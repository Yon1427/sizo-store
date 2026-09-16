import { apiDelete, apiGet, apiPatch, apiPost, guestOrderClient } from '../core/http.js';
import { formatDate, formatMoney, escapeHtml } from '../core/format.js';
import { initShell, syncLucide, renderI18n, refreshCartCount } from '../core/shell.js';
import { getUser, setUser, isAuthenticated, getGuestOrderToken } from '../core/session.js';
import { buildLoginUrl } from '../core/navigation.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';
import { debounce } from '../core/utils.js';
import { renderWalletTab } from './wallet.js';

const sections = ['library', 'orders', 'wishlist', 'reviews', 'settings', 'wallet'];

const state = {
  profile: null,
  orders: [],
  wishlist: [],
  reviews: [],
  addresses: [],
};

// Template for profile tab bar (horizontal)
const navButtonsTemplate = () => `
  <nav class="profile-tab-bar" role="tablist" aria-label="${t('profile_nav_label', 'Profile sections')}">
    <button data-action="show-section" data-section="library" id="nav-library" class="profile-tab active" role="tab" aria-selected="true" aria-controls="section-library" tabindex="0">
      <i data-lucide="library" class="w-4 h-4"></i>${t('profile_tab_library', 'Library')}
      <span class="tab-count" id="library-count-nav">0</span>
    </button>
    <button data-action="show-section" data-section="orders" id="nav-orders" class="profile-tab" role="tab" aria-selected="false" aria-controls="section-orders" tabindex="-1">
      <i data-lucide="receipt" class="w-4 h-4"></i>${t('profile_tab_orders', 'Orders')}
      <span class="tab-count" id="orders-count-nav">0</span>
    </button>
    <button data-action="show-section" data-section="wishlist" id="nav-wishlist" class="profile-tab" role="tab" aria-selected="false" aria-controls="section-wishlist" tabindex="-1">
      <i data-lucide="heart" class="w-4 h-4"></i>${t('profile_tab_wishlist', 'Wishlist')}
      <span class="tab-count" id="wishlist-count-nav">0</span>
    </button>
    <button data-action="show-section" data-section="reviews" id="nav-reviews" class="profile-tab" role="tab" aria-selected="false" aria-controls="section-reviews" tabindex="-1">
      <i data-lucide="star" class="w-4 h-4"></i>${t('profile_tab_reviews', 'Reviews')}
      <span class="tab-count" id="reviews-count-nav">0</span>
    </button>
    <button data-action="show-section" data-section="settings" id="nav-settings" class="profile-tab" role="tab" aria-selected="false" aria-controls="section-settings" tabindex="-1">
      <i data-lucide="settings" class="w-4 h-4"></i>${t('profile_tab_settings', 'Settings')}
    </button>
    <button data-action="show-section" data-section="wallet" id="nav-wallet" class="profile-tab" role="tab" aria-selected="false" aria-controls="section-wallet" tabindex="-1">
      <i data-lucide="wallet" class="w-4 h-4"></i>${t('wallet_tab', 'Wallet')}
    </button>
  </nav>
`;

