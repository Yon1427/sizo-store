const TOKEN_KEY = 'sizo_token';
const EXPIRY_KEY = 'sizo_token_expiry';
const USER_KEY = 'sizo_user';
const CSRF_KEY = 'sizo_csrf';
const GUEST_ORDER_TOKEN_KEY = 'sizo_guest_order_token';

// --- CSRF token (synchroniser-token pattern) ---

export const getCsrfToken = () => window.localStorage.getItem(CSRF_KEY) || '';

export const setCsrfToken = (token) => {
  if (!token) {
    window.localStorage.removeItem(CSRF_KEY);
    return;
  }
  window.localStorage.setItem(CSRF_KEY, token);
};

// --- Legacy token helpers (JWT now lives in an httpOnly cookie) ---

export const getToken = () => {
  // Backward compat: return any legacy localStorage token so that
  // http.js can send it as a Bearer fallback until the user re-logs in.
  const expiry = window.localStorage.getItem(EXPIRY_KEY);
  if (expiry && Date.now() > parseInt(expiry, 10)) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(EXPIRY_KEY);
    return '';
  }
  return window.localStorage.getItem(TOKEN_KEY) || '';
};

export const setToken = (token) => {
  // New sessions no longer store tokens client-side.
  // Clean up any legacy entries.
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(EXPIRY_KEY);
};

// --- User data ---

export const getUser = () => {
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const setUser = (user) => {
  if (!user) {
    window.localStorage.removeItem(USER_KEY);
    return;
  }

  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
};

// --- Session lifecycle ---

export const clearSession = () => {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(EXPIRY_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(CSRF_KEY);
};

export const isAuthenticated = () => Boolean(getUser());

export const setSession = ({ token, user, csrfToken }) => {
  // Clear legacy JWT from localStorage
  setToken(null);
  setUser(user || null);
  if (csrfToken) {
    setCsrfToken(csrfToken);
  }
};

export const getGuestOrderToken = () => window.sessionStorage.getItem(GUEST_ORDER_TOKEN_KEY) || '';

export const setGuestOrderToken = (token) => {
  if (!token) {
    window.sessionStorage.removeItem(GUEST_ORDER_TOKEN_KEY);
    return;
  }

  window.sessionStorage.setItem(GUEST_ORDER_TOKEN_KEY, token);
};

export const clearGuestOrderToken = () => {
  window.sessionStorage.removeItem(GUEST_ORDER_TOKEN_KEY);
};

export const getInitials = (name, email = '') => {
  const source = (name || email || '').trim();
  if (!source) {
    return 'U';
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};
