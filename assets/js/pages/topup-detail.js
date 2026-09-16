import { apiGet } from '../core/http.js';
import { formatMoney, escapeHtml } from '../core/format.js';
import { addToCartAction } from '../core/cart-helpers.js';
import { renderNotFoundState, initStickyBar } from '../core/ui-helpers.js';
import { initShell, syncLucide, renderI18n } from '../core/shell.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';


// DOM refs
const breadcrumbTitle = document.getElementById('breadcrumb-title');
const tuImage = document.getElementById('tu-image');
const tuTitle = document.getElementById('tu-title');
const tuRating = document.getElementById('tu-rating');
const tuCategory = document.getElementById('tu-category');
const tuAmounts = document.getElementById('tu-amounts');
const tuDescription = document.getElementById('tu-description');
const tuPlayerId = document.getElementById('tu-player-id');
const tuPlayerName = document.getElementById('tu-player-name');
const tuServer = document.getElementById('tu-server');

// Stepper buttons
const btnStep1Next = document.getElementById('btn-step1-next');
const btnStep2Back = document.getElementById('btn-step2-back');
const btnStep2Next = document.getElementById('btn-step2-next');
const btnStep3Back = document.getElementById('btn-step3-back');
const btnAddToCart = document.getElementById('btn-add-to-cart');

// Confirm fields
const confirmProduct = document.getElementById('confirm-product');
const confirmAmount = document.getElementById('confirm-amount');
const confirmPlayerId = document.getElementById('confirm-player-id');
const confirmPlayerName = document.getElementById('confirm-player-name');
const confirmServer = document.getElementById('confirm-server');
const confirmTotal = document.getElementById('confirm-total');

let currentProduct = null;
let selectedVariant = null;
let currentStep = 1;

const getSlug = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug') || '';
};

// ─── Skeleton Loading ────────────────────────────────────────
const showSkeleton = () => {
  if (tuImage) {
    tuImage.src = '';
    tuImage.alt = '';
    tuImage.classList.add('skeleton-surface');
  }
  if (tuTitle) { tuTitle.innerHTML = '<span class="skeleton-line" style="width:60%;height:1.1rem;display:inline-block"></span>'; }
  if (tuRating) { tuRating.innerHTML = '<span class="skeleton-line" style="width:35%;height:0.7rem;display:inline-block"></span>'; }
  if (tuAmounts) {
    tuAmounts.innerHTML = Array.from({ length: 8 })
      .map(() => '<div class="skeleton-surface" style="height:70px;border-radius:10px"></div>')
      .join('');
  }
  if (tuDescription) { tuDescription.innerHTML = '<span class="skeleton-line" style="width:100%;height:0.75rem;margin-bottom:0.5rem;display:block"></span><span class="skeleton-line" style="width:80%;height:0.75rem;display:block"></span>'; }
};

const hideSkeleton = () => {
  if (tuImage) {
    tuImage.classList.remove('skeleton-surface');
  }
};

// ─── Stepper ────────────────────────────────────────────────
const goToStep = (step) => {
  currentStep = step;

  // Update panels
  document.querySelectorAll('.step-panel').forEach((p) => p.classList.remove('active'));
  const panel = document.getElementById(`step-${step}`);
  if (panel) panel.classList.add('active');

  // Update stepper dots + aria
  document.querySelectorAll('.stepper-step').forEach((s) => {
    const sNum = Number(s.dataset.step);
    s.classList.remove('active', 'done');
    s.setAttribute('aria-current', sNum === step ? 'step' : 'false');
    if (sNum === step) s.classList.add('active');
    else if (sNum < step) s.classList.add('done');
  });

  // Update stepper lines
  document.querySelectorAll('.stepper-line').forEach((l) => {
    const lNum = Number(l.dataset.line);
    l.classList.toggle('done', lNum < step);
  });

  // Populate confirm on step 3
  if (step === 3) {
    populateConfirm();
  }

  syncLucide();
  renderI18n();
};

const showNotFoundState = (message = t('topup_not_found_message', 'This top-up is no longer available or the link is invalid.')) => {
  renderNotFoundState({
    title: t('topup_not_found_title', 'Top-up not found'),
    message,
    browseFilter: '?type=TOP_UP',
    browseLabel: t('topup_browse_label', 'Browse top-ups'),
    browseIcon: 'zap',
  });
};

