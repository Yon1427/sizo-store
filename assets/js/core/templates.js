/**
 * SIZO Shared Templates — Reusable game card and badge rendering.
 */
import { escapeHtml, formatMoney } from './format.js';
import { t } from './i18n.js';

// ─── Badge helpers ───────────────────────────────────────────────────

export const discountBadge = (game) => {
  if (game.discountPercent && game.discountPercent > 0) {
    return `<span class="discount-badge">-${game.discountPercent}%</span>`;
  }

  if (game.isNew) {
    return '<span class="discount-badge badge-new">NEW</span>';
  }

  return '';
};

export const productTypeBadge = (game) => {
  const type = game.productType || 'GAME_KEY';
  if (type === 'GIFT_CARD') {
    return `<span class="product-type-badge product-type-badge--gift-card">${t('product_type_gift_card', 'GIFT CARD')}</span>`;
  }
  if (type === 'TOP_UP') {
    return `<span class="product-type-badge product-type-badge--top-up">${t('product_type_top_up', 'TOP-UP')}</span>`;
  }
  return '';
};

export const flashSaleBadge = (game) => {
  if (game.flashSale?.isLive) {
    return '<span class="flash-badge"><i data-lucide="zap" class="w-3 h-3"></i> FLASH</span>';
  }
  return '';
};

// ─── Price display helpers ───────────────────────────────────────────

export const getDisplayPrice = (game, variant = null) => {
  if (game.flashSale?.isLive && !variant) {
    return Number(game.flashSale.flashPrice);
  }
  return Number(variant?.price ?? game.price ?? 0);
};

export const getDisplayOriginalPrice = (game, variant = null) => {
  if (game.flashSale?.isLive && !variant) {
    return Number(game.price);
  }
  return Number(variant?.originalPrice ?? game.originalPrice ?? getDisplayPrice(game, variant));
};

const getDetailPage = (game) => {
  const type = game.productType || 'GAME_KEY';
  if (type === 'GIFT_CARD') return 'gift-card-detail.html';
  if (type === 'TOP_UP') return 'topup-detail.html';
  return 'game-detail.html';
};

// ─── Card templates ──────────────────────────────────────────────────

export const gameCardFeatured = (game, options = {}) => {
  const price = Number(game.price || 0);
  const original = Number(game.originalPrice || 0);
  const hasFlash = game.flashSale?.isLive;
  const displayPrice = getDisplayPrice(game);
  const displayOriginalPrice = getDisplayOriginalPrice(game);
  const hasDiscount = displayOriginalPrice > displayPrice;
  const savings = hasDiscount ? displayOriginalPrice - displayPrice : 0;
  const hasVariants = Boolean(game.hasVariants);
  const rating = Number(game.rating || 0).toFixed(1);

  return `
    <article class="game-card game-card--holo group reveal">
      <div class="card-image">
        <a href="${getDetailPage(game)}?slug=${encodeURIComponent(game.slug)}">
          <img src="${escapeHtml(game.coverImage)}" alt="${escapeHtml(game.title)}" loading="lazy">
        </a>
        <div class="absolute top-3 left-3 z-10 flex flex-wrap gap-1">${hasFlash ? flashSaleBadge(game) : discountBadge(game)}</div>
        <div class="card-hover-action">
          <button data-action="add-to-cart" data-game-id="${game.id}" class="w-full btn-cyber bg-cyan text-void">
            <i data-lucide="shopping-cart" class="w-4 h-4"></i> ${hasVariants ? t('btn_choose_options', 'CHOOSE OPTIONS') : t('btn_add_to_cart', 'ADD TO CART')}
          </button>
          ${!hasVariants ? `
            <button data-action="buy-now" data-game-id="${game.id}" class="w-full btn-cyber bg-coral text-void">
              <i data-lucide="zap" class="w-4 h-4"></i> ${t('btn_buy_now', 'BUY NOW')}
            </button>
          ` : ''}
        </div>
      </div>
      <div class="game-card__body">
        <div class="game-card__meta">
          ${productTypeBadge(game)}
          <span class="game-card__chip game-card__chip--accent">${escapeHtml(game.category?.name || 'GAME').toUpperCase()}</span>
          ${savings > 0 ? `<span class="price-save">${t('save_prefix', 'Save')} ${formatMoney(savings)}</span>` : ''}
        </div>
        <a href="${getDetailPage(game)}?slug=${encodeURIComponent(game.slug)}">
          <h3 class="game-card__title">${escapeHtml(game.title)}</h3>
        </a>
        <div class="game-card__actions">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-display text-lg ${hasFlash ? 'flash-price' : hasDiscount ? 'text-success' : 'text-ivory'}">${hasVariants ? `${t('from_price', 'From')} ${formatMoney(displayPrice)}` : formatMoney(displayPrice)}</span>
            ${hasDiscount ? `<span class="font-body text-sm text-muted line-through">${formatMoney(displayOriginalPrice)}</span>` : ''}
          </div>
          <div class="flex items-center gap-1">
            <i data-lucide="star" class="w-3 h-3 text-gold fill-current"></i>
            <span class="font-mono text-xs text-muted">${rating}</span>
          </div>
        </div>
      </div>
    </article>
  `;
};

