import { buildApiPath } from '../core/config.js';
import { mergeGuestCartIntoAccount } from '../core/cart-helpers.js';
import { apiPost } from '../core/http.js';
import { DEFAULT_PUBLIC_REDIRECT, sanitizeNextPath } from '../core/navigation.js';
import { createTurnstileGuard } from '../core/security.js';
import { isAuthenticated, setSession } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { syncLucide } from '../core/shell.js';
import { t } from '../core/i18n.js';

const form = document.getElementById('login-form');
const passwordToggleButton = document.getElementById('password-toggle');
const googleBtn = document.getElementById('google-btn');
const turnstileGuardPromise = createTurnstileGuard({ containerId: 'login-turnstile' });

const getNextUrl = () => {
  const next = new URLSearchParams(window.location.search).get('next');
  return sanitizeNextPath(next, DEFAULT_PUBLIC_REDIRECT);
};

const bindPasswordToggle = () => {
  if (!passwordToggleButton) {
    return;
  }

  passwordToggleButton.addEventListener('click', () => {
    const wrap = passwordToggleButton.closest('.login-form__input-wrap');
    const input = wrap?.querySelector('input');
    const icon = passwordToggleButton.querySelector('i');

    if (!input) {
      return;
    }

    if (input.type === 'password') {
      input.type = 'text';
      icon?.setAttribute('data-lucide', 'eye-off');
      passwordToggleButton.setAttribute('aria-label', 'Hide password');
    } else {
      input.type = 'password';
      icon?.setAttribute('data-lucide', 'eye');
      passwordToggleButton.setAttribute('aria-label', 'Show password');
    }

    syncLucide();
  });
};

const bindGoogleButton = () => {
  if (!googleBtn) return;

  googleBtn.addEventListener('click', () => {
    // Same-origin through the Pages proxy, so the callback can set the session
    // cookie directly. `next` rides along so the backend can send the browser
    // back to where it started.
    const apiBase = buildApiPath('/auth/google');
    const next = getNextUrl();
    const separator = apiBase.includes('?') ? '&' : '?';
    const redirectUrl = next ? `${apiBase}${separator}next=${encodeURIComponent(next)}` : apiBase;
    window.location.href = redirectUrl;
  });
};

const bindForm = () => {
  if (!form) {
    return;
  }

  const emailInput = form.querySelector('input[type="email"]');
  const passwordInput = form.querySelector('input[type="password"]');

  // Clear aria-invalid / aria-describedby on input
  emailInput?.addEventListener('input', () => {
    emailInput.removeAttribute('aria-invalid');
    emailInput.removeAttribute('aria-describedby');
    const emailErr = document.getElementById('email-error');
    if (emailErr) emailErr.setAttribute('hidden', '');
  });
  passwordInput?.addEventListener('input', () => {
    passwordInput.removeAttribute('aria-invalid');
    passwordInput.removeAttribute('aria-describedby');
    const passwordErr = document.getElementById('password-error');
    if (passwordErr) passwordErr.setAttribute('hidden', '');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput?.value?.trim() || '';
    const password = passwordInput?.value || '';
    const submitButton = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      if (!email) {
        emailInput?.setAttribute('aria-invalid', 'true');
        emailInput?.setAttribute('aria-describedby', 'email-error');
        const emailErr = document.getElementById('email-error');
        if (emailErr) { emailErr.textContent = t('field_required', 'This field is required'); emailErr.removeAttribute('hidden'); }
      }
      if (!password) {
        passwordInput?.setAttribute('aria-invalid', 'true');
        passwordInput?.setAttribute('aria-describedby', 'password-error');
        const passwordErr = document.getElementById('password-error');
        if (passwordErr) { passwordErr.textContent = t('field_required', 'This field is required'); passwordErr.removeAttribute('hidden'); }
      }
      showToast(t('toast_login_fields_required', 'Email and password are required'), 'error');
      return;
    }

    const original = submitButton?.innerHTML;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline"></i> ${t('btn_signing_in', 'SIGNING IN...')}`;
      syncLucide();
    }

    try {
      const turnstileGuard = await turnstileGuardPromise;
      const turnstileToken = await turnstileGuard.consumeToken();
      const response = await apiPost('/auth/login', { email, password, turnstileToken });
      const user = response?.data?.user;
      const csrfToken = response?.data?.csrfToken;

      if (!user) {
        throw new Error('Invalid login response');
      }

      setSession({ user, csrfToken });
      showToast(t('toast_signed_in', 'Signed in successfully'), 'success');

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
      showToast(error.message || t('toast_login_failed', 'Login failed'), 'error');
    }
  });
};

const parseUserPayload = (raw) => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
};

const handleAuthQuery = () => {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get('error');
  const authReason = params.get('reason');
  const token = params.get('token');
  const userParam = params.get('user');

  if (token && userParam) {
    const user = parseUserPayload(userParam);
    if (user) {
      setSession({ user });
      showToast(t('toast_signed_in_google', 'Signed in with Google'), 'success');
      window.setTimeout(async () => {
        // Merge any guest cart items into the account cart before leaving (H2).
        try { await mergeGuestCartIntoAccount(); } catch { /* non-fatal */ }
        window.location.href = getNextUrl();
      }, 250);
      return true;
    }

    showToast(t('toast_callback_invalid', 'Authentication callback was invalid'), 'error');
  }

  if (authError === 'auth_failed') {
    // The backend reports why: an account that already exists for the Google
    // address needs a different message from a generic failure, because
    // retrying with Google will never work — the customer has to sign in with
    // their password first.
    const reason = authReason === 'CONFLICT'
      ? t('toast_google_account_exists', 'An account already exists for this email. Sign in with your password, then connect Google from your account settings.')
      : t('toast_google_failed', 'Google sign-in failed. Please try again.');
    showToast(reason, 'error');
  }

  return false;
};

const init = () => {
  syncLucide();

  if (handleAuthQuery()) {
    return;
  }

  if (isAuthenticated()) {
    window.location.href = getNextUrl();
    return;
  }

  bindPasswordToggle();
  bindGoogleButton();
  bindForm();
};

init();
