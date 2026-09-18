import { buildApiPath } from './config.js';
import { t } from './i18n.js';
import {
  clearSession,
  getCsrfToken,
  getGuestOrderToken,
  getToken,
} from './session.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  constructor(message, status = 500, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const toApiError = (status, payload, fallbackMessage) => {
  const message = payload?.message || payload?.error || fallbackMessage || t('http_error_fallback', 'Request failed');
  return new ApiError(message, status, payload);
};

export const apiRequest = async (path, options = {}) => {
  const {
    method = 'GET',
    body,
    auth = false,
    guestOrder = false,
    headers = {},
    timeout = 15000,
  } = options;

  const requestHeaders = {
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (auth) {
    // Legacy fallback: send Bearer header if an old token exists in localStorage.
    // New sessions rely solely on the httpOnly cookie sent via credentials:'include'.
    const legacyToken = getToken();
    if (legacyToken) {
      requestHeaders.Authorization = `Bearer ${legacyToken}`;
    }
  }

  // CSRF protection: echo the synchroniser token on every mutating request,
  // not only the ones flagged `auth`.
  //
  // The cookie is attached by the browser on *all* requests here
  // (`credentials: 'include'`), so a public endpoint called while signed in is
  // still an authenticated request as far as the server is concerned — and the
  // server enforces the double-submit check whenever a session carries an auth
  // context. `/auth/verify-email/confirm` is the trap: a customer who registers
  // and then clicks the link in their inbox is still signed in in that browser,
  // so omitting the header produced a 403 on a flow that has nothing to do with
  // being logged in. Sending a valid token when one is stored is always correct
  // and is ignored by endpoints that do not check it.
  if (MUTATING_METHODS.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      requestHeaders['X-CSRF-Token'] = csrf;
    }
  }

  if (guestOrder) {
    const guestToken = getGuestOrderToken();
    if (!guestToken) {
      throw new ApiError(t('http_guest_token_missing', 'Guest order token is missing'), 401);
    }

    requestHeaders['x-guest-token'] = guestToken;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(buildApiPath(path), {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'include',
    });
    clearTimeout(timeoutId);

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 401) {
        clearSession();
      }
      throw toApiError(response.status, payload, `HTTP ${response.status}`);
    }

    return payload;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError(t('http_request_timed_out', 'Request timed out'), 408);
    }
    throw err;
  }
};

export const apiGet = (path, auth = false, options = {}) => apiRequest(path, { auth, ...options });
export const apiPost = (path, body, auth = false, options = {}) =>
  apiRequest(path, { method: 'POST', body, auth, ...options });
export const apiPatch = (path, body, auth = false, options = {}) =>
  apiRequest(path, { method: 'PATCH', body, auth, ...options });
export const apiDelete = (path, auth = false, options = {}) => apiRequest(path, { method: 'DELETE', auth, ...options });

const createClient = (defaults = {}) => ({
  get: (path, options = {}) => apiRequest(path, { ...defaults, ...options }),
  post: (path, body, options = {}) => apiRequest(path, { method: 'POST', body, ...defaults, ...options }),
  patch: (path, body, options = {}) => apiRequest(path, { method: 'PATCH', body, ...defaults, ...options }),
  delete: (path, options = {}) => apiRequest(path, { method: 'DELETE', ...defaults, ...options }),
});

export const authClient = createClient({ auth: true });
export const guestOrderClient = createClient({ guestOrder: true });
