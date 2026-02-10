// copilotAuthService.js
// Handles GitHub Device Flow authentication for GitHub Copilot.
// Persists the OAuth token via electron-store so the user stays logged in across restarts.

const Store = require('electron-store');
const { shell, clipboard } = require('electron');

// GitHub OAuth Device Flow endpoints
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// Well-known OAuth client ID used by Copilot editor integrations
const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

const store = new Store({ name: 'copilot-auth-session' });

class CopilotAuthService {
    constructor() {
        this._polling = false;
    }

    // ── Token storage ─────────────────────────────────────────────

    getToken() {
        return store.get('github_token', null);
    }

    isLoggedIn() {
        return !!this.getToken();
    }

    // ── Device Flow login ─────────────────────────────────────────

    /**
     * Starts the full GitHub Device Flow:
     *  1. Requests a device code from GitHub
     *  2. Copies the user code to clipboard & opens the verification URL
     *  3. Polls until the user authorises (or flow expires)
     *  4. Stores the resulting token
     *
     * @returns {{ success: boolean, userCode?: string, error?: string }}
     */
    async login() {
        try {
            console.log('[CopilotAuth] Starting Device Flow…');

            // 1. Request device code
            const deviceResp = await fetch(DEVICE_CODE_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_id: COPILOT_CLIENT_ID,
                    scope: 'read:user',
                }),
            });

            if (!deviceResp.ok) {
                const text = await deviceResp.text();
                throw new Error(`Device code request failed (${deviceResp.status}): ${text}`);
            }

            const device = await deviceResp.json();
            // device = { device_code, user_code, verification_uri, expires_in, interval }

            // 2. Copy code to clipboard and open browser
            clipboard.writeText(device.user_code);
            shell.openExternal(device.verification_uri);

            console.log(`[CopilotAuth] User code: ${device.user_code}  –  awaiting authorisation…`);

            // 3. Poll for token
            const token = await this._pollForToken(
                device.device_code,
                device.interval || 5,
                device.expires_in || 900,
            );

            if (token) {
                store.set('github_token', token);
                console.log('[CopilotAuth] Token obtained and stored.');
                return { success: true, userCode: device.user_code };
            }

            return { success: false, error: 'Authentication timed out or was denied.' };
        } catch (error) {
            console.error('[CopilotAuth] Login failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ── Logout ────────────────────────────────────────────────────

    async logout() {
        store.delete('github_token');
        console.log('[CopilotAuth] Token cleared.');
        return { success: true };
    }

    // ── GitHub user info ──────────────────────────────────────────

    async getUser() {
        const token = this.getToken();
        if (!token) return null;

        try {
            const resp = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Glass-App',
                    'Accept': 'application/json',
                },
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return { login: data.login, name: data.name, avatar: data.avatar_url };
        } catch {
            return null;
        }
    }

    // ── Status (for settings UI) ──────────────────────────────────

    async getStatus() {
        const token = this.getToken();
        if (!token) return { loggedIn: false, user: null };

        const user = await this.getUser();
        if (!user) {
            // Token may have been revoked
            return { loggedIn: false, user: null };
        }

        return { loggedIn: true, user };
    }

    // ── Internal: polling loop ────────────────────────────────────

    async _pollForToken(deviceCode, interval, expiresIn) {
        const maxAttempts = Math.floor(expiresIn / interval);
        this._polling = true;

        for (let i = 0; i < maxAttempts && this._polling; i++) {
            await new Promise(r => setTimeout(r, interval * 1000));

            try {
                const resp = await fetch(ACCESS_TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        client_id: COPILOT_CLIENT_ID,
                        device_code: deviceCode,
                        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                    }),
                });

                const data = await resp.json();

                if (data.access_token) {
                    return data.access_token;
                }

                if (data.error === 'authorization_pending') {
                    continue; // normal – user hasn't authorised yet
                } else if (data.error === 'slow_down') {
                    interval += 5; // back off as requested
                    continue;
                } else if (data.error === 'expired_token' || data.error === 'access_denied') {
                    console.log(`[CopilotAuth] Flow ended: ${data.error}`);
                    return null;
                }
            } catch (err) {
                console.error('[CopilotAuth] Poll error:', err.message);
                // transient network error – keep trying
            }
        }

        this._polling = false;
        return null;
    }
}

const copilotAuthService = new CopilotAuthService();
module.exports = copilotAuthService;