// Template for tab section shells
const tabSectionsTemplate = () => `
    <!-- MY LIBRARY -->
    <div id="section-library" class="content-section active" role="tabpanel" aria-labelledby="nav-library" tabindex="0">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p class="section-kicker">${t('profile_library_kicker', 'Owned Titles')}</p>
          <h2 class="section-title">${t('profile_library_title', 'My Library')}</h2>
        </div>
        <p class="text-sm" style="color:var(--muted)">${t('profile_library_desc', "Games you've purchased are stored here forever.")}</p>
      </div>
      <div id="library-grid" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"></div>
      <div id="library-empty" class="hidden">
        <div class="empty-state">
          <i data-lucide="library"></i>
          <p>${t('profile_library_empty', 'No games yet')}</p>
          <a href="browse.html" class="btn-cyber text-xs mt-2">${t('profile_library_browse', 'BROWSE STORE')}</a>
        </div>
      </div>
    </div>

    <!-- ORDERS -->
    <div id="section-orders" class="content-section" role="tabpanel" aria-labelledby="nav-orders" tabindex="0">
      <div class="section-header mb-6">
        <div>
          <p class="section-kicker">${t('profile_orders_kicker', 'Orders & Receipts')}</p>
          <h2 class="section-title">${t('profile_orders_title', 'Recent Purchases')}</h2>
        </div>
        <p class="section-description">${t('profile_orders_desc', 'Track payment state, delivery progress, and access order details with minimal friction.')}</p>
      </div>
      <div class="toolbar mb-5">
        <div class="toolbar-block">
          <label for="order-search">${t('profile_orders_search', 'Search')}</label>
          <input id="order-search" class="input-cyber" placeholder="${t('profile_orders_search_placeholder', 'Order number, email, name')}">
        </div>
        <div class="toolbar-block">
          <label for="order-status-filter">${t('profile_orders_status', 'Status')}</label>
          <select id="order-status-filter" class="input-cyber">
            <option value="">${t('profile_orders_all', 'All Status')}</option>
            <option value="COMPLETED">${t('status_delivered', 'Completed')}</option>
            <option value="PROCESSING">${t('profile_orders_processing', 'Processing')}</option>
            <option value="PENDING">${t('status_pending', 'Pending')}</option>
            <option value="FAILED">${t('status_failed', 'Failed')}</option>
            <option value="REFUNDED">${t('status_refunded', 'Refunded')}</option>
          </select>
        </div>
      </div>
      <div id="orders-list" class="space-y-4"></div>
    </div>

    <!-- WISHLIST -->
    <div id="section-wishlist" class="content-section" role="tabpanel" aria-labelledby="nav-wishlist" tabindex="0">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p class="section-kicker">${t('profile_wishlist_kicker', 'Saved Items')}</p>
          <h2 class="section-title">${t('profile_wishlist_title', 'My Wishlist')}</h2>
        </div>
      </div>
      <div id="wishlist-content" class="grid gap-4 sm:grid-cols-1 md:grid-cols-2"></div>
    </div>

    <!-- REVIEWS -->
    <div id="section-reviews" class="content-section" role="tabpanel" aria-labelledby="nav-reviews" tabindex="0">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p class="section-kicker">${t('profile_reviews_kicker', 'My Feedback')}</p>
          <h2 class="section-title">${t('profile_reviews_title', 'My Reviews')}</h2>
        </div>
      </div>
      <div id="reviews-content" class="space-y-4"></div>
    </div>

    <!-- SETTINGS -->
    <div id="section-settings" class="content-section" role="tabpanel" aria-labelledby="nav-settings" tabindex="0">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p class="section-kicker">${t('profile_settings_kicker', 'Account')}</p>
          <h2 class="section-title">${t('profile_settings_title', 'Settings')}</h2>
        </div>
      </div>

      <!-- Email verification -->
      <div id="email-verification-panel" class="card p-5 mb-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p id="email-verification-status" class="font-display font-bold" style="color:var(--text)">${t('profile_email_checking', 'Checking...')}</p>
            <p id="email-verification-copy" class="text-sm mt-1" style="color:var(--muted)">—</p>
          </div>
          <button id="send-verification-email" class="btn-cyber text-xs">${t('send_email_button', 'SEND EMAIL')}</button>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-2">
        <!-- Identity -->
        <div class="card p-6">
          <p class="section-kicker mb-4">${t('profile_settings_identity', 'Identity')}</p>
          <div class="space-y-4">
            <div>
              <label class="block uppercase font-mono text-xs tracking-wider mb-1.5" style="color:var(--muted)">${t('profile_settings_name', 'Display Name')}</label>
              <input id="profile-name" class="input-cyber" placeholder="${t('profile_settings_name_placeholder', 'Your name')}">
            </div>
            <div>
              <label class="block uppercase font-mono text-xs tracking-wider mb-1.5" style="color:var(--muted)">${t('profile_settings_phone', 'Phone')} <span class="text-xs" style="color:var(--muted)">${t('profile_settings_optional', '(optional)')}</span></label>
              <input id="profile-phone" class="input-cyber" placeholder="+213 ...">
            </div>
            <div>
              <label class="block uppercase font-mono text-xs tracking-wider mb-1.5" style="color:var(--muted)">${t('field_email', 'Email')}</label>
              <input id="profile-email" class="input-cyber" readonly aria-readonly="true">
            </div>
            <div class="flex gap-3 pt-2">
              <button id="save-profile" class="btn-cyber text-xs">${t('btn_save', 'SAVE CHANGES')}</button>
              <a href="index.html" data-action="logout" class="action-btn text-xs" style="color:var(--muted)">${t('auth_logout', 'SIGN OUT')}</a>
            </div>
          </div>
        </div>

        <!-- Addresses -->
        <div class="card p-6">
          <p class="section-kicker mb-4">${t('profile_settings_addresses', 'Delivery Addresses')}</p>
          <div id="addresses-list" class="space-y-3 mb-4"></div>
          <form id="address-form" class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="block uppercase font-mono text-xs tracking-wider mb-1.5" style="color:var(--muted)">${t('profile_address_label', 'Label')}</label>
                <input name="label" required class="input-cyber" placeholder="${t('profile_address_label_placeholder', 'Home / Work')}">
              </div>
              <div>
                <label class="block uppercase font-mono text-xs tracking-wider mb-1.5" style="color:var(--muted)">${t('profile_address_city', 'City')}</label>
                <input name="city" required class="input-cyber" placeholder="${t('profile_address_city_placeholder', 'Algiers')}">
              </div>
            </div>
            <div>
              <label class="block uppercase font-mono text-xs tracking-wider mb-1.5" style="color:var(--muted)">${t('profile_address_street', 'Street Address')}</label>
              <input name="street" required class="input-cyber" placeholder="${t('profile_address_street_placeholder', '123 Street Name')}">
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="block uppercase font-mono text-xs tracking-wider mb-1.5" style="color:var(--muted)">${t('profile_address_wilaya', 'Wilaya')}</label>
                <input name="wilaya" required class="input-cyber" placeholder="${t('profile_address_wilaya_placeholder', 'Alger')}">
              </div>
              <div>
                <label class="block uppercase font-mono text-xs tracking-wider mb-1.5" style="color:var(--muted)">${t('profile_address_zip', 'Postal Code')}</label>
                <input name="zipCode" class="input-cyber" placeholder="16000">
              </div>
            </div>
            <label class="inline-flex items-center gap-2 text-sm" style="color:var(--muted)">
              <input name="isDefault" type="checkbox" class="h-4 w-4"> ${t('profile_address_default', 'Set as default address')}
            </label>
            <button type="submit" class="btn-cyber text-xs">${t('btn_add', 'ADD ADDRESS')}</button>
          </form>
        </div>
      </div>
    </div>

    <!-- WALLET -->
    <div id="section-wallet" class="content-section" role="tabpanel" aria-labelledby="nav-wallet" tabindex="0">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p class="section-kicker">${t('wallet_tx_deposit', 'Funds')}</p>
          <h2 class="section-title">${t('wallet_tab', 'Wallet')}</h2>
        </div>
      </div>
      <div id="wallet-tab-content"></div>
    </div>
`;

