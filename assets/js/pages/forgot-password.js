import { apiPost } from '../core/http.js';
import { createTurnstileGuard } from '../core/security.js';
import { syncLucide } from '../core/shell.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';

const form = document.getElementById('forgot-password-form');
const emailInput = document.getElementById('recovery-email');
const submitButton = document.getElementById('forgot-password-submit');
const statusNode = document.getElementById('forgot-password-status');
const turnstileGuardPromise = createTurnstileGuard({
  containerId: 'forgot-password-turnstile',
});

const setStatus = (message) => {
  if (!statusNode) {
    return;
  }

  statusNode.textContent = message;
  statusNode.classList.remove('hidden');
};

emailInput?.addEventListener('input', () => {
  emailInput.removeAttribute('aria-invalid');
  emailInput.removeAttribute('aria-describedby');
  const emailErr = document.getElementById('recovery-email-error');
  if (emailErr) emailErr.setAttribute('hidden', '');
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = emailInput?.value?.trim() || '';
  if (!email) {
    emailInput?.setAttribute('aria-invalid', 'true');
    emailInput?.setAttribute('aria-describedby', 'recovery-email-error');
    const emailErr = document.getElementById('recovery-email-error');
    if (emailErr) { emailErr.textContent = t('field_required', 'This field is required'); emailErr.removeAttribute('hidden'); }
    showToast(t('toast_forgot_email_required', 'Please enter your email address'), 'error');
    return;
  }

  const original = submitButton?.innerHTML || 'SEND RESET LINK';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = t('btn_sending', 'SENDING...');
  }

  try {
    const turnstileGuard = await turnstileGuardPromise;
    const turnstileToken = await turnstileGuard.consumeToken();
    const response = await apiPost('/auth/forgot-password', {
      email,
      turnstileToken,
    });
    const message =
      response?.message ||
      'If an account exists, a password reset email has been sent.';
    setStatus(message);
    showToast(t('toast_reset_email_sent', 'Reset email request sent'), 'success');
    if (form) {
      form.reset();
    }
  } catch (error) {
    turnstileGuardPromise?.reset?.();
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = original;
    }
    showToast(error.message || t('toast_reset_email_failed', 'Unable to send reset email'), 'error');
    return;
  }

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.innerHTML = original;
  }
});

// Initialize icons
syncLucide();