// ─── Load product ──────────────────────────────────────────
const loadProduct = async () => {
  const slug = getSlug();
  if (!slug) {
    showNotFoundState(t('topup_no_slug', 'No top-up was specified.'));
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
  } catch (err) {
    if (err?.status === 404 || /not found/i.test(err?.message || '')) {
      showNotFoundState();
    } else {
      showToast(t('toast_product_load_failed', 'Failed to load product'), 'error');
    }
  }
};

const renderProduct = (game) => {
  // Breadcrumb
  if (breadcrumbTitle) breadcrumbTitle.textContent = game.title || t('topup_default_title', 'Top-Up');

  // Image
  if (tuImage) {
    tuImage.src = game.coverImage || '';
    tuImage.alt = game.title || t('topup_default_title', 'Top-Up');
  }

  // Title
  if (tuTitle) tuTitle.textContent = game.title || t('topup_default_title', 'Top-Up');

  // Rating
  if (tuRating) {
    tuRating.textContent = `${Number(game.rating || 0).toFixed(1)} (${Number(game.reviewCount || 0)} reviews)`;
  }

  // Category
  if (tuCategory) tuCategory.textContent = (game.category?.name || t('badge_topup', 'TOP-UP')).toUpperCase();

  // Description
  if (tuDescription) {
    tuDescription.textContent = game.description || game.shortDesc || t('topup_default_description', 'Instant in-game currency top-up with fast delivery.');
  }

  // Amounts (variants or base price)
  const variants = Array.isArray(game.variants) ? game.variants : [];
  if (variants.length > 0 && tuAmounts) {
    const sorted = [...variants].sort((a, b) => Number(a.price) - Number(b.price));
    tuAmounts.innerHTML = sorted.map((v, i) => {
      const price = Number(v.price || 0);
      const origPrice = Number(v.originalPrice || price);
      const hasDiscount = origPrice > price;
      return `
        <button class="topup-amount ${i === 0 ? 'active' : ''}" aria-pressed="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}" data-variant-id="${escapeHtml(v.id)}" data-variant-price="${price}" data-variant-original="${origPrice}" data-variant-name="${escapeHtml(v.name)}">
          <div class="topup-amount__name">${escapeHtml(v.name)}</div>
          <div class="topup-amount__price">${formatMoney(price)}${hasDiscount ? ` <span class="line-through" style="color:var(--muted)">${formatMoney(origPrice)}</span>` : ''}</div>
        </button>
      `;
    }).join('');

    selectedVariant = sorted[0];
    if (btnStep1Next) btnStep1Next.disabled = false;

    // Bind amount clicks
    tuAmounts.querySelectorAll('.topup-amount').forEach((btn) => {
      btn.addEventListener('click', () => {
        tuAmounts.querySelectorAll('.topup-amount').forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
          b.setAttribute('tabindex', '-1');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('tabindex', '0');
        const vId = btn.dataset.variantId;
        selectedVariant = sorted.find((v) => v.id === vId) || sorted[0];
        if (btnStep1Next) btnStep1Next.disabled = false;
      });
    });

    // Keyboard navigation: roving tabindex with arrow keys
    tuAmounts.addEventListener('keydown', (e) => {
      const btns = Array.from(tuAmounts.querySelectorAll('.topup-amount'));
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
    // No variants — single amount
    if (tuAmounts) {
      const price = Number(game.price || 0);
      const origPrice = Number(game.originalPrice || price);
      const hasDiscount = origPrice > price;
      const stdName = escapeHtml(t('topup_standard_name', 'Standard Top-Up'));
      tuAmounts.innerHTML = `
        <button class="topup-amount active" data-variant-id="" data-variant-price="${price}" data-variant-original="${origPrice}" data-variant-name="Standard">
          <div class="topup-amount__name">${stdName}</div>
          <div class="topup-amount__price">${formatMoney(price)}${hasDiscount ? ` <span class="line-through" style="color:var(--muted)">${formatMoney(origPrice)}</span>` : ''}</div>
        </button>
      `;
      selectedVariant = null;
      if (btnStep1Next) btnStep1Next.disabled = false;
    }
  }

  // Page title
  document.title = `${game.title} | SIZO Digital Store`;

  syncLucide();
  renderI18n();
};

// ─── Confirm ────────────────────────────────────────────────
const populateConfirm = () => {
  if (!currentProduct) return;

  const price = selectedVariant ? Number(selectedVariant.price) : Number(currentProduct.price || 0);

  if (confirmProduct) confirmProduct.textContent = currentProduct.title;
  if (confirmAmount) confirmAmount.textContent = selectedVariant?.name || t('topup_standard_name', 'Standard Top-Up');
  if (confirmPlayerId) confirmPlayerId.textContent = tuPlayerId?.value || '--';
  if (confirmPlayerName) confirmPlayerName.textContent = tuPlayerName?.value || '--';
  if (confirmServer) confirmServer.textContent = tuServer?.value || '--';
  if (confirmTotal) confirmTotal.textContent = formatMoney(price);
};

// ─── Step navigation ────────────────────────────────────────
const handleStep1Next = () => {
  if (!selectedVariant && !currentProduct) return;
  goToStep(2);
};

const handleStep2Next = () => {
  const playerId = tuPlayerId?.value?.trim();
  const errorEl = document.getElementById('tu-player-id-error');
  if (!playerId) {
    if (tuPlayerId) {
      tuPlayerId.setAttribute('aria-invalid', 'true');
      tuPlayerId.style.borderColor = 'var(--error)';
    }
    if (errorEl) {
      errorEl.textContent = t('player_id_required_inline', 'Player ID is required');
      errorEl.classList.remove('hidden');
    }
    tuPlayerId?.focus();
    return;
  }
  // Clear error state
  if (tuPlayerId) {
    tuPlayerId.removeAttribute('aria-invalid');
    tuPlayerId.style.borderColor = '';
  }
  if (errorEl) errorEl.classList.add('hidden');
  goToStep(3);
};

const handleStep2Back = () => goToStep(1);
const handleStep3Back = () => goToStep(2);

// ─── Add to cart ────────────────────────────────────────────
const handleAddToCart = async () => {
  if (!currentProduct) return;
  const variantId = selectedVariant?.id || null;
  const playerId = tuPlayerId?.value?.trim() || '';
  const playerName = tuPlayerName?.value?.trim() || '';
  const server = tuServer?.value?.trim() || '';
  if (!playerId) { showToast(t('toast_player_id_required', 'Player ID is required'), 'error'); goToStep(2); return; }
  await addToCartAction({
    gameId: currentProduct.id,
    variantId,
    quantity: 1,
    metadata: { playerId, playerName, server },
    game: { ...currentProduct, productType: 'TOP_UP' },
    variant: selectedVariant,
  });
};

// ─── Bind events ────────────────────────────────────────────
if (btnStep1Next) btnStep1Next.addEventListener('click', handleStep1Next);
if (btnStep2Back) btnStep2Back.addEventListener('click', handleStep2Back);
if (btnStep2Next) btnStep2Next.addEventListener('click', handleStep2Next);
if (btnStep3Back) btnStep3Back.addEventListener('click', handleStep3Back);
if (btnAddToCart) btnAddToCart.addEventListener('click', handleAddToCart);

// Enable step2 next when player ID is filled + clear error on input
if (tuPlayerId) {
  tuPlayerId.addEventListener('input', () => {
    if (btnStep2Next) btnStep2Next.disabled = !tuPlayerId.value.trim();
    // Clear error state on input
    const errorEl = document.getElementById('tu-player-id-error');
    if (tuPlayerId.value.trim()) {
      tuPlayerId.removeAttribute('aria-invalid');
      tuPlayerId.style.borderColor = '';
      if (errorEl) errorEl.classList.add('hidden');
    }
  });
}

// ─── Mobile Sticky Bar ──────────────────────────────────────
const initMobileStickyBar = () => {
  const stickyPrice = document.getElementById('sticky-price');
  const stickyAddCart = document.getElementById('sticky-add-cart');

  const syncStickyPrice = () => {
    const price = selectedVariant ? Number(selectedVariant.price) : Number(currentProduct?.price || 0);
    if (stickyPrice) stickyPrice.textContent = formatMoney(price);
  };

  if (stickyAddCart) { stickyAddCart.addEventListener('click', () => handleAddToCart()); }

  const observer = initStickyBar({ observeButton: btnAddToCart, onPriceSync: syncStickyPrice });

  // MutationObserver on confirmTotal for re-sync
  const priceObserver = new MutationObserver(() => {
    if (stickyPrice && confirmTotal) stickyPrice.textContent = confirmTotal.textContent;
  });
  if (confirmTotal) priceObserver.observe(confirmTotal, { childList: true });

  return { observer, priceObserver };
};

// Init
await initShell();
initMobileStickyBar();
loadProduct();
