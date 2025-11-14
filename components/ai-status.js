class AIStatus extends HTMLElement {
    connectedCallback() {
        this.attachShadow({ mode: 'open' });
        this.render();
        this.checkStatus();
        
        // Listen for API key changes
        window.addEventListener('storage', (e) => {
            if (e.key === 'openai_api_key') {
                this.checkStatus();
            }
        });
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
            <div class="ai-status ai-status-disabled" id="status-container">
                <div class="status-dot disabled"></div>
                <span id="status-text">AI: Not Configured</span>
            </div>
        `;
    }

    checkStatus() {
        const apiKey = localStorage.getItem('openai_api_key');
        const statusContainer = this.shadowRoot.getElementById('status-container');
        const statusDot = statusContainer.querySelector('.status-dot');
        const statusText = this.shadowRoot.getElementById('status-text');

        if (!apiKey) {
            statusContainer.className = 'ai-status ai-status-disabled';
            statusDot.className = 'status-dot disabled';
            statusText.textContent = 'AI: Not Configured';
            return;
        }

        // Test the connection
        fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        }).then(response => {
            if (response.ok) {
                statusContainer.className = 'ai-status ai-status-connected';
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'AI: Connected';
        }).catch(() => {
            statusContainer.className = 'ai-status ai-status-disconnected';
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'AI: Connection Failed';
        });
    }
}

customElements.define('ai-status', AIStatus);