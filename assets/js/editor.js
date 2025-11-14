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

    const MAX_HISTORY_ITEMS = 50;
    const historyItems = [];

    async function handleGenerate() {
        const userInput = input.value.trim();
        const selectedTemplate = template.value;
        const platform = platformSelect.value;
        const tone = toneSelect.value;

        if (!userInput) {
            alert('Please enter input.');
            return;
        }

        // Simple UX: show loading state
        preview.textContent = 'Generating content...';
        generateBtn.disabled = true;

        try {
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    template: selectedTemplate,
                    input: userInput,
                    platform,
                    tone,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const msg =
                    errorData?.error ||
                    `Generation failed with status ${response.status}.`;
                preview.textContent = msg;
                alert(msg);
                return;
            }

            const data = await response.json();
            if (!data.ok) {
                const msg = data.error || 'Generation failed.';
                preview.textContent = msg;
                alert(msg);
                return;
            }

            const generatedContent = data.content;
            preview.textContent = generatedContent;

            // Update history (bounded)
            historyItems.unshift({
                template: selectedTemplate,
                platform,
                tone,
                content: generatedContent,
            });
            if (historyItems.length > MAX_HISTORY_ITEMS) {
                historyItems.pop();
            }

            renderHistory();
        } catch (err) {
            console.error('Error calling /api/generate', err);
            preview.textContent = 'Unexpected error during generation.';
            alert('Unexpected error during generation. Check console for details.');
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