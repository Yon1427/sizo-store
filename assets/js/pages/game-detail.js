import { apiDelete, apiGet, apiPatch, apiPost } from '../core/http.js';
import { getDisplayPrice as getDisplayPriceUtil, getDisplayOriginalPrice as getDisplayOriginalPriceUtil } from '../core/templates.js';
import { formatDate, formatMoney, escapeHtml } from '../core/format.js';
import { addToCartAction } from '../core/cart-helpers.js';
import { addToWishlist, removeFromWishlist } from '../core/wishlist-helpers.js';
import { initStickyBar } from '../core/ui-helpers.js';
import {
  ensureAuthenticated,
  initShell,
  syncLucide,
} from '../core/shell.js';
import { isAuthenticated } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { t, renderI18n } from '../core/i18n.js';
import { showConfirmModal } from '../core/components.js';

const mainImage = document.getElementById('main-image');
const addToCartButton = document.getElementById('add-to-cart');
const wishlistButton = document.getElementById('wishlist-toggle');
const tabButtons = Array.from(document.querySelectorAll('.detail-tab-btn'));
const tabContents = Array.from(document.querySelectorAll('.detail-tab-panel'));
const reviewsAverage = document.getElementById('reviews-average');
const reviewsCount = document.getElementById('reviews-count');
const reviewsList = document.getElementById('reviews-list');
const reviewForm = document.getElementById('review-form');
const reviewFormCopy = document.getElementById('review-form-copy');
const reviewRating = document.getElementById('review-rating');
const reviewTitle = document.getElementById('review-title');
const reviewContent = document.getElementById('review-content');
const reviewSubmit = document.getElementById('review-submit');
const reviewDelete = document.getElementById('review-delete');
const reviewStarPicker  = document.getElementById('review-star-picker');
const reviewContentCount = document.getElementById('review-content-count');
const reviewsDistribution = document.getElementById('reviews-distribution');
const reviewsStarsDisplay = document.getElementById('reviews-stars-display');
const reviewSignIn = document.getElementById('review-sign-in');
const variantPicker = document.getElementById('variant-picker');
const variantOptions = document.getElementById('variant-options');
const variantStockNote = document.getElementById('variant-stock-note');

let currentGame = null;
let currentReview = null;
let isInWishlist = false;
let selectedVariant = null;


const getSlug = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug') || '';
};

const getDisplayPrice = () => getDisplayPriceUtil(currentGame, selectedVariant);
const getDisplayOriginalPrice = () => getDisplayOriginalPriceUtil(currentGame, selectedVariant);
const getGalleryThumbs = () => Array.from(document.querySelectorAll('.gallery__thumb'));

const bindTabs = () => {
  if (!tabButtons.length || !tabContents.length) {
    return;
  }

  const tablist = tabButtons[0]?.closest('[role="tablist"]');

  const updateTabState = (activeIndex) => {
    tabButtons.forEach((btn, i) => {
      const isActive = i === activeIndex;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
    });

    tabContents.forEach((content, i) => {
      const isActive = i === activeIndex;
      content.classList.toggle('active', isActive);
      content.classList.toggle('hidden', !isActive);
    });
  };

  tabButtons.forEach((button, index) => {
    button.addEventListener('click', () => {
      updateTabState(index);
    });
  });

  if (tablist) {
    tablist.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        return;
      }

      e.preventDefault();
      const tabs = [...tabButtons];
      const idx = tabs.indexOf(document.activeElement);
      let next = idx;

      if (e.key === 'ArrowRight') {
        next = (idx + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft') {
        next = (idx - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        next = 0;
      } else if (e.key === 'End') {
        next = tabs.length - 1;
      }

      tabs[next].focus();
      tabs[next].click();
    });
  }
};

const bindGallery = () => {
  const thumbs = getGalleryThumbs();
  if (!mainImage || !thumbs.length) {
    return;
  }

  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const image = thumb.querySelector('img');
      if (!image) {
        return;
      }

      thumbs.forEach((node) => {
        node.classList.remove('active');
        node.classList.add('opacity-60');
        node.setAttribute('aria-pressed', 'false');
      });

      thumb.classList.add('active');
      thumb.classList.remove('opacity-60');
      thumb.setAttribute('aria-pressed', 'true');
      mainImage.src = image.src;
    });
  });
};

const renderGallery = (game) => {
  if (!mainImage) {
    return;
  }

  const images =
    Array.isArray(game.images) && game.images.length
      ? game.images
      : [game.coverImage];
  mainImage.src = images[0] || game.coverImage;

  const thumbsContainer = document.querySelector('.gallery__thumb')?.parentElement;
  if (!thumbsContainer) {
    return;
  }

  thumbsContainer.innerHTML = images
    .slice(0, 6)
    .map(
      (image, index) => `
        <button class="gallery__thumb ${index === 0 ? 'active' : 'opacity-60 hover:opacity-100'} h-16 w-24 flex-shrink-0 overflow-hidden border-2 border-transparent transition-all" aria-label="View screenshot ${index + 1}" aria-pressed="${index === 0 ? 'true' : 'false'}">
          <img loading="lazy" src="${escapeHtml(image)}" class="w-full h-full object-cover">
        </button>
      `
    )
    .join('');
};

