const { BrowserWindow } = require('electron');
const { createStreamingLLM } = require('../common/ai/factory');
// Lazy require helper to avoid circular dependency issues
const getWindowManager = () => require('../../window/windowManager');
const internalBridge = require('../../bridge/internalBridge');

const getWindowPool = () => {
    try {
        return getWindowManager().windowPool;
    } catch {
        return null;
    }
};

const sessionRepository = require('../common/repositories/session');
const askRepository = require('./repositories');
const { getSystemPrompt } = require('../common/prompts/promptBuilder');
const path = require('node:path');
const fs = require('node:fs');
const os = require('os');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { desktopCapturer } = require('electron');
const modelStateService = require('../common/services/modelStateService');

// Try to load sharp, but don't fail if it's not available
let sharp;
try {
    sharp = require('sharp');
    console.log('[AskService] Sharp module loaded successfully');
} catch (error) {
    console.warn('[AskService] Sharp module not available:', error.message);
    console.warn('[AskService] Screenshot functionality will work with reduced image processing capabilities');
    sharp = null;
}
let lastScreenshot = null;

// ---------------------------
// Screenshot Queue Management (for manual screenshots)
// ---------------------------
let screenshotQueue = [];
const MAX_SCREENSHOT_QUEUE_SIZE = 10;

/**
 * Capture a manual screenshot using desktopCapturer (main process)
 * This hides the overlay windows before capture to get a clean screenshot
 * Similar to Phantom Lens implementation
 */
