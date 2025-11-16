
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('admin-login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginMessage = document.getElementById('login-message');

    // Check if already logged in
    const isLoggedIn = localStorage.getItem('admin_logged_in');
    if (isLoggedIn === 'true') {
        window.location.href = 'admin.html';
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        // Default credentials
        const correctUsername = 'admin';
        const correctPassword = 'admin';

        if (username === correctUsername && password === correctPassword) {
            localStorage.setItem('admin_logged_in', 'true');
            showNotification('Login successful! Redirecting to admin panel...', 'success');
        
        // Redirect after short delay
        setTimeout(() => {
            window.location.href = 'admin.html';
        }, 1000);
    } else {
        loginMessage.textContent = 'Invalid username or password. Please try again.';
        loginMessage.className = 'mt-4 text-center text-sm text-red-600';
        }
    });
});