const renderSavingsHighlight = (game) => {
  const savingsEl = document.getElementById('savings-highlight');
  const savingsText = document.getElementById('savings-text');
  const original = getDisplayOriginalPrice();
  const current = getDisplayPrice();
  const savings = original > current ? original - current : 0;

  if (savingsEl && savingsText) {
    if (savings > 0) {
      savingsText.textContent = `${t('savings_you_save', 'You save')} ${formatMoney(savings)}`;
      savingsEl.classList.remove('hidden');
    } else {
      savingsEl.classList.add('hidden');
    }
  }
};

const renderGameMeta = (game) => {
  const card = addToCartButton?.closest('[data-game-summary]');
  if (!card) {
    return;
  }

  // Product type badge
  const typeBadge = document.getElementById('product-type-badge');
  if (typeBadge) {
    const type = game.productType || 'GAME_KEY';
    if (type === 'GIFT_CARD') {
      typeBadge.textContent = t('product_type_gift_card', 'Gift Card');
      typeBadge.className = 'badge badge--cyan';
      typeBadge.classList.remove('hidden');
    } else if (type === 'TOP_UP') {
      typeBadge.textContent = t('product_type_top_up', 'Top-Up');
      typeBadge.className = 'badge badge--cyan';
      typeBadge.classList.remove('hidden');
    } else {
      typeBadge.classList.add('hidden');
    }
  }

  // Category badge
  const categoryBadge = document.getElementById('game-category-badge');
  if (categoryBadge) {
    categoryBadge.textContent = String(game.category?.name || 'GAME').toUpperCase();
    categoryBadge.className = 'badge badge--cyan';
  }

  // Discount / Flash badge (alt position)
  const discountBadgeAlt = document.getElementById('game-discount-badge-alt');
  if (discountBadgeAlt) {
    if (game.flashSale?.isLive) {
      discountBadgeAlt.innerHTML = '<i data-lucide="zap" class="w-3 h-3 inline-block align-middle mr-1"></i>' + t('flash_badge_label', 'FLASH');
      discountBadgeAlt.className = 'flash-badge';
      discountBadgeAlt.classList.remove('hidden');
    } else if (game.discountPercent && game.discountPercent > 0) {
      discountBadgeAlt.textContent = `-${game.discountPercent}%`;
      discountBadgeAlt.className = 'discount-badge';
      discountBadgeAlt.classList.remove('hidden');
    } else {
      discountBadgeAlt.classList.add('hidden');
    }
  }

  // Discount / Flash badge (price hero position)
  const discountBadge = document.getElementById('game-discount-badge');
  if (discountBadge) {
    if (game.flashSale?.isLive) {
      discountBadge.textContent = `-${game.flashSale.discountPercent}%`;
      discountBadge.className = 'discount-badge';
      discountBadge.style.background = 'var(--coral)';
      discountBadge.classList.remove('hidden');
    } else if (game.discountPercent && game.discountPercent > 0) {
      discountBadge.textContent = `-${game.discountPercent}%`;
      discountBadge.className = 'discount-badge';
      discountBadge.style.background = '';
      discountBadge.classList.remove('hidden');
    } else {
      discountBadge.classList.add('hidden');
    }
  }

  const titleNode = card.querySelector('h1');
  if (titleNode) {
    titleNode.textContent = String(game.title || '');
  }

  const ratingNode = document.getElementById('game-rating');
  if (ratingNode) {
    ratingNode.textContent = `${Number(game.rating || 0).toFixed(1)} / 5 — ${Number(game.reviewCount || 0)} ${t('reviews_count_suffix', 'reviews')}`;
  }

  // Sold count
  const soldNode = document.getElementById('game-sold-count');
  if (soldNode) {
    const sold = Number(game.soldCount || 0);
    if (sold > 0) {
      soldNode.textContent = `${sold.toLocaleString()} ${t('sold_count_label', 'sold')}`;
      soldNode.style.display = '';
    } else {
      soldNode.style.display = 'none';
    }
  }

  const priceNode = document.getElementById('game-price');
  if (priceNode) {
    priceNode.textContent = formatMoney(getDisplayPrice());
    if (game.flashSale?.isLive && !selectedVariant) {
      priceNode.classList.add('flash-price');
    } else {
      priceNode.classList.remove('flash-price');
    }
  }

  const originalNode = document.getElementById('game-original-price');
  if (originalNode) {
    const original = getDisplayOriginalPrice();
    const current = getDisplayPrice();
    if (original > current) {
      originalNode.textContent = formatMoney(original);
      originalNode.classList.remove('hidden');
    } else {
      originalNode.classList.add('hidden');
    }
  }

  renderSavingsHighlight(game);

  // Metadata — hide irrelevant fields for gift cards/top-ups
  const metadataEl = document.getElementById('game-metadata');
  const productType = game.productType || 'GAME_KEY';
  const isGameKey = productType === 'GAME_KEY';

  if (metadataEl) {
    metadataEl.querySelectorAll('[data-meta]').forEach((row) => {
      const key = row.getAttribute('data-meta');
      const valueNode = row.querySelector('span:last-child');

      // Hide developer/publisher/release-date for non-game products
      if (!isGameKey && ['developer', 'publisher', 'release-date'].includes(key)) {
        row.classList.add('hidden');
        return;
      }
      row.classList.remove('hidden');

      if (key === 'developer' && valueNode) valueNode.textContent = game.developer || t('default_not_available', 'N/A');
      if (key === 'publisher' && valueNode) valueNode.textContent = game.publisher || 'N/A';
      if (key === 'release-date' && valueNode) valueNode.textContent = formatDate(game.releaseDate);
      if (key === 'platform' && valueNode) valueNode.textContent = game.platform || t('default_platform', 'PC');
      if (key === 'region' && valueNode) valueNode.textContent = game.region || t('default_region', 'GLOBAL');
    });
  }

  if (addToCartButton) {
    addToCartButton.setAttribute('data-game-id', game.id);
    addToCartButton.setAttribute('data-variant-id', selectedVariant?.id || '');
  }

  document.title = `${game.title} | SIZO Digital Store`;

  // Breadcrumb title
  const breadcrumbTitle = document.getElementById('breadcrumb-title');
  if (breadcrumbTitle) {
    breadcrumbTitle.textContent = game.title || t('breadcrumb_product', 'Product');
  }
};

