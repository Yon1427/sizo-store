import { apiPost } from '../core/http.js';
import { mergeGuestCartIntoAccount } from '../core/cart-helpers.js';
import { DEFAULT_AUTH_REDIRECT, sanitizeNextPath } from '../core/navigation.js';
import { createTurnstileGuard } from '../core/security.js';
import { isAuthenticated, setSession } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { syncLucide } from '../core/shell.js';
import { t } from '../core/i18n.js';

const form = document.getElementById('register-form');
const firstNameInput = document.getElementById('register-first-name');
const lastNameInput = document.getElementById('register-last-name');
const emailInput = document.getElementById('register-email');
const confirmPasswordInput = document.getElementById('register-password-confirm');
const passwordInput = document.getElementById('password');
const strengthBar = document.getElementById('password-strength');
const hintNode = document.getElementById('password-hint');
const turnstileGuardPromise = createTurnstileGuard({ containerId: 'register-turnstile' });

const getNextUrl = () => {
  const next = new URLSearchParams(window.location.search).get('next');
  return sanitizeNextPath(next, DEFAULT_AUTH_REDIRECT);
};

const updatePasswordStrength = (password) => {
  if (!strengthBar || !hintNode) {
    return;
  }

  let strength = 0;
  if (password.length >= 8) {
    strength += 1;
  }
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    strength += 1;
  }
  if (/\d/.test(password)) {
    strength += 1;
  }
  if (/[^a-zA-Z\d]/.test(password)) {
    strength += 1;
  }

  const container = document.getElementById('password-strength-container');

  let label;
  if (strength <= 1) {
    strengthBar.className = 'password-strength bg-scarlet';
    strengthBar.style.width = '25%';
    hintNode.textContent = t('password_hint_weak', 'Weak - Add more characters');
    hintNode.className = 'font-mono text-xs text-scarlet mt-1';
    label = t('password_strength_weak', 'Weak');
  } else if (strength === 2) {
    strengthBar.className = 'password-strength bg-gold';
    strengthBar.style.width = '50%';
    hintNode.textContent = t('password_hint_medium', 'Medium - Add numbers and symbols');
    hintNode.className = 'font-mono text-xs text-gold mt-1';
    label = t('password_strength_medium', 'Medium');
  } else if (strength === 3) {
    strengthBar.className = 'password-strength bg-cyan';
    strengthBar.style.width = '75%';
    hintNode.textContent = t('password_hint_strong', 'Strong - Good password!');
    hintNode.className = 'font-mono text-xs text-cyan mt-1';
    label = t('password_strength_strong', 'Strong');
  } else {
    strengthBar.className = 'password-strength bg-success';
    strengthBar.style.width = '100%';
    hintNode.textContent = t('password_hint_very_strong', 'Very Strong - Excellent!');
    hintNode.className = 'font-mono text-xs text-success mt-1';
    label = t('password_strength_very_strong', 'Very Strong');
  }

  if (container) {
    container.setAttribute('aria-valuenow', String(strength));
    container.setAttribute('aria-label', 'Password strength: ' + label);
  }
};

const bindPasswordToggles = () => {
  document.querySelectorAll('.toggle-password').forEach((button) => {
    button.addEventListener('click', () => {
      const input = button.previousElementSibling;
      const icon = button.querySelector('i');

      if (!input || input.tagName !== 'INPUT') {
        return;
      }

      if (input.type === 'password') {
        input.type = 'text';
        icon?.setAttribute('data-lucide', 'eye-off');
        button.setAttribute('aria-label', 'Hide password');
      } else {
        input.type = 'password';
        icon?.setAttribute('data-lucide', 'eye');
        button.setAttribute('aria-label', 'Show password');
      }

      syncLucide();
    });
  });
};

const bindStrengthIndicator = () => {
  passwordInput?.addEventListener('input', (event) => {
    updatePasswordStrength(event.target.value || '');
  });
};

const bindForm = () => {
  if (!form) {
    return;
  }

  // Clear aria-invalid / aria-describedby on input
  [firstNameInput, lastNameInput, emailInput, passwordInput, confirmPasswordInput].forEach((input) => {
    input?.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      const errorEl = document.getElementById(`${input.id}-error`);
      if (errorEl) errorEl.setAttribute('hidden', '');
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const firstName = firstNameInput?.value?.trim() || '';
    const lastName = lastNameInput?.value?.trim() || '';
    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';
    const submitButton = form.querySelector('button[type="submit"]');

    const setFieldError = (input, errorId, message) => {
      input?.setAttribute('aria-invalid', 'true');
      input?.setAttribute('aria-describedby', errorId);
      const errorEl = document.getElementById(errorId);
      if (errorEl) { errorEl.textContent = message; errorEl.removeAttribute('hidden'); }
    };

    let valid = true;
    if (!firstName) { setFieldError(firstNameInput, 'register-first-name-error', t('field_required', 'This field is required')); valid = false; }
    if (!lastName) { setFieldError(lastNameInput, 'register-last-name-error', t('field_required', 'This field is required')); valid = false; }
    if (!email) { setFieldError(emailInput, 'register-email-error', t('field_required', 'This field is required')); valid = false; }
    if (!password) { setFieldError(passwordInput, 'password-error', t('field_required', 'This field is required')); valid = false; }

    if (!valid) {
      showToast(t('toast_register_fields_required', 'Please complete all required fields'), 'error');
      return;
    }

    if (password.length < 8) {
      setFieldError(passwordInput, 'password-error', t('toast_password_min', 'Password must be at least 8 characters'));
      showToast(t('toast_password_min', 'Password must be at least 8 characters'), 'error');
      return;
    }

    if (password !== confirmPassword) {
      setFieldError(confirmPasswordInput, 'register-password-confirm-error', t('toast_password_mismatch', 'Passwords do not match'));
      showToast(t('toast_password_mismatch', 'Passwords do not match'), 'error');
      return;
    }

    const name = `${firstName} ${lastName}`.trim();

    const original = submitButton?.innerHTML;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline"></i> ${t('btn_creating', 'CREATING ACCOUNT...')}`;
      syncLucide();
    }

    try {
      const turnstileGuard = await turnstileGuardPromise;
      const turnstileToken = await turnstileGuard.consumeToken();
      const response = await apiPost('/auth/register', {
        email,
        password,
        name,
        turnstileToken,
      });
      const user = response?.data?.user;
      const csrfToken = response?.data?.csrfToken;

      if (!user) {
        throw new Error('Invalid registration response');
      }

      setSession({ user, csrfToken });
      showToast(t('toast_account_created', 'Account created successfully'), 'success');

      window.setTimeout(async () => {
        // Merge any guest cart items into the account cart before leaving (H2).
        try { await mergeGuestCartIntoAccount(); } catch { /* non-fatal */ }
        window.location.href = getNextUrl();
      }, 300);
    } catch (error) {
      // turnstileGuardPromise is a plain object, not a Promise — reference directly
      turnstileGuardPromise?.reset?.();
      if (submitButton && original) {
        submitButton.innerHTML = original;
      }
      if (submitButton) {
        submitButton.disabled = false;
      }
      syncLucide();
      showToast(error.message || t('toast_registration_failed', 'Registration failed'), 'error');
    }
  });
};

const init = () => {
  syncLucide();

  if (isAuthenticated()) {
    window.location.href = getNextUrl();
    return;
  }

  bindPasswordToggles();
  bindStrengthIndicator();
  bindForm();
};

init();
