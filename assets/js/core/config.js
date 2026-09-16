function isLoopbackHost(hostname) {
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1';
}

const resolveDefaultApiUrl = () => {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000/api';
  }

  const { protocol, hostname, port } = window.location;
  if (!/^https?:$/.test(protocol)) {
    return 'http://localhost:3000/api';
  }

  if (isLoopbackHost(hostname)) {
    return 'http://localhost:3000/api';
  }

  // Production: use relative path so requests go through the Pages Function
  // proxy (Service Binding) instead of hitting the now-private api.sizo.uk.
  return '/api';
};

const DEFAULT_API_URL = resolveDefaultApiUrl();
const API_URL_KEY = 'SIZO_API_URL';

const getSanitizedConfiguredApiUrl = () => {
  const configured = window.localStorage.getItem(API_URL_KEY);
  if (!configured || !configured.trim()) {
    return '';
  }

  try {
    const parsed = new URL(configured.trim());
    const normalized = parsed.toString().replace(/\/$/, '');
    const pageHost = window.location.hostname;
    const pageProtocol = window.location.protocol;
    const sameOrigin = parsed.origin === window.location.origin;
    const loopbackTarget = isLoopbackHost(parsed.hostname);
    const publicPage = !isLoopbackHost(pageHost);

    // Prevent stale dev overrides like http://localhost:3000/api from breaking the public HTTPS site.
    if (publicPage && loopbackTarget && !sameOrigin) {
      window.localStorage.removeItem(API_URL_KEY);
      return '';
    }

    // Avoid mixed-content API overrides on HTTPS pages.
    if (pageProtocol === 'https:' && parsed.protocol === 'http:' && !sameOrigin) {
      window.localStorage.removeItem(API_URL_KEY);
      return '';
    }

    return normalized;
  } catch {
    window.localStorage.removeItem(API_URL_KEY);
    return '';
  }
};

export const getApiUrl = () => {
  const configured = getSanitizedConfiguredApiUrl();
  return configured || DEFAULT_API_URL;
};

export const setApiUrl = (url) => {
  if (!url || !url.trim()) {
    window.localStorage.removeItem(API_URL_KEY);
    return;
  }

  window.localStorage.setItem(API_URL_KEY, url.trim().replace(/\/$/, ''));
};

export const buildApiPath = (path) => {
  const sanitized = path.startsWith('/') ? path : `/${path}`;
  return `${getApiUrl()}${sanitized}`;
};

// OAuth flows require the browser to navigate directly to the auth service.
// In production, this is auth.sizo.uk (bypasses the Pages proxy which cannot
// pass Google's 302 redirect through to the browser).
const getAuthServiceUrl = () => {
  if (typeof window === 'undefined') return 'http://localhost:3000/api';
  if (isLoopbackHost(window.location.hostname)) return 'http://localhost:3000/api';
  return 'https://auth.sizo.uk/api';
};

export const buildAuthPath = (path) => {
  const sanitized = path.startsWith('/') ? path : `/${path}`;
  return `${getAuthServiceUrl()}${sanitized}`;
};
