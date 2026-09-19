function isLoopbackHost(hostname) {
  return hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1';
}

/**
 * Local development API base.
 *
 * The backend runs on 9100 (`PORT` in `apps/backend/.env`) and lists
 * `localhost:5500` in STORE_CORS/AUTH_CORS, which is the port this store is
 * served from locally. The previous value here was 3000, a legacy service that
 * is no longer part of the stack, so every local request failed CORS before it
 * reached the API.
 */
const LOCAL_API_URL = 'http://localhost:9100/api';

const resolveDefaultApiUrl = () => {
  if (typeof window === 'undefined') {
    return LOCAL_API_URL;
  }

  const { protocol, hostname } = window.location;
  if (!/^https?:$/.test(protocol)) {
    return LOCAL_API_URL;
  }

  if (isLoopbackHost(hostname)) {
    return LOCAL_API_URL;
  }

  // Production: relative path, so requests go through the Pages Function in
  // `_worker.js`, which proxies them to API_ORIGIN (the Railway backend). Keeping
  // the API same-origin is what lets the session cookie be first-party; pointing
  // this at api.sizo.uk directly would make it third-party.
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

// OAuth flows used to navigate to a separate auth host (auth.sizo.uk), because
// the Pages proxy was assumed unable to pass Google's redirect through.
//
// That is no longer true, and the separate host was actively broken: the proxy
// in `_worker.js` forwards `/api/*` to the backend, so `/api/auth/google` and its
// callback are reachable on this very origin. Keeping the flow same-origin is also
// what lets the callback set the session cookie directly, and it removes a second
// deployment to keep in step.
//
// Google is therefore started with `buildApiPath('/auth/google')`.
