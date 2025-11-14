
// Global JavaScript for CreatorFlow Studio

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

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
        button.addEventListener('click', function(e) {
            if (this.hasAttribute('data-loading')) {
                this.classList.add('opacity-75', 'cursor-not-allowed');
                this.innerHTML = `<span class="loading-spinner inline-block mr-2"></span>Loading...`;
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
                'instagram': `🌟 ${prompt} ✨

Check out this amazing content! What do you think? Let me know in the comments! 👇

#contentcreator #digitalmarketing #socialmedia`,
                'youtube': `🎬 ${prompt}

In today's video, we're diving deep into this fascinating topic. Make sure to like and subscribe for more content like this! 🔔`,
                'tiktok': `🔥 ${prompt} 
                 
This trend is absolutely insane! 😱

#trending #viral #fyp`
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
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    showNotification('Switched to light theme', 'info');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        showNotification('Switched to dark theme', 'info');
    }
}

// Check for saved theme preference
function loadTheme() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    }
}

// Initialize theme on load
loadTheme();
// Help search functionality
function initHelpSearch() {
    const searchInput = document.querySelector('input[placeholder*="Search for help articles"]');
    const searchButton = document.querySelector('button:contains("Search")');
    
    if (searchInput && searchButton) {
        searchButton.addEventListener('click', function(e) {
            e.preventDefault();
            const query = searchInput.value.trim().toLowerCase();
            
            if (query) {
                // Simulate search - in a real app, this would call an API
                const mockResults = {
                    'getting started': ['How to Create Your First Content Project', 'Setting Up Your Account', 'Navigating the Dashboard'],
                    'content generation': ['Using AI Content Generation Effectively', 'Crafting Effective Prompts', 'Optimizing Content Output'],
                    'templates': ['Understanding Content Templates', 'Customizing Templates', 'Creating New Templates'],
                    'export': ['Exporting Content to Social Media Platforms', 'Scheduling Posts', 'Cross-Platform Publishing'],
                    'billing': ['Managing Your Subscription and Billing', 'Updating Payment Methods', 'Cancelling Your Account'],
                    'troubleshooting': ['Common Content Generation Issues', 'Login and Account Problems', 'Export and Publishing Errors'],
                    'integrations': ['Connecting Social Media Accounts', 'Setting Up Platform Integrations', 'Troubleshooting Connection Issues']
                };
                
                // Find matching category
                let matchingArticles = [];
                for (const [category, articles] of Object.entries(mockResults)) {
                    if (category.includes(query) || query.includes(category)) {
                    matchingArticles = articles;
                    break;
                    }
                }
                
                if (matchingArticles.length > 0) {
                    showNotification(`Found ${matchingArticles.length} articles for "${query}"`, 'success');
                    
                    // In a real implementation, you would update the UI with search results
                    // For now, we'll just show a notification
                    console.log('Search results:', matchingArticles);
                } else {
                    showNotification(`No articles found for "${query}". Try different keywords.`, 'info');
                }
            } else {
                showNotification('Please enter a search term', 'warning');
            }
        });
    }
}

// Export functions for use in other modules
window.CreatorFlow = {
    simulateContentGeneration,
    copyToClipboard,
    showNotification,
    toggleTheme
};
