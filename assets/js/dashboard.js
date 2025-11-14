(() => {
  function setStatus(statusElement, message) {
    if (!statusElement) {
      return;
    }
    statusElement.textContent = message || '';
  }

  function setError(errorElement, message) {
    if (!errorElement) {
      return;
    }
    if (message) {
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
    } else {
      errorElement.textContent = '';
      errorElement.classList.add('hidden');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('analysis-form');
    const contentInput = document.getElementById('analysis-content');
    const platformInput = document.getElementById('analysis-platform');
    const goalsInput = document.getElementById('analysis-goals');
    const submitButton = document.getElementById('analysis-submit');
    const statusElement = document.getElementById('analysis-status');
    const errorElement = document.getElementById('analysis-error');
    const resultContainer = document.getElementById('analysis-result');
    const resultOutput = document.getElementById('analysis-output');

    fetch('/api/auth/status', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        if (!data?.authenticated) {
          window.location.replace('login.html?error=session');
        }
      })
      .catch(() => {
        /* If the status check fails we let the form continue; the API will enforce auth. */
      });

    if (!form || !contentInput || !submitButton) {
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setError(errorElement, '');
      setStatus(statusElement, '');

      const content = contentInput.value.trim();
      const platform = platformInput?.value.trim() || '';
      const goals = goalsInput?.value.trim() || '';

      if (!content) {
        setError(errorElement, 'Please paste the content you want to analyze.');
        return;
      }

      submitButton.disabled = true;
      submitButton.classList.add('opacity-70', 'cursor-wait');
      setStatus(statusElement, 'Analyzing your content...');

      try {
        const response = await fetch('/api/content/analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            content,
            platform: platform || undefined,
            goals: goals || undefined,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const message = errorBody?.error || `Request failed with status ${response.status}.`;
          setError(errorElement, message);
          return;
        }

        const data = await response.json();
        if (!data?.ok) {
          setError(errorElement, data?.error || 'Analysis failed.');
          return;
        }

        if (resultOutput && resultContainer) {
          resultOutput.textContent = data.analysis || 'No feedback generated.';
          resultContainer.classList.remove('hidden');
        }
      } catch (err) {
        setError(errorElement, 'Unexpected error while analyzing content.');
        console.error('Error during content analysis', err);
      } finally {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-70', 'cursor-wait');
        setStatus(statusElement, '');
      }
    });
  });
})();
