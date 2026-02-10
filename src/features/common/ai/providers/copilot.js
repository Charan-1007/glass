// copilot.js — GitHub Copilot AI provider
//
// Uses the GitHub Copilot chat-completions endpoint which is OpenAI-compatible.
// Authentication is a two-step process:
//   1. A long-lived GitHub OAuth token (obtained via Device Flow, stored in DB)
//   2. A short-lived Copilot API token exchanged on-the-fly
//
// Streaming output is native OpenAI SSE, so no format conversion is needed.

const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_CHAT_FALLBACK = 'https://api.githubcopilot.com';

// ── Short-lived Copilot token cache ──────────────────────────────

let _cachedToken = null;
let _cachedExpiry = 0;
let _cachedEndpoint = COPILOT_CHAT_FALLBACK;

async function getCopilotApiToken(githubToken) {
    // Re-use if still valid (with 60 s buffer)
    if (_cachedToken && Date.now() < _cachedExpiry - 60_000) {
        return { token: _cachedToken, endpoint: _cachedEndpoint };
    }

    const resp = await fetch(COPILOT_TOKEN_URL, {
        headers: {
            'Authorization': `token ${githubToken}`,
            'User-Agent': 'GithubCopilot/1.0',
            'Accept': 'application/json',
        },
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Copilot token exchange failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    _cachedToken = data.token;
    _cachedExpiry = (data.expires_at || 0) * 1000;
    _cachedEndpoint = data.endpoints?.api || COPILOT_CHAT_FALLBACK;
    return { token: _cachedToken, endpoint: _cachedEndpoint };
}

// ── Helpers ──────────────────────────────────────────────────────

/** Strip the `copilot:` catalogue prefix so the API receives a clean model id. */
function resolveModel(modelId) {
    return typeof modelId === 'string' && modelId.startsWith('copilot:')
        ? modelId.slice(8)
        : modelId;
}

function buildHeaders(copilotToken) {
    return {
        'Authorization': `Bearer ${copilotToken}`,
        'Content-Type': 'application/json',
        'Editor-Version': 'vscode/1.96.0',
        'Editor-Plugin-Version': 'copilot-chat/0.24.2',
        'Copilot-Integration-Id': 'vscode-chat',
        'Openai-Intent': 'conversation-panel',
    };
}

// ── Fetch available models from Copilot API ─────────────────────

let _cachedModels = null;
let _modelsCacheExpiry = 0;

async function fetchModels(githubToken) {
    // Cache for 5 minutes
    if (_cachedModels && Date.now() < _modelsCacheExpiry) {
        return _cachedModels;
    }

    try {
        const { token, endpoint } = await getCopilotApiToken(githubToken);

        const resp = await fetch(`${endpoint}/models`, {
            headers: buildHeaders(token),
        });

        if (!resp.ok) {
            console.warn(`[CopilotProvider] Models endpoint returned ${resp.status}`);
            return _cachedModels || [];
        }

        const data = await resp.json();
        const rawModels = data.data || data.models || data || [];

        // Filter to models that:
        //  1. support the /chat/completions endpoint
        //  2. are enabled in the user's Copilot policy
        const modelList = rawModels
            .filter(m => {
                if (!m.id) return false;
                const endpoints = m.supported_endpoints || [];
                if (!endpoints.includes('/chat/completions')) return false;
                if (m.model_picker_enabled === false) return false;
                if (m.policy?.state === 'unconfigured') return false;
                return true;
            })
            .map(m => ({
                id: `copilot:${m.id}`,
                name: m.name || m.id,
                _category: m.model_picker_category || '',
            }));

        // Sort: lightweight first (low-resource default), then versatile, then powerful
        const categoryOrder = { lightweight: 0, versatile: 1, powerful: 2 };
        modelList.sort((a, b) =>
            (categoryOrder[a._category] ?? 9) - (categoryOrder[b._category] ?? 9)
        );

        console.log(`[CopilotProvider] Models from API (${rawModels.length} total, ${modelList.length} chat-enabled):`,
            modelList.map(m => m.id).join(', '));

        if (modelList.length > 0) {
            _cachedModels = modelList;
            _modelsCacheExpiry = Date.now() + 5 * 60 * 1000;
        }

        return modelList;
    } catch (err) {
        console.warn('[CopilotProvider] Failed to fetch models:', err.message);
        return _cachedModels || [];
    }
}

// ── Provider class (static validateApiKey) ───────────────────────

class CopilotProvider {
    /**
     * Validates a GitHub OAuth token by checking:
     *   1. The token is valid with the GitHub API
     *   2. The account has Copilot access (can exchange for a Copilot token)
     */
    static async validateApiKey(token) {
        if (!token || typeof token !== 'string') {
            return { success: false, error: 'Invalid GitHub token.' };
        }

        try {
            // 1. Verify the GitHub token itself
            const userResp = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Glass-App',
                    'Accept': 'application/json',
                },
            });

            if (!userResp.ok) {
                return { success: false, error: `GitHub token invalid (HTTP ${userResp.status}).` };
            }

            // 2. Verify Copilot entitlement
            const copilotResp = await fetch(COPILOT_TOKEN_URL, {
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'Glass-App',
                    'Accept': 'application/json',
                },
            });

            if (!copilotResp.ok) {
                return {
                    success: false,
                    error: 'GitHub Copilot is not available for this account. '
                         + 'Please ensure you have an active Copilot subscription.',
                };
            }

            return { success: true };
        } catch (error) {
            console.error('[CopilotProvider] Validation error:', error);
            return { success: false, error: 'Network error during validation.' };
        }
    }
}