// Wallet tab is rendered dynamically via renderWalletTab from wallet.js
// to avoid loading wallet code until the tab is actually opened.

// Template for active order banner
const activeOrderBannerTemplate = () => `
  <div id="active-order-banner" class="hidden mx-auto max-w-7xl px-4 pt-24 pb-0">
    <div class="active-order-banner">
      <i data-lucide="loader" class="w-5 h-5 animate-spin" style="color:var(--cyan)"></i>
      <div class="flex-1">
        <p class="font-display font-bold text-sm" style="color:var(--text)">${t('profile_banner_title', 'Order is being processed')}</p>
        <p class="text-sm" style="color:var(--muted)">${t('profile_banner_desc', 'Your keys are being prepared. This usually takes a few seconds.')}</p>
      </div>
      <a id="active-order-link" href="#" class="btn-cyber text-xs">${t('profile_banner_view', 'VIEW ORDER')}</a>
    </div>
  </div>
`;

// Render all shell HTML into mount points

const renderShells = () => {
  const navMount = document.getElementById('profile-nav-mount');
  const contentMount = document.getElementById('profile-content-mount');
  const bannerMount = document.getElementById('active-order-mount');

  if (navMount) navMount.outerHTML = navButtonsTemplate();
  if (contentMount) contentMount.outerHTML = tabSectionsTemplate();
  if (bannerMount) bannerMount.outerHTML = activeOrderBannerTemplate();
};


const renderErrorState = (retryFn) => {
  const target = document.querySelector('.content-section.active') 
    || document.getElementById('section-library') 
    || document.getElementById('main-content');
  if (!target) return;

  target.innerHTML = `
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <i data-lucide="alert-circle" class="w-12 h-12 mb-4 text-error"></i>
      <h2 class="font-display text-xl font-bold mb-2" style="color:var(--text-primary)">${t('profile_error_title', 'Unable to load profile')}</h2>
      <p class="mb-6" style="color:var(--muted)">${t('profile_error_desc', 'Something went wrong while loading your profile data.')}</p>
      <button id="profile-retry-btn" class="btn-cyber bg-cyan px-6 py-3 font-display font-bold text-[var(--on-accent)]">${t('profile_error_retry', 'RETRY')}</button>
    </div>
  `;
  syncLucide();
  renderI18n();
  document.getElementById('profile-retry-btn')?.addEventListener('click', retryFn);
};

const showSection = (sectionName) => {
  const nextSection = sections.includes(sectionName) ? sectionName : 'library';
  sections.forEach((section) => {
    const isActive = section === nextSection;
    document.getElementById(`section-${section}`)?.classList.toggle('active', isActive);
    const navBtn = document.getElementById(`nav-${section}`);
    navBtn?.classList.toggle('active', isActive);
    if (navBtn) {
      navBtn.setAttribute('aria-selected', String(isActive));
      navBtn.tabIndex = isActive ? 0 : -1;
    }
  });
  const url = new URL(window.location.href);
  url.searchParams.set('tab', nextSection);
  url.hash = nextSection;
  window.history.replaceState({}, '', url);
};

