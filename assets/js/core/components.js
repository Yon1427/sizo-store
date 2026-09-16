// SIZO Shared Components - Common UI functionality
import { throttle } from './utils.js';
import { apiGet, apiPost } from './http.js';
import { getGuestCartItems } from './guest-cart.js';
import { isAuthenticated, getUser, clearSession } from './session.js';
import { t, setLang, getLang, initI18n, renderI18n } from './i18n.js';
import { formatMoney, escapeHtml } from './format.js';

let mobileSearchDebounce;

/* ============================================
   THEME SYSTEM
   ============================================ */

export const initTheme = () => {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  _syncThemeButton(theme);
};

export const toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', next);
  document.documentElement.classList.toggle('dark', next === 'dark');
  localStorage.setItem('sizo-theme', next);
  _syncThemeButton(next);
};

const _syncThemeButton = (theme) => {
  const isDark = theme === 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', isDark ? t('aria_light_mode', 'Switch to light mode') : t('aria_dark_mode', 'Switch to dark mode'));
  });
  document.querySelectorAll('[data-theme-icon="dark"]').forEach((moon) => {
    moon.classList.toggle('hidden', !isDark);
  });
  document.querySelectorAll('[data-theme-icon="light"]').forEach((sun) => {
    sun.classList.toggle('hidden', isDark);
  });
};

const bindThemeToggles = () => {
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    if (btn.dataset.themeBound === '1') {
      return;
    }

    btn.dataset.themeBound = '1';
    btn.addEventListener('click', toggleTheme);
  });
};

/* ============================================
   LOGO
   ============================================ */

