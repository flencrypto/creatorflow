class CustomNavbar extends HTMLElement {
    connectedCallback() {
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                .navbar {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(20px) saturate(180%);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
                    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 
                        0 8px 32px rgba(0, 0, 0, 0.08);
                }
                
                .navbar-scrolled {
                    background: rgba(255, 255, 255, 0.12);
                    backdrop-filter: blur(25px);
                    box-shadow: 
                        0 12px 40px rgba(0, 0, 0, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2);
                }
                
                .nav-link {
                    position: relative;
                    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .nav-link:hover {
                    color: #7c3aed;
                    transform: translateY(-2px);
                }
                
                .nav-link::after {
                    content: '';
                    position: absolute;
                    width: 0;
                    height: 2px;
                    bottom: -4px;
                    left: 0;
                    background: linear-gradient(135deg, #7c3aed, #4f46e5);
                    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .nav-link:hover::after {
                    width: 100%;
                }
                
                .mobile-menu {
                    transform: translateX(-100%);
                    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .mobile-menu.open {
                    transform: translateX(0);
                }

                /* Enhanced mobile menu with glass effect */
                .mobile-menu {
                    background: rgba(255, 255, 255, 0.08);
                    backdrop-filter: blur(25px);
                }
            </style>
            <nav class="navbar fixed top-0 left-0 right-0 z-50 header-container">
                <div class="container mx-auto px-4 py-3">
                    <div class="flex items-center justify-between">
                        <!-- Logo -->
                        <a href="index.html" class="flex items-center space-x-2">
                            <div class="w-8 h-8 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center">
                                <i data-feather="wand" class="text-white w-4 h-4"></i>
                            </div>
                            <span class="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                                CreatorFlow
                            </span>
                        </a>
<!-- Desktop Navigation -->
                <div class="hidden md:flex items-center space-x-6">
                            <a href="index.html" class="nav-link text-gray-700 font-medium">Home</a>
                            <a href="dashboard.html" class="nav-link text-gray-700 font-medium">Dashboard</a>
                            <a href="editor.html" class="nav-link text-gray-700 font-medium">Editor</a>
                        <a href="templates.html" class="nav-link text-gray-700 font-medium">Templates</a>
                        <a href="pricing.html" class="nav-link text-gray-700 font-medium">Pricing</a>
                        <a href="integrations.html" class="nav-link text-gray-700 font-medium">Integrations</a>
                        <a href="help.html" class="nav-link text-gray-700 font-medium">Help</a>
                        <a href="admin-login.html" class="nav-link text-gray-700 font-medium">Admin</a>
</div>
<!-- Auth Buttons -->
                        <div class="hidden md:flex items-center space-x-4">
                        <a href="login.html" class="text-gray-700 hover:text-purple-600 font-medium transition-colors duration-300">
                            Sign In
                        </a>
                        <a href="signup.html" class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 hover:shadow-lg">
                                Start Free Trial
                            </a>
</div>
<!-- Mobile Menu Button -->
                        <button class="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors duration-300" id="mobile-menu-button">
                                <i data-feather="menu" class="w-6 h-6 text-gray-700"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Mobile Menu -->
                <div class="mobile-menu md:hidden fixed inset-0 bg-white z-40 pt-20 px-6">
                            <button class="absolute top-4 right-4 p-2" id="mobile-menu-close">
                                <i data-feather="x" class="w-6 h-6 text-gray-700"></button>
                            
                            <div class="space-y-6">
                                <a href="index.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Home
                            </a>
                            <a href="dashboard.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Dashboard
                            </a>
                            <a href="editor.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Editor
                            </a>
                            <a href="templates.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Editor
                            </a>
                            <a href="templates.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Templates
                            </a>
                            <a href="pricing.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Templates
                            </a>
                            <a href="pricing.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Pricing
                            </a>
                            <a href="integrations.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Integrations
                            </a>
                            <a href="help.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Help
                            </a>
<div class="pt-6 border-t border-gray-200">
                                <a href="login.html" class="block text-lg font-medium text-gray-700 hover:text-purple-600 transition-colors duration-300">
                                Sign In
                            </a>
                            <a href="dashboard.html" class="block mt-4 bg-purple-600 text-white text-lg font-medium px-4 py-2 rounded-lg text-center">
                                Get Started
                            </a>
                        </div>
</div>
                </div>
            </nav>
        `;
        
        // Add scroll effect
        this.addScrollEffect();
        
        // Initialize mobile menu
        this.initMobileMenu();
        
        // Initialize Feather icons after a short delay
        setTimeout(() => {
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        }, 100);
    }
    addScrollEffect() {
        const navbar = this.shadowRoot.querySelector('.navbar');
        window.addEventListener('scroll', () => {
            if (window.scrollY > 10) {
                navbar.classList.add('navbar-scrolled');
            } else {
                navbar.classList.remove('navbar-scrolled');
            }
        });
    }
initMobileMenu() {
        const menuButton = this.shadowRoot.getElementById('mobile-menu-button');
        const menuClose = this.shadowRoot.getElementById('mobile-menu-close');
        const mobileMenu = this.shadowRoot.querySelector('.mobile-menu');
        
        menuButton.addEventListener('click', () => {
            mobileMenu.classList.add('open');
        });
        
        menuClose.addEventListener('click', () => {
            mobileMenu.classList.remove('open');
        });
        
        // Close menu when clicking on links
        const mobileLinks = mobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('open');
            });
        });
    }
}

customElements.define('custom-navbar', CustomNavbar);