const updateMetaTag = (selector, value) => {
  const node = document.querySelector(selector);
  if (node && value) {
    node.setAttribute('content', value);
  }
};

const updateLinkTag = (selector, href) => {
  const node = document.querySelector(selector);
  if (node && href) {
    node.setAttribute('href', href);
  }
};

const renderStructuredData = (game) => {
  const slug = game.slug || getSlug();
  const url = `https://sizo.uk/game-detail.html?slug=${encodeURIComponent(slug)}`;
  const price = getDisplayPrice();
  const image = Array.isArray(game.images) && game.images.length
    ? game.images[0]
    : game.coverImage;
  const shortDesc = String(game.shortDesc || game.description || '').slice(0, 300);

  document.title = `${game.title} | SIZO Digital Store`;
  updateMetaTag('meta[name="description"]', shortDesc || `Buy ${game.title} at SIZO. Instant email delivery.`);
  updateLinkTag('link[rel="canonical"]', url);
  updateMetaTag('meta[property="og:title"]', `${game.title} | SIZO Digital Store`);
  updateMetaTag('meta[property="og:description"]', shortDesc);
  updateMetaTag('meta[property="og:url"]', url);
  if (image) {
    updateMetaTag('meta[property="og:image"]', image);
    updateMetaTag('meta[name="twitter:image"]', image);
  }
  updateMetaTag('meta[name="twitter:title"]', `${game.title} | SIZO Digital Store`);
  updateMetaTag('meta[name="twitter:description"]', shortDesc);

  const offer = {
    '@type': 'Offer',
    url,
    priceCurrency: 'DZD',
    price: price.toFixed(2),
    availability: Number(game.stock || 0) > 0
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: 'SIZO Digital Store' },
  };

  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: game.title,
    description: shortDesc,
    sku: game.id,
    image: image ? [image] : undefined,
    brand: { '@type': 'Brand', name: game.publisher || game.developer || 'SIZO' },
    category: game.category?.name || 'Video Games',
    offers: offer,
  };

  const reviewCount = Number(game.reviewCount || 0);
  const rating = Number(game.rating || 0);
  if (reviewCount > 0 && rating > 0) {
    product.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating.toFixed(1),
      reviewCount,
      bestRating: '5',
      worstRating: '1',
    };
  }

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://sizo.uk/' },
      { '@type': 'ListItem', position: 2, name: 'Browse', item: 'https://sizo.uk/browse.html' },
      { '@type': 'ListItem', position: 3, name: game.title, item: url },
    ],
  };

  const productNode = document.getElementById('jsonld-product');
  const breadcrumbNode = document.getElementById('jsonld-breadcrumb');
  if (productNode) {
    productNode.textContent = JSON.stringify(product);
  }
  if (breadcrumbNode) {
    breadcrumbNode.textContent = JSON.stringify(breadcrumb);
  }
};

const renderVariantPicker = (game) => {
  const variants = Array.isArray(game?.variants) ? game.variants : [];
  if (!variantPicker || !variantOptions) {
    return;
  }

  if (!variants.length) {
    variantPicker.classList.add('hidden');
    return;
  }

  variantPicker.classList.remove('hidden');
  if (!selectedVariant) {
    selectedVariant = variants[0] || null;
  }

  variantOptions.innerHTML = variants
    .map((variant) => {
      const isSelected = selectedVariant?.id === variant.id;
      return `
        <button
          type="button"
          class="variant-option${isSelected ? ' active' : ''}"
          data-variant-id="${variant.id}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
        >
          <span>${escapeHtml(variant.name)}</span>
          <span class="variant-option__price">${formatMoney(variant.price)}</span>
        </button>
      `;
    })
    .join('');

  if (variantStockNote) {
    const stock = Number(selectedVariant?.stock || 0);
    variantStockNote.textContent = stock > 0 ? `${stock} ${t('variant_keys_ready', 'keys ready')}` : t('variant_awaiting', 'Awaiting fulfillment');
  }
};

const renderAbout = (game) => {
  const descEl = document.getElementById('game-description');
  if (!descEl) {
    return;
  }

  const desc = String(game.description || game.shortDesc || t('description_unavailable', 'No description available.'));
  const parts = desc.split(/\n\s*\n/).filter(Boolean);

  let html = parts.map(p => `<p style="margin-bottom:1rem;line-height:1.7">${escapeHtml(p)}</p>`).join('');

  if (Array.isArray(game.features) && game.features.length) {
    html += '<ul style="list-style:none;padding:0;margin-top:1rem">' +
      game.features.slice(0, 6).map(f =>
        `<li style="display:flex;align-items:flex-start;gap:0.5rem;margin-bottom:0.5rem"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" style="flex-shrink:0;margin-top:2px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>${escapeHtml(f)}</span></li>`
      ).join('') + '</ul>';
  }

  descEl.innerHTML = html;
};

