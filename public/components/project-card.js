class ProjectCard extends HTMLElement {
    connectedCallback() {
        if (!this.shadowRoot) {
            this.attachShadow({ mode: 'open' });
        }

        this.render();
        this.attachNavigation();
        this.initIcons();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .project-card {
                    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                }

                .project-card:hover {
                    transform: translateY(-8px) scale(1.02);
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.08);
                }

                .platform-icon {
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .project-card:hover .platform-icon {
                    transform: scale(1.15);
                    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
                }
            </style>
            <div class="project-card bg-white rounded-xl p-6 shadow-lg" role="button" tabindex="0" aria-label="Open project in editor">
                <div class="flex items-start justify-between mb-4">
                    <div>
                        <h3 class="text-xl font-bold text-gray-800 mb-2">Social Media Campaign</h3>
                        <p class="text-gray-600 text-sm">Last edited: 2 hours ago</p>
                    </div>
                    <div class="text-gray-400 hover:text-purple-600 transition-colors duration-300">
                        <i data-feather="more-horizontal" class="w-5 h-5"></i>
                    </div>
                </div>

                <div class="flex items-center space-x-2 mb-4">
                    <span class="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full">Active</span>
                    <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">3 Platforms</span>
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <div class="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                            <i data-feather="youtube" class="text-red-600 w-3 h-3 platform-icon"></i>
                        </div>
                        <div class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                            <i data-feather="instagram" class="text-blue-600 w-3 h-3 platform-icon"></i>
                        </div>
                        <div class="w-6 h-6 bg-black rounded-full flex items-center justify-center">
                            <i data-feather="twitter" class="text-white w-3 h-3 platform-icon"></i>
                        </div>
                    </div>
                    <i data-feather="arrow-right" class="w-5 h-5 text-gray-400"></i>
                </div>
            </div>
        `;
    }

    attachNavigation() {
        const card = this.shadowRoot.querySelector('.project-card');
        if (!card) {
            return;
        }

        const navigate = () => {
            window.location.href = 'editor.html';
        };

        card.addEventListener('click', navigate);
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate();
            }
        });
    }

    initIcons() {
        requestAnimationFrame(() => {
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        });
    }
}

customElements.define('project-card', ProjectCard);
