import { createApiClient } from './api-client.js';

document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const exportBtn = document.getElementById('export-btn');
    const preview = document.getElementById('preview');
    const input = document.getElementById('input');
    const template = document.getElementById('template');
    const platformSelect = document.getElementById('platform');
    const toneSelect = document.getElementById('tone');
    const historyList = document.getElementById('history-list');
    const logoutBtn = document.getElementById('logout-btn');
    const LOCAL_ADMIN_API_KEY = 'creatorflow_admin_api_key';
    const LOCAL_MODEL_ID = 'gpt-4o-mini';

    const MAX_HISTORY_ITEMS = 50;
    const historyItems = [];
    const apiClient = createApiClient();

    const setSelectValue = (selectEl, value, label) => {
        if (!selectEl || !value) {
            return;
        }

        const exists = Array.from(selectEl.options).some((option) => option.value === value);
        if (!exists) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label || value;
            selectEl.appendChild(option);
        }

        selectEl.value = value;
    };

    const applyTemplateFromQuery = () => {
        const params = new URLSearchParams(window.location.search);
        const templateParam = params.get('template');
        const platformParam = params.get('platform');
        const toneParam = params.get('tone');
        const promptParam = params.get('prompt');

        if (templateParam) {
            setSelectValue(template, templateParam);
        }
        if (platformParam) {
            setSelectValue(platformSelect, platformParam);
        }
        if (toneParam) {
            setSelectValue(toneSelect, toneParam);
        }
        if (promptParam && input) {
            input.value = promptParam;
        }
    };

    const readStoredApiKey = () => {
        try {
            return localStorage.getItem(LOCAL_ADMIN_API_KEY);
        } catch (error) {
            console.warn('Unable to read stored admin API key', error);
            return null;
        }
    };

    const extractMessageContent = (payload) => {
        const messageContent = payload?.choices?.[0]?.message?.content;
        if (Array.isArray(messageContent)) {
            const combined = messageContent
                .map((part) => {
                    if (typeof part === 'string') {
                        return part;
                    }
                    return typeof part?.text === 'string' ? part.text : '';
                })
                .join('')
                .trim();
            return combined || null;
        }

        if (typeof messageContent === 'string') {
            return messageContent.trim();
        }

        if (messageContent?.text) {
            return messageContent.text.trim();
        }

        return null;
    };

    const generateWithServer = async (payload) => {
        const response = await apiClient.fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        let data;
        try {
            data = await response.json();
        } catch (error) {
            const parseError = new Error('Failed to parse server response.');
            parseError.status = response?.status;
            throw parseError;
        }

        if (!data.ok) {
            const error = new Error(data.error || 'Generation failed.');
            error.status = response?.status;
            throw error;
        }

        return data.content;
    };

    const generateWithLocalKey = async (payload) => {
        const apiKey = readStoredApiKey();
        if (!apiKey) {
            throw new Error('No API key stored locally. Save one in the admin dashboard and try again.');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: LOCAL_MODEL_ID,
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a concise content creation assistant. Produce platform-ready copy that fits the requested template and tone.',
                    },
                    {
                        role: 'user',
                        content: `Template: ${payload.template}\nPlatform: ${payload.platform}\nTone: ${payload.tone}\n\n${payload.input}`,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(errorText || `OpenAI request failed with status ${response.status}`);
        }

        const result = await response.json();
        const message = extractMessageContent(result);
        if (!message) {
            throw new Error('No content returned from OpenAI.');
        }

        return message;
    };

    const updateGeneratedContent = (content, context) => {
        preview.textContent = content;

        historyItems.unshift({
            template: context.template,
            platform: context.platform,
            tone: context.tone,
            content,
        });

        if (historyItems.length > MAX_HISTORY_ITEMS) {
            historyItems.pop();
        }

        renderHistory();
    };

    async function handleGenerate() {
        const userInput = input.value.trim();
        const selectedTemplate = template.value;
        const platform = platformSelect.value;
        const tone = toneSelect.value;

        if (!userInput) {
            alert('Please enter input.');
            return;
        }

        const payload = {
            template: selectedTemplate,
            input: userInput,
            platform,
            tone,
        };

        // Simple UX: show loading state
        preview.textContent = 'Generating content...';
        generateBtn.disabled = true;

        try {
            const generatedContent = await generateWithServer(payload);
            updateGeneratedContent(generatedContent, payload);
        } catch (err) {
            const shouldFallback = err?.status === 404 || err?.status === 503;

            if (shouldFallback) {
                try {
                    const generatedContent = await generateWithLocalKey(payload);
                    updateGeneratedContent(generatedContent, payload);
                    alert('Generated using your saved API key.');
                    return;
                } catch (fallbackError) {
                    console.error('Local OpenAI generation failed', fallbackError);
                    const message = fallbackError?.message || 'Generation failed. Check your saved API key.';
                    preview.textContent = message;
                    alert(message);
                    return;
                }
            }

            console.error('Error calling /api/generate', err);
            const status = typeof err?.status === 'number' ? err.status : null;
            const apiBase =
                window.__CREATORFLOW_RUNTIME_CONFIG__?.apiBaseUrl || window.__API_BASE_URL || window.location?.origin;
            
            const isStaticHost = (() => {
                if (!apiBase) return false;
                try {
                    const url = new URL(apiBase);
                    const hostname = url.hostname.toLowerCase();
                    return hostname.endsWith('.github.io') || 
                           hostname.endsWith('.hf.space') || 
                           hostname === 'huggingface.co' ||
                           hostname.endsWith('.huggingface.co');
                } catch {
                    return false;
                }
            })();
            
            const staticHostHint =
                (status === 404 || status === 405) && isStaticHost
                    ? 'This page is being served from a static host that cannot handle /api requests. Set ?apiBase=https://your-backend.example or update the <meta name="creatorflow:api-base"> tag to point at your running API server.'
                    : null;
            const fallbackMessage = 'Unexpected error during generation.';
            const message =
                staticHostHint
                || (typeof err?.message === 'string' && err.message.trim() ? err.message : fallbackMessage);
            preview.textContent = message;
            alert(message);
        } finally {
            generateBtn.disabled = false;
        }
    }

    function renderHistory() {
        historyList.innerHTML = '';
        historyItems.forEach((item) => {
            const li = document.createElement('li');
            const short =
                item.content.length > 80
                    ? `${item.content.substring(0, 80)}…`
                    : item.content;

            li.textContent = `[${item.template}/${item.platform}/${item.tone}] ${short}`;
            historyList.appendChild(li);
        });
    }

    applyTemplateFromQuery();

    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    if (exportBtn && preview) {
        exportBtn.addEventListener('click', () => {
            const content = preview.textContent;
            if (!content) {
                alert('Nothing to export.');
                return;
            }

            // For now just copy to clipboard as a basic "export"
            navigator.clipboard
                .writeText(content)
                .then(() => {
                    alert('Content copied to clipboard.');
                })
                .catch(() => {
                    alert('Failed to copy. You can manually select and copy.');
                });
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            alert('Logged out.');
            window.location.href = 'index.html';
        });
    }
});
