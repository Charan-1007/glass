import { html, css, LitElement } from '../assets/lit-core-2.7.4.min.js';

export class ListenView extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 400px;
            height: 100vh;
            overflow: hidden;
            transform: translate3d(0, 0, 0);
            backface-visibility: hidden;
            transition: transform 0.2s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.2s ease-out;
            will-change: transform, opacity;
        }

        :host(.hiding) {
            animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }

        :host(.showing) {
            animation: slideDown 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        :host(.hidden) {
            opacity: 0;
            transform: translateY(-150%) scale(0.85);
            pointer-events: none;
        }

        * {
            font-family: 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: default;
            user-select: none;
        }

        .transcription-container *,
        .transcription-container {
            user-select: text !important;
            cursor: text !important;
        }

        .listen-container {
            display: flex;
            flex-direction: column;
            color: #ffffff;
            box-sizing: border-box;
            position: relative;
            background: rgba(0, 0, 0, 0.6);
            overflow: visible;
            border-radius: 12px;
            width: 100%;
            height: 100%;
        }

        .listen-container::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 12px;
            padding: 1px;
            background: linear-gradient(169deg, rgba(255, 255, 255, 0.17) 0%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0.17) 100%);
            -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
            -webkit-mask-composite: destination-out;
            mask-composite: exclude;
            pointer-events: none;
        }

        .listen-container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.15);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            z-index: -1;
        }

        .top-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 16px;
            min-height: 32px;
            position: relative;
            z-index: 1;
            width: 100%;
            box-sizing: border-box;
            flex-shrink: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .bar-left {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            min-width: 0;
        }

        .status-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.4);
            flex-shrink: 0;
            transition: background 0.3s;
        }

        .status-dot.recording {
            background: #ff3b30;
            animation: pulse-dot 1.5s ease-in-out infinite;
        }

        .status-dot.processing {
            background: #ff9500;
            animation: pulse-dot 0.8s ease-in-out infinite;
        }

        @keyframes pulse-dot {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .bar-title {
            color: white;
            font-size: 13px;
            font-family: 'Helvetica Neue', sans-serif;
            font-weight: 500;
            white-space: nowrap;
        }

        .timer {
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.5);
        }

        .bar-controls {
            display: flex;
            gap: 4px;
            align-items: center;
            flex-shrink: 0;
        }

        .copy-button {
            background: transparent;
            color: rgba(255, 255, 255, 0.9);
            border: none;
            outline: none;
            box-shadow: none;
            padding: 4px;
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 24px;
            height: 24px;
            flex-shrink: 0;
            transition: background-color 0.15s ease;
            position: relative;
            overflow: hidden;
        }

        .copy-button:hover {
            background: rgba(255, 255, 255, 0.15);
        }

        .copy-button svg {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            transition: opacity 0.2s ease-in-out, transform 0.2s ease-in-out;
        }

        .copy-button .check-icon {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }

        .copy-button.copied .copy-icon {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
        }

        .copy-button.copied .check-icon {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }

        .transcription-container {
            overflow-y: scroll;
            padding: 12px 16px 16px 16px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-height: 0;
            flex: 1 1 0;
            max-height: calc(100vh - 45px);
        }

        .transcription-container::-webkit-scrollbar {
            width: 6px;
        }

        .transcription-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 3px;
        }

        .transcription-container::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 3px;
        }

        .transcription-container::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.35);
        }

        .transcript-line {
            font-size: 13px;
            line-height: 1.6;
            color: rgba(255, 255, 255, 0.9);
            padding: 4px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }

        .transcript-line:last-child {
            border-bottom: none;
        }

        .transcript-line.partial {
            color: rgba(255, 255, 255, 0.5);
            font-style: italic;
        }

        .transcript-line.separator {
            text-align: center;
            color: rgba(255, 255, 255, 0.2);
            font-size: 11px;
            border-bottom: none;
            padding: 2px 0;
            letter-spacing: 2px;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 80px;
            gap: 6px;
        }

        .empty-state-text {
            color: rgba(255, 255, 255, 0.4);
            font-size: 12px;
        }

        .empty-state-hint {
            color: rgba(255, 255, 255, 0.25);
            font-size: 11px;
        }

        /* ────────────────[ GLASS BYPASS ]─────────────── */
        :host-context(body.has-glass) .listen-container,
        :host-context(body.has-glass) .top-bar,
        :host-context(body.has-glass) .copy-button,
        :host-context(body.has-glass) .transcription-container,
        :host-context(body.has-glass) .transcript-line {
            background: transparent !important;
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
            filter: none !important;
            backdrop-filter: none !important;
        }

        :host-context(body.has-glass) .listen-container::before,
        :host-context(body.has-glass) .listen-container::after {
            display: none !important;
        }

        :host-context(body.has-glass) .copy-button:hover {
            background: transparent !important;
        }

        :host-context(body.has-glass) .transcription-container::-webkit-scrollbar-track,
        :host-context(body.has-glass) .transcription-container::-webkit-scrollbar-thumb {
            background: transparent !important;
        }

        :host-context(body.has-glass) * {
            animation: none !important;
            transition: none !important;
            transform: none !important;
            filter: none !important;
            backdrop-filter: none !important;
            box-shadow: none !important;
        }

        :host-context(body.has-glass) .listen-container,
        :host-context(body.has-glass) .copy-button {
            border-radius: 0 !important;
        }

        :host-context(body.has-glass) ::-webkit-scrollbar,
        :host-context(body.has-glass) ::-webkit-scrollbar-track,
        :host-context(body.has-glass) ::-webkit-scrollbar-thumb {
            background: transparent !important;
            width: 0 !important;
        }
    `;

    static properties = {
        copyState: { type: String },
        elapsedTime: { type: String },
        isSessionActive: { type: Boolean },
        transcriptMessages: { type: Array },
        isProcessing: { type: Boolean },
    };

    constructor() {
        super();
        this.isSessionActive = false;
        this.elapsedTime = '00:00';
        this.captureStartTime = null;
        this.timerInterval = null;
        this.isThrottled = false;
        this.adjustHeightThrottle = null;
        this.copyState = 'idle';
        this.copyTimeout = null;
        this.transcriptMessages = [];
        this.messageIdCounter = 0;
        this._shouldScrollAfterUpdate = false;
        this.isProcessing = false;

        this.adjustWindowHeight = this.adjustWindowHeight.bind(this);
        this.handleSttUpdate = this.handleSttUpdate.bind(this);
    }

    connectedCallback() {
        super.connectedCallback();

        if (this.isSessionActive) {
            this.startTimer();
        }

        if (window.api) {
            // Listen for session state changes
            window.api.listenView.onSessionStateChanged((event, { isActive }) => {
                const wasActive = this.isSessionActive;
                this.isSessionActive = isActive;

                if (!wasActive && isActive) {
                    // New session started — keep previous transcript, add separator
                    if (this.transcriptMessages.length > 0) {
                        this.transcriptMessages = [
                            ...this.transcriptMessages,
                            { id: this.messageIdCounter++, text: '───────────────', isPartial: false, isFinal: true, isSeparator: true },
                        ];
                    }
                    this.isProcessing = false;
                    this.startTimer();
                    this.requestUpdate();
                }
                if (wasActive && !isActive) {
                    // Session stopped — show processing state until transcription arrives
                    this.isProcessing = true;
                    this.stopTimer();
                    this.requestUpdate();
                    // Fallback: clear processing state after 30s if no transcription arrives
                    this._processingTimeout = setTimeout(() => {
                        this.isProcessing = false;
                        this.requestUpdate();
                    }, 30000);
                }
            });

            // Listen for transcription updates directly
            window.api.sttView.onSttUpdate(this.handleSttUpdate);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.stopTimer();

        if (this.adjustHeightThrottle) {
            clearTimeout(this.adjustHeightThrottle);
            this.adjustHeightThrottle = null;
        }
        if (this.copyTimeout) {
            clearTimeout(this.copyTimeout);
        }
        if (this._processingTimeout) {
            clearTimeout(this._processingTimeout);
            this._processingTimeout = null;
        }
        if (window.api) {
            window.api.sttView.removeOnSttUpdate(this.handleSttUpdate);
        }
    }

    handleSttUpdate(event, { speaker, text, isFinal, isPartial }) {
        if (text === undefined) return;
        console.log(`[ListenView] stt-update received: speaker=${speaker}, isFinal=${isFinal}, text="${text?.substring(0, 80)}"`);

        // Clear processing state when transcription arrives
        if (this.isProcessing) {
            this.isProcessing = false;
            if (this._processingTimeout) {
                clearTimeout(this._processingTimeout);
                this._processingTimeout = null;
            }
        }

        // Always auto-scroll when new transcription arrives
        this._shouldScrollAfterUpdate = true;

        const findLastPartialIdx = () => {
            for (let i = this.transcriptMessages.length - 1; i >= 0; i--) {
                if (this.transcriptMessages[i].isPartial) return i;
            }
            return -1;
        };

        const newMessages = [...this.transcriptMessages];
        const targetIdx = findLastPartialIdx();

        if (isPartial) {
            if (targetIdx !== -1) {
                newMessages[targetIdx] = { ...newMessages[targetIdx], text, isPartial: true, isFinal: false };
            } else {
                newMessages.push({ id: this.messageIdCounter++, text, isPartial: true, isFinal: false });
            }
        } else if (isFinal) {
            if (targetIdx !== -1) {
                newMessages[targetIdx] = { ...newMessages[targetIdx], text, isPartial: false, isFinal: true };
            } else {
                newMessages.push({ id: this.messageIdCounter++, text, isPartial: false, isFinal: true });
            }
        }

        this.transcriptMessages = newMessages;
        this.isProcessing = false;
        this.adjustWindowHeightThrottled();
    }

    startTimer() {
        this.captureStartTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.captureStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            this.elapsedTime = `${minutes}:${seconds}`;
            this.requestUpdate();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    adjustWindowHeight() {
        if (!window.api) return;

        this.updateComplete
            .then(() => {
                const topBar = this.shadowRoot?.querySelector('.top-bar');
                const content = this.shadowRoot?.querySelector('.transcription-container');
                if (!topBar || !content) return;

                const idealHeight = topBar.offsetHeight + content.scrollHeight;
                const targetHeight = Math.min(700, idealHeight);

                window.api.listenView.adjustWindowHeight('listen', targetHeight);
            })
            .catch(err => console.error('ListenView adjustWindowHeight error:', err));
    }

    adjustWindowHeightThrottled() {
        if (this.isThrottled) return;
        this.adjustWindowHeight();
        this.isThrottled = true;
        this.adjustHeightThrottle = setTimeout(() => { this.isThrottled = false; }, 16);
    }

    getTranscriptText() {
        return this.transcriptMessages
            .filter(m => m.isFinal)
            .map(m => m.text)
            .join('\n');
    }

    async handleCopy() {
        if (this.copyState === 'copied') return;

        const textToCopy = this.getTranscriptText();
        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);
            this.copyState = 'copied';
            this.requestUpdate();

            if (this.copyTimeout) clearTimeout(this.copyTimeout);
            this.copyTimeout = setTimeout(() => {
                this.copyState = 'idle';
                this.requestUpdate();
            }, 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        if (changedProperties.has('transcriptMessages')) {
            if (this._shouldScrollAfterUpdate) {
                setTimeout(() => {
                    const container = this.shadowRoot?.querySelector('.transcription-container');
                    if (container) container.scrollTop = container.scrollHeight;
                }, 0);
                this._shouldScrollAfterUpdate = false;
            }
        }
    }

    firstUpdated() {
        super.firstUpdated();
        setTimeout(() => this.adjustWindowHeight(), 200);
    }

    render() {
        const statusClass = this.isSessionActive ? 'recording' : this.isProcessing ? 'processing' : '';
        const titleText = this.isSessionActive
            ? `Listening ${this.elapsedTime}`
            : this.isProcessing
              ? 'Processing...'
              : this.transcriptMessages.length > 0
                ? 'Transcript'
                : 'Transcript';

        const hasFinalMessages = this.transcriptMessages.some(m => m.isFinal);

        return html`
            <div class="listen-container">
                <div class="top-bar">
                    <div class="bar-left">
                        <div class="status-dot ${statusClass}"></div>
                        <span class="bar-title">${titleText}</span>
                    </div>
                    <div class="bar-controls">
                        ${hasFinalMessages ? html`
                            <button
                                class="copy-button ${this.copyState === 'copied' ? 'copied' : ''}"
                                @click=${this.handleCopy}
                            >
                                <svg class="copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                                <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                </div>

                <div class="transcription-container">
                    ${this.transcriptMessages.length === 0
                        ? html`
                            <div class="empty-state">
                                <span class="empty-state-text">
                                    ${this.isSessionActive ? 'Listening for audio...' : 'No transcript yet'}
                                </span>
                                ${!this.isSessionActive ? html`
                                    <span class="empty-state-hint">Press Ctrl+Shift+L to start</span>
                                ` : ''}
                            </div>
                        `
                        : this.transcriptMessages.map(msg => html`
                            <div class="transcript-line ${msg.isPartial ? 'partial' : ''} ${msg.isSeparator ? 'separator' : ''}">
                                ${msg.text}
                            </div>
                        `)
                    }
                </div>
            </div>
        `;
    }
}

customElements.define('listen-view', ListenView);
