import { apiPost, authClient } from './http.js';
import { getGuestCartCount } from './guest-cart.js';
import { showToast } from './toast.js';
import { clearSession, getInitials, getUser, isAuthenticated, setCsrfToken, setUser } from './session.js';
import { t, renderI18n } from './i18n.js';
import { buildLoginUrl } from './navigation.js';

const PROTECTED_PAGES = new Set(['profile.html']);
const PROTECTED_LINKS = new Set(['profile.html']);

// Cloudflare Pages serves clean URLs (/profile maps to profile.html).
// Always normalise to a "<name>.html" form so set lookups work in both modes.
const ensureHtmlSuffix = (name) => {
  if (!name) return 'index.html';
  return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.html`;
};

const toPageName = (href = '') => {
  try {
    const parsed = new URL(href || window.location.pathname, window.location.href);
    const path = parsed.pathname || '';
    if (!path || path === '/') {
      return 'index.html';
    }

    const last = path.split('/').filter(Boolean).pop()?.toLowerCase() || 'index.html';
    return ensureHtmlSuffix(last);
  } catch {
    const normalized = String(href || '')
      .split('#')[0]
      .split('?')[0]
      .trim()
      .replace(/^\.\//, '')
      .replace(/^\//, '')
      .toLowerCase();

    if (!normalized) {
      return 'index.html';
    }

    return ensureHtmlSuffix(normalized.split('/').pop() || 'index.html');
  }
};

const getCurrentPage = () => toPageName(window.location.pathname);

const buildNextPath = () => {
  // Preserve the full pathname, not just the filename, so post-login
  // redirects can return the user to nested routes.
  const path = window.location.pathname || '/index.html';
  const search = window.location.search || '';
  return `${path}${search}`;
};

const redirectToLogin = (nextPath = buildNextPath()) => {
  window.location.href = buildLoginUrl(nextPath || '/index.html');
};

const enforcePageProtection = () => {
  const current = getCurrentPage();
  const isProtected = PROTECTED_PAGES.has(current);
  if (!isProtected || isAuthenticated()) {
    return true;
  }

  redirectToLogin();
  return false;
};

const syncLucide = () => {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
};

const bindSignOut = () => {
  if (document.body.dataset.logoutBound === '1') {
    return;
  }

  document.body.dataset.logoutBound = '1';
  document.body.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-action="logout"]');
    if (!link) {
      return;
    }

    event.preventDefault();

    // Best-effort server-side cookie clear; proceed locally even if it fails.
    apiPost('/auth/logout', {}, true).catch(() => {});

    clearSession();
    window.location.href = '/index.html';
  });
};

const buildNavLink = (href, text, className, action = '') => {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  link.className = className;
  if (action) {
    link.dataset.action = action;
  }
  return link;
};

const decorateDesktopNav = () => {
  document.querySelectorAll('nav div').forEach((group) => {
    if (!group.classList.contains('md:flex')) {
      return;
    }

    if (!group.querySelector('a[data-action="logout"]')) {
      group.append(buildNavLink('index.html', t('btn_sign_out', 'SIGN OUT'), 'text-gray-300 hover:text-scarlet', 'logout'));
    }
  });
};

const decorateMobileNav = () => {
  const mobileMenu = document.getElementById('mobile-menu');
  if (!mobileMenu) {
    return;
  }

  if (!mobileMenu.querySelector('a[data-action="logout"]')) {
    mobileMenu.append(buildNavLink('index.html', t('btn_sign_out', 'SIGN OUT'), 'block py-1 text-scarlet', 'logout'));
  }
};

const removeSessionLinks = () => {
  document.querySelectorAll('a[data-action="logout"]').forEach((link) => link.remove());
  document.querySelectorAll('a[data-auth-swapped="1"]').forEach((link) => {
    link.textContent = t('nav_signin', 'SIGN IN');
    link.setAttribute('href', '/login.html');
    link.removeAttribute('data-auth-swapped');
  });
};

const bindProtectedLinks = () => {
  if (document.body.dataset.protectedLinksBound === '1') {
    return;
  }

  document.body.dataset.protectedLinksBound = '1';
  document.body.addEventListener('click', (event) => {
    if (isAuthenticated()) {
      return;
    }

    const link = event.target.closest('a[href]');
    if (!link) {
      return;
    }

    const href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')) {
      return;
    }

    const targetPage = toPageName(href);
    if (!PROTECTED_LINKS.has(targetPage)) {
      return;
    }

    let nextPath = targetPage;
    try {
      const parsed = new URL(href, window.location.href);
      nextPath = `${toPageName(parsed.pathname)}${parsed.search || ''}`;
    } catch {
      nextPath = targetPage;
    }

    event.preventDefault();
    showToast(t('toast_sign_in_required', 'Please sign in first'), 'error');
    redirectToLogin(nextPath);
  });
};

const hydrateAuthUi = () => {
  const authenticated = isAuthenticated();
  const user = getUser();

  if (authenticated) {
    document.querySelectorAll('a[href="login.html"], a[href="/login.html"]').forEach((link) => {
      if (link.textContent?.toUpperCase().includes('SIGN IN')) {
        link.textContent = t('auth_profile', 'PROFILE');
      }
      link.setAttribute('href', '/profile.html');
      link.dataset.authSwapped = '1';
    });

    const initials = getInitials(user?.name, user?.email);
    document.querySelectorAll('div.rounded-full span').forEach((node) => {
      if (node.textContent && node.textContent.trim().length <= 2) {
        node.textContent = initials;
      }
    });

    decorateDesktopNav();
    decorateMobileNav();
    syncLucide();
    return;
  }

  removeSessionLinks();
};

const applyCartCount = (badges, count) => {
  badges.forEach((badge) => {
    badge.textContent = count;
    badge.style.display = Number(count) > 0 ? 'inline-flex' : 'none';
  });
};

export const refreshCartCount = async () => {
  const badges = document.querySelectorAll('#cart-count, .navbar__cart-badge');
  if (!badges.length) {
    return;
  }

  if (!isAuthenticated()) {
    applyCartCount(badges, String(getGuestCartCount()));
    return;
  }

  try {
    const response = await authClient.get('/cart/count');
    applyCartCount(badges, String(response?.data?.count ?? 0));
  } catch {
    applyCartCount(badges, '0');
  }
};

export const ensureAuthenticated = () => {
  if (isAuthenticated()) {
    return true;
  }

  const next = `${getCurrentPage()}${window.location.search || ''}`;
  showToast(t('toast_sign_in_required', 'Please sign in first'), 'error');
  redirectToLogin(next);
  return false;
};

export const verifyServerSession = async () => {
  try {
    const response = await authClient.get('/auth/verify');
    const data = response?.data;
    if (!data?.authenticated || !data?.user) {
      clearSession();
      return null;
    }

    setUser(data.user);
    if (data.csrfToken) {
      setCsrfToken(data.csrfToken);
    }
    return data;
  } catch {
    clearSession();
    return null;
  }
};

export const initShell = async () => {
  if (!enforcePageProtection()) {
    return false;
  }

  // If localStorage has no session, check the httpOnly cookie server-side.
  // This bridges auth across www.sizo.uk ↔ sizo.uk (different origins, same cookie).
  if (!isAuthenticated()) {
    await verifyServerSession();
  }

  syncLucide();
  bindSignOut();
  bindProtectedLinks();
  hydrateAuthUi();
  refreshCartCount();
  return true;
};

export { syncLucide, renderI18n };
