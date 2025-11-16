
// Global JavaScript for CreatorFlow Studio

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Lightweight notification system shared across pages
function showNotification(message, type = 'info') {
    const containerId = 'creatorflow-notifications';
    let container = document.getElementById(containerId);

    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.setAttribute('role', 'region');
        container.setAttribute('aria-live', 'polite');
        container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm';
        document.body.appendChild(container);
    }

    const typeStyles = {
        success: 'bg-emerald-500',
        error: 'bg-rose-500',
        warning: 'bg-amber-500',
        info: 'bg-indigo-500'
    };

    const notification = document.createElement('div');
    notification.className = `${typeStyles[type] ?? typeStyles.info} text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-3`;
    notification.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const messageWrapper = document.createElement('span');
    messageWrapper.textContent = message;
    messageWrapper.className = 'flex-1 text-sm font-medium';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'text-white/80 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60 rounded';
    closeButton.setAttribute('aria-label', 'Dismiss notification');
    closeButton.innerHTML = '&times;';

    closeButton.addEventListener('click', () => {
        if (notification.parentElement) {
            notification.parentElement.removeChild(notification);
        }
    });

    notification.appendChild(messageWrapper);
    notification.appendChild(closeButton);
    container.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.parentElement.removeChild(notification);
        }
    }, 4000);
}

// Add admin logout function
function adminLogout() {
    localStorage.removeItem('admin_logged_in');
    showNotification('Logged out successfully', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

function initializeApp() {
    // Add loading states to interactive elements
    addLoadingStates();
    
    // Initialize tooltips if any
    initTooltips();
    
    // Handle smooth scrolling for anchor links
    initSmoothScrolling();
    
    // Initialize any API integrations
    initAPIIntegrations();
    
    // Initialize help search functionality
    initHelpSearch();
}
// Loading states for buttons and forms
function addLoadingStates() {
    const buttons = document.querySelectorAll('button, a[href="#"]');
    buttons.forEach(button => {
        button.addEventListener('click', function (event) {
            if (!this.hasAttribute('data-loading')) {
                return;
            }

            if (!this.dataset.originalLabel) {
                this.dataset.originalLabel = this.innerHTML;
            }

            this.classList.add('opacity-75', 'cursor-not-allowed');
            this.setAttribute('aria-busy', 'true');
            this.innerHTML = '<span class="loading-spinner inline-block mr-2" aria-hidden="true"></span>Loading...';

            if (this.tagName === 'A') {
                event.preventDefault();
            }
        });
    });
}

// Tooltip initialization
function initTooltips() {
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    tooltipElements.forEach(element => {
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    });
}

function showTooltip(e) {
    const tooltipText = e.target.getAttribute('data-tooltip');
    const tooltip = document.createElement('div');
    tooltip.className = 'fixed z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg';
    tooltip.textContent = tooltipText;
    tooltip.id = 'current-tooltip';
    
    document.body.appendChild(tooltip);
    
    const rect = e.target.getBoundingClientRect();
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 5 + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('current-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// Smooth scrolling for anchor links
function initSmoothScrolling() {
    const anchorLinks = document.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// API Integration functions
function initAPIIntegrations() {
    // Initialize any third-party API integrations here
    // For demo purposes, we'll simulate API calls
}

// Simulate API call for content generation
async function simulateContentGeneration(prompt, template) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const mockResponses = {
                instagram: `🌟 ${prompt} ✨

Check out this amazing content! What do you think? Let me know in the comments! 👇

#contentcreator #digitalmarketing #socialmedia`,
                youtube: `🎬 ${prompt}

In today's video, we're diving deep into this fascinating topic. Make sure to like and subscribe for more content like this! 🔔`,
                tiktok: `🔥 ${prompt}

This trend is absolutely insane! 😱

#trending #viral #fyp`,
            };
            
            resolve(mockResponses[template] || `Generated content for: ${prompt}`);
        }, 1500);
    });
}

// Utility function to copy text to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Content copied to clipboard!', 'success');
        return true;
    } catch (err) {
        console.error('Failed to copy text: ', err);
        showNotification('Failed to copy content', 'error');
        return false;
    }
}
// Theme management
function toggleTheme() {
    const html = document.documentElement;
    const shouldEnableDark = !html.classList.contains('dark');

    if (shouldEnableDark) {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        showNotification('Switched to dark theme', 'info');
        return;
    }

    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
    showNotification('Switched to light theme', 'info');
}

// Check for saved theme preference
function loadTheme() {
    const theme = localStorage.getItem('theme');
    document.documentElement.classList.toggle('dark', theme === 'dark');
}

// Initialize theme on load
loadTheme();

// Help search functionality
function initHelpSearch() {
    const searchInput = document.querySelector('[data-role=\"help-search-input\"]');
    const searchButton = document.querySelector('[data-role=\"help-search-button\"]');

    if (!searchInput || !searchButton) {
        return;
    }

    const performSearch = () => {
        const query = searchInput.value.trim().toLowerCase();

        if (!query) {
            showNotification('Please enter a search term', 'warning');
            return;
        }

        const mockResults = {
            'getting started': ['How to Create Your First Content Project', 'Setting Up Your Account', 'Navigating the Dashboard'],
            'content generation': ['Using AI Content Generation Effectively', 'Crafting Effective Prompts', 'Optimizing Content Output'],
            'templates': ['Understanding Content Templates', 'Customizing Templates', 'Creating New Templates'],
            'export': ['Exporting Content to Social Media Platforms', 'Scheduling Posts', 'Cross-Platform Publishing'],
            'billing': ['Managing Your Subscription and Billing', 'Updating Payment Methods', 'Cancelling Your Account'],
            'troubleshooting': ['Common Content Generation Issues', 'Login and Account Problems', 'Export and Publishing Errors'],
            'integrations': ['Connecting Social Media Accounts', 'Setting Up Platform Integrations', 'Troubleshooting Connection Issues']
        };

        let matchingArticles = [];
        for (const [category, articles] of Object.entries(mockResults)) {
            if (category.includes(query) || query.includes(category)) {
                matchingArticles = articles;
                break;
            }
        }

        if (matchingArticles.length > 0) {
            showNotification(`Found ${matchingArticles.length} articles for "${query}"`, 'success');
            console.log('Search results:', matchingArticles);
            return;
        }

        showNotification(`No articles found for "${query}". Try different keywords.`, 'info');
    };

    searchButton.addEventListener('click', (event) => {
        event.preventDefault();
        performSearch();
    });

    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            performSearch();
        }
    });
}


// Export functions for use in other modules
window.CreatorFlow = {
    simulateContentGeneration,
    copyToClipboard,
    showNotification,
    toggleTheme,
    adminLogout,
    initializeApp,
};
