import { apiPost } from '../core/http.js';
import { createTurnstileGuard } from '../core/security.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';

const form = document.getElementById('reset-password-form');
const passwordInput = document.getElementById('reset-password');
const confirmInput = document.getElementById('reset-password-confirm');
const submitButton = document.getElementById('reset-password-submit');
const statusNode = document.getElementById('reset-password-status');
const copyNode = document.getElementById('reset-password-copy');
const turnstileGuardPromise = createTurnstileGuard({
  containerId: 'reset-password-turnstile',
});

const getToken = () => new URLSearchParams(window.location.search).get('token') || '';

const setStatus = (message, tone = 'success') => {
  if (!statusNode) {
    return;
  }

  statusNode.textContent = message;
  statusNode.className = `mt-5 border p-4 text-sm ${
    tone === 'success'
      ? 'border-success/30 bg-success/10 text-[var(--ivory)]'
      : 'border-red-400/40 bg-red-400/10 text-red-500 dark:text-red-300'
  }`;
  statusNode.classList.remove('hidden');
};

const token = getToken();
if (!token) {
  if (copyNode) {
    copyNode.textContent = t('reset_copy_invalid', 'This reset link is missing a token or has been opened incorrectly.');
  }
  if (submitButton) {
    submitButton.disabled = true;
  }
  setStatus(t('toast_reset_token_missing', 'Reset token missing. Request a fresh password reset email.'), 'error');
}

// Clear aria-invalid / aria-describedby on input — registered once at module init
passwordInput?.addEventListener('input', () => {
  passwordInput.removeAttribute('aria-invalid');
  passwordInput.removeAttribute('aria-describedby');
  const errorEl = document.getElementById('reset-password-error');
  if (errorEl) errorEl.setAttribute('hidden', '');
});
confirmInput?.addEventListener('input', () => {
  confirmInput.removeAttribute('aria-invalid');
  confirmInput.removeAttribute('aria-describedby');
  const errorEl = document.getElementById('reset-password-confirm-error');
  if (errorEl) errorEl.setAttribute('hidden', '');
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!token) {
    showToast(t('toast_reset_token_missing', 'Reset token missing'), 'error');
    return;
  }

  const password = passwordInput?.value || '';
  const confirmPassword = confirmInput?.value || '';

  if (password.length < 8) {
    passwordInput?.setAttribute('aria-invalid', 'true');
    passwordInput?.setAttribute('aria-describedby', 'reset-password-error');
    const errorEl = document.getElementById('reset-password-error');
    if (errorEl) { errorEl.textContent = t('toast_password_min', 'Password must be at least 8 characters'); errorEl.removeAttribute('hidden'); }
    showToast(t('toast_password_min', 'Password must be at least 8 characters'), 'error');
    return;
  }

  if (password !== confirmPassword) {
    confirmInput?.setAttribute('aria-invalid', 'true');
    confirmInput?.setAttribute('aria-describedby', 'reset-password-confirm-error');
    const errorEl = document.getElementById('reset-password-confirm-error');
    if (errorEl) { errorEl.textContent = t('toast_password_mismatch', 'Passwords do not match'); errorEl.removeAttribute('hidden'); }
    showToast(t('toast_password_mismatch', 'Passwords do not match'), 'error');
    return;
  }

  const original = submitButton?.innerHTML || 'UPDATE PASSWORD';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = t('btn_updating', 'UPDATING...');
  }

  try {
    const turnstileGuard = await turnstileGuardPromise;
    const turnstileToken = await turnstileGuard.consumeToken();
    const response = await apiPost('/auth/reset-password', {
      token,
      password,
      turnstileToken,
    });

    setStatus(
      response?.message ||
        t('toast_password_updated', 'Password updated')
    );
    showToast(t('toast_password_updated', 'Password updated'), 'success');
    if (form) {
      form.reset();
    }
  } catch (error) {
    turnstileGuardPromise?.reset?.();
    setStatus(error.message || 'Unable to reset password', 'error');
    showToast(error.message || 'Unable to reset password', 'error');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = original;
    }
  }
});