async function captureManualScreenshotToQueue() {
    try {
        const windowPool = getWindowPool();
        const windowsToHide = [];
        
        // Hide all overlay windows before capture
        if (windowPool) {
            for (const [name, win] of windowPool.entries()) {
                if (win && !win.isDestroyed() && win.isVisible()) {
                    windowsToHide.push({ name, win });
                    win.hide();
                }
            }
        }
        
        // Wait for windows to be hidden
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Capture the screen using desktopCapturer
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: 1920,
                height: 1080,
            },
        });
        
        // Show windows again
        for (const { win } of windowsToHide) {
            if (win && !win.isDestroyed()) {
                win.showInactive();
            }
        }
        
        if (sources.length === 0) {
            console.error('[AskService] No screen sources available for manual screenshot');
            return { success: false, error: 'No screen sources available' };
        }
        
        const source = sources[0];
        const buffer = source.thumbnail.toJPEG(80);
        const base64 = buffer.toString('base64');
        const size = source.thumbnail.getSize();
        
        // Add to queue
        const screenshot = {
            base64,
            width: size.width,
            height: size.height,
            timestamp: Date.now(),
        };
        
        screenshotQueue.push(screenshot);
        
        // Limit queue size
        if (screenshotQueue.length > MAX_SCREENSHOT_QUEUE_SIZE) {
            screenshotQueue = screenshotQueue.slice(-MAX_SCREENSHOT_QUEUE_SIZE);
        }
        
        console.log(`[AskService] Manual screenshot captured and queued. Queue size: ${screenshotQueue.length}`);
        
        // Notify renderer about the capture (for visual feedback)
        const mainWindow = windowPool?.get('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('screenshot-captured', { queueSize: screenshotQueue.length });
        }
        
        return { success: true, queueSize: screenshotQueue.length };
    } catch (error) {
        console.error('[AskService] Failed to capture manual screenshot:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Add a screenshot to the queue (called from renderer via IPC)
 */
function addScreenshotToQueue(screenshot) {
    screenshotQueue.push({
        ...screenshot,
        timestamp: Date.now(),
    });
    
    // Limit queue size
    if (screenshotQueue.length > MAX_SCREENSHOT_QUEUE_SIZE) {
        screenshotQueue = screenshotQueue.slice(-MAX_SCREENSHOT_QUEUE_SIZE);
    }
    
    console.log(`[AskService] Screenshot added to queue. Queue size: ${screenshotQueue.length}`);
    return { success: true, queueSize: screenshotQueue.length };
}

/**
 * Get and clear the screenshot queue
 */
function getAndClearScreenshotQueue() {
    const queue = [...screenshotQueue];
    screenshotQueue = [];
    console.log(`[AskService] Retrieved and cleared ${queue.length} screenshots from queue`);
    return queue;
}

/**
 * Check if there are queued screenshots
 */
function hasQueuedScreenshots() {
    return screenshotQueue.length > 0;
}

/**
 * Clear the screenshot queue
 */
function clearScreenshotQueue() {
    screenshotQueue = [];
    console.log('[AskService] Screenshot queue cleared');
}

/**
 * Get queue size
 */
function getScreenshotQueueSize() {
    return screenshotQueue.length;
}

async function captureScreenshot(options = {}) {
    if (process.platform === 'darwin') {
        try {
            const tempPath = path.join(os.tmpdir(), `screenshot-${Date.now()}.jpg`);

            await execFile('screencapture', ['-x', '-t', 'jpg', tempPath]);

            const imageBuffer = await fs.promises.readFile(tempPath);
            await fs.promises.unlink(tempPath);

            if (sharp) {
                try {
                    // Try using sharp for optimal image processing
                    const resizedBuffer = await sharp(imageBuffer)
                        .resize({ height: 384 })
                        .jpeg({ quality: 80 })
                        .toBuffer();

                    const base64 = resizedBuffer.toString('base64');
                    const metadata = await sharp(resizedBuffer).metadata();

                    lastScreenshot = {
                        base64,
                        width: metadata.width,
                        height: metadata.height,
                        timestamp: Date.now(),
                    };

                    return { success: true, base64, width: metadata.width, height: metadata.height };
                } catch (sharpError) {
                    console.warn('Sharp module failed, falling back to basic image processing:', sharpError.message);
                }
            }
            
            // Fallback: Return the original image without resizing
            console.log('[AskService] Using fallback image processing (no resize/compression)');
            const base64 = imageBuffer.toString('base64');
            
            lastScreenshot = {
                base64,
                width: null, // We don't have metadata without sharp
                height: null,
                timestamp: Date.now(),
            };

            return { success: true, base64, width: null, height: null };
        } catch (error) {
            console.error('Failed to capture screenshot:', error);
            return { success: false, error: error.message };
        }
    }

    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: 1920,
                height: 1080,
            },
        });

        if (sources.length === 0) {
            throw new Error('No screen sources available');
        }
        const source = sources[0];
        const buffer = source.thumbnail.toJPEG(70);
        const base64 = buffer.toString('base64');
        const size = source.thumbnail.getSize();

        return {
            success: true,
            base64,
            width: size.width,
            height: size.height,
        };
    } catch (error) {
        console.error('Failed to capture screenshot using desktopCapturer:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * @class
 * @description
 */
class AskService {
    constructor() {
        this.abortController = null;
        this.state = {
            isVisible: false,
            isLoading: false,
            isStreaming: false,
            currentQuestion: '',
            currentResponse: '',
            showTextInput: true,
        };
        console.log('[AskService] Service instance created.');
    }

    _broadcastState() {
        const askWindow = getWindowPool()?.get('ask');
        if (askWindow && !askWindow.isDestroyed()) {
            askWindow.webContents.send('ask:stateUpdate', this.state);
        }
    }

    async toggleAskButton(inputScreenOnly = false) {
        // Guard: Discard new requests when LLM is busy (loading or streaming)
        if (this.state.isLoading || this.state.isStreaming) {
            console.log('[AskService] LLM is busy, discarding new request');
            return;
        }

        const askWindow = getWindowPool()?.get('ask');

        let shouldSendScreenOnly = false;
        if (inputScreenOnly && this.state.showTextInput && askWindow && askWindow.isVisible()) {
            shouldSendScreenOnly = true;
            await this.sendMessage('', []);
            return;
        }

        const hasContent = this.state.isLoading || this.state.isStreaming || (this.state.currentResponse && this.state.currentResponse.length > 0);

        if (askWindow && askWindow.isVisible() && hasContent) {
            this.state.showTextInput = !this.state.showTextInput;
            this._broadcastState();
        } else {
            if (askWindow && askWindow.isVisible()) {
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
                this.state.isVisible = false;
            } else {
                console.log('[AskService] Showing hidden Ask window');
                internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
                this.state.isVisible = true;
            }
            if (this.state.isVisible) {
                this.state.showTextInput = true;
                this._broadcastState();
            }
        }
    }

    async closeAskWindow () {
            if (this.abortController) {
                this.abortController.abort('Window closed by user');
                this.abortController = null;
            }
    
            this.state = {
                isVisible      : false,
                isLoading      : false,
                isStreaming    : false,
                currentQuestion: '',
                currentResponse: '',
                showTextInput  : true,
            };
            this._broadcastState();
    
            internalBridge.emit('window:requestVisibility', { name: 'ask', visible: false });
    
            return { success: true };
        }
    

    /**
     * 
     * @param {string[]} conversationTexts
     * @returns {string}
     * @private
     */
    _formatConversationForPrompt(conversationTexts) {
        if (!conversationTexts || conversationTexts.length === 0) {
            return 'No conversation history available.';
        }
        return conversationTexts.slice(-30).join('\n');
    }

    /**
     * 
     * @param {string} userPrompt
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async sendMessage(userPrompt, conversationHistoryRaw=[]) {
        internalBridge.emit('window:requestVisibility', { name: 'ask', visible: true });
        this.state = {
            ...this.state,
            isLoading: true,
            isStreaming: false,
            currentQuestion: userPrompt,
            currentResponse: '',
            showTextInput: false,
        };
        this._broadcastState();

        if (this.abortController) {
            this.abortController.abort('New request received.');
        }
        this.abortController = new AbortController();
        const { signal } = this.abortController;


        let sessionId;

        try {
            console.log(`[AskService] 🤖 Processing message: ${userPrompt.substring(0, 50)}...`);

            sessionId = await sessionRepository.getOrCreateActive('ask');
            await askRepository.addAiMessage({ sessionId, role: 'user', content: userPrompt.trim() });
            console.log(`[AskService] DB: Saved user prompt to session ${sessionId}`);
            
            const modelInfo = await modelStateService.getCurrentModelInfo('llm');
            if (!modelInfo || !modelInfo.apiKey) {
                throw new Error('AI model or API key not configured.');
            }
            console.log(`[AskService] Using model: ${modelInfo.model} for provider: ${modelInfo.provider}`);

            // Check for queued screenshots first, otherwise capture current screen
            let screenshotsToAnalyze = [];
            let usingQueuedScreenshots = false;
            
            if (hasQueuedScreenshots()) {
                // Get queued screenshots and clear the queue
                screenshotsToAnalyze = getAndClearScreenshotQueue();
                usingQueuedScreenshots = true;
                console.log(`[AskService] Using ${screenshotsToAnalyze.length} queued screenshots for analysis`);
            } else {
                // Capture current screen
                const screenshotResult = await captureScreenshot({ quality: 'medium' });
                if (screenshotResult.success) {
                    screenshotsToAnalyze = [{ base64: screenshotResult.base64, width: screenshotResult.width, height: screenshotResult.height }];
                }
                console.log('[AskService] Captured current screen for analysis');
            }

            const conversationHistory = this._formatConversationForPrompt(conversationHistoryRaw);

            // Use the appropriate system prompt based on whether we have queued screenshots
            const systemPrompt = usingQueuedScreenshots && screenshotsToAnalyze.length > 0
                ? getSystemPrompt('pickle_glass_screenshot_analysis', conversationHistory, false)
                : getSystemPrompt('pickle_glass_analysis', conversationHistory, false);

            // Build user message with appropriate prompt
            let userText = userPrompt.trim();
            if (usingQueuedScreenshots && screenshotsToAnalyze.length > 0) {
                if (!userText) {
                    userText = `Analyze the following ${screenshotsToAnalyze.length} screenshot(s). Identify the type of content:
- If it's an MCQ (Multiple Choice Question), provide the correct answer with a clear explanation.
- If it's a Coding question/problem, provide the complete solution code with explanation.
- If it's neither, describe what you see and provide relevant insights.`;
                }
            }

            const messages = [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: `User Request: ${userText}` },
                    ],
                },
            ];

            // Add all screenshots to the message
            for (const screenshot of screenshotsToAnalyze) {
                if (screenshot.base64) {
                    messages[1].content.push({
                        type: 'image_url',
                        image_url: { url: `data:image/jpeg;base64,${screenshot.base64}` },
                    });
                }
            }
            
            const streamingLLM = createStreamingLLM(modelInfo.provider, {
                apiKey: modelInfo.apiKey,
                model: modelInfo.model,
                temperature: 0.7,
                maxTokens: 2048,
                usePortkey: modelInfo.provider === 'openai-glass',
                portkeyVirtualKey: modelInfo.provider === 'openai-glass' ? modelInfo.apiKey : undefined,
            });

            try {
                const response = await streamingLLM.streamChat(messages);
                const askWin = getWindowPool()?.get('ask');

                if (!askWin || askWin.isDestroyed()) {
                    console.error("[AskService] Ask window is not available to send stream to.");
                    response.body.getReader().cancel();
                    return { success: false, error: 'Ask window is not available.' };
                }

                const reader = response.body.getReader();
                signal.addEventListener('abort', () => {
                    console.log(`[AskService] Aborting stream reader. Reason: ${signal.reason}`);
                    reader.cancel(signal.reason).catch(() => { /* 이미 취소된 경우의 오류는 무시 */ });
                });

                await this._processStream(reader, askWin, sessionId, signal);
                return { success: true };

            } catch (multimodalError) {
                // 멀티모달 요청이 실패했고 스크린샷이 포함되어 있다면 텍스트만으로 재시도
                if (screenshotsToAnalyze.length > 0 && this._isMultimodalError(multimodalError)) {
                    console.log(`[AskService] Multimodal request failed, retrying with text-only: ${multimodalError.message}`);
                    
                    // 텍스트만으로 메시지 재구성
                    const textOnlyMessages = [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content: `User Request: ${userText}`
                        }
                    ];

                    const fallbackResponse = await streamingLLM.streamChat(textOnlyMessages);
                    const askWin = getWindowPool()?.get('ask');

                    if (!askWin || askWin.isDestroyed()) {
                        console.error("[AskService] Ask window is not available for fallback response.");
                        fallbackResponse.body.getReader().cancel();
                        return { success: false, error: 'Ask window is not available.' };
                    }

                    const fallbackReader = fallbackResponse.body.getReader();
                    signal.addEventListener('abort', () => {
                        console.log(`[AskService] Aborting fallback stream reader. Reason: ${signal.reason}`);
                        fallbackReader.cancel(signal.reason).catch(() => {});
                    });

                    await this._processStream(fallbackReader, askWin, sessionId, signal);
                    return { success: true };
                } else {
                    // 다른 종류의 에러이거나 스크린샷이 없었다면 그대로 throw
                    throw multimodalError;
                }
            }

        } catch (error) {
            console.error('[AskService] Error during message processing:', error);
            this.state = {
                ...this.state,
                isLoading: false,
                isStreaming: false,
                showTextInput: true,
            };
            this._broadcastState();

            const askWin = getWindowPool()?.get('ask');
            if (askWin && !askWin.isDestroyed()) {
                const streamError = error.message || 'Unknown error occurred';
                askWin.webContents.send('ask-response-stream-error', { error: streamError });
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * 
     * @param {ReadableStreamDefaultReader} reader
     * @param {BrowserWindow} askWin
     * @param {number} sessionId 
     * @param {AbortSignal} signal
     * @returns {Promise<void>}
     * @private
     */
    async _processStream(reader, askWin, sessionId, signal) {
        const decoder = new TextDecoder();
        let fullResponse = '';

        try {
            this.state.isLoading = false;
            this.state.isStreaming = true;
            this._broadcastState();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data === '[DONE]') {
                            return; 
                        }
                        try {
                            const json = JSON.parse(data);
                            const token = json.choices[0]?.delta?.content || '';
                            if (token) {
                                fullResponse += token;
                                this.state.currentResponse = fullResponse;
                                this._broadcastState();
                            }
                        } catch (error) {
                        }
                    }
                }
            }
        } catch (streamError) {
            if (signal.aborted) {
                console.log(`[AskService] Stream reading was intentionally cancelled. Reason: ${signal.reason}`);
            } else {
                console.error('[AskService] Error while processing stream:', streamError);
                if (askWin && !askWin.isDestroyed()) {
                    askWin.webContents.send('ask-response-stream-error', { error: streamError.message });
                }
            }
        } finally {
            this.state.isStreaming = false;
            this.state.currentResponse = fullResponse;
            this._broadcastState();
            if (fullResponse) {
                 try {
                    await askRepository.addAiMessage({ sessionId, role: 'assistant', content: fullResponse });
                    console.log(`[AskService] DB: Saved partial or full assistant response to session ${sessionId} after stream ended.`);
                } catch(dbError) {
                    console.error("[AskService] DB: Failed to save assistant response after stream ended:", dbError);
                }
            }
        }
    }

    /**
     * 멀티모달 관련 에러인지 판단
     * @private
     */
    _isMultimodalError(error) {
        const errorMessage = error.message?.toLowerCase() || '';
        return (
            errorMessage.includes('vision') ||
            errorMessage.includes('image') ||
            errorMessage.includes('multimodal') ||
            errorMessage.includes('unsupported') ||
            errorMessage.includes('image_url') ||
            errorMessage.includes('400') ||  // Bad Request often for unsupported features
            errorMessage.includes('invalid') ||
            errorMessage.includes('not supported')
        );
    }

}

const askService = new AskService();

// Export both the service instance and the screenshot queue functions
module.exports = {
    // AskService instance methods (default export behavior)
    sendMessage: (...args) => askService.sendMessage(...args),
    toggleAskButton: (...args) => askService.toggleAskButton(...args),
    closeAskWindow: (...args) => askService.closeAskWindow(...args),
    
    // Screenshot queue management functions
    captureManualScreenshotToQueue,
    addScreenshotToQueue,
    getAndClearScreenshotQueue,
    hasQueuedScreenshots,
    clearScreenshotQueue,
    getScreenshotQueueSize,
    
    // Also export the instance for direct access if needed
    _instance: askService,
};