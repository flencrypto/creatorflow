class DashboardStats extends HTMLElement {
    connectedCallback() {
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                .stat-card {
                    background: rgba(255, 255, 255, 0.08);
                    backdrop-filter: blur(15px);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 
                        0 8px 32px rgba(0, 0, 0, 0.06);
                }
                
                .stat-card:hover {
                    transform: translateY(-8px) scale(1.02);
                    box-shadow: 
                        0 20px 40px rgba(0, 0, 0, 0.08);
                }
.trend-up {
                    color: #10b981;
                }
                
                .trend-down {
                    color: #ef4444;
                }
            </style>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Content Generated -->
                <div class="stat-card rounded-xl p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <i data-feather="file-text" class="text-purple-600 w-6 h-6"></i>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-800">1,247</h3>
                    <p class="text-gray-600">Content Generated</p>
                    <div class="flex items-center mt-2">
                        <i data-feather="trending-up" class="w-4 h-4 trend-up mr-1"></i>
                    <span class="text-sm trend-up">+12% this week</span>
                </div>
            </div>
            
            <!-- Time Saved -->
            <div class="stat-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <i data-feather="clock" class="text-blue-600 w-6 h-6"></i>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-800">42h</h3>
                    <p class="text-gray-600">Time Saved</p>
                    <div class="flex items-center mt-2">
                        <i data-feather="trending-up" class="w-4 h-4 trend-up mr-1"></i>
                    <span class="text-sm trend-up">+8h this week</span>
                </div>
            </div>
            
            <!-- Templates Used -->
            <div class="stat-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <i data-feather="layers" class="text-green-600 w-6 h-6"></i>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-800">89</h3>
                    <p class="text-gray-600">Templates Used</p>
                    <div class="flex items-center mt-2">
                        <i data-feather="trending-up" class="w-4 h-4 trend-up mr-1"></i>
                    <span class="text-sm trend-up">+15 this week</span>
                </div>
            </div>
            
            <!-- Platforms -->
            <div class="stat-card rounded-xl p-6">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                        <i data-feather="share-2" class="text-orange-600 w-6 h-6"></i>
                    </div>
                    <h3 class="text-2xl font-bold text-gray-800">6</h3>
                    <p class="text-gray-600">Platforms Active</p>
                    <div class="flex items-center mt-2">
                        <i data-feather="trending-up" class="w-4 h-4 trend-up mr-1"></i>
                    <span class="text-sm trend-up">+1 this week</span>
                </div>
            </div>
        </div>
        `;
        
        // Initialize Feather icons after a short delay
        setTimeout(() => {
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        }, 100);
    }
}

customElements.define('dashboard-stats', DashboardStats);