const renderDetails = (game) => {
  // Genres
  const genresSection = document.getElementById('details-genres-section');
  const genresEl = document.getElementById('details-genres');
  const genres = Array.isArray(game.genres) ? game.genres.filter(Boolean) : [];
  if (genresEl && genres.length) {
    genresEl.innerHTML = genres.map(g =>
      `<span class="badge badge--cyan" style="font-size:0.8rem;padding:0.35rem 0.75rem">${escapeHtml(g)}</span>`
    ).join('');
    if (genresSection) genresSection.style.display = '';
  } else if (genresSection) {
    genresSection.style.display = 'none';
  }

  // Languages
  const languagesSection = document.getElementById('details-languages-section');
  const languagesEl = document.getElementById('details-languages');
  const languages = Array.isArray(game.languages) ? game.languages.filter(Boolean) : [];
  if (languagesEl && languages.length) {
    languagesEl.innerHTML = languages.map(l =>
      `<span class="badge" style="font-size:0.8rem;padding:0.35rem 0.75rem;background:var(--surface);color:var(--text);border:1px solid var(--border)">${escapeHtml(l)}</span>`
    ).join('');
    if (languagesSection) languagesSection.style.display = '';
  } else if (languagesSection) {
    languagesSection.style.display = 'none';
  }

  // Age rating
  const ageSection = document.getElementById('details-age-rating');
  const ageValue = document.getElementById('details-age-rating-value');
  if (ageSection && ageValue) {
    const ageRating = game.ageRating || null;
    if (ageRating) {
      ageValue.textContent = ageRating;
      ageSection.classList.remove('hidden');
    } else {
      ageSection.classList.add('hidden');
    }
  }

  // Metacritic score
  const metacriticSection = document.getElementById('details-metacritic');
  const metacriticValue = document.getElementById('details-metacritic-value');
  if (metacriticSection && metacriticValue) {
    const score = game.metacriticScore ?? null;
    if (score !== null && score > 0) {
      const color = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--gold)' : 'var(--danger)';
      metacriticValue.innerHTML = `<span style="font-size:1.5rem;font-weight:700;color:${color}">${score}</span><span style="color:var(--muted)"> / 100</span>`;
      metacriticSection.classList.remove('hidden');
    } else {
      metacriticSection.classList.add('hidden');
    }
  }

  // Sold count in details tab too
  const soldValue = document.getElementById('details-sold-count-value');
  if (soldValue) {
    const sold = Number(game.soldCount || 0);
    soldValue.textContent = sold > 0 ? `${sold.toLocaleString()} ${t('sold_copies_label', 'copies')}` : t('sold_first_to_buy', 'Be the first to buy');
  }

  // Activation instructions
  const activationSection = document.getElementById('details-activation-section');
  const activationEl = document.getElementById('details-activation');
  if (activationSection && activationEl) {
    const activation = game.activationDetails || null;
    if (activation) {
      activationEl.textContent = activation;
      activationSection.classList.remove('hidden');
    } else {
      activationSection.classList.add('hidden');
    }
  }

  // Tags
  const tagsEl = document.getElementById('details-tags');
  const tags = Array.isArray(game.tags) ? game.tags.filter(t => t && !t.startsWith('canonical:')) : [];
  if (tagsEl && tags.length) {
    tagsEl.innerHTML = tags.map(t =>
      `<span class="badge" style="font-size:0.75rem;padding:0.25rem 0.6rem;background:var(--surface);color:var(--muted);border:1px solid var(--border)">${escapeHtml(t)}</span>`
    ).join('');
  }
};