export const getLogoSVG = (size = 40) => {
  const viewBox = size === 40 ? '0 0 48 48' : `0 0 ${size} ${size}`;
  const strokeWidth = size === 40 ? 2.5 : 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" fill="none" class="logo-icon">
  <path d="M8 20C8 16.6863 10.6863 14 14 14H34C37.3137 14 40 16.6863 40 20V28C40 31.3137 37.3137 34 34 34H14C10.6863 34 8 31.3137 8 28V20Z" stroke="currentColor" stroke-width="${strokeWidth}" fill="none"/>
  <circle cx="18" cy="22" r="4" stroke="currentColor" stroke-width="${strokeWidth}" fill="none"/>
  <circle cx="32" cy="20" r="2.5" stroke="currentColor" stroke-width="${strokeWidth}"/>
  <circle cx="28" cy="26" r="2.5" stroke="currentColor" stroke-width="${strokeWidth}"/>
  <path d="M18 28V32M16 30H20" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round"/>
  <path d="M20 14V16C20 16 22 15 24 15C26 15 28 16 28 16V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
</svg>`;
};

export const initLogo = () => {
  const container = document.getElementById('logo-container');
  if (container) {
    container.innerHTML = getLogoSVG();
  }

  const footerLogo = document.getElementById('footer-logo');
  if (footerLogo && !footerLogo.innerHTML) {
    footerLogo.innerHTML = getLogoSVG(24);
  }
};

/* ============================================
   MOBILE MENU
   ============================================ */

export const initMobileMenu = () => {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');

  const trapFocusInMenu = (e) => {
    if (e.key !== 'Tab' || !menu) return;
    const focusable = menu.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const closeMenu = () => {
    menu.classList.remove('open');
    menuBtn?.setAttribute('aria-expanded', 'false');
    menuBtn?.setAttribute('aria-label', 'Open menu');
    document.removeEventListener('keydown', trapFocusInMenu);
    document.removeEventListener('keydown', onMenuEscape);
    menuBtn?.focus();
  };

  const onMenuEscape = (e) => {
    if (e.key === 'Escape') closeMenu();
  };

  if (menuBtn && menu) {
    menuBtn.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(isOpen));
      menuBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
      if (isOpen) {
        document.addEventListener('keydown', trapFocusInMenu);
        document.addEventListener('keydown', onMenuEscape);
        const firstLink = menu.querySelector('a, button');
        firstLink?.focus();
      } else {
        document.removeEventListener('keydown', trapFocusInMenu);
        document.removeEventListener('keydown', onMenuEscape);
      }
    });
  }

  const toggles = document.querySelectorAll('.mobile-menu__accordion-toggle');
  toggles.forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = btn.nextElementSibling;
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      btn.setAttribute('aria-expanded', String(!open));
    });
  });
};

/* ============================================
   REVEAL ANIMATIONS
   ============================================ */

export const initRevealAnimations = () => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealSelectors = '.reveal, .reveal-scale, .reveal-left, .reveal-right';
  const reveals = document.querySelectorAll(revealSelectors);
  if (reveals.length === 0) return;

  if (prefersReduced) {
    reveals.forEach(el => el.classList.add('active'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.classList.add('active');
        }, index * 100);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  reveals.forEach(el => observer.observe(el));
};

/* ============================================
   NAVBAR SCROLL
   ============================================ */

export const initNavbar = () => {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  window.addEventListener('scroll', throttle(() => {
    navbar.classList.toggle('navbar-scrolled', window.scrollY > 100);
  }, 100));
};

/* ============================================
   NAVBAR / FOOTER RENDERING
   ============================================ */

const _getCurrentPage = () => {
  return window.location.pathname.split('/').pop() || 'index.html';
};

export const renderNavbar = (mountId = 'navbar-mount') => {
  const el = document.getElementById(mountId);
  if (el) el.outerHTML = getNavbarHTML();
};

export const renderFooter = (mountId = 'footer-mount') => {
  const el = document.getElementById(mountId);
  if (el) el.outerHTML = getFooterHTML();
};

export const getNavbarHTML = () => {
  const page = _getCurrentPage();
  const isAuthPage = ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html'].includes(page);

  const navActive = (href) => page === href ? ' active' : '';

  return `
      <nav class="navbar" id="navbar">
        <div class="navbar__inner">
          <a href="/index.html" class="navbar__logo">
            <span id="logo-container"></span>
            <span class="navbar__logo-text">SIZO</span>
          </a>
          <div class="navbar__links">
            <a href="/index.html" class="navbar__link${navActive('index.html')}" data-i18n="nav_home">${t('nav_home', 'Home')}</a>
            <a href="/browse.html" class="navbar__link${navActive('browse.html')}" data-i18n="nav_browse">${t('nav_browse', 'Browse')}</a>
            <a href="/news.html" class="navbar__link${navActive('news.html')}" data-i18n="nav_news">${t('nav_news', 'News')}</a>
            <a href="/about.html" class="navbar__link${navActive('about.html')}" data-i18n="nav_about">${t('nav_about', 'About')}</a>
            <a href="/cart.html" class="navbar__link${navActive('cart.html')} navbar__cart"><span data-i18n="nav_cart">${t('nav_cart', 'Cart')}</span><span id="cart-count" class="navbar__cart-badge" aria-live="polite" style="display:none"></span></a>
          </div>
          <div class="navbar__actions">
            <button class="btn-icon mobile-search-trigger" id="mobile-search-btn" aria-label="Search">
              <i data-lucide="search" class="w-5 h-5 pointer-events-none"></i>
            </button>
            <div class="lang-dropdown-wrapper" style="position:relative">
              <button class="btn-icon lang-selector" id="lang-toggle" aria-label="Change language" aria-expanded="false">
                <span id="lang-label">EN</span>
              </button>
              <div class="lang-dropdown" id="lang-dropdown" style="display:none">
                <button data-lang="en" class="lang-option">English</button>
                <button data-lang="fr" class="lang-option">Français</button>
                <button data-lang="ar" class="lang-option">العربية</button>
              </div>
            </div>
            <button class="btn-icon" data-theme-toggle aria-label="${(document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? t('aria_light_mode', 'Switch to light mode') : t('aria_dark_mode', 'Switch to dark mode')}">
              <i data-lucide="moon" data-theme-icon="dark" class="w-5 h-5 pointer-events-none"></i>
              <i data-lucide="sun" data-theme-icon="light" class="w-5 h-5 pointer-events-none hidden"></i>
            </button>
            <div id="nav-auth-container"></div>
            <button class="btn-icon mobile-menu-trigger" id="mobile-menu-btn" aria-label=t('aria_open_menu', 'Open menu') aria-expanded="false">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
      </nav>
      <div class="mobile-menu" id="mobile-menu">
        <div class="mobile-menu__accordion">
          <button class="mobile-menu__accordion-toggle" aria-expanded="false">
            <span data-i18n="mobile_menu_nav_label">${t('mobile_menu_nav_label', 'Menu')}</span>
            <i data-lucide="chevron-down"></i>
          </button>
          <div class="mobile-menu__accordion-panel" style="display:none">
            <a href="/browse.html?productType=GIFT_CARD" class="mobile-menu__link" data-i18n="nav_gift_cards">Gift Cards</a>
            <a href="/browse.html?productType=TOP_UP" class="mobile-menu__link" data-i18n="nav_top_ups">Top-Ups</a>
            <a href="/browse.html?productType=GAME_KEY" class="mobile-menu__link" data-i18n="nav_game_keys">Game Keys</a>
            <a href="/browse.html?deals=true" class="mobile-menu__link" data-i18n="nav_deals">Deals</a>
          </div>
        </div>
        <a href="/index.html" class="mobile-menu__link" data-i18n="nav_home">${t('nav_home', 'Home')}</a>
        <a href="/browse.html" class="mobile-menu__link" data-i18n="nav_browse">${t('nav_browse', 'Browse')}</a>
        <a href="/news.html" class="mobile-menu__link" data-i18n="nav_news">${t('nav_news', 'News')}</a>
        <a href="/about.html" class="mobile-menu__link" data-i18n="nav_about">${t('nav_about', 'About')}</a>
        <a href="/profile.html" class="mobile-menu__link${page === 'profile.html' ? ' active' : ''}" data-i18n="nav_library">${t('nav_library', 'Library')}</a>
        <a href="/cart.html" class="mobile-menu__link" data-i18n="nav_cart">${t('nav_cart', 'Cart')}</a>
        ${(isAuthPage || isAuthenticated()) ? '' : `<a href="/login.html" class="mobile-menu__link" data-i18n="nav_signin">${t('nav_signin', 'Sign In')}</a>`}
      </div>
      <div class="mobile-search-overlay" id="mobile-search-overlay">
        <div class="mobile-search-overlay__header">
          <button class="btn-icon" id="mobile-search-close" aria-label=t('aria_close_search', 'Close search')>
            <i data-lucide="arrow-left" class="w-5 h-5 pointer-events-none"></i>
          </button>
          <input type="search" class="mobile-search-overlay__input" data-i18n-placeholder="nav_search_placeholder" placeholder=t('search_placeholder', 'Search 500+ products...') aria-label=t('aria_search_products', 'Search products') autocomplete="off" id="mobile-search-input">
        </div>
        <div class="mobile-search-overlay__results" id="mobile-search-results"></div>
      </div>
    `;
};

export const getFooterHTML = () => {
  return `
      <footer class="footer">
        <div class="footer__inner">
          <div class="footer__top">
            <div class="footer__col footer__col--brand">
              <div class="footer__brand-mark">
                <span id="footer-logo"></span>
                <span class="footer__brand-text">SIZO</span>
              </div>
              <p class="footer__tagline" data-i18n="footer_brand_tagline">${t('footer_brand_tagline', "Algeria's digital store for gift cards, top-ups & game keys. Instant delivery in DZD.")}</p>
            </div>

            <div class="footer__col footer__col--categories">
              <h4 class="footer__col-title" data-i18n="footer_platforms_heading">${t('footer_platforms_heading', 'Platforms')}</h4>
              <ul class="footer__col-list">
                <li><a class="footer__link" href="/browse.html?platform=Steam" data-i18n="footer_plat_steam">${t('footer_plat_steam', 'Steam')}</a></li>
                <li><a class="footer__link" href="/browse.html?platform=Xbox" data-i18n="footer_plat_xbox">${t('footer_plat_xbox', 'Xbox')}</a></li>
                <li><a class="footer__link" href="/browse.html?platform=PlayStation" data-i18n="footer_plat_playstation">${t('footer_plat_playstation', 'PlayStation')}</a></li>
                <li><a class="footer__link" href="/browse.html?platform=Nintendo" data-i18n="footer_plat_nintendo">${t('footer_plat_nintendo', 'Nintendo')}</a></li>
                <li><a class="footer__link" href="/browse.html?platform=Epic+Games" data-i18n="footer_plat_epic">${t('footer_plat_epic', 'Epic Games')}</a></li>
              </ul>
            </div>

            <div class="footer__col footer__col--account">
              <h4 class="footer__col-title" data-i18n="footer_my_account_heading">${t('footer_my_account_heading', 'My Account')}</h4>
              <ul class="footer__col-list">
                <li><a class="footer__link" href="/profile.html" data-i18n="footer_my_library">${t('footer_my_library', 'My Library')}</a></li>
                <li><a class="footer__link" href="/profile.html?tab=orders" data-i18n="footer_my_orders">${t('footer_my_orders', 'My Orders')}</a></li>
              </ul>
            </div>

            <div class="footer__col footer__col--support">
              <h4 class="footer__col-title" data-i18n="footer_support_heading">${t('footer_support_heading', 'Support')}</h4>
              <ul class="footer__col-list">
                <li><a class="footer__link" href="/terms.html" data-i18n="footer_terms">${t('footer_terms', 'Terms')}</a></li>
                <li><a class="footer__link" href="/privacy.html" data-i18n="footer_privacy">${t('footer_privacy', 'Privacy')}</a></li>
                <li><a class="footer__link" href="/refund.html" data-i18n="footer_refund">${t('footer_refund', 'Refund')}</a></li>
              </ul>
            </div>
          </div>
          <div class="footer__bottom">
            <p class="footer__copy" data-i18n="footer_copy">${t('footer_copy', '© 2026 SIZO Digital Store. All rights reserved.')}</p>
          </div>
        </div>
      </footer>
    `;
};

/* ============================================
   AUTH NAV RENDERING
   ============================================ */

const renderAuthNav = async () => {
  const container = document.getElementById('nav-auth-container');
  if (!container) return;
  const authed = await isAuthenticated();
  container.textContent = '';
  if (authed) {
    const profile = getUser();
    const initial = profile?.name?.charAt(0)?.toUpperCase() || 'U';
    const wrapper = document.createElement('div');
    wrapper.className = 'auth-dropdown-wrapper';
    const avatarBtn = document.createElement('button');
    avatarBtn.className = 'auth-avatar';
    avatarBtn.id = 'auth-avatar';
    avatarBtn.setAttribute('aria-label', 'User menu');
    avatarBtn.setAttribute('aria-expanded', 'false');
    avatarBtn.textContent = initial;
    const dropdown = document.createElement('div');
    dropdown.className = 'auth-dropdown';
    dropdown.id = 'auth-dropdown';
    dropdown.style.display = 'none';
    [
      { href: '/profile.html', key: 'auth_profile', fallback: 'Profile' },
      { href: '/profile.html?tab=orders', key: 'auth_orders', fallback: 'Orders' },
      { href: '/profile.html?tab=wishlist', key: 'auth_wishlist', fallback: 'Wishlist' },
    ].forEach(item => {
      const a = document.createElement('a');
      a.href = item.href;
      a.className = 'auth-dropdown__item';
      a.setAttribute('data-i18n', item.key);
      a.textContent = t(item.key, item.fallback);
      dropdown.appendChild(a);
    });
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'auth-dropdown__item';
    logoutBtn.id = 'auth-logout';
    logoutBtn.setAttribute('data-i18n', 'auth_logout');
    logoutBtn.textContent = t('auth_logout', 'Logout');
    dropdown.appendChild(logoutBtn);
    wrapper.appendChild(avatarBtn);
    wrapper.appendChild(dropdown);
    container.appendChild(wrapper);
    const closeDropdown = () => {
      dropdown.style.display = 'none';
      avatarBtn.setAttribute('aria-expanded', 'false');
    };

    const onOutsideClick = (e) => {
      if (!wrapper.contains(e.target)) {
        closeDropdown();
        document.removeEventListener('click', onOutsideClick);
        document.removeEventListener('keydown', onEscape);
      }
    };

    const onEscape = (e) => {
      if (e.key === 'Escape') {
        closeDropdown();
        document.removeEventListener('click', onOutsideClick);
        document.removeEventListener('keydown', onEscape);
        avatarBtn.focus();
      }
    };

    avatarBtn.addEventListener('click', () => {
      const open = dropdown.style.display !== 'none';
      dropdown.style.display = open ? 'none' : 'block';
      avatarBtn.setAttribute('aria-expanded', String(!open));
      if (!open) {
        document.addEventListener('click', onOutsideClick);
        document.addEventListener('keydown', onEscape);
      } else {
        document.removeEventListener('click', onOutsideClick);
        document.removeEventListener('keydown', onEscape);
      }
    });
    logoutBtn.addEventListener('click', () => {
      apiPost('/auth/logout', {}, true).catch(() => {});
      clearSession();
      window.location.href = '/index.html';
    });
  } else {
    const a = document.createElement('a');
    a.href = '/login.html';
    a.id = 'nav-signin';
    a.className = 'btn btn-primary btn-sm';
    a.setAttribute('data-i18n', 'nav_signin');
    a.textContent = t('nav_signin', 'Sign In');
    container.appendChild(a);
  }
};

/* ============================================
   SEARCH HELPER
   ============================================ */

const performSearch = async (query, container) => {
  if (!query.trim()) {
    container.style.display = 'none';
    container.textContent = '';
    return;
  }
  try {
    const data = await apiGet(`/games?search=${encodeURIComponent(query.trim())}&limit=6`);
    container.textContent = '';
    const games = data?.data || [];
    if (games.length === 0) {
      container.innerHTML = `<div class="search-dropdown__empty">${t('search_no_results', 'No results')}</div>`;
      container.style.display = 'block';
      return;
    }
    games.forEach(g => {
      const a = document.createElement('a');
      a.href = `/game-detail.html?slug=${encodeURIComponent(g.slug)}`;
      a.className = 'search-dropdown__item';
      const img = document.createElement('img');
      img.src = g.coverImage || '/assets/placeholder-game.png';
      img.alt = '';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'search-dropdown__title';
      titleSpan.textContent = g.title;
      const priceSpan = document.createElement('span');
      priceSpan.className = 'search-dropdown__price';
      priceSpan.textContent = g.price ? formatMoney(g.price) : '';
      a.appendChild(img);
      a.appendChild(titleSpan);
      a.appendChild(priceSpan);
      container.appendChild(a);
    });
    container.style.display = 'block';
  } catch {
    container.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'search-dropdown__empty';
    empty.textContent = t('search_error', 'Unable to search');
    container.appendChild(empty);
    container.style.display = 'block';
  }
};

/* ============================================
   CART PREVIEW
   ============================================ */

export const initCartPreview = () => {
  const cartLink = document.querySelector('a[href="/cart.html"], a[href="cart.html"]');
  if (!cartLink || window.innerWidth < 768) return;

  let preview;
  let hideTimeout;

  const showPreview = async () => {
    clearTimeout(hideTimeout);
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'cart-preview';
      cartLink.parentElement.appendChild(preview);
      preview.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
      preview.addEventListener('mouseleave', hidePreview);
    }
    preview.textContent = '';
    let items = [];
    let subtotal = 0;
    try {
      const data = await apiGet('/cart', true);
      items = (data?.data?.items || []).slice(-3);
      subtotal = data?.data?.total || 0;
    } catch {
      const guestItems = getGuestCartItems();
      items = guestItems.slice(-3).map(item => ({
        title: item.game?.title || 'Item',
        price: (item.variant?.price || item.game?.price || 0) * item.quantity,
      }));
      subtotal = guestItems.reduce((s, item) => s + (item.variant?.price || item.game?.price || 0) * item.quantity, 0);
    }
    if (items.length === 0) {
      const emptyP = document.createElement('p');
      emptyP.className = 'cart-preview__empty';
      emptyP.textContent = t('cart_preview_empty', 'Cart is empty');
      preview.appendChild(emptyP);
    } else {
      items.forEach(i => {
        const row = document.createElement('div');
        row.className = 'cart-preview__item';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'cart-preview__title';
        titleSpan.textContent = i.title || i.gameTitle || i.game?.title || 'Item';
        const priceSpan = document.createElement('span');
        priceSpan.className = 'cart-preview__price';
        const unitPrice = i.variant?.price || i.game?.price || i.price || 0;
        const qty = i.quantity || 1;
        priceSpan.textContent = formatMoney(typeof i.price === 'number' && !i.game ? i.price : unitPrice * qty);
        row.appendChild(titleSpan);
        row.appendChild(priceSpan);
        preview.appendChild(row);
      });
      const subtotalDiv = document.createElement('div');
      subtotalDiv.className = 'cart-preview__subtotal';
      subtotalDiv.textContent = `${t('cart_preview_subtotal', 'Subtotal:')} ${formatMoney(subtotal)}`;
      preview.appendChild(subtotalDiv);
    }
    const cta = document.createElement('a');
    cta.href = '/cart.html';
    cta.className = 'cart-preview__cta';
    cta.setAttribute('data-i18n', 'cart_preview_view');
    cta.textContent = t('cart_preview_view', 'View Cart');
    preview.appendChild(cta);
    preview.style.display = 'block';
  };

  const hidePreview = () => {
    hideTimeout = setTimeout(() => {
      if (preview) preview.style.display = 'none';
    }, 150);
  };

  cartLink.addEventListener('mouseenter', showPreview);
  cartLink.addEventListener('mouseleave', hidePreview);
};

/* ============================================
   MOBILE SEARCH OVERLAY
   ============================================ */

const initMobileSearch = () => {
  const btn = document.getElementById('mobile-search-btn');
  const overlay = document.getElementById('mobile-search-overlay');
  const closeBtn = document.getElementById('mobile-search-close');
  const input = document.getElementById('mobile-search-input');
  const results = document.getElementById('mobile-search-results');
  if (!btn || !overlay) return;

  btn.addEventListener('click', () => {
    overlay.classList.add('open');
    if (input) input.focus();
  });
  closeBtn?.addEventListener('click', () => {
    overlay.classList.remove('open');
    if (results) { results.style.display = 'none'; results.textContent = ''; }
    if (input) input.value = '';
  });

  if (input && results) {
    input.addEventListener('input', (e) => {
      clearTimeout(mobileSearchDebounce);
      const q = e.target.value.trim();
      if (!q) { results.style.display = 'none'; results.textContent = ''; return; }
      mobileSearchDebounce = setTimeout(() => performSearch(q, results), 200);
    });
  }
};

/* ============================================
   CONFIRM MODAL
   ============================================ */

export const showConfirmModal = (message, onConfirm, onCancel) => {
  const existing = document.getElementById('sizo-confirm-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'sizo-confirm-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'sizo-modal-title');

  const triggerElement = document.activeElement;

  overlay.innerHTML = `
    <div class="fixed inset-0 z-[200] flex items-center justify-center p-4" style="background:rgba(0,0,0,0.6)" id="sizo-modal-backdrop">
      <div class="w-full max-w-md rounded-xl border p-6" style="background:var(--surface);border-color:var(--border)">
        <h2 id="sizo-modal-title" class="sr-only">Confirm action</h2>
        <p class="mb-6 text-lg" style="color:var(--text-primary)">${escapeHtml(message)}</p>
        <div class="flex justify-end gap-3">
          <button id="sizo-modal-cancel" class="btn-cyber border px-4 py-2 font-display text-sm" style="color:var(--text-primary)">${t('modal_cancel', 'CANCEL')}</button>
          <button id="sizo-modal-confirm" class="btn-cyber px-4 py-2 font-display text-sm font-bold text-[var(--on-accent)]" style="background:var(--coral)">${t('modal_confirm', 'CONFIRM')}</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const confirmBtn = document.getElementById('sizo-modal-confirm');
  const cancelBtn = document.getElementById('sizo-modal-cancel');
  confirmBtn?.focus();

  const getFocusableElements = () => {
    const focusable = overlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(focusable).filter((el) => !el.hasAttribute('disabled'));
  };

  const trapFocus = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const cleanup = () => {
    if (!document.contains(overlay)) return;
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('keydown', trapFocus);
    overlay.remove();
    triggerElement?.focus();
  };

  confirmBtn?.addEventListener('click', () => {
    cleanup();
    onConfirm?.();
  });

  cancelBtn?.addEventListener('click', () => {
    cleanup();
    onCancel?.();
  });

  document.getElementById('sizo-modal-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'sizo-modal-backdrop') {
      cleanup();
      onCancel?.();
    }
  });

  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      cleanup();
      onCancel?.();
    }
  };

  document.addEventListener('keydown', onKeydown);
  document.addEventListener('keydown', trapFocus);

  return { close: cleanup };
};

