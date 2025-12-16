const { globalShortcut, screen } = require('electron');
const shortcutsRepository = require('./repositories');
const internalBridge = require('../../bridge/internalBridge');
const askService = require('../ask/askService');


class ShortcutsService {
    constructor() {
        this.lastVisibleWindows = new Set(['header']);
        this.mouseEventsIgnored = false;
        this.windowPool = null;
        this.allWindowVisibility = true;
    }

    initialize(windowPool) {
        this.windowPool = windowPool;
        internalBridge.on('reregister-shortcuts', () => {
            console.log('[ShortcutsService] Reregistering shortcuts due to header state change.');
            this.registerShortcuts();
        });
        console.log('[ShortcutsService] Initialized with dependencies and event listener.');
    }

    async openShortcutSettingsWindow () {
        const keybinds = await this.loadKeybinds();
        const shortcutWin = this.windowPool.get('shortcut-settings');
        shortcutWin.webContents.send('shortcut:loadShortcuts', keybinds);

        globalShortcut.unregisterAll();
        internalBridge.emit('window:requestVisibility', { name: 'shortcut-settings', visible: true });
        console.log('[ShortcutsService] Shortcut settings window opened.');
        return { success: true };
    }

    async closeShortcutSettingsWindow () {
        await this.registerShortcuts();
        internalBridge.emit('window:requestVisibility', { name: 'shortcut-settings', visible: false });
        console.log('[ShortcutsService] Shortcut settings window closed.');
        return { success: true };
    }

    async handleSaveShortcuts(newKeybinds) {
        try {
            await this.saveKeybinds(newKeybinds);
            await this.closeShortcutSettingsWindow();
            return { success: true };
        } catch (error) {
            console.error("Failed to save shortcuts:", error);
            await this.closeShortcutSettingsWindow();
            return { success: false, error: error.message };
        }
    }

    async handleRestoreDefaults() {
        const defaults = this.getDefaultKeybinds();
        return defaults;
    }

    getDefaultKeybinds() {
        const isMac = process.platform === 'darwin';
        return {
            moveUp: isMac ? 'Cmd+Up' : 'Ctrl+Up',
            moveDown: isMac ? 'Cmd+Down' : 'Ctrl+Down',
            moveLeft: isMac ? 'Cmd+Left' : 'Ctrl+Left',
            moveRight: isMac ? 'Cmd+Right' : 'Ctrl+Right',
            toggleVisibility: isMac ? 'Cmd+\\' : 'Ctrl+\\',
            toggleClickThrough: isMac ? 'Cmd+M' : 'Ctrl+M',
            nextStep: isMac ? 'Cmd+Enter' : 'Ctrl+Enter',
            manualScreenshot: isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S',
            previousResponse: isMac ? 'Cmd+[' : 'Ctrl+[',
            nextResponse: isMac ? 'Cmd+]' : 'Ctrl+]',
            scrollUp: isMac ? 'Cmd+Shift+Up' : 'Ctrl+Shift+Up',
            scrollDown: isMac ? 'Cmd+Shift+Down' : 'Ctrl+Shift+Down',
            quitApp: isMac ? 'Cmd+Q' : 'Ctrl+Q',
        };
    }

    async loadKeybinds() {
        let keybindsArray = await shortcutsRepository.getAllKeybinds();

        if (!keybindsArray || keybindsArray.length === 0) {
            console.log(`[Shortcuts] No keybinds found. Loading defaults.`);
            const defaults = this.getDefaultKeybinds();
            await this.saveKeybinds(defaults); 
            return defaults;
        }

        const keybinds = {};
        keybindsArray.forEach(k => {
            keybinds[k.action] = k.accelerator;
        });

        const defaults = this.getDefaultKeybinds();
        let needsUpdate = false;
        for (const action in defaults) {
            if (!keybinds[action]) {
                keybinds[action] = defaults[action];
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            console.log('[Shortcuts] Updating missing keybinds with defaults.');
            await this.saveKeybinds(keybinds);
        }

        return keybinds;
    }

    async saveKeybinds(newKeybinds) {
        const keybindsToSave = [];
        for (const action in newKeybinds) {
            if (Object.prototype.hasOwnProperty.call(newKeybinds, action)) {
                keybindsToSave.push({
                    action: action,
                    accelerator: newKeybinds[action],
                });
            }
        }
        await shortcutsRepository.upsertKeybinds(keybindsToSave);
        console.log(`[Shortcuts] Saved keybinds.`);
    }

    async toggleAllWindowsVisibility() {
        const targetVisibility = !this.allWindowVisibility;
        internalBridge.emit('window:requestToggleAllWindowsVisibility', {
            targetVisibility: targetVisibility
        });

        if (this.allWindowVisibility) {
            await this.registerShortcuts(true);
        } else {
            await this.registerShortcuts();
        }

        this.allWindowVisibility = !this.allWindowVisibility;
    }

    async registerShortcuts(registerOnlyToggleVisibility = false) {
        if (!this.windowPool) {
            console.error('[Shortcuts] Service not initialized. Cannot register shortcuts.');
            return;
        }
        const keybinds = await this.loadKeybinds();
        globalShortcut.unregisterAll();
        
        const header = this.windowPool.get('header');
        const mainWindow = header;

        const sendToRenderer = (channel, ...args) => {
            this.windowPool.forEach(win => {
                if (win && !win.isDestroyed()) {
                    try {
                        win.webContents.send(channel, ...args);
                    } catch (e) {
                        // Ignore errors for destroyed windows
                    }
                }
            });
        };
        
        sendToRenderer('shortcuts-updated', keybinds);

        if (registerOnlyToggleVisibility) {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => this.toggleAllWindowsVisibility());
            }
            console.log('[Shortcuts] registerOnlyToggleVisibility, only toggleVisibility shortcut is registered.');
            return;
        }