const renderSystemRequirements = (game) => {
  const container = document.getElementById('system-requirements');
  if (!container) return;

  const requirements = game.systemRequirements;
  if (!requirements) {
    container.innerHTML = `<p class="text-muted">${t('system_requirements_unavailable', 'System requirements have not been published for this game yet.')}</p>`;
    return;
  }

  // Handle array format: [{system: "Windows", requirement: [...]}, ...]
  if (Array.isArray(requirements) && requirements.length) {
    container.innerHTML = `
      <div class="grid gap-4 sm:grid-cols-2">
        ${requirements.map((entry) => `
          <div class="detail-inline-card border border-[var(--border)] bg-[var(--surface)]/50 p-4">
            <p class="font-mono text-xs uppercase tracking-[0.25em] text-cyan">${escapeHtml(entry.system || '')}</p>
            <div class="mt-2 text-[var(--ivory)] text-sm leading-relaxed">
              ${(Array.isArray(entry.requirement) ? entry.requirement : [entry.requirement || '']).map(r => `<p class="mb-1">${escapeHtml(String(r))}</p>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>`;
    return;
  }

  // Handle legacy object format: {Windows: "reqs", Mac: "reqs"}
  if (typeof requirements === 'object' && !Array.isArray(requirements)) {
    const entries = Object.entries(requirements);
    if (!entries.length) {
      container.innerHTML = `<p class="text-muted">${t('system_requirements_unavailable', 'System requirements have not been published for this game yet.')}</p>`;
      return;
    }
    container.innerHTML = `
      <div class="grid gap-4 sm:grid-cols-2">
        ${entries.map(([label, value]) => `
          <div class="detail-inline-card border border-[var(--border)] bg-[var(--surface)]/50 p-4">
            <p class="font-mono text-xs uppercase tracking-[0.25em] text-cyan">${escapeHtml(label)}</p>
            <p class="mt-2 text-[var(--ivory)]">${escapeHtml(Array.isArray(value) ? value.join(', ') : String(value))}</p>
          </div>
        `).join('')}
      </div>`;
    return;
  }

  container.innerHTML = `<p class="text-muted">${t('system_requirements_unavailable', 'System requirements have not been published for this game yet.')}</p>`;
};

const renderWishlistState = () => {
  if (!wishlistButton) {
    return;
  }

  const text = isInWishlist ? t('btn_in_wishlist', 'IN WISHLIST') : t('btn_save_wishlist', 'SAVE TO WISHLIST');
  const span = wishlistButton.querySelector('span[data-i18n]');
  if (span) {
    span.textContent = text;
  } else {
    wishlistButton.textContent = text;
  }
  wishlistButton.classList.toggle('bg-success', isInWishlist);
  wishlistButton.classList.toggle('text-void', isInWishlist);
  wishlistButton.classList.toggle('border-success', isInWishlist);
  wishlistButton.setAttribute('aria-pressed', isInWishlist ? 'true' : 'false');
  wishlistButton.setAttribute('aria-label', isInWishlist ? t('aria_remove_wishlist', 'Remove from wishlist') : t('aria_add_wishlist', 'Add to wishlist'));
};

const loadWishlistState = async () => {
  if (!currentGame || !isAuthenticated()) {
    isInWishlist = false;
    renderWishlistState();
    return;
  }

  try {
    const response = await apiGet(
      `/wishlist/check/${encodeURIComponent(currentGame.id)}`,
      true
    );
    isInWishlist = Boolean(response?.data?.isInWishlist);
  } catch {
    isInWishlist = false;
  }

  renderWishlistState();
};

const updateStarPicker = (selected) => {
  if (!reviewStarPicker) return;
  reviewStarPicker.setAttribute('role', 'radiogroup');
  reviewStarPicker.setAttribute('aria-label', 'Rating');
  reviewStarPicker.querySelectorAll('[data-value]').forEach((s, i) => {
    const active = i < selected;
    s.style.color = active ? 'var(--gold)' : 'var(--border)';
    s.setAttribute('role', 'radio');
    s.setAttribute('aria-checked', String(active));
    s.tabIndex = (i === 0 || i === selected - 1) ? 0 : -1;
  });
};

const renderAverageStars = (avg) => {
  if (!reviewsStarsDisplay) return;
  const full = Math.floor(avg);
  reviewsStarsDisplay.innerHTML = Array.from({ length: 5 }, (_, i) =>
    `<span style="color:${i < full ? 'var(--gold)' : 'var(--border)'}">★</span>`
  ).join('');
};

const renderDistribution = (reviews, total) => {
  if (!reviewsDistribution) return;
  reviewsDistribution.innerHTML = [5, 4, 3, 2, 1].map(stars => {
    const count = reviews.filter(r => Number(r.rating) === stars).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return `
      <div class="review-dist-row">
        <span class="review-dist-label">${stars}★</span>
        <div class="review-dist-track">
          <div class="review-dist-fill" style="width:${pct}%"></div>
        </div>
        <span class="review-dist-count">${count}</span>
      </div>`;
  }).join('');
};

const renderReviews = (data) => {
  const reviews = Array.isArray(data?.reviews) ? data.reviews : [];
  if (reviewsAverage) {
    reviewsAverage.textContent = Number(data?.averageRating || 0).toFixed(1);
  }

  if (reviewsCount) {
    reviewsCount.textContent = `${Number(data?.totalReviews || 0)} reviews`;
  }

  renderAverageStars(Number(data?.averageRating || 0));
  renderDistribution(reviews, Number(data?.totalReviews || 0));

  if (tabButtons[3]) {
    tabButtons[3].textContent = `${t('tab_reviews_count', 'REVIEWS')} (${Number(data?.totalReviews || 0).toLocaleString()})`;
  }

  if (!reviewsList) {
    return;
  }

  if (!reviews.length) {
    reviewsList.innerHTML =
      `<div class="detail-inline-card border border-[var(--border)] bg-[var(--surface)]/50 p-5 text-[var(--muted)]">${t('reviews_empty', 'No approved reviews yet. Be the first to share your experience.')}</div>`;
    return;
  }

  reviewsList.innerHTML = reviews
    .map((review) => {
      const author = review.user?.name || t('review_author_default', 'Player');
      const badge = review.isVerified
        ? `<span class="review-verified-badge">${t('review_verified_badge', '✓ Verified')}</span>`
        : '';

      return `
        <article class="review-card">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            ${review.title ? `<p class="review-card-title">${escapeHtml(review.title)}</p>` : ''}
            ${badge}
          </div>
          <div class="review-card-stars mb-2">
            ${Array.from({ length: 5 }, (_, i) => `<span style="color:${i < Number(review.rating || 0) ? 'var(--gold)' : 'var(--border)'}">★</span>`).join('')}
          </div>
          <p class="review-card-body">${escapeHtml(review.content || '')}</p>
          <div class="review-card-meta mt-3">
            <span>${escapeHtml(author)}</span>
            <span style="color:var(--border)">·</span>
            <span>${formatDate(review.createdAt)}</span>
          </div>
        </article>
      `;
    })
    .join('');
};

const renderReviewComposer = () => {
  if (!reviewForm || !reviewFormCopy || !reviewSignIn) {
    return;
  }

  if (!isAuthenticated()) {
    reviewForm.classList.add('hidden');
    reviewSignIn.classList.remove('hidden');
    reviewSignIn.href = `login.html?next=${encodeURIComponent(`game-detail.html?slug=${getSlug()}`)}`;
    reviewFormCopy.textContent = t('sign_in_to_review', 'Sign in to leave feedback about this game.');
    return;
  }

  reviewForm.classList.remove('hidden');
  reviewSignIn.classList.add('hidden');

  if (currentReview) {
    reviewFormCopy.textContent = currentReview.status === 'APPROVED'
      ? t('review_live', 'Your review is live. Updating it will send it back for moderation.')
      : currentReview.status === 'REJECTED'
        ? t('review_rejected', 'Your review was not approved. You can edit and resubmit it.')
        : t('review_pending_live', 'Your review is pending approval. You can still edit it before it goes live.');
    if (reviewRating) {
      reviewRating.value = String(currentReview.rating || 5);
    }
    updateStarPicker(currentReview.rating || 5);
    if (reviewTitle) {
      reviewTitle.value = currentReview.title || '';
    }
    if (reviewContent) {
      reviewContent.value = currentReview.content || '';
    }
    if (reviewSubmit) {
      reviewSubmit.textContent = t('btn_update_review', 'UPDATE REVIEW');
    }
    if (reviewDelete) {
      reviewDelete.classList.remove('hidden');
    }
    return;
  }

  reviewFormCopy.textContent = t('review_form_copy', 'Share what worked, what surprised you, and whether you would recommend it.');
  if (reviewRating) {
    reviewRating.value = '5';
  }
  updateStarPicker(5);
  if (reviewTitle) {
    reviewTitle.value = '';
  }
  if (reviewContent) {
    reviewContent.value = '';
  }
  if (reviewSubmit) {
    reviewSubmit.textContent = t('btn_submit_review', 'SUBMIT REVIEW');
  }
  if (reviewDelete) {
    reviewDelete.classList.add('hidden');
  }
};

const loadReviewData = async () => {
  if (!currentGame) {
    return;
  }

  const publicReviewsResponse = await apiGet(`/reviews/game/${encodeURIComponent(currentGame.id)}`);
  renderReviews(publicReviewsResponse?.data || null);

  currentReview = null;

  if (isAuthenticated()) {
    try {
      const myReviewsResponse = await apiGet('/reviews/my', true);
      if (Array.isArray(myReviewsResponse?.data)) {
        currentReview =
          myReviewsResponse.data.find((review) => review.game?.id === currentGame.id) || null;
      }
    } catch {
      currentReview = null;
    }
  }

  renderReviewComposer();
  syncLucide();
  renderI18n();
};

const renderSimilarGames = async (game) => {
  const similarGrid = document.getElementById('similar-games-grid');
  if (!similarGrid) {
    return;
  }

  try {
    const params = new URLSearchParams({ limit: '8', category: game.category?.slug || '' });
    const response = await apiGet(`/games?${params.toString()}`);
    const games = (Array.isArray(response?.data) ? response.data : [])
      .filter((item) => item.id !== game.id)
      .slice(0, 4);

    if (!games.length) {
      return;
    }

    similarGrid.innerHTML = games
      .map(
        (item) => `
          <div class="similar-game-card group overflow-hidden">
            <a href="game-detail.html?slug=${encodeURIComponent(item.slug)}">
              <div class="aspect-[4/5] overflow-hidden">
                <img loading="lazy" src="${escapeHtml(item.coverImage)}" alt="${escapeHtml(item.title)}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
              </div>
            </a>
            <div class="p-4">
              <span class="font-mono text-xs uppercase tracking-[0.22em] text-cyan">${escapeHtml((item.category?.name || 'GAME').toUpperCase())}</span>
              <h3 class="mt-2 font-display text-lg font-bold text-[var(--ivory)]">${escapeHtml(item.title)}</h3>
              <span class="mt-3 inline-flex font-body text-xl font-bold text-success">${formatMoney(item.price)}</span>
            </div>
          </div>
        `
      )
      .join('');

    syncLucide();
  renderI18n();
  } catch {
    // Keep fallback cards when the related fetch fails.
  }
};

const renderRecommendedGames = async (game) => {
  const section = document.getElementById('recommended-section');
  const grid = document.getElementById('recommended-grid');
  if (!section || !grid) return;

  try {
    const response = await apiGet(`/games/${encodeURIComponent(game.slug)}/recommended?limit=4`);
    const games = Array.isArray(response?.data) ? response.data : [];
    if (!games.length) return;

    grid.innerHTML = games
      .map((item) => {
        const hasFlash = item.flashSale?.isLive;
        const displayPrice = hasFlash
          ? Number(item.flashSale.flashPrice)
          : Number(item.startingPrice || item.price || 0);
        const originalPrice = hasFlash
          ? Number(item.price)
          : Number(item.startingOriginalPrice || item.originalPrice || displayPrice);
        const hasDiscount = originalPrice > displayPrice;
        const type = item.productType || 'GAME_KEY';
        const detailPage =
          type === 'GIFT_CARD'
            ? 'gift-card-detail.html'
            : type === 'TOP_UP'
            ? 'topup-detail.html'
            : 'game-detail.html';
        const badge = hasFlash
          ? '<span class="flash-badge"><i data-lucide="zap" class="w-3 h-3"></i> FLASH</span>'
          : hasDiscount
          ? `<span class="discount-badge">-${item.discountPercent || 0}%</span>`
          : '';

        return `
          <div class="similar-game-card group overflow-hidden">
            <a href="${detailPage}?slug=${encodeURIComponent(item.slug)}" class="block">
              <div class="relative aspect-[4/5] overflow-hidden">
                <img loading="lazy" src="${escapeHtml(item.coverImage)}" alt="${escapeHtml(item.title)}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">
                ${badge ? `<div class="absolute top-2 left-2">${badge}</div>` : ''}
              </div>
            </a>
            <div class="p-4">
              <span class="font-mono text-xs uppercase tracking-[0.22em] text-cyan">${escapeHtml((item.category?.name || 'GAME').toUpperCase())}</span>
              <a href="${detailPage}?slug=${encodeURIComponent(item.slug)}">
                <h3 class="mt-2 font-display text-lg font-bold" style="color:var(--ivory)">${escapeHtml(item.title)}</h3>
              </a>
              <div class="mt-3 flex items-center gap-2">
                <span class="font-body text-xl font-bold ${hasFlash ? 'flash-price' : hasDiscount ? 'text-success' : 'text-ivory'}">${formatMoney(displayPrice)}</span>
                ${hasDiscount ? `<span class="font-body text-sm line-through" style="color:var(--muted)">${formatMoney(originalPrice)}</span>` : ''}
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    section.style.display = '';
    syncLucide();
  renderI18n();
  } catch {
    // Recommendations are non-critical — silently skip on failure.
  }
};

const addToCart = async () => {
  if (!addToCartButton || !currentGame) return;
  const gameId = addToCartButton.getAttribute('data-game-id');
  if (!gameId) return;
  await addToCartAction({
    gameId,
    variantId: selectedVariant?.id || null,
    button: addToCartButton,
    game: currentGame,
    variant: selectedVariant,
    useLucideIcons: true,
    successTimeout: 1300,
  });
};

const toggleWishlist = async () => {
  if (!currentGame || !wishlistButton) return;
  if (!isAuthenticated()) { ensureAuthenticated(); return; }
  const original = wishlistButton.textContent;
  wishlistButton.disabled = true;
  wishlistButton.textContent = isInWishlist ? t('btn_removing', 'REMOVING...') : t('btn_saving', 'SAVING...');
  try {
    if (isInWishlist) {
      const ok = await removeFromWishlist(currentGame.id);
      if (ok) isInWishlist = false;
    } else {
      const ok = await addToWishlist(currentGame.id);
      if (ok) isInWishlist = true;
    }
    renderWishlistState();
  } catch (error) {
    wishlistButton.textContent = original;
  } finally {
    wishlistButton.disabled = false;
  }
};

const submitReview = async (event) => {
  event.preventDefault();

  if (!currentGame || !reviewRating || !reviewContent) {
    return;
  }

  const isUpdating = Boolean(currentReview);

  const payload = {
    gameId: currentGame.id,
    rating: Number(reviewRating.value || 5),
    title: reviewTitle?.value?.trim() || '',
    content: reviewContent.value.trim(),
  };

  if (!payload.content) {
    showToast(t('review_validation_empty', 'Please write a few words before submitting'), 'error');
    return;
  }

  const original = reviewSubmit?.textContent || 'SUBMIT REVIEW';
  if (reviewSubmit) {
    reviewSubmit.disabled = true;
    reviewSubmit.textContent = isUpdating ? t('btn_updating', 'UPDATING...') : t('btn_submitting', 'SUBMITTING...');
  }

  try {
    const response = isUpdating
      ? await apiPatch(`/reviews/${encodeURIComponent(currentReview.id)}`, {
          rating: payload.rating,
          title: payload.title,
          content: payload.content,
        }, true)
      : await apiPost('/reviews', payload, true);

    currentReview = response?.data || currentReview;
    renderReviewComposer();
    await loadReviewData();
    showToast(
      isUpdating
        ? t('review_save_success', 'Review saved. It will appear after moderation.')
        : t('review_submit_success', 'Review submitted for moderation.'),
      'success'
    );
  } catch (error) {
    showToast(error.message || t('review_save_error', 'Unable to save review'), 'error');
  } finally {
    if (reviewSubmit) {
      reviewSubmit.disabled = false;
      reviewSubmit.textContent = original;
    }
  }
};

const removeReview = async () => {
  if (!currentReview) {
    return;
  }

  showConfirmModal('Delete your review for this game?', async () => {
    const original = reviewDelete?.textContent || 'DELETE REVIEW';
    if (reviewDelete) {
      reviewDelete.disabled = true;
      reviewDelete.textContent = t('btn_deleting', 'DELETING...');
    }

    try {
      await apiDelete(`/reviews/${encodeURIComponent(currentReview.id)}`, true);
      currentReview = null;
      renderReviewComposer();
      await loadReviewData();
      showToast(t('review_delete_success', 'Review deleted'), 'success');
    } catch (error) {
      showToast(error.message || t('review_delete_error', 'Unable to delete review'), 'error');
    } finally {
      if (reviewDelete) {
        reviewDelete.disabled = false;
        reviewDelete.textContent = original;
      }
    }
  });
};

let isPreview = false;

const loadGame = async () => {
  const slug = getSlug();
  const params = new URLSearchParams(window.location.search);
  isPreview = params.get('preview') === '1';

  if (isPreview && !isAuthenticated()) {
    showToast(t('preview_auth_required', 'Admin authentication required for preview'), 'error');
    window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search);
    return null;
  }

  if (slug) {
    let url = `/games/${encodeURIComponent(slug)}`;
    if (isPreview) url += '?preview=1';
    const response = await apiGet(url, true);
    return response?.data || null;
  }

  const featured = await apiGet('/games/featured');
  return Array.isArray(featured?.data) ? featured.data[0] || null : null;
};

const init = async () => {
  if (!(await initShell())) {
    return;
  }

  bindTabs();

  try {
    const game = await loadGame();
    if (!game) {
      showToast(t('game_not_found', 'Game not found'), 'error');
      return;
    }

    currentGame = game;
    selectedVariant = Array.isArray(game.variants) && game.variants.length ? game.variants[0] : null;
    renderGallery(game);
    bindGallery();
    renderVariantPicker(game);
    renderGameMeta(game);
    renderStructuredData(game);
    renderAbout(game);
    renderDetails(game);
    renderSystemRequirements(game);
    await Promise.all([
      renderSimilarGames(game),
      renderRecommendedGames(game),
      loadWishlistState(),
      loadReviewData(),
    ]);
    syncLucide();
  renderI18n();

    // Preview mode banner — only show if game is actually inactive (confirms admin preview access)
    if (isPreview && !game.isActive) {
      const banner = document.createElement('div');
      banner.id = 'preview-banner';
      banner.style.cssText = 'background:var(--gold);color:#000;text-align:center;padding:0.5rem;font-weight:600;font-size:0.85rem;position:sticky;top:0;z-index:100;';
      banner.textContent = t('preview_banner_text', 'PREVIEW MODE — This product is not yet published');
      document.body.prepend(banner);
    }
  } catch (error) {
    showToast(error.message || t('game_load_error', 'Unable to load game details'), 'error');
  }

  addToCartButton?.addEventListener('click', (event) => {
    event.preventDefault();
    addToCart();
  });

  variantOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-variant-id]');
    const variantId = button?.getAttribute('data-variant-id');
    if (!button || !variantId || !currentGame) {
      return;
    }

    selectedVariant = (currentGame.variants || []).find((variant) => variant.id === variantId) || null;
    renderVariantPicker(currentGame);
    renderGameMeta(currentGame);
    renderStructuredData(currentGame);
    syncLucide();
  renderI18n();
  });

  wishlistButton?.addEventListener('click', (event) => {
    event.preventDefault();
    toggleWishlist();
  });

  reviewStarPicker?.addEventListener('click', (e) => {
    const star = e.target.closest('[data-value]');
    if (!star || !reviewRating) return;
    const val = Number(star.dataset.value);
    reviewRating.value = String(val);
    updateStarPicker(val);
  });

  reviewStarPicker?.addEventListener('keydown', (e) => {
    const current = Number(reviewRating?.value || 5);
    let next = current;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { next = Math.min(5, current + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { next = Math.max(1, current - 1); }
    else if (e.key === 'Home') { next = 1; }
    else if (e.key === 'End') { next = 5; }
    else return;
    e.preventDefault();
    if (reviewRating) reviewRating.value = String(next);
    updateStarPicker(next);
    const target = reviewStarPicker.querySelector(`[data-value="${next}"]`);
    if (target) target.focus();
  });

  reviewContent?.addEventListener('input', () => {
    if (!reviewContentCount) return;
    const len = (reviewContent.value || '').length;
    reviewContentCount.textContent = String(len);
    reviewContentCount.classList.toggle('review-char-count--danger', len >= 1950);
    reviewContentCount.classList.toggle('review-char-count--warn', len >= 1800 && len < 1950);
  });

  reviewForm?.addEventListener('submit', submitReview);
  reviewDelete?.addEventListener('click', removeReview);

  // Mobile sticky bar
  initMobileStickyBar();
};

const initMobileStickyBar = () => {
  const stickyPrice = document.getElementById('sticky-price');
  const stickyOriginal = document.getElementById('sticky-original');
  const stickyAddCart = document.getElementById('sticky-add-cart');

  const syncStickyPrice = () => {
    if (stickyPrice) stickyPrice.textContent = formatMoney(getDisplayPrice());
    if (stickyOriginal) {
      const original = getDisplayOriginalPrice();
      const current = getDisplayPrice();
      if (original > current) { stickyOriginal.textContent = formatMoney(original); stickyOriginal.classList.remove('hidden'); }
      else { stickyOriginal.classList.add('hidden'); }
    }
  };

  if (stickyAddCart) { stickyAddCart.addEventListener('click', () => addToCart()); }

  initStickyBar({ observeButton: addToCartButton, onPriceSync: syncStickyPrice });

  // Re-sync sticky price when main price elements change (variant switch, flash sale)
  const priceObserver = new MutationObserver(() => syncStickyPrice());
  const priceNode = document.getElementById('game-price');
  const originalNode = document.getElementById('game-original-price');
  if (priceNode) priceObserver.observe(priceNode, { childList: true });
  if (originalNode) priceObserver.observe(originalNode, { childList: true });
};

init();
