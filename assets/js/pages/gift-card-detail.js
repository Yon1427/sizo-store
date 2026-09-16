import { apiGet } from '../core/http.js';
import { formatMoney, escapeHtml } from '../core/format.js';
import { addToCartAction } from '../core/cart-helpers.js';
import { addToWishlist, removeFromWishlist } from '../core/wishlist-helpers.js';
import { renderNotFoundState, initStickyBar } from '../core/ui-helpers.js';
import { initShell, syncLucide, renderI18n } from '../core/shell.js';
import { isAuthenticated } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';


// DOM refs
const breadcrumbTitle = document.getElementById('breadcrumb-title');
const gcImage = document.getElementById('gc-image');
const gcTitle = document.getElementById('gc-title');
const gcRating = document.getElementById('gc-rating');
const gcCategoryBadge = document.getElementById('gc-category-badge');
const gcDenominationGrid = document.getElementById('gc-denomination-grid');
const gcPrice = document.getElementById('gc-price');
const gcOriginalPrice = document.getElementById('gc-original-price');
const gcSavings = document.getElementById('gc-savings');
const gcSavingsAmount = document.getElementById('gc-savings-amount');
const gcDescription = document.getElementById('gc-description');
const gcRegion = document.getElementById('gc-region');
const gcPlatform = document.getElementById('gc-platform');
const gcAddToCart = document.getElementById('gc-add-to-cart');
const gcWishlist = document.getElementById('gc-wishlist');

let currentProduct = null;
let selectedVariant = null;
let isInWishlist = false;

const getSlug = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug') || '';
};

// ─── Skeleton Loading ────────────────────────────────────────
const showSkeleton = () => {
  if (gcImage) {
    gcImage.src = '';
    gcImage.alt = '';
    gcImage.classList.add('skeleton-surface');
    gcImage.style.minHeight = '240px';
  }
  if (gcTitle) { gcTitle.innerHTML = '<span class="skeleton-line" style="width:70%;height:1.25rem"></span>'; }
  if (gcRating) { gcRating.innerHTML = '<span class="skeleton-line" style="width:40%;height:0.75rem;display:inline-block"></span>'; }
  if (gcDescription) { gcDescription.innerHTML = '<span class="skeleton-line" style="width:100%;height:0.75rem;margin-bottom:0.5rem;display:block"></span><span class="skeleton-line" style="width:85%;height:0.75rem;display:block"></span>'; }
  if (gcDenominationGrid) {
    gcDenominationGrid.innerHTML = Array.from({ length: 6 })
      .map(() => '<div class="skeleton-surface" style="height:60px;border-radius:10px"></div>')
      .join('');
  }
  if (gcPrice) { gcPrice.innerHTML = '<span class="skeleton-line" style="width:35%;height:1.5rem;display:inline-block"></span>'; }
};

const hideSkeleton = () => {
  if (gcImage) {
    gcImage.classList.remove('skeleton-surface');
    gcImage.style.minHeight = '';
  }
};

const showNotFoundState = (message = 'This gift card is no longer available or the link is invalid.') => {
  renderNotFoundState({
    title: 'Gift card not found',
    message,
    browseFilter: '?type=GIFT_CARD',
    browseLabel: 'Browse gift cards',
    browseIcon: 'gift',
  });
};

const loadProduct = async () => {
  const slug = getSlug();
  if (!slug) {
    showNotFoundState('No gift card was specified.');
    return;
  }

  showSkeleton();

  try {
    const response = await apiGet(`/games/${encodeURIComponent(slug)}`);
    const game = response?.data;
    if (!game) {
      showNotFoundState();
      return;
    }

    currentProduct = game;
    hideSkeleton();
    renderProduct(game);
    loadWishlistState();
  } catch (err) {
    if (err?.status === 404 || /not found/i.test(err?.message || '')) {
      showNotFoundState();
    } else {
      showToast('Failed to load product', 'error');
    }
  }
};

