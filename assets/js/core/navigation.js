export const DEFAULT_PUBLIC_REDIRECT = '/index.html';
export const DEFAULT_AUTH_REDIRECT = '/profile.html';

export const sanitizeNextPath = (value, fallback = DEFAULT_PUBLIC_REDIRECT) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  if (
    !normalized ||
    !normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.startsWith('/\\') ||
    normalized.startsWith('#')
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(normalized, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.hash || parsed.pathname.includes('\\')) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
};

export const buildLoginUrl = (nextPath = window.location.pathname + window.location.search) =>
  `/login.html?next=${encodeURIComponent(sanitizeNextPath(nextPath, DEFAULT_PUBLIC_REDIRECT))}`;