// Keyboard navigation for profile tablist (ArrowLeft/Right, Home/End)
const initProfileTabKeyboard = () => {
  const tablist = document.querySelector('.profile-tab-bar[role="tablist"]');
  if (!tablist) return;

  tablist.addEventListener('keydown', (e) => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    const idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;

    let next = null;
    if (e.key === 'ArrowRight') {
      next = (idx + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      next = (idx - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = tabs.length - 1;
    }

    if (next !== null) {
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  });
};

const pillClass = (status) => {
  const s = String(status || '').toUpperCase();
  if (s === 'PAID' || s === 'COMPLETED') return 'pill-green';
  if (s === 'PROCESSING' || s === 'PENDING') return 'pill-amber';
  if (s === 'FAILED' || s === 'CANCELLED' || s === 'REFUNDED') return 'pill-red';
  return 'pill-blue';
};

const statusBadgeClass = (status = '') => {
  const normalized = String(status).toUpperCase();
  if (normalized === 'PAID' || normalized === 'COMPLETED') return 'status-success';
  if (normalized === 'PROCESSING' || normalized === 'PENDING') return 'status-pending';
  if (normalized === 'FAILED' || normalized === 'CANCELLED' || normalized === 'REFUNDED') return 'status-danger';
  return 'status-progress';
};

const isOrderActive = (order) => {
  const ps = String(order?.paymentStatus || '').toUpperCase();
  const s = String(order?.status || '').toUpperCase();
  return ps === 'PAID' && (s === 'PROCESSING' || s === 'PENDING');
};

const updateActiveOrderBanner = (orders) => {
  const banner = document.getElementById('active-order-banner');
  const link = document.getElementById('active-order-link');
  if (!banner || !link) return;
  const activeOrder = orders.find(isOrderActive);
  if (activeOrder) {
    banner.classList.remove('hidden');
    link.href = `order-detail.html?order=${encodeURIComponent(activeOrder.id)}`;
  } else {
    banner.classList.add('hidden');
  }
};

const updateProfileHeader = (profile) => {
  const name = profile.name || profile.email;

  const profileName = document.getElementById('profile-name');
  const profilePhone = document.getElementById('profile-phone');
  const profileEmail = document.getElementById('profile-email');

  if (profileName) profileName.value = profile.name || '';
  if (profilePhone) profilePhone.value = profile.phone || '';
  if (profileEmail) profileEmail.value = profile.email || '';

  const cachedUser = getUser() || {};
  setUser({ ...cachedUser, ...profile, name: profile.name, email: profile.email });

  document.title = `${name} | SIZO Digital Store`;
};

const updateSidebarCounts = (orders, wishlistItems, reviews) => {
  const owned = orders.filter((o) => {
    const ps = String(o.paymentStatus || '').toUpperCase();
    const s = String(o.status || '').toUpperCase();
    return ps === 'PAID' && s !== 'CANCELLED' && s !== 'REFUNDED';
  });

  const seenGames = new Set();
  let libraryCount = 0;
  owned.forEach((order) => {
    (order.items || []).forEach((item) => {
      if (item.game && !seenGames.has(item.game.id)) {
        seenGames.add(item.game.id);
        libraryCount++;
      }
    });
  });

  const libraryCountNav = document.getElementById('library-count-nav');
  const ordersCountNav = document.getElementById('orders-count-nav');
  const wishlistCountNav = document.getElementById('wishlist-count-nav');
  const reviewsCountNav = document.getElementById('reviews-count-nav');

  if (libraryCountNav) libraryCountNav.textContent = libraryCount;
  if (ordersCountNav) ordersCountNav.textContent = orders.length;
  if (wishlistCountNav) wishlistCountNav.textContent = wishlistItems.length;
  if (reviewsCountNav) reviewsCountNav.textContent = reviews.length;
};

// Targeted refresh helpers — re-fetch only the affected section instead of
// calling loadData() which re-fetches all 5 data sources on every mutation.
const refreshWishlist = async () => {
  try {
    const res = await apiGet('/wishlist', true);
    if (res.status === 200 && Array.isArray(res.data?.items)) {
      state.wishlist = res.data.items;
      renderWishlist(state.wishlist);
      updateSidebarCounts(state.orders, state.wishlist, state.reviews);
    }
  } catch (err) {
    console.error('Failed to refresh wishlist:', err);
  }
};

const refreshReviews = async () => {
  try {
    const res = await apiGet('/reviews/my', true);
    if (res.status === 200 && Array.isArray(res.data)) {
      state.reviews = res.data;
      renderReviews(state.reviews);
      updateSidebarCounts(state.orders, state.wishlist, state.reviews);
    }
  } catch (err) {
    console.error('Failed to refresh reviews:', err);
  }
};

const refreshAddresses = async () => {
  try {
    const res = await apiGet('/addresses', true);
    if (res.status === 200 && Array.isArray(res.data)) {
      state.addresses = res.data;
      renderAddresses(state.addresses);
    }
  } catch (err) {
    console.error('Failed to refresh addresses:', err);
  }
};

const renderEmailVerification = (profile) => {
  const verificationStatus = document.getElementById('email-verification-status');
  const verificationCopy = document.getElementById('email-verification-copy');
  const verificationButton = document.getElementById('send-verification-email');

  if (!verificationStatus || !verificationCopy || !verificationButton) return;
  if (profile.isVerified) {
    verificationStatus.textContent = t('email_verified', 'Email verified');
    verificationCopy.textContent = t('email_verified_copy', 'Your account email is verified and ready for receipts and checkout.');
    verificationButton.disabled = true;
    verificationButton.textContent = t('email_verified_button', 'VERIFIED');

    verificationButton.style.background = 'var(--success)';
    verificationButton.style.color = 'var(--text)';
  } else {
    verificationStatus.textContent = t('email_not_verified', 'Email not verified');
    verificationCopy.textContent = t('email_not_verified_copy', 'Verify your email to keep your account secure. Check your inbox for the verification link.');
    verificationButton.disabled = false;
    verificationButton.textContent = t('send_email_button', 'SEND EMAIL');

  }
};

const renderOrders = (orders) => {
  const ordersList = document.getElementById('orders-list');
  const orderSearch = document.getElementById('order-search');
  const orderStatusFilter = document.getElementById('order-status-filter');

  if (!ordersList) return;

  const search = (orderSearch?.value || '').toLowerCase();
  const statusFilter = orderStatusFilter?.value || '';

  let filtered = orders;
  if (statusFilter) {
    filtered = filtered.filter((o) => {
      const s = String(o.status || '').toUpperCase();
      return s === statusFilter;
    });
  }
  if (search) {
    filtered = filtered.filter(
      (o) => {
        const orderNum = String(o.orderNumber || '').toLowerCase();
        const email = String(o.email || '').toLowerCase();
        const name = String(o.name || '').toLowerCase();
        return orderNum.includes(search) || email.includes(search) || name.includes(search);
      }
    );
  }

  if (!filtered.length) {
    ordersList.innerHTML = `<div class="empty-state"><i data-lucide="receipt"></i><span>${t('no_orders', 'NO ORDERS FOUND')}</span></div>`;
    syncLucide();
  renderI18n();
    return;
  }

  ordersList.innerHTML = filtered.map((order) => {
    const status = order.paymentStatus || order.status;
    const itemCount = Array.isArray(order.items) ? order.items.length : 0;
    const images = (order.items || [])
      .slice(0, 4)
      .map((item) => `<img loading="lazy" src="${escapeHtml(item.game?.coverImage || '')}" class="w-10 h-14 object-cover rounded" alt="">`)
      .join('');

    return `
      <article class="card p-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-3">
              <span class="font-display text-lg font-bold" style="color:var(--text)">#${escapeHtml(order.orderNumber || order.id)}</span>
              <span class="status-chip ${statusBadgeClass(status)}">${escapeHtml(status)}</span>
            </div>
            <p class="mt-2 font-mono text-xs" style="color:var(--muted)">${escapeHtml(formatDate(order.createdAt))} &bull; ${itemCount} item${itemCount !== 1 ? 's' : ''}</p>
            ${order.couponCode && Number(order.discountAmount || 0) > 0
              ? `<p class="text-sm mt-1" style="color:var(--accent)">${escapeHtml(order.couponCode)}: -${escapeHtml(formatMoney(order.discountAmount))}</p>`
              : ''}
          </div>
          <div class="text-left lg:text-right">
            <div class="font-display text-2xl font-black" style="color:var(--text)">${escapeHtml(formatMoney(order.totalAmount))}</div>
            <div class="space-y-2">
              <a href="order-detail.html?order=${encodeURIComponent(order.id)}" class="btn-cyber mt-3 inline-flex w-full">${t('profile_order_view', 'View Details')}</a>
              ${(order.paymentStatus || '').toUpperCase() !== 'PAID' ? `
                <button data-resume-order="${escapeHtml(order.id || '')}" class="btn-cyber bg-cyan mt-3 inline-flex w-full" data-i18n="btn_resume_payment">
                  RESUME PAYMENT
                </button>` : ''}
            </div>
          </div>
        </div>
        <div class="flex gap-2 mt-4 overflow-x-auto pb-1">${images}</div>
      </article>
    `;
  }).join('');
  syncLucide();
  renderI18n();

  // Add event listeners for resume payment buttons
  document.querySelectorAll('[data-resume-order]').forEach(button => {
    button.addEventListener('click', (e) => {
      const orderId = e.currentTarget.getAttribute('data-resume-order');
      resumePayment(orderId);
    });
  });
};

const renderLibrary = (orders) => {
  const libraryGrid = document.getElementById('library-grid');
  const libraryEmpty = document.getElementById('library-empty');

  if (!libraryGrid) return 0;

  const seen = new Set();
  const games = [];
  orders.forEach((order) => {
    const ps = String(order.paymentStatus || '').toUpperCase();
    const s = String(order.status || '').toUpperCase();
    if (ps !== 'PAID' || s === 'CANCELLED' || s === 'REFUNDED') return;
    (order.items || []).forEach((item) => {
      if (item.game && !seen.has(item.game.id)) {
        seen.add(item.game.id);
        games.push(item.game);
      }
    });
  });

  if (!games.length) {
    libraryGrid.innerHTML = '';
    libraryEmpty?.classList.remove('hidden');
    return 0;
  }

  libraryEmpty?.classList.add('hidden');
  libraryGrid.innerHTML = games.map((game) => `
    <div class="game-card">
      <div class="relative aspect-[16/10] overflow-hidden">
        <img loading="lazy" src="${escapeHtml(game.coverImage || '')}" alt="${escapeHtml(game.title)}" class="h-full w-full object-cover">
        <div class="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2" style="background:rgb(0,0,0,0.7)">
          <a href="game-detail.html?slug=${encodeURIComponent(game.slug || '')}" class="btn-cyber text-xs">${t('btn_view_game', 'VIEW GAME')}</a>
        </div>
        <div class="absolute top-2 right-2">
          <span class="pill pill-green text-xs">${t('label_owned', 'OWNED')}</span>
        </div>
      </div>
      <div class="p-4">
        <p class="font-mono text-xs uppercase tracking-[0.15em] mb-1" style="color:var(--accent)">${escapeHtml(game.category?.name || 'Game')}</p>
        <h3 class="font-display text-sm font-bold leading-tight mb-1" style="color:var(--text)">${escapeHtml(game.title || '')}</h3>
        <p class="font-mono text-xs" style="color:var(--muted)">${escapeHtml(game.platform || 'PC')}</p>
      </div>
    </div>
  `).join('');
  return games.length;
};

const renderWishlist = (items) => {
  const wishlistContent = document.getElementById('wishlist-content');
  if (!wishlistContent) return;
  if (!items.length) {
    wishlistContent.innerHTML = `<div class="empty-state col-span-2"><i data-lucide="heart"></i><span>${t('no_wishlist', 'WISHLIST EMPTY')}</span></div>`;
    syncLucide();
  renderI18n();
    return;
  }
  wishlistContent.innerHTML = items.map((item) => {
    const game = item.game || {};
    return `
      <article class="card overflow-hidden">
        <div class="flex gap-4 p-4">
          <a href="game-detail.html?slug=${encodeURIComponent(game.slug || '')}" class="shrink-0">
            <img loading="lazy" src="${escapeHtml(game.coverImage || '')}" alt="${escapeHtml(game.title)}" class="h-20 w-14 object-cover rounded-lg">
          </a>
          <div class="flex-1 min-w-0">
            <p class="font-mono text-xs uppercase tracking-[0.15em] mb-1" style="color:var(--accent)">${escapeHtml(game.category?.name || 'Game')}</p>
            <h3 class="font-display font-bold mb-1" style="color:var(--text)">${escapeHtml(game.title || '—')}</h3>
            <p class="font-mono text-xs mb-2" style="color:var(--muted)">${escapeHtml(game.platform || 'PC')}</p>
            <div class="flex items-center gap-3">
              <span class="font-display text-lg font-black" style="color:var(--accent)">${escapeHtml(formatMoney(game.price || 0))}</span>
              <button data-action="move-to-cart" data-game-id="${escapeHtml(game.id || '')}" class="btn-cyber text-xs py-1.5 px-3">${t('btn_add_to_cart', 'ADD TO CART')}</button>
              <button data-action="remove-wishlist" data-game-id="${escapeHtml(game.id || '')}" class="action-btn text-xs py-1.5 px-3" style="color:var(--muted)">${t('btn_remove', 'REMOVE')}</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
};

const renderReviews = (reviews) => {
  const reviewsContent = document.getElementById('reviews-content');
  if (!reviewsContent) return;
  if (!reviews.length) {
    reviewsContent.innerHTML = `<div class="empty-state"><i data-lucide="star"></i><span>${t('no_reviews', 'NO REVIEWS YET')}</span></div>`;
    syncLucide();
  renderI18n();
    return;
  }
  reviewsContent.innerHTML = reviews.map((review) => {
    const rating = Number(review.rating || 0);
    const stars = Array.from({ length: 5 }, (_, i) => `<i data-lucide="star" class="w-3.5 h-3.5" style="color:var(--warning);${i < rating ? '' : 'opacity:0.3'}"></i>`).join('');
    return `
      <article class="card p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 flex-wrap">
              <a href="game-detail.html?slug=${encodeURIComponent(review.game?.slug || '')}" class="font-display font-bold hover:opacity-80" style="color:var(--text)">${escapeHtml(review.game?.title || '—')}</a>
              <span class="pill ${review.status === 'APPROVED' ? 'pill-green' : review.status === 'REJECTED' ? 'pill-red' : 'pill-amber'}">${escapeHtml(review.status || 'PENDING')}</span>
            </div>
            <div class="flex items-center gap-1 mt-2">${stars}</div>
            ${review.title ? `<p class="font-display font-bold mt-2" style="color:var(--text)">${escapeHtml(review.title)}</p>` : ''}
            <p class="mt-1 text-sm leading-relaxed" style="color:var(--muted)">${escapeHtml(review.content || '')}</p>
            <p class="font-mono text-xs mt-3" style="color:var(--muted)">${escapeHtml(formatDate(review.updatedAt || review.createdAt))}</p>
          </div>
          <button data-action="delete-review" data-review-id="${escapeHtml(review.id || '')}" class="action-btn text-xs shrink-0" style="color:var(--danger)">DELETE</button>
        </div>
      </article>
    `;
  }).join('');
  syncLucide();
  renderI18n();
};

const renderAddresses = (addresses) => {
  const addressesList = document.getElementById('addresses-list');
  if (!addressesList) return;
  if (!addresses.length) {
    addressesList.innerHTML = `<p class="text-sm" style="color:var(--muted)">${t('profile_address_empty', 'No addresses saved yet.')}</p>`;
    return;
  }
  addressesList.innerHTML = addresses.map((addr) => `
    <div class="card-address p-4" data-address-id="${escapeHtml(addr.id || '')}">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <p class="font-display font-bold text-sm" style="color:var(--text)">${escapeHtml(addr.label || 'Address')}</p>
            ${addr.isDefault ? `<span class="pill pill-green text-xs">${t('profile_address_default_badge', 'DEFAULT')}</span>` : ''}
          </div>
          <p class="text-sm mt-1" style="color:var(--muted)">${escapeHtml(addr.street || '')}</p>
          <p class="text-sm" style="color:var(--muted)">${escapeHtml(addr.city || '')}, ${escapeHtml(addr.wilaya || '')}${addr.zipCode ? ` ${escapeHtml(addr.zipCode)}` : ''}</p>
        </div>
        <div class="flex gap-2">
          ${addr.isDefault ? '' : `<button data-action="set-default-address" data-address-id="${escapeHtml(addr.id || '')}" class="action-btn text-xs py-1.5 px-3">${t('profile_address_set_default', 'DEFAULT')}</button>`}
          <button data-action="delete-address" data-address-id="${escapeHtml(addr.id || '')}" class="action-btn text-xs py-1.5 px-3" style="color:var(--danger)">${t('btn_remove', 'DELETE')}</button>
        </div>
      </div>
    </div>
  `).join('');
};

const loadData = async () => {
  const [profileRes, ordersRes, wishlistRes, reviewsRes, addressesRes] = await Promise.allSettled([
    apiGet('/auth/profile', true),
    apiGet('/orders', true),
    apiGet('/wishlist', true),
    apiGet('/reviews/my', true),
    apiGet('/addresses', true),
  ]);

  const profile = profileRes.status === 'fulfilled' ? profileRes.value?.data : null;
  const orders = ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value?.data) ? ordersRes.value.data : [];
  const wishlist = wishlistRes.status === 'fulfilled' && Array.isArray(wishlistRes.value?.data?.items) ? wishlistRes.value.data.items : [];
  const reviews = reviewsRes.status === 'fulfilled' && Array.isArray(reviewsRes.value?.data) ? reviewsRes.value.data : [];
  const addresses = addressesRes.status === 'fulfilled' && Array.isArray(addressesRes.value?.data) ? addressesRes.value.data : [];

  if (!profile) throw new Error('Unable to load profile');

  state.profile = profile;
  state.orders = orders;
  state.wishlist = wishlist;
  state.reviews = reviews;
  state.addresses = addresses;

  updateActiveOrderBanner(orders);
  updateProfileHeader(profile);
  renderEmailVerification(profile);
  renderOrders(orders);
  const libraryCount = renderLibrary(orders);
  renderWishlist(wishlist);
  renderReviews(reviews);
  renderAddresses(addresses);
  updateSidebarCounts(orders, wishlist, reviews);
  syncLucide();
  renderI18n();
};

const saveProfile = async () => {
  const profileName = document.getElementById('profile-name');
  const profilePhone = document.getElementById('profile-phone');
  const payload = { name: profileName?.value?.trim() || '', phone: profilePhone?.value?.trim() || '' };
  const response = await apiPatch('/auth/profile', payload, true);
  state.profile = { ...state.profile, ...response?.data };
  updateProfileHeader(state.profile);
  showToast(t('toast_profile_updated', 'Profile updated'), 'success');
};

const createAddress = async () => {
  const addressForm = document.getElementById('address-form');
  if (!addressForm) return;
  const fd = new FormData(addressForm);
  await apiPost('/addresses', {
    label: String(fd.get('label') || '').trim(),
    street: String(fd.get('street') || '').trim(),
    city: String(fd.get('city') || '').trim(),
    wilaya: String(fd.get('wilaya') || '').trim(),
    zipCode: String(fd.get('zipCode') || '').trim(),
    isDefault: fd.get('isDefault') === 'on',
  }, true);
  addressForm.reset();
  await refreshAddresses();
  showToast(t('toast_address_added', 'Address added'), 'success');
};

const bindEvents = () => {
  // Profile tab navigation (delegated)
  const tabbar = document.querySelector('.profile-tab-bar');
  tabbar?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="show-section"]');
    if (!btn) return;
    const section = btn.dataset.section;
    if (section) {
      showSection(section);
      if (section === 'wallet') {
        const walletContainer = document.getElementById('wallet-tab-content');
        if (walletContainer && !walletContainer.dataset.rendered) {
          try {
            await renderWalletTab(walletContainer);
            walletContainer.dataset.rendered = '1';
          } catch (e) {
            // Leave flag unset so retry is possible on next tab click
            console.error('Failed to render wallet tab:', e);
          }
        }
      }
    }
  });

  const saveProfileButton = document.getElementById('save-profile');
  const addressForm = document.getElementById('address-form');
  const verificationButton = document.getElementById('send-verification-email');
  const wishlistContent = document.getElementById('wishlist-content');
  const reviewsContent = document.getElementById('reviews-content');
  const addressesList = document.getElementById('addresses-list');
  const orderSearch = document.getElementById('order-search');
  const orderStatusFilter = document.getElementById('order-status-filter');

  saveProfileButton?.addEventListener('click', async () => {
    try { await saveProfile(); }
    catch (e) { showToast(e.message || t('toast_profile_update_failed', 'Unable to update profile'), 'error'); }
  });

  addressForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await createAddress(); }
    catch (e) { showToast(e.message || t('toast_address_save_failed', 'Unable to save address'), 'error'); }
  });

  verificationButton?.addEventListener('click', async () => {
    try {
      await apiPost('/auth/verify-email', {}, true);
      const verificationCopy = document.getElementById('email-verification-copy');
      if (verificationCopy) verificationCopy.textContent = t('email_sent_copy', 'Verification email sent. Check your inbox.');
      verificationButton.textContent = t('email_sent_button', 'EMAIL SENT');
      showToast(t('toast_email_sent', 'Verification email sent'), 'success');
    } catch (e) { showToast(e.message || t('toast_email_send_failed', 'Unable to send'), 'error'); }
  });

  document.addEventListener('click', async (e) => {
    const link = e.target.closest('a[data-action="logout"]');
    if (!link) return;
    e.preventDefault();
    try {
      const { clearSession } = await import('../core/session.js');
      clearSession();
      window.location.href = 'index.html';
    } catch (e) { showToast(e.message || t('toast_signout_failed', 'Unable to sign out'), 'error'); }
  });

  // Wishlist actions
  wishlistContent?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    const gameId = btn?.dataset?.gameId;
    if (!btn || !gameId) return;
    try {
      if (btn.dataset.action === 'move-to-cart') {
        await apiPost('/cart', { gameId, quantity: 1 }, true);
        await apiDelete(`/wishlist/game/${encodeURIComponent(gameId)}`, true);
        await refreshCartCount();
        showToast(t('toast_added_to_cart', 'Moved to cart'), 'success');
      }
      if (btn.dataset.action === 'remove-wishlist') {
        await apiDelete(`/wishlist/game/${encodeURIComponent(gameId)}`, true);
        showToast(t('toast_removed_from_wishlist', 'Removed'), 'success');
      }
      await refreshWishlist();
    } catch (e) { showToast(e.message, 'error'); }
  });

  // Review delete
  reviewsContent?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action="delete-review"]');
    const reviewId = btn?.dataset?.reviewId;
    if (!btn || !reviewId) return;
    try {
      await apiDelete(`/reviews/${encodeURIComponent(reviewId)}`, true);
      showToast(t('toast_review_deleted', 'Review deleted'), 'success');
      await refreshReviews();
    } catch (e) { showToast(e.message, 'error'); }
  });

  // Address actions
  addressesList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    const addrId = btn?.dataset?.addressId;
    if (!btn || !addrId) return;
    try {
      if (btn.dataset.action === 'set-default-address') {
        await apiPatch(`/addresses/${encodeURIComponent(addrId)}/default`, {}, true);
        showToast(t('toast_profile_updated', 'Default updated'), 'success');
      }
      if (btn.dataset.action === 'delete-address') {
        await apiDelete(`/addresses/${encodeURIComponent(addrId)}`, true);
        showToast(t('toast_item_removed', 'Address deleted'), 'success');
      }
      await refreshAddresses();
    } catch (e) { showToast(e.message, 'error'); }
  });

  // Order search/filter
  orderSearch?.addEventListener('input', debounce(() => renderOrders(state.orders), 250));
  orderStatusFilter?.addEventListener('change', () => renderOrders(state.orders));
};

const init = async () => {
  if (!(await initShell())) return;
  const user = getUser();
  if (!user || !user.id) {
    window.location.href = buildLoginUrl('/profile.html');
    return;
  }
  renderShells();
  bindEvents();
  initProfileTabKeyboard();
  const url = new URL(window.location.href);
  const tab = url.searchParams.get('tab') || url.hash.replace('#', '');
  showSection(sections.includes(tab) ? tab : 'library');
  if (tab === 'wallet') {
    const walletContainer = document.getElementById('wallet-tab-content');
    if (walletContainer && !walletContainer.dataset.rendered) {
      try {
        await renderWalletTab(walletContainer);
        walletContainer.dataset.rendered = '1';
      } catch (e) {
        console.error('Failed to render wallet tab:', e);
        // Leave flag unset so retry is possible
      }
    }
  }
  try { await loadData(); }
  catch (e) {
    renderErrorState(async () => {
      try { await loadData(); }
      catch (e) { showToast(e.message || t('toast_profile_load_failed', 'Unable to load profile'), 'error'); }
    });
  }
};

// Function to resume payment for an order (called from order card button)
async function resumePayment(orderId) {
  if (!orderId) {
    showToast(t('err_order_id_missing', 'Order ID is missing'), 'error');
    return;
  }

  try {
    let response;
    if (isAuthenticated()) {
      response = await apiPost(`/payments/${orderId}/regenerate`, undefined, true);
    } else {
      // For guest orders, we need the guest token
      const token = getGuestOrderToken();
      if (!token) {
        showToast(t('err_sign_in_required', 'Please sign in or open your guest order link again'), 'error');
        return;
      }
      response = await guestOrderClient.post(`/payments/guest/${orderId}/regenerate`);
    }

    if (response && response.data && response.data.checkoutUrl) {
      // Redirect to the new checkout URL
      window.location.href = response.data.checkoutUrl;
    } else {
      showToast(t('toast_checkout_url_missing', 'Checkout URL missing. Please contact support.'), 'error');
    }
  } catch (error) {
    // Handle known error codes from the API
    if (error.data && error.data.error === 'SESSION_NOT_STALE') {
      showToast(t('toast_session_not_stale', 'Checkout session is still active.'), 'info');
    } else if (error.data && error.data.error === 'REGENERATION_LIMIT_EXCEEDED') {
      showToast(t('toast_regeneration_capped', 'Maximum checkout regenerations exceeded. Please contact support.'), 'error');
    } else if (error.data && error.data.error === 'ORDER_NOT_PAYABLE') {
      showToast(t('toast_order_not_payable', 'This order can no longer accept payments.'), 'error');
    } else {
      showToast(error.message || t('toast_regeneration_failed', 'Failed to regenerate checkout.'), 'error');
    }
  }
}

init();