const renderProduct = (game) => {
  // Breadcrumb
  if (breadcrumbTitle) breadcrumbTitle.textContent = game.title || 'Gift Card';

  // Image
  if (gcImage) {
    gcImage.src = game.coverImage || '';
    gcImage.alt = game.title || 'Gift Card';
  }

  // Title
  if (gcTitle) gcTitle.textContent = game.title || 'Gift Card';

  // Rating
  if (gcRating) {
    gcRating.textContent = `${Number(game.rating || 0).toFixed(1)} (${Number(game.reviewCount || 0)} reviews)`;
  }

  // Category badge
  if (gcCategoryBadge) {
    gcCategoryBadge.textContent = (game.category?.name || 'GIFT CARD').toUpperCase();
  }

  // Description
  if (gcDescription) {
    gcDescription.textContent = game.description || game.shortDesc || 'Digital gift card with instant email delivery.';
  }

  // Region & Platform
  if (gcRegion) gcRegion.textContent = game.region || 'GLOBAL';
  if (gcPlatform) gcPlatform.textContent = game.platform || 'Multi-platform';

  // Denominations (variants)
  const variants = Array.isArray(game.variants) ? game.variants : [];
  if (variants.length > 0 && gcDenominationGrid) {
    gcDenominationGrid.innerHTML = variants
      .sort((a, b) => Number(a.price) - Number(b.price))
      .map((v, i) => {
        const price = Number(v.price || 0);
        const origPrice = Number(v.originalPrice || price);
        const hasDiscount = origPrice > price;
        return `
          <button class="gc-denomination ${i === 0 ? 'active' : ''}" aria-pressed="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}" data-variant-id="${escapeHtml(v.id)}" data-variant-price="${price}" data-variant-original="${origPrice}" data-variant-name="${escapeHtml(v.name)}">
            <div class="text-center">
              <div>${escapeHtml(v.name)}</div>
              <div class="gc-price">${formatMoney(price)}${hasDiscount ? ` <span class="line-through" style="color:var(--muted)">${formatMoney(origPrice)}</span>` : ''}</div>
            </div>
          </button>
        `;
      }).join('');

    // Select first variant
    selectedVariant = variants.sort((a, b) => Number(a.price) - Number(b.price))[0];
    updatePriceDisplay(selectedVariant);

    // Bind denomination clicks
    gcDenominationGrid.querySelectorAll('.gc-denomination').forEach((btn) => {
      btn.addEventListener('click', () => {
        gcDenominationGrid.querySelectorAll('.gc-denomination').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
          b.setAttribute('tabindex', '-1');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('tabindex', '0');
        const vId = btn.dataset.variantId;
        selectedVariant = variants.find((v) => v.id === vId) || variants[0];
        updatePriceDisplay(selectedVariant);
      });
    });

    // Keyboard navigation: roving tabindex with arrow keys
    gcDenominationGrid.addEventListener('keydown', (e) => {
      const btns = Array.from(gcDenominationGrid.querySelectorAll('.gc-denomination'));
      if (!btns.length) return;
      const idx = btns.indexOf(document.activeElement);
      if (idx === -1) return;

      let nextIdx = idx;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextIdx = (idx + 1) % btns.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        nextIdx = (idx - 1 + btns.length) % btns.length;
      } else {
        return;
      }

      btns[idx].setAttribute('tabindex', '-1');
      btns[nextIdx].setAttribute('tabindex', '0');
      btns[nextIdx].focus();
      btns[nextIdx].click();
    });
  } else {
    // No variants — show base price
    if (gcDenominationGrid) {
      gcDenominationGrid.innerHTML = '';
    }
    selectedVariant = null;
    updatePriceDisplayFromGame(game);
  }

  // Page title
  document.title = `${game.title} | SIZO Digital Store`;

  syncLucide();
  renderI18n();
};

const updatePriceDisplay = (variant) => {
  if (!variant) return;
  const price = Number(variant.price || 0);
  const origPrice = Number(variant.originalPrice || price);
  const hasDiscount = origPrice > price;
  const savings = hasDiscount ? origPrice - price : 0;

  if (gcPrice) gcPrice.textContent = formatMoney(price);
  if (gcOriginalPrice) {
    gcOriginalPrice.textContent = hasDiscount ? formatMoney(origPrice) : '';
    gcOriginalPrice.style.display = hasDiscount ? '' : 'none';
  }
  if (gcSavings) {
    gcSavings.classList.toggle('hidden', !hasDiscount);
    if (gcSavingsAmount) gcSavingsAmount.textContent = formatMoney(savings);
  }
};