/* ============================================
   INIT
   ============================================ */

const init = async () => {
  if (window.__sizoComponentsInitialized) {
    return;
  }
  window.__sizoComponentsInitialized = true;

  renderNavbar();
  renderFooter();
  await initI18n();

  // Language selector
  const langToggle = document.getElementById('lang-toggle');
  const langDropdown = document.getElementById('lang-dropdown');
  if (langToggle && langDropdown) {
    const langLabel = document.getElementById('lang-label');
    if (langLabel) {
      langLabel.textContent = getLang().toUpperCase();
    }

    const closeLangDropdown = () => {
      langDropdown.style.display = 'none';
      langToggle.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onEscape);
    };

    const onEscape = (e) => {
      if (e.key === 'Escape') {
        closeLangDropdown();
        langToggle.focus();
      }
    };

    langToggle.addEventListener('click', () => {
      const open = langDropdown.style.display !== 'none';
      if (open) {
        closeLangDropdown();
      } else {
        langDropdown.style.display = 'block';
        langToggle.setAttribute('aria-expanded', 'true');
        document.addEventListener('keydown', onEscape);
      }
    });
    langDropdown.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        setLang(lang);
        document.getElementById('lang-label').textContent = lang.toUpperCase();
        closeLangDropdown();
      });
    });
    document.addEventListener('click', (e) => {
      if (!langToggle.contains(e.target) && !langDropdown.contains(e.target)) {
        closeLangDropdown();
      }
    });
  }

  await renderAuthNav();
  initTheme();
  bindThemeToggles();
  initLogo();
  initMobileMenu();
  initCartPreview();
  initMobileSearch();
  initRevealAnimations();
  initNavbar();

  // Allow skip-link to focus main content
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.setAttribute('tabindex', '-1');

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  renderI18n();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
