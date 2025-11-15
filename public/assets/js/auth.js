(() => {
  function showSocialUnavailable(unavailableElement) {
    if (unavailableElement) {
      unavailableElement.classList.remove('hidden');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const socialContainer = document.getElementById('social-login-container');
    const unavailableText = document.getElementById('social-login-unavailable');
    const errorBanner = document.getElementById('auth-error-banner');
    const loginForm = document.querySelector('form');

    const searchParams = new URLSearchParams(window.location.search);
    const errorProvider = searchParams.get('error');
    if (errorProvider && errorBanner) {
      errorBanner.classList.remove('hidden');
    }

    fetch('/api/auth/status', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        if (data?.authenticated) {
          window.location.replace('dashboard.html');
        }
      })
      .catch(() => {
        /* best-effort check only */
      });

    fetch('/auth/providers', { credentials: 'include' })
      .then((response) => response.json())
      .then((data) => {
        if (!Array.isArray(data?.providers) || data.providers.length === 0) {
          showSocialUnavailable(unavailableText);
          return;
        }

        if (!socialContainer) {
          return;
        }

        const available = new Set(data.providers);
        const socialButtons = socialContainer.querySelectorAll('button[data-provider]');
        socialButtons.forEach((button) => {
          const provider = button.dataset.provider;
          if (available.has(provider)) {
            button.classList.remove('hidden');
            button.disabled = false;
          } else {
            button.classList.add('hidden');
            button.disabled = true;
          }
        });

        if ([...available].length === 0) {
          showSocialUnavailable(unavailableText);
        }
      })
      .catch(() => {
        showSocialUnavailable(unavailableText);
      });

    if (socialContainer) {
      socialContainer.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-provider]');
        if (!button || button.disabled || button.classList.contains('hidden')) {
          return;
        }
        const provider = button.dataset.provider;
        window.location.href = `/auth/${provider}`;
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        alert('Password sign-in is coming soon. Please use one of the social sign-in options above.');
      });
    }
  });
})();