const updatePriceDisplayFromGame = (game) => {
  const price = Number(game.price || 0);
  const origPrice = Number(game.originalPrice || price);
  const hasDiscount = origPrice > price;
  const savings = hasDiscount ? origPrice - price : 0;

  if (gcPrice) gcPrice.textContent = formatMoney(price);
  if (gcOriginalPrice) {
    gcOriginalPrice.textContent = hasDiscount ? formatMoney(origPrice) : '';
    gcOriginalPrice.style.display = hasDiscount ? '' : 'none';
  }
  if (gcSavings) {
    gcSavings.classList.toggle('hidden', !hasDiscount);
    if (gcSavingsAmount) gcSavingsAmount.textContent = formatMoney(savings);
  }
};

// Add to cart
const handleAddToCart = async () => {
  if (!currentProduct) return;
  await addToCartAction({
    gameId: currentProduct.id,
    variantId: selectedVariant?.id || null,
    game: currentProduct,
    variant: selectedVariant,
  });
};

// Wishlist
const loadWishlistState = async () => {
  if (!currentProduct || !isAuthenticated()) { isInWishlist = false; renderWishlistButton(); return; }
  try {
    const response = await apiGet(`/wishlist/check/${encodeURIComponent(currentProduct.id)}`, true);
    isInWishlist = Boolean(response?.data?.isInWishlist);
  } catch {
    isInWishlist = false;
  }
  renderWishlistButton();
};

const renderWishlistButton = () => {
  if (!gcWishlist) return;
  gcWishlist.textContent = isInWishlist ? 'IN WISHLIST' : 'SAVE TO WISHLIST';
  gcWishlist.classList.toggle('bg-success', isInWishlist);
  gcWishlist.classList.toggle('text-void', isInWishlist);
  gcWishlist.classList.toggle('border-success', isInWishlist);
  gcWishlist.setAttribute('aria-pressed', isInWishlist ? 'true' : 'false');
  gcWishlist.setAttribute('aria-label', isInWishlist ? t('aria_remove_wishlist', 'Remove from wishlist') : t('aria_add_wishlist', 'Add to wishlist'));
};

const handleWishlist = async () => {
  if (!currentProduct) return;
  if (!isAuthenticated()) { showToast('Sign in to save to wishlist', 'info'); return; }
  gcWishlist.disabled = true;
  gcWishlist.textContent = isInWishlist ? 'REMOVING...' : 'SAVING...';
  try {
    if (isInWishlist) {
      const ok = await removeFromWishlist(currentProduct.id);
      if (ok) isInWishlist = false;
    } else {
      const ok = await addToWishlist(currentProduct.id);
      if (ok) isInWishlist = true;
    }
  } catch {
    // Toast already shown by helpers
  } finally {
    gcWishlist.disabled = false;
    renderWishlistButton();
  }
};

// Bind events
if (gcAddToCart) gcAddToCart.addEventListener('click', handleAddToCart);
if (gcWishlist) gcWishlist.addEventListener('click', handleWishlist);

// ─── Mobile Sticky Bar ──────────────────────────────────────
const initMobileStickyBar = () => {
  const stickyPrice = document.getElementById('sticky-price');
  const stickyOriginal = document.getElementById('sticky-original');
  const stickyAddCart = document.getElementById('sticky-add-cart');

  const syncStickyPrice = () => {
    const price = selectedVariant ? Number(selectedVariant.price) : Number(currentProduct?.price || 0);
    const origPrice = selectedVariant ? Number(selectedVariant.originalPrice || price) : Number(currentProduct?.originalPrice || price);
    if (stickyPrice) stickyPrice.textContent = formatMoney(price);
    if (stickyOriginal) {
      if (origPrice > price) { stickyOriginal.textContent = formatMoney(origPrice); stickyOriginal.classList.remove('hidden'); }
      else { stickyOriginal.classList.add('hidden'); }
    }
  };

  if (stickyAddCart) { stickyAddCart.addEventListener('click', () => handleAddToCart()); }

  const observer = initStickyBar({ observeButton: gcAddToCart, onPriceSync: syncStickyPrice });

  // MutationObserver on price elements for re-sync
  const priceObserver = new MutationObserver(() => syncStickyPrice());
  if (gcPrice) priceObserver.observe(gcPrice, { childList: true });
  if (gcOriginalPrice) priceObserver.observe(gcOriginalPrice, { childList: true });

  return { observer, priceObserver };
};

// Init
await initShell();
initMobileStickyBar();

loadProduct();
