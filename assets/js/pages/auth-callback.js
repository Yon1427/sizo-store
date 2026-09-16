import { setSession } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { DEFAULT_AUTH_REDIRECT, sanitizeNextPath } from '../core/navigation.js';

const statusNode = document.getElementById('auth-status');

const setStatus = (text, isError = false) => {
  if (!statusNode) {
    return;
  }

  statusNode.textContent = text;
  statusNode.classList.toggle('text-scarlet', isError);
  statusNode.classList.toggle('text-gray-400', !isError);
};

const redirect = (url, delay = 350) => {
  window.setTimeout(() => {
    window.location.href = url;
  }, delay);
};

const getCallbackParams = () => {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';

  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      params.set(key, value);
    });
  }

  return params;
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

const init = () => {
  const params = getCallbackParams();
  const userParam = params.get('user');
  const csrfToken = params.get('csrf') || '';
  const nextPath = sanitizeNextPath(params.get('next'), DEFAULT_AUTH_REDIRECT);

  if (!userParam) {
    setStatus('Authentication callback is missing required data.', true);
    showToast('Authentication failed', 'error');
    redirect('/login.html?error=auth_failed', 700);
    return;
  }

  const user = parseUserPayload(userParam);
  if (user) {
    setSession({ user, csrfToken });
    setStatus('Authentication complete. Redirecting to your profile...');
    showToast('Signed in successfully', 'success');
    redirect(nextPath || DEFAULT_AUTH_REDIRECT);
    return;
  }

  setStatus('Unable to parse callback data.', true);
  showToast('Authentication failed', 'error');
  redirect('/login.html?error=auth_failed', 700);
};

init();