// ── createLLM ────────────────────────────────────────────────────

function createLLM({ apiKey, model = 'gpt-4o', temperature = 0.7, maxTokens = 2048 }) {
    if (!apiKey) throw new Error('GitHub token is required for Copilot');

    const sdkModel = resolveModel(model);

    async function callApi(messages) {
        const { token, endpoint } = await getCopilotApiToken(apiKey);

        const resp = await fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: buildHeaders(token),
            body: JSON.stringify({
                model: sdkModel,
                messages,
                temperature,
                max_tokens: maxTokens,
            }),
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Copilot API error (${resp.status}): ${errText}`);
        }

        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || '';
        return { content, raw: data };
    }

    return {
        /**
         * generateContent(parts) — same parts-based interface used by every provider.
         * Accepts an array of strings (text) and { inlineData } objects (images).
         */
        generateContent: async (parts) => {
            let systemPrompt = null;
            const userContent = [];

            for (const part of parts) {
                if (typeof part === 'string') {
                    if (!systemPrompt && part.includes('You are')) {
                        systemPrompt = part;
                    } else {
                        userContent.push({ type: 'text', text: part });
                    }
                } else if (part.inlineData) {
                    userContent.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                        },
                    });
                }
            }

            const messages = [];
            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
            if (userContent.length > 0) messages.push({ role: 'user', content: userContent });

            const result = await callApi(messages);
            return {
                response: { text: () => result.content },
                raw: result.raw,
            };
        },

        /** chat(messages) — pass OpenAI-style messages directly. */
        chat: async (messages) => {
            return await callApi(messages);
        },
    };
}

// ── createStreamingLLM ───────────────────────────────────────────

function createStreamingLLM({ apiKey, model = 'gpt-4o', temperature = 0.7, maxTokens = 2048 }) {
    if (!apiKey) throw new Error('GitHub token is required for Copilot');

    const sdkModel = resolveModel(model);

    return {
        /**
         * streamChat(messages) — returns a fetch Response whose body is an
         * OpenAI-compatible SSE stream.  This is consumed by _processStream()
         * in askService exactly like the OpenAI provider.
         */
        streamChat: async (messages) => {
            const { token, endpoint } = await getCopilotApiToken(apiKey);

            const response = await fetch(`${endpoint}/chat/completions`, {
                method: 'POST',
                headers: buildHeaders(token),
                body: JSON.stringify({
                    model: sdkModel,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    stream: true,
                }),
            });

            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`Copilot streaming error (${response.status}): ${errText}`);
            }

            // The response body is already OpenAI-compatible SSE — pass through.
            return response;
        },
    };
}

module.exports = {
    CopilotProvider,
    createLLM,
    createStreamingLLM,
    fetchModels,
};