export const gameCardBrowse = (game, wishlistGameIds = new Set()) => {
  const price = Number(game.price || 0);
  const originalPrice = Number(game.originalPrice || 0);
  const hasFlash = game.flashSale?.isLive;
  const displayPrice = getDisplayPrice(game);
  const displayOriginalPrice = getDisplayOriginalPrice(game);
  const hasDiscount = displayOriginalPrice > displayPrice;
  const savings = hasDiscount ? displayOriginalPrice - displayPrice : 0;
  const hasVariants = Boolean(game.hasVariants);
  const isWishlisted = wishlistGameIds.has(game.id);
  const shortDescription = String(
    game.shortDesc || game.description || t('fallback_description', 'Instant digital delivery for your next session.')
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 110);
  const badge = hasFlash
    ? flashSaleBadge(game)
    : hasDiscount
      ? `<span class="discount-badge">-${game.discountPercent || 0}%</span>`
      : game.isNew
        ? `<span class="discount-badge badge-new">${t('badge_new', 'NEW')}</span>`
        : '';

  const typeBadgeHtml = productTypeBadge(game);

  return `
    <article class="game-card group">
      <div class="card-image">
        <a href="${getDetailPage(game)}?slug=${encodeURIComponent(game.slug)}" class="block h-full w-full">
          <img src="${escapeHtml(game.coverImage)}" alt="${escapeHtml(game.title)}" loading="lazy">
        </a>
        ${badge ? `<div class="absolute top-3 left-3 z-10 flex flex-wrap gap-1">${badge}</div>` : ''}
        <div class="absolute top-3 right-3 z-10">
          <button data-action="toggle-wishlist" data-game-id="${game.id}" aria-pressed="${isWishlisted ? 'true' : 'false'}" aria-label="${isWishlisted ? t('aria_remove_wishlist', 'Remove from wishlist') : t('aria_add_wishlist', 'Add to wishlist')}" class="game-card__wishlist ${isWishlisted ? 'text-coral border-coral bg-coral-dim' : ''}">
            ${isWishlisted ? t('btn_saved', 'Saved') : t('btn_save', 'Save')}
          </button>
        </div>
      </div>
      <div class="game-card__body">
        <div class="game-card__meta">
          ${typeBadgeHtml}
          <span class="game-card__chip game-card__chip--accent">${escapeHtml((game.category?.name || 'GAME').toUpperCase())}</span>
          ${savings > 0 ? `<span class="price-save">${t('save_prefix', 'Save')} ${formatMoney(savings)}</span>` : `<span class="game-card__chip">${escapeHtml(String(game.platform || 'PC').toUpperCase())}</span>`}
        </div>
        <a href="${getDetailPage(game)}?slug=${encodeURIComponent(game.slug)}">
          <h3 class="game-card__title">${escapeHtml(game.title)}</h3>
        </a>
        <p class="game-card__description">${escapeHtml(shortDescription)}${shortDescription.length >= 110 ? '...' : ''}</p>
        <div class="my-3 flex items-center gap-2">
          <i data-lucide="star" class="w-3 h-3 ${Number(game.rating || 0) >= 4 ? 'text-gold fill-current' : 'text-muted'}"></i>
          <span class="font-mono text-xs text-muted">${Number(game.rating || 0).toFixed(1)}</span>
          <span class="font-mono text-xs text-muted/60">•</span>
          <span class="font-mono text-xs text-muted">${Number(game.reviewCount || 0)}</span>
        </div>
        <div class="game-card__actions">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-display text-lg ${hasFlash ? 'flash-price' : hasDiscount ? 'text-success' : 'text-ivory'}">${hasVariants ? `${t('from_price', 'From')} ${formatMoney(displayPrice)}` : formatMoney(displayPrice)}</span>
            ${hasDiscount ? `<span class="font-body text-sm text-muted line-through">${formatMoney(displayOriginalPrice)}</span>` : ''}
          </div>
          <div class="flex gap-1">
            <button data-action="add-to-cart" data-game-id="${game.id}" class="game-card__buy flex-1 btn-cyber bg-cyan text-void">${hasVariants ? t('btn_options', 'OPTIONS') : t('btn_cart', 'CART')}</button>
            ${!hasVariants ? `
              <button data-action="buy-now" data-game-id="${game.id}" class="game-card__buy btn-cyber bg-coral text-void" title="${t('title_buy_now', 'Buy Now')}" aria-label="${t('title_buy_now', 'Buy Now')}">
                <i data-lucide="zap" class="w-4 h-4" aria-hidden="true"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    </article>
  `;
};

export const skeletonCard = () => `
  <div class="game-card">
    <div class="card-image">
      <div class="skeleton w-full h-full"></div>
    </div>
    <div class="game-card__body">
      <div class="skeleton h-5 w-3/4 mb-3"></div>
      <div class="skeleton h-4 w-1/2 mb-3"></div>
      <div class="skeleton h-10 w-full mt-4"></div>
    </div>
  </div>
`;