        // --- Hardcoded shortcuts ---
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 'Cmd' : 'Ctrl';
        
        // Monitor switching
        const displays = screen.getAllDisplays();
        if (displays.length > 1) {
            displays.forEach((display, index) => {
                const key = `${modifier}+Shift+${index + 1}`;
                globalShortcut.register(key, () => internalBridge.emit('window:moveToDisplay', { displayId: display.id }));
            });
        }

        // Edge snapping
        const edgeDirections = [
            { key: `${modifier}+Shift+Left`, direction: 'left' },
            { key: `${modifier}+Shift+Right`, direction: 'right' },
        ];
        edgeDirections.forEach(({ key, direction }) => {
            globalShortcut.register(key, () => {
                if (header && header.isVisible()) internalBridge.emit('window:moveToEdge', { direction });
            });
        });

        // --- User-configurable shortcuts ---
        if (header?.currentHeaderState === 'apikey') {
            if (keybinds.toggleVisibility) {
                globalShortcut.register(keybinds.toggleVisibility, () => this.toggleAllWindowsVisibility());
            }
            console.log('[Shortcuts] ApiKeyHeader is active, only toggleVisibility shortcut is registered.');
            return;
        }

        for (const action in keybinds) {
            const accelerator = keybinds[action];
            if (!accelerator) continue;

            let callback;
            switch(action) {
                case 'toggleVisibility':
                    callback = () => {
                        const headerWindow = this.windowPool.get('header');
                        const askWindow = this.windowPool.get('ask');
                        
                        if (headerWindow && !headerWindow.isDestroyed()) {
                            if (headerWindow.isVisible()) {
                                headerWindow.hide();
                                if (askWindow && !askWindow.isDestroyed()) {
                                    askWindow.hide();
                                }
                            } else {
                                // Use showInactive() to NOT steal focus
                                headerWindow.showInactive();
                                if (askWindow && !askWindow.isDestroyed()) {
                                    askWindow.showInactive();
                                }
                            }
                        }
                    };
                    break;
                case 'nextStep':
                    callback = () => askService.toggleAskButton(true);
                    break;
                case 'scrollUp':
    callback = () => {
        const askWindow = this.windowPool.get('ask');
        if (askWindow && !askWindow.isDestroyed() && askWindow.isVisible()) {
            askWindow.webContents.send('aks:scrollResponseUp');
        }
    };
    break;
case 'scrollDown':
    callback = () => {
        const askWindow = this.windowPool.get('ask');
        if (askWindow && !askWindow.isDestroyed() && askWindow.isVisible()) {
            askWindow.webContents.send('aks:scrollResponseDown');
        }
    };
    break;
                case 'moveUp':
                    callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'up' }); };
                    break;
                case 'moveDown':
                    callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'down' }); };
                    break;
                case 'moveLeft':
                    callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'left' }); };
                    break;
                case 'moveRight':
                    callback = () => { if (header && header.isVisible()) internalBridge.emit('window:moveStep', { direction: 'right' }); };
                    break;
                case 'toggleClickThrough':
                    callback = () => {
                        const askWindow = this.windowPool.get('ask');
                        if (askWindow && !askWindow.isDestroyed()) {
                            const currentClickThrough = askWindow.isClickThrough || false;
                            const newClickThrough = !currentClickThrough;
                            
                            if (newClickThrough) {
                                // Enable click-through
                                askWindow.setIgnoreMouseEvents(true, { forward: true });
                            } else {
                                // Disable click-through
                                askWindow.setIgnoreMouseEvents(false);
                            }
                            
                            askWindow.isClickThrough = newClickThrough;
                            console.log(`Click-through mode: ${newClickThrough ? 'enabled' : 'disabled'}`);
                        }
                    };
                    break;
                case 'manualScreenshot':
                    callback = async () => {
                        // Capture screenshot directly in main process (like Phantom Lens)
                        // This hides windows, captures clean screenshot, and adds to queue
                        const askService = require('../ask/askService');
                        const result = await askService.captureManualScreenshotToQueue();
                        if (result.success) {
                            console.log(`[Shortcuts] Manual screenshot captured. Queue size: ${result.queueSize}`);
                        } else {
                            console.error(`[Shortcuts] Manual screenshot failed:`, result.error);
                        }
                    };
                    break;
                case 'previousResponse':
                    callback = () => sendToRenderer('navigate-previous-response');
                    break;
                case 'nextResponse':
                    callback = () => sendToRenderer('navigate-next-response');
                    break;
                case 'quitApp':
                    callback = () => {
                        const { app } = require('electron');
                        app.quit();
                    };
                    break;
            }
            
            if (callback) {
                try {
                    globalShortcut.register(accelerator, callback);
                } catch(e) {
                    console.error(`[Shortcuts] Failed to register shortcut for "${action}" (${accelerator}):`, e.message);
                }
            }
        }
        console.log('[Shortcuts] All shortcuts have been registered.');
    }

    unregisterAll() {
        globalShortcut.unregisterAll();
        console.log('[Shortcuts] All shortcuts have been unregistered.');
    }
}


const shortcutsService = new ShortcutsService();

module.exports = shortcutsService;