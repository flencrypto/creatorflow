document.addEventListener('DOMContentLoaded', () => {
    const testApiBtn = document.getElementById('test-api');
    const apiStatusIndicator = document.getElementById('api-status-indicator');
    const apiStatusText = document.getElementById('api-status-text');
    const apiConfigSource = document.getElementById('api-config-source');
    const lastTested = document.getElementById('api-last-tested');

    async function refreshOpenAiStatus() {
        try {
            const response = await fetch('/api/integrations/openai/status');
            if (!response.ok) {
                throw new Error(`Status request failed with ${response.status}`);
            }

            const data = await response.json();
            if (data?.configured) {
                updateApiStatus('configured', 'Server-side key detected.');
                if (apiConfigSource) {
                    apiConfigSource.textContent = 'Environment variable OPEN_API_KEY or OPEN_AI_KEY secret';
                }
            } else {
                updateApiStatus('not_configured', 'No API key configured on the server.');
                if (apiConfigSource) {
                    apiConfigSource.textContent = 'Not configured';
                }
            }
        } catch (error) {
            console.error('Failed to load OpenAI status:', error);
            updateApiStatus('error', 'Unable to load integration status.');
            if (apiConfigSource) {
                apiConfigSource.textContent = 'Unknown';
            }
        }
    }

    if (testApiBtn) {
        testApiBtn.addEventListener('click', async () => {
            updateApiStatus('testing', 'Running connection test...');

            try {
                const response = await fetch('/api/integrations/openai/test', {
                    method: 'POST',
                });

                if (!response.ok) {
                    const errorBody = await response.json().catch(() => ({}));
                    throw new Error(errorBody?.error || `Test failed with status ${response.status}`);
                }

                updateApiStatus('connected', 'OpenAI connection succeeded.');
                showNotification('OpenAI connection succeeded.', 'success');
            } catch (error) {
                console.error('OpenAI integration test failed:', error);
                updateApiStatus('error', error.message || 'OpenAI connection failed.');
                showNotification('OpenAI connection failed. Check server logs.', 'error');
            } finally {
                if (lastTested) {
                    const timestamp = new Date().toLocaleString();
                    lastTested.textContent = `Last tested: ${timestamp}`;
                }
            }
        });
    }

    function updateApiStatus(status, message) {
        const statusClasses = {
            not_configured: 'bg-gray-400',
            configured: 'bg-yellow-400',
            testing: 'bg-blue-400 animate-pulse',
            connected: 'bg-green-400',
            error: 'bg-red-400',
        };

        apiStatusIndicator.className = `w-3 h-3 rounded-full ${statusClasses[status] || 'bg-gray-400'}`;
        apiStatusText.textContent = `Status: ${message}`;
    }

    function loadUsageStatistics() {
        const mockStats = {
            totalGenerations: 1247,
            activeUsers: 342,
            templatesUsed: 89,
        };

        document.getElementById('total-generations').textContent = mockStats.totalGenerations.toLocaleString();
        document.getElementById('active-users').textContent = mockStats.activeUsers.toLocaleString();
        document.getElementById('templates-used').textContent = mockStats.templatesUsed.toLocaleString();
    }

    loadUsageStatistics();
    refreshOpenAiStatus();
});