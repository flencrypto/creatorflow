document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('api-key');
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const testApiBtn = document.getElementById('test-api');
    const apiStatusIndicator = document.getElementById('api-status-indicator');
    const apiStatusText = document.getElementById('api-status-text');

    // Load saved API key if exists
    const savedApiKey = localStorage.getItem('creatorflow_api_key');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        updateApiStatus('configured', 'API key is configured');
    }

    // Save API key
    saveApiKeyBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showNotification('Please enter an API key', 'error');
            return;
        }

        localStorage.setItem('creatorflow_api_key', apiKey);
        updateApiStatus('configured', 'API key saved successfully');
        showNotification('API key saved successfully', 'success');
    });

    // Test API connection
    testApiBtn.addEventListener('click', async () => {
        const apiKey = localStorage.getItem('creatorflow_api_key');
        if (!apiKey) {
            showNotification('Please save an API key first', 'error');
            return;
        }

        try {
            updateApiStatus('testing', 'Testing API connection...');
            
            // Test the API by making a simple request
            const response = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
            });

            if (response.ok) {
                updateApiStatus('connected', 'API connection successful');
                showNotification('API connection successful', 'success');
            } else {
                updateApiStatus('error', 'API connection failed');
                showNotification('API connection failed. Please check your API key.', 'error');
            }
        } catch (error) {
            console.error('API test failed:', error);
            updateApiStatus('error', 'API connection failed');
            showNotification('API connection failed', 'error');
        }
    });

    // Usage statistics (mock data for demo)
    function loadUsageStatistics() {
        // In a real implementation, this would fetch data from your backend
        const mockStats = {
            totalGenerations: 1247,
            activeUsers: 342,
            templatesUsed: 89
        };

        // Update the UI with statistics
        document.getElementById('total-generations').textContent = mockStats.totalGenerations.toLocaleString();
        document.getElementById('active-users').textContent = mockStats.activeUsers.toLocaleString();
        document.getElementById('templates-used').textContent = mockStats.templatesUsed.toLocaleString();
    }

    function updateApiStatus(status, message) {
        const statusClasses = {
            'not_configured': 'bg-gray-400',
            'configured': 'bg-yellow-400',
            'testing': 'bg-blue-400 animate-pulse',
            'connected': 'bg-green-400',
            'error': 'bg-red-400'
        };

        // Update status indicator
        apiStatusIndicator.className = `w-3 h-3 rounded-full ${statusClasses[status] || 'bg-gray-400'}`;
        apiStatusText.textContent = `Status: ${message}`;
    }

    // Initialize the admin panel
    loadUsageStatistics();
});