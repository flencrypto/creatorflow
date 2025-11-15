const STATUS_VARIANTS = {
    connected: {
        container: 'ai-status ai-status-connected',
        dot: 'status-dot connected',
    },
    disconnected: {
        container: 'ai-status ai-status-disconnected',
        dot: 'status-dot disconnected',
    },
    disabled: {
        container: 'ai-status ai-status-disabled',
        dot: 'status-dot disabled',
    },
    checking: {
        container: 'ai-status ai-status-disabled',
        dot: 'status-dot disabled',
    },
};

class AIStatus extends HTMLElement {
    constructor() {
        super();
        this.handleStorageChange = this.handleStorageChange.bind(this);
        this.abortController = null;
    }

    connectedCallback() {
        if (!this.shadowRoot) {
            this.attachShadow({ mode: 'open' });
        }

        this.render();
        this.setStatus('disabled', 'AI: Not Configured');
        this.checkStatus().catch(() => {
            // Errors are surfaced through setStatus; no-op here to avoid noisy console logs.
        });

        window.addEventListener('storage', this.handleStorageChange);
    }

    disconnectedCallback() {
        window.removeEventListener('storage', this.handleStorageChange);
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .ai-status {
                    display: inline-flex;
                    align-items: center;
                    padding: 0.25rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 500;
                }
                .ai-status-connected {
                    background-color: #dcfce7;
                    color: #166534;
                }
                .ai-status-disconnected {
                    background-color: #fee2e2;
                    color: #991b1b;
                }
                .ai-status-disabled {
                    background-color: #f3f4f6;
                    color: #374151;
                }
                .status-dot {
                    width: 0.5rem;
                    height: 0.5rem;
                    border-radius: 50%;
                    margin-right: 0.375rem;
                    animation: pulse 2s infinite;
                }
                .connected {
                    background-color: #22c55e;
                }
                .disconnected {
                    background-color: #ef4444;
                }
                .disabled {
                    background-color: #9ca3af;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            </style>
            <div class="ai-status ai-status-disabled" id="status-container" role="status" aria-live="polite">
                <div class="status-dot disabled" aria-hidden="true"></div>
                <span id="status-text">AI: Not Configured</span>
            </div>
        `;
    }

    setStatus(state, label) {
        const container = this.shadowRoot.getElementById('status-container');
        const dot = container?.querySelector('.status-dot');
        const text = this.shadowRoot.getElementById('status-text');
        const variant = STATUS_VARIANTS[state] ?? STATUS_VARIANTS.disabled;

        if (container) {
            container.className = variant.container;
        }
        if (dot) {
            dot.className = variant.dot;
        }
        if (text) {
            text.textContent = label;
        }
    }

    async checkStatus() {
        const apiKey = localStorage.getItem('openai_api_key');
        if (!apiKey) {
            this.setStatus('disabled', 'AI: Not Configured');
            return;
        }

        this.setStatus('checking', 'AI: Checking connection...');

        if (this.abortController) {
            this.abortController.abort();
        }
        const controller = new AbortController();
        this.abortController = controller;

        try {
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                signal: controller.signal,
            });

            if (controller.signal.aborted || this.abortController !== controller) {
                return;
            }

            if (response.ok) {
                this.setStatus('connected', 'AI: Connected');
                return;
            }

            this.setStatus('disconnected', 'AI: Connection Failed');
        } catch (error) {
            if (controller.signal.aborted || this.abortController !== controller) {
                return;
            }
            this.setStatus('disconnected', 'AI: Connection Failed');
        } finally {
            if (this.abortController === controller) {
                this.abortController = null;
            }
        }
    }

    handleStorageChange(event) {
        if (event.key === 'openai_api_key') {
            this.checkStatus().catch(() => {
                this.setStatus('disconnected', 'AI: Connection Failed');
            });
        }
    }
}

customElements.define('ai-status', AIStatus);
