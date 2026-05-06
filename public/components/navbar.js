const NAV_ITEMS = [
    { href: 'index.html', label: 'Home' },
    { href: 'dashboard.html', label: 'Dashboard' },
    { href: 'editor.html', label: 'Editor' },
    { href: 'templates.html', label: 'Templates' },
    { href: 'pricing.html', label: 'Pricing' },
    { href: 'integrations.html', label: 'Integrations' },
    { href: 'help.html', label: 'Help' },
    { href: 'admin-login.html', label: 'Admin' }
];

const AUTH_ACTIONS = [
    { href: 'login.html', label: 'Sign In', variant: 'ghost' },
    { href: 'signup.html', label: 'Start Free Trial', variant: 'primary' }
];

class CustomNavbar extends HTMLElement {
    constructor() {
        super();
        this.handleRouteChange = () => this.highlightActiveLink();
        this.handleCloseOnEscape = null;
    }

    connectedCallback() {
        this.attachShadow({ mode: 'open' });

        const desktopLinks = NAV_ITEMS.map(
            ({ href, label }) => `
                <a href="${href}" class="nav-link" data-nav>
                    ${label}
                </a>
            `
        ).join('');

        const mobileLinks = NAV_ITEMS.map(
            ({ href, label }) => `
                <a href="${href}" class="nav-link mobile-link" data-nav>
                    ${label}
                </a>
            `
        ).join('');

        const authLinks = AUTH_ACTIONS.map(({ href, label, variant }) => {
            if (variant === 'primary') {
                return `
                    <a href="${href}" class="nav-cta" data-auth>
                        ${label}
                    </a>
                `;
            }

            return `
                <a href="${href}" class="nav-action" data-auth>
                    ${label}
                </a>
            `;
        }).join('');

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: contents;
                }

                .navbar {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    z-index: 1000;
                    background: linear-gradient(135deg, rgba(7, 17, 35, 0.92), rgba(3, 9, 26, 0.88));
                    backdrop-filter: blur(24px) saturate(180%);
                    border-bottom: 1px solid rgba(56, 189, 248, 0.18);
                    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow:
                        0 16px 40px rgba(2, 8, 23, 0.6),
                        inset 0 1px 0 rgba(148, 163, 184, 0.05);
                    padding: 0 1.25rem;
                }

                .navbar-scrolled {
                    background: linear-gradient(135deg, rgba(4, 12, 31, 0.95), rgba(2, 6, 20, 0.95));
                    border-bottom-color: rgba(56, 189, 248, 0.28);
                    box-shadow:
                        0 20px 60px rgba(2, 8, 23, 0.7),
                        inset 0 1px 0 rgba(148, 163, 184, 0.08);
                }

                .nav-shell {
                    width: min(1100px, calc(100% - 2rem));
                    margin: 0 auto;
                    padding: 0.9rem 0;
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                }

                .brand {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.8rem;
                    text-decoration: none;
                    color: #e2e8f0;
                    font-weight: 600;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }

