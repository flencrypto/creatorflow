import { createApiClient } from './api-client.js';

const notification = {
    info(message) {
        if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
            window.showNotification(message, 'info');
        } else {
            console.log('[INFO]', message);
        }
    },
    success(message) {
        if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
            window.showNotification(message, 'success');
        } else {
            console.log('[SUCCESS]', message);
        }
    },
    error(message) {
        if (typeof window !== 'undefined' && typeof window.showNotification === 'function') {
            window.showNotification(message, 'error');
        } else {
            console.error('[ERROR]', message);
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    const FALLBACK_CONNECTORS = [
        {
            id: 'openai-content-generator',
            provider: 'openai',
            name: 'OpenAI Content Generator',
            description: 'Generate multi-channel social content with GPT-4o templates tuned for CreatorFlow prompts.',
            features: [
                'Post, script, and caption generation',
                'Tone-aware creativity controls',
                'Platform-aware formatting',
            ],
            status: 'requires_configuration',
            statusMessage: 'Connect a backend API base (use ?apiBase=...) to enable live health checks.',
            actions: { testable: true, models: true, suggestions: true },
        },
        {
            id: 'openai-performance-coach',
            provider: 'openai',
            name: 'OpenAI Performance Coach',
            description: 'Review draft content and produce structured feedback for hooks, CTAs, and optimization tips.',
            features: [
                'Content critique and scoring',
                'Goal-aligned suggestions',
                'Actionable hook/CTA library',
            ],
            status: 'requires_configuration',
            statusMessage: 'Waiting for API base configuration.',
            actions: { testable: true, suggestions: true },
        },
        {
            id: 'perplexity-research',
            provider: 'perplexity',
            name: 'Perplexity Deep Research',
            description: 'Conduct real-time research on trends, audience insights, and competitive analysis with web access.',
            features: [
                'Real-time web research',
                'Competitive content analysis',
                'Audience insights and trends',
                'Cited sources',
            ],
            status: 'requires_configuration',
            statusMessage: 'Configure API base to check connectivity.',
            actions: { testable: true, suggestions: false },
        },
    ];

    const FALLBACK_MODELS = [
        { id: 'gpt-4o-mini', ownedBy: 'openai', created: 1720579200 },
        { id: 'gpt-4o', ownedBy: 'openai', created: 1721171200 },
        { id: 'o4-mini', ownedBy: 'openai', created: 1721171200 },
    ];

    const apiClient = createApiClient();
    const statusBadge = document.getElementById('openai-status-badge');
    const statusText = document.getElementById('openai-status-text');
    const cacheDetails = document.getElementById('openai-cache-details');
    const modelsList = document.getElementById('openai-model-list');
    const loadModelsBtn = document.getElementById('load-openai-models');
    const connectorsGrid = document.getElementById('integration-grid');
    const catalogEmptyState = document.getElementById('integration-empty-state');
    const connectorForm = document.getElementById('connector-suggestion-form');
    const connectorResults = document.getElementById('connector-suggestions');
    const connectorSummary = document.getElementById('connector-summary');

    let cachedCsrfToken = null;

    async function fetchCsrfToken() {
        if (cachedCsrfToken) {
            return cachedCsrfToken;
        }
        try {
            const response = await apiClient.fetch('/api/auth/csrf');
            const data = await response.json();
            if (data?.csrfToken) {
                cachedCsrfToken = data.csrfToken;
                return cachedCsrfToken;
            }
        } catch (error) {
            console.warn('Failed to fetch CSRF token', error);
        }
        return null;
    }

    async function bootstrap() {
        await refreshCatalog();
        attachTestButtons();
    }

    async function refreshCatalog() {
        try {
            const response = await apiClient.fetch('/api/integrations');
            const data = await response.json();
            const connectors = Array.isArray(data?.connectors) ? data.connectors : [];
            renderConnectors(connectors);
            updateStatusMeta(data?.meta?.openai || {});
        } catch (error) {
            console.error('Failed to refresh integration catalog', error);
            renderConnectors(FALLBACK_CONNECTORS);
            updateStatusMeta({ configured: false, cachedModels: 0, cacheExpiresAt: null });
            showEmptyState('Using offline catalog preview. Append ?apiBase=https://backend.example.com to use your live API.');
            notification.info('Integration catalog is in preview mode. Configure the API base to load live data.');
        }
    }

    function renderConnectors(connectors = []) {
        if (!connectorsGrid) {
            return;
        }

        connectorsGrid.innerHTML = '';

        if (!connectors.length) {
            showEmptyState('No integrations available yet. Configure OPEN_API_KEY or the OPEN_AI_KEY secret to unlock OpenAI connectors.');
            return;
        }

        connectors.forEach((connector) => {
            const card = document.createElement('article');
            card.className = 'bg-white rounded-2xl shadow-lg border border-slate-200 p-6 flex flex-col gap-4';
            card.setAttribute('data-connector-id', connector.id);

            const header = document.createElement('div');
            header.className = 'flex items-start justify-between gap-4';

            const titleWrapper = document.createElement('div');
            titleWrapper.className = 'flex flex-col';

            const title = document.createElement('h3');
            title.className = 'text-xl font-semibold text-slate-900';
            title.textContent = connector.name;

            const subtitle = document.createElement('p');
            subtitle.className = 'text-sm text-slate-500';
            subtitle.textContent = connector.description;

            titleWrapper.appendChild(title);
            titleWrapper.appendChild(subtitle);

            const badge = document.createElement('span');
            badge.className = getStatusBadgeClasses(connector.status);
            badge.textContent = connector.status === 'connected' ? 'Connected' : 'Needs setup';
            badge.setAttribute('aria-label', connector.statusMessage || 'Connector status');

            header.appendChild(titleWrapper);
            header.appendChild(badge);

            const featureList = document.createElement('ul');
            featureList.className = 'list-disc list-inside text-sm text-slate-600 space-y-1';
            (connector.features || []).forEach((feature) => {
                const li = document.createElement('li');
                li.textContent = feature;
                featureList.appendChild(li);
            });

            const footer = document.createElement('div');
            footer.className = 'flex flex-wrap gap-2 items-center';

            const statusMessage = document.createElement('p');
            statusMessage.className = 'text-xs text-slate-500 flex-1';
            statusMessage.textContent = connector.statusMessage || '';

            footer.appendChild(statusMessage);

            if (connector.documentationUrl) {
                const docLink = document.createElement('a');
                docLink.href = connector.documentationUrl;
                docLink.target = '_blank';
                docLink.rel = 'noopener noreferrer';
                docLink.className = 'inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700';
                docLink.innerHTML = '<span>Docs</span><i data-feather="external-link" class="w-3 h-3"></i>';
                footer.appendChild(docLink);
            }

            if (connector.actions?.testable) {
                const testButton = document.createElement('button');
                testButton.type = 'button';
                testButton.dataset.integrationTest = connector.provider;
                testButton.className = 'px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-400';
                testButton.textContent = 'Run health check';
                footer.appendChild(testButton);
            }

            card.appendChild(header);
            card.appendChild(featureList);
            card.appendChild(footer);

            connectorsGrid.appendChild(card);
        });

        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        if (catalogEmptyState) {
            catalogEmptyState.classList.add('hidden');
        }
    }

    function showEmptyState(message) {
        if (catalogEmptyState) {
            catalogEmptyState.classList.remove('hidden');
            catalogEmptyState.textContent = message;
        }
        if (connectorsGrid) {
            connectorsGrid.innerHTML = '';
        }
    }

    function getStatusBadgeClasses(status) {
        const base = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold';
        if (status === 'connected') {
            return `${base} bg-emerald-100 text-emerald-700`;
        }
        if (status === 'requires_configuration') {
            return `${base} bg-amber-100 text-amber-700`;
        }
        return `${base} bg-slate-200 text-slate-600`;
    }

    function updateStatusMeta(meta) {
        if (statusBadge) {
            statusBadge.className = meta.configured
                ? 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold'
                : 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100 text-rose-700 text-sm font-semibold';
            statusBadge.innerHTML = meta.configured ? '<i data-feather="check-circle" class="w-4 h-4"></i><span>Connected</span>' : '<i data-feather="alert-triangle" class="w-4 h-4"></i><span>Disconnected</span>';
        }

        if (statusText) {
            statusText.textContent = meta.configured
                ? 'OpenAI key detected. Creators can use AI templates and performance coaching.'
                : 'Add OPEN_API_KEY (or configure the OPEN_AI_KEY secret) to your environment variables to enable OpenAI-powered features.';
        }

        if (cacheDetails) {
            if (meta.cachedModels) {
                const expires = meta.cacheExpiresAt ? new Date(meta.cacheExpiresAt).toLocaleTimeString() : 'soon';
                cacheDetails.textContent = `Cached models: ${meta.cachedModels}. Refreshes at ${expires}.`;
            } else {
                cacheDetails.textContent = 'Model cache empty. Load available models to prime the catalog.';
            }
        }

        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    function attachTestButtons() {
        document.querySelectorAll('[data-integration-test]').forEach((button) => {
            button.addEventListener('click', async (event) => {
                const provider = event.currentTarget.dataset.integrationTest;
                if (!provider) {
                    return;
                }

                buttonDisabledState(event.currentTarget, true, 'Testing...');
                try {
                    await runIntegrationTest(provider);
                    notification.success('Integration health check succeeded.');
                } catch (error) {
                    console.error('Integration test failed', error);
                    notification.error(error.message || 'Integration test failed.');
                } finally {
                    buttonDisabledState(event.currentTarget, false);
                }
            });
        });
    }

    if (loadModelsBtn) {
        loadModelsBtn.addEventListener('click', async () => {
            buttonDisabledState(loadModelsBtn, true, 'Loading...');
            try {
                const response = await apiClient.fetch('/api/integrations/openai/models');
                const data = await response.json();
                renderModels(data?.models || []);
                notification.success('Loaded OpenAI models.');
            } catch (error) {
                console.error('Failed to load OpenAI models', error);
                renderModels(FALLBACK_MODELS);
                notification.info('Showing sample OpenAI models. Configure the API base to load live data.');
            } finally {
                buttonDisabledState(loadModelsBtn, false, 'Load available models');
            }
        });
    }

    function renderModels(models) {
        if (!modelsList) {
            return;
        }

        modelsList.innerHTML = '';
        if (!models.length) {
            const empty = document.createElement('li');
            empty.className = 'text-sm text-slate-500';
            empty.textContent = 'No models returned. Check your OpenAI permissions.';
            modelsList.appendChild(empty);
            return;
        }

        models.slice(0, 15).forEach((model) => {
            const item = document.createElement('li');
            item.className = 'flex flex-col rounded-lg border border-slate-200 px-3 py-2';

            const name = document.createElement('span');
            name.className = 'text-sm font-semibold text-slate-800';
            name.textContent = model.id;

            const meta = document.createElement('span');
            meta.className = 'text-xs text-slate-500';
            const created = model.created ? new Date(model.created * 1000).toLocaleDateString() : 'unknown';
            meta.textContent = `Owner: ${model.ownedBy || 'unknown'} • Created: ${created}`;

            item.appendChild(name);
            item.appendChild(meta);
            modelsList.appendChild(item);
        });
    }

    if (connectorForm && connectorResults) {
        connectorForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(connectorForm);
            const payload = {
                useCase: String(formData.get('useCase') || '').trim(),
                audience: String(formData.get('audience') || '').trim() || undefined,
                tone: String(formData.get('tone') || '').trim() || undefined,
                channels: (String(formData.get('channels') || '')
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean)) || undefined,
            };

            if (!payload.useCase) {
                notification.error('Describe your use case to generate connectors.');
                return;
            }

            buttonDisabledState(connectorForm.querySelector('button[type="submit"]'), true, 'Generating...');
            connectorResults.innerHTML = '<p class="text-sm text-slate-500">Generating connector plan...</p>';
            if (connectorSummary) {
                connectorSummary.textContent = '';
            }

            try {
                const csrfToken = await fetchCsrfToken();
                const headers = { 'Content-Type': 'application/json' };
                if (csrfToken) {
                    headers['x-csrf-token'] = csrfToken;
                }
                const response = await apiClient.fetch('/api/integrations/openai/connectors', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                });

                const data = await response.json();
                renderConnectorSuggestions(data);
                notification.success('Connector plan generated.');
            } catch (error) {
                console.error('Failed to generate connector plan', error);
                notification.error(error.message || 'Failed to generate connector plan.');
                connectorResults.innerHTML = '<p class="text-sm text-rose-600">Unable to generate connector plan right now.</p>';
            } finally {
                buttonDisabledState(connectorForm.querySelector('button[type="submit"]'), false, 'Generate connector plan');
            }
        });
    }

    function renderConnectorSuggestions(data) {
        if (connectorSummary) {
            connectorSummary.textContent = data?.summary || 'AI-generated connector automations tailored to your workflow.';
        }

        const connectors = Array.isArray(data?.connectors) ? data.connectors : [];
        connectorResults.innerHTML = '';

        if (!connectors.length) {
            connectorResults.innerHTML = '<p class="text-sm text-slate-500">No structured connectors returned. Review the raw response in the developer console.</p>';
            return;
        }

        connectors.forEach((connector) => {
            const block = document.createElement('article');
            block.className = 'border border-indigo-200 bg-indigo-50/60 rounded-xl p-4 flex flex-col gap-3';

            const title = document.createElement('h4');
            title.className = 'text-lg font-semibold text-indigo-900';
            title.textContent = connector.name;

            const description = document.createElement('p');
            description.className = 'text-sm text-indigo-800';
            description.textContent = connector.description;

            const setupList = document.createElement('ul');
            setupList.className = 'list-disc list-inside text-sm text-indigo-900';
            (connector.setup || []).forEach((step) => {
                const item = document.createElement('li');
                item.textContent = step;
                setupList.appendChild(item);
            });

            const automationList = document.createElement('ul');
            automationList.className = 'list-disc list-inside text-sm text-indigo-900';
            (connector.automations || []).forEach((automation) => {
                const item = document.createElement('li');
                item.textContent = automation;
                automationList.appendChild(item);
            });

            const setupLabel = document.createElement('p');
            setupLabel.className = 'text-xs font-semibold text-indigo-700 uppercase tracking-wide';
            setupLabel.textContent = 'Setup steps';

            const automationLabel = document.createElement('p');
            automationLabel.className = 'text-xs font-semibold text-indigo-700 uppercase tracking-wide';
            automationLabel.textContent = 'Automations';

            block.appendChild(title);
            block.appendChild(description);
            block.appendChild(setupLabel);
            block.appendChild(setupList);
            block.appendChild(automationLabel);
            block.appendChild(automationList);

            connectorResults.appendChild(block);
        });
    }

    async function runIntegrationTest(provider) {
        const endpoint =
            provider === 'openai'
                ? '/api/integrations/openai/test'
                : `/api/integrations/${provider}/test`;
        try {
            const csrfToken = await fetchCsrfToken();
            const headers = {};
            if (csrfToken) {
                headers['x-csrf-token'] = csrfToken;
            }
            await apiClient.fetch(endpoint, { method: 'POST', headers });
            return true;
        } catch (error) {
            if (error?.status === 401 || error?.status === 403 || error?.status === 404) {
                const statusOk = await probeOpenAiStatus();
                if (statusOk) {
                    notification.info('OpenAI status confirmed via unauthenticated probe.');
                    updateStatusMeta({ configured: true });
                    return true;
                }
                throw new Error('Backend API unreachable. Add ?apiBase=<backend-origin> and reload.');
            }
            throw error;
        }
    }

    async function probeOpenAiStatus() {
        try {
            const response = await apiClient.fetch('/api/integrations/openai/status');
            const payload = await response.json();
            return Boolean(payload?.configured);
        } catch (error) {
            console.warn('Status probe failed', error);
            return false;
        }
    }

    function buttonDisabledState(button, disabled, loadingText) {
        if (!button) {
            return;
        }

        if (disabled) {
            button.dataset.originalText = button.textContent;
            button.textContent = loadingText || 'Working...';
            button.disabled = true;
            button.classList.add('opacity-70', 'cursor-not-allowed');
        } else {
            const original = button.dataset.originalText;
            if (original) {
                button.textContent = original;
            }
            button.disabled = false;
            button.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    }

    bootstrap();
});
