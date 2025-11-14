class CustomFooter extends HTMLElement {
    connectedCallback() {
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                .footer-link {
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .footer-link:hover {
                    color: #7c3aed;
                    transform: translateX(8px);
                }

                /* Enhanced footer with glass effect */
                footer {
                    background: rgba(0, 0, 0, 0.08);
                    backdrop-filter: blur(20px);
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
</style>
            <footer class="bg-gradient-to-r from-gray-900 to-purple-900 text-white">
                <div class="container mx-auto px-4 py-12">
                    <div class="grid md:grid-cols-4 gap-8">
                    <!-- Company Info -->
                    <div class="md:col-span-2">
                        <div class="flex items-center space-x-2 mb-4">
                            <div class="w-8 h-8 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-lg flex items-center justify-center">
                                <i data-feather="wand" class="text-white w-4 h-4"></i>
                            </div>
                            <span class="text-xl font-bold">CreatorFlow Studio</span>
                        </div>
                        <p class="text-gray-300 mb-4 max-w-md">
                            Your AI-powered content creation companion. Generate, organize, and publish stunning content across all platforms.
                        </p>
                        <div class="flex space-x-4">
                            <a href="#" class="text-gray-300 hover:text-white transition-colors duration-300">
                                <i data-feather="twitter" class="w-5 h-5"></i>
                            </a>
                            <a href="#" class="text-gray-300 hover:text-white transition-colors duration-300">
                                <i data-feather="instagram" class="w-5 h-5"></i>
                            </a>
                            <a href="#" class="text-gray-300 hover:text-white transition-colors duration-300">
                                <i data-feather="linkedin" class="w-5 h-5"></i>
                            </a>
                            <a href="#" class="text-gray-300 hover:text-white transition-colors duration-300">
                                <i data-feather="youtube" class="w-5 h-5"></i>
                            </a>
                        </div>
                    </div>
                    
                    <!-- Product Links -->
                    <div>
                        <h3 class="font-semibold text-lg mb-4">Product</h3>
                        <ul class="space-y-2">
                            <li><a href="features.html" class="footer-link text-gray-300">Features</a></li>
                            <li><a href="pricing.html" class="footer-link text-gray-300">Pricing</a></li>
                        <li><a href="templates.html" class="footer-link text-gray-300">Templates</a></li>
                        <li><a href="integrations.html" class="footer-link text-gray-300">Integrations</a></li>
                        <li><a href="signup.html" class="footer-link text-gray-300">Free Trial</a></li>
</ul>
                    </div>
                    <!-- Support Links -->
                    <div>
                        <h3 class="font-semibold text-lg mb-4">Support</h3>
                        <ul class="space-y-2">
                            <li><a href="help.html" class="footer-link text-gray-300">Help Center</a></li>
                            <li><a href="contact.html" class="footer-link text-gray-300">Contact</a></li>
                            <li><a href="privacy.html" class="footer-link text-gray-300">Privacy</a></li>
                            <li><a href="terms.html" class="footer-link text-gray-300">Terms</a></li>
                            <li><a href="admin-login.html" class="footer-link text-gray-300">Admin</a>
</li>
</ul>
</div>
                </div>
                
                <!-- Bottom Bar -->
                <div class="border-t border-gray-800 mt-8 pt-8">
                    <div class="flex flex-col md:flex-row justify-between items-center">
                        <p class="text-gray-400 text-sm mb-4 md:mb-0">
                            © 2024 CreatorFlow Studio. All rights reserved.
                        </p>
                        <div class="flex space-x-6">
                            <a href="#" class="text-gray-400 hover:text-white text-sm transition-colors duration-300">
                                Status
                            </a>
                            <a href="#" class="text-gray-400 hover:text-white text-sm transition-colors duration-300">
                                Security
                            </a>
                            <a href="#" class="text-gray-400 hover:text-white text-sm transition-colors duration-300">
                                Docs
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
        `;
        
        // Initialize Feather icons after a short delay
        setTimeout(() => {
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        }, 100);
    }
}

customElements.define('custom-footer', CustomFooter);