                .brand-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 14px;
                    display: grid;
                    place-items: center;
                    background: radial-gradient(circle at 25% 25%, rgba(56, 189, 248, 0.9), rgba(2, 6, 23, 0.9));
                    border: 1px solid rgba(56, 189, 248, 0.25);
                    box-shadow: 0 10px 25px rgba(8, 145, 178, 0.4), inset 0 1px 0 rgba(148, 163, 184, 0.12);
                }

                .brand-name {
                    font-size: 0.95rem;
                    background: linear-gradient(120deg, rgba(56, 189, 248, 0.95), rgba(94, 234, 212, 0.95));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    text-shadow: 0 0 16px rgba(56, 189, 248, 0.35);
                }

                .desktop-links {
                    display: flex;
                    align-items: center;
                    gap: 1.4rem;
                    margin-left: auto;
                }

                .nav-link {
                    position: relative;
                    color: #cbd5f5;
                    font-weight: 500;
                    letter-spacing: 0.01em;
                    text-decoration: none;
                    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .nav-link::after {
                    content: '';
                    position: absolute;
                    left: 0;
                    bottom: -6px;
                    width: 0;
                    height: 2px;
                    background: linear-gradient(120deg, rgba(56, 189, 248, 1), rgba(20, 184, 166, 1));
                    box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
                    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .nav-link:hover,
                .nav-link:focus-visible {
                    color: #ffffff;
                    transform: translateY(-2px);
                }

                .nav-link:hover::after,
                .nav-link:focus-visible::after,
                .nav-link.is-active::after,
                .nav-link[aria-current='page']::after {
                    width: 100%;
                }

                .nav-link.is-active,
                .nav-link[aria-current='page'] {
                    color: #ffffff;
                    text-shadow: 0 0 12px rgba(56, 189, 248, 0.45);
                }

                .actions {
                    display: flex;
                    align-items: center;
                    gap: 1.2rem;
                    margin-left: 1.2rem;
                }

                .nav-action {
                    color: #94a3b8;
                    text-decoration: none;
                    font-weight: 500;
                    transition: color 0.3s ease;
                }

                .nav-action:hover,
                .nav-action:focus-visible {
                    color: #e2e8f0;
                }

                .nav-cta {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0.55rem 1.4rem;
                    border-radius: 999px;
                    background: linear-gradient(120deg, rgba(59, 130, 246, 0.95) 0%, rgba(2, 132, 199, 0.95) 100%);
                    color: #ffffff;
                    font-weight: 600;
                    text-decoration: none;
                    box-shadow: 0 18px 36px rgba(34, 211, 238, 0.35), 0 0 24px rgba(56, 189, 248, 0.45);
                    transition: transform 0.35s ease, box-shadow 0.35s ease;
                }

                .nav-cta::after {
                    content: '';
                    position: absolute;
                    inset: -1px;
                    border-radius: inherit;
                    border: 1px solid rgba(148, 163, 184, 0.2);
                    opacity: 0.6;
                }

                .nav-cta:hover,
                .nav-cta:focus-visible {
                    transform: translateY(-2px);
                    box-shadow: 0 20px 44px rgba(34, 211, 238, 0.4), 0 0 32px rgba(56, 189, 248, 0.55);
                }

                .mobile-toggle {
                    display: none;
                    padding: 0.5rem;
                    border-radius: 12px;
                    border: 1px solid rgba(56, 189, 248, 0.18);
                    background: rgba(7, 17, 35, 0.6);
                    color: #e2e8f0;
                    cursor: pointer;
                    transition: border-color 0.3s ease, transform 0.3s ease;
                }

                .mobile-toggle:hover,
                .mobile-toggle:focus-visible {
                    border-color: rgba(56, 189, 248, 0.4);
                    transform: translateY(-2px);
                }

                .mobile-scrim {
                    position: fixed;
                    inset: 0;
                    background: rgba(2, 6, 23, 0.65);
                    backdrop-filter: blur(6px);
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.4s ease;
                    z-index: 999;
                }

                .mobile-scrim.visible {
                    opacity: 1;
                    pointer-events: auto;
                }

                .mobile-menu {
                    position: fixed;
                    top: 0;
                    left: 0;
                    bottom: 0;
                    width: min(360px, 82vw);
                    padding: 1.75rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                    background: linear-gradient(145deg, rgba(5, 16, 42, 0.96), rgba(3, 10, 28, 0.92));
                    backdrop-filter: blur(30px) saturate(160%);
                    transform: translateX(-120%);
                    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
                    z-index: 1000;
                    overflow-y: auto;
                    border-right: 1px solid rgba(56, 189, 248, 0.2);
                }

                .mobile-menu.open {
                    transform: translateX(0);
                }

                .mobile-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                }

                .mobile-title {
                    font-size: 0.85rem;
                    letter-spacing: 0.14em;
                    text-transform: uppercase;
                    color: #94a3b8;
                }

                .mobile-close {
                    border: none;
                    background: none;
                    color: #e2e8f0;
                    display: inline-flex;
                    padding: 0.25rem;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: transform 0.3s ease, color 0.3s ease;
                }

                .mobile-close:hover,
                .mobile-close:focus-visible {
                    color: #ffffff;
                    transform: rotate(90deg);
                }

                .mobile-links {
                    display: grid;
                    gap: 1rem;
                }

                .mobile-divider {
                    height: 1px;
                    background: linear-gradient(90deg, rgba(56, 189, 248, 0.2), rgba(2, 6, 23, 0));
                    margin: 0.25rem 0 0.5rem;
                }

                .mobile-auth {
                    display: grid;
                    gap: 0.75rem;
                }

                .mobile-link {
                    font-size: 1rem;
                }

                .mobile-link::after {
                    bottom: -4px;
                }

                .mobile-cta {
                    display: inline-flex;
                    justify-content: center;
                    align-items: center;
                    border-radius: 999px;
                    padding: 0.7rem 1.4rem;
                    background: linear-gradient(120deg, rgba(59, 130, 246, 0.95) 0%, rgba(2, 132, 199, 0.95) 100%);
                    color: #ffffff;
                    font-weight: 600;
                    text-decoration: none;
                    box-shadow: 0 18px 36px rgba(34, 211, 238, 0.35);
                }

                .mobile-menu:focus {
                    outline: none;
                }

                .feather-icon {
                    width: 20px;
                    height: 20px;
                    stroke-width: 1.8;
                }

                @media (max-width: 960px) {
                    .desktop-links,
                    .actions {
                        display: none;
                    }

                    .mobile-toggle {
                        display: inline-flex;
                    }

                    .nav-shell {
                        padding-right: 0;
                    }
                }

                @media (max-width: 640px) {
                    .nav-shell {
                        width: min(100%, 100% - 1.5rem);
                        padding: 0.85rem 0;
                    }

                    .brand-name {
                        font-size: 0.9rem;
                    }
                }
            </style>
            <nav class="navbar">
                <div class="nav-shell">
                    <a href="index.html" class="brand">
                        <span class="brand-icon" aria-hidden="true">
                            <i data-feather="zap"></i>
                        </span>
                        <span class="brand-name">CreatorFlow</span>
                    </a>
                    <div class="desktop-links" role="navigation" aria-label="Primary">
                        ${desktopLinks}
                    </div>
                    <div class="actions">
                        ${authLinks}
                    </div>
                    <button class="mobile-toggle" id="mobile-menu-button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open navigation menu">
                        <i data-feather="menu"></i>
                    </button>
                </div>
                <div class="mobile-scrim" hidden></div>
                <div class="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Site navigation" tabindex="-1">
                    <div class="mobile-header">
                        <span class="mobile-title">Navigation</span>
                        <button class="mobile-close" id="mobile-menu-close" aria-label="Close navigation menu">
                            <i data-feather="x"></i>
                        </button>
                    </div>
                    <div class="mobile-divider"></div>
                    <div class="mobile-links">
                        ${mobileLinks}
                    </div>
                    <div class="mobile-divider"></div>
                    <div class="mobile-auth">
                        <a href="${AUTH_ACTIONS[0].href}" class="nav-link mobile-link" data-auth>${AUTH_ACTIONS[0].label}</a>
                        <a href="${AUTH_ACTIONS[1].href}" class="mobile-cta" data-auth>${AUTH_ACTIONS[1].label}</a>
                    </div>
                </div>
            </nav>
        `;

        this.addScrollEffect();
        this.initMobileMenu();
        this.highlightActiveLink();
        this.initFeatherIcons();

        window.addEventListener('popstate', this.handleRouteChange);
        window.addEventListener('hashchange', this.handleRouteChange);
    }

    initFeatherIcons() {
        setTimeout(() => {
            if (typeof feather !== 'undefined') {
                feather.replace({
                    class: 'feather-icon'
                });
            }
        }, 120);
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
        const scrim = this.shadowRoot.querySelector('.mobile-scrim');

        if (!menuButton || !menuClose || !mobileMenu || !scrim) {
            return;
        }

        const toggleMenu = (open) => {
            mobileMenu.classList.toggle('open', open);
            menuButton.setAttribute('aria-expanded', String(open));
            if (scrim) {
                scrim.classList.toggle('visible', open);
                scrim.hidden = !open;
            }
            if (open) {
                mobileMenu.focus();
            }
        };

        menuButton.addEventListener('click', () => toggleMenu(true));
        menuClose.addEventListener('click', () => toggleMenu(false));
        scrim.addEventListener('click', () => toggleMenu(false));

        this.handleCloseOnEscape = (event) => {
            if (event.key === 'Escape' && mobileMenu.classList.contains('open')) {
                toggleMenu(false);
            }
        };

        window.addEventListener('keydown', this.handleCloseOnEscape);

        const mobileLinks = mobileMenu.querySelectorAll('a');
        mobileLinks.forEach((link) => {
            link.addEventListener('click', () => toggleMenu(false));
        });
    }

    highlightActiveLink() {
        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        const normalize = (href) => href.replace('./', '');

        this.shadowRoot.querySelectorAll('[data-nav]').forEach((link) => {
            const href = normalize(link.getAttribute('href') || '');
            const isActive = href === currentPath || (href === 'index.html' && currentPath === '');
            if (isActive) {
                link.classList.add('is-active');
                link.setAttribute('aria-current', 'page');
            } else {
                link.classList.remove('is-active');
                link.removeAttribute('aria-current');
            }
        });
    }

    disconnectedCallback() {
        window.removeEventListener('popstate', this.handleRouteChange);
        window.removeEventListener('hashchange', this.handleRouteChange);
        if (this.handleCloseOnEscape) {
            window.removeEventListener('keydown', this.handleCloseOnEscape);
        }
    }
}

customElements.define('custom-navbar', CustomNavbar);
