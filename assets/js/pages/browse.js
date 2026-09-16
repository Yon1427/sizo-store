import { apiGet } from '../core/http.js';
import { formatMoney, escapeHtml } from '../core/format.js';
import { gameCardBrowse } from '../core/templates.js';
import { debounce } from '../core/utils.js';
import { addToCartAction, buyNowAction } from '../core/cart-helpers.js';
import { addToWishlist, removeFromWishlist } from '../core/wishlist-helpers.js';
import { initShell, syncLucide, renderI18n } from '../core/shell.js';
import { isAuthenticated } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';

const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const clearFiltersButton = document.getElementById('clear-filters');
const gridViewButton = document.getElementById('grid-view');
const listViewButton = document.getElementById('list-view');
const gamesGrid = document.getElementById('games-grid');
const categoryFiltersRoot = document.getElementById('category-filters');
const resultsCount = document.getElementById('results-count');
const activeFiltersRoot = document.getElementById('active-filters');
const priceMinInput = document.getElementById('price-min');
const priceMaxInput = document.getElementById('price-max');
const priceRangeInput = document.getElementById('price-range');
const platformFiltersRoot = document.getElementById('platform-filters');
const regionFiltersRoot = document.getElementById('region-filters');
const searchStatusEl = document.getElementById('search-status');
const loadMoreRoot = document.getElementById('load-more');
const loadMoreButton = loadMoreRoot?.querySelector('button');
const PAGE_SIZE = 32;
const gamesById = new Map();
const wishlistGameIds = new Set();
const catalogState = {
  serverGames: [],
  total: 0,
  page: 1,
  loadingMore: false,
  loading: false,
};


const getSortOptions = (sortKey) => {
  const map = {
    popular: { sortBy: 'soldCount', sortOrder: 'desc' },
    discount: { sortBy: 'discountPercent', sortOrder: 'desc' },
    new: { sortBy: 'createdAt', sortOrder: 'desc' },
    'price-low': { sortBy: 'price', sortOrder: 'asc' },
    'price-high': { sortBy: 'price', sortOrder: 'desc' },
    rating: { sortBy: 'rating', sortOrder: 'desc' },
  };

  return map[sortKey] || map.popular;
};

const categoryFilterTemplate = (category) => `
  <label class="filter-option">
    <input type="radio" name="category-filter" value="${escapeHtml(category.slug || '')}">
    ${escapeHtml(category.name || 'Category')}
  </label>
`;

const platformFilterTemplate = (platform) => `
  <label class="filter-option">
    <input type="checkbox" name="platform-filter" value="${escapeHtml(platform)}">
    ${escapeHtml(platform)}
  </label>
`;


const regionFilterTemplate = (region) => `
  <label class="filter-option">
    <input type="checkbox" name="region-filter" value="${escapeHtml(region)}">
    ${escapeHtml(region)}
  </label>
`;

const setResultCount = (total, serverTotal) => {
  if (!resultsCount) return;
  if (serverTotal && serverTotal > total) {
    resultsCount.textContent = `${total} of ${serverTotal}`;
  } else {
    resultsCount.textContent = `${total}`;
  }
};

const getSelectedRegions = () =>
  Array.from(regionFiltersRoot?.querySelectorAll('input[name="region-filter"]:checked') || []).map((input) => input.value);

const getSelectedPlatforms = () =>
  Array.from(platformFiltersRoot?.querySelectorAll('input[name="platform-filter"]:checked') || []).map((input) => input.value);

const setViewMode = (mode) => {
  if (!gamesGrid || !gridViewButton || !listViewButton) {
    return;
  }

  if (mode === 'list') {
    listViewButton.classList.add('active');
    listViewButton.setAttribute('aria-pressed', 'true');
    gridViewButton.classList.remove('active');
    gridViewButton.setAttribute('aria-pressed', 'false');
    gamesGrid.className = 'browse-grid browse-grid--list';
    return;
  }

  gridViewButton.classList.add('active');
  gridViewButton.setAttribute('aria-pressed', 'true');
  listViewButton.classList.remove('active');
  listViewButton.setAttribute('aria-pressed', 'false');
  gamesGrid.className = 'browse-grid';
};

const readQueryState = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get('search') || '',
    category: params.get('category') || '',
    productType: params.get('productType') || '',
    deals: params.get('deals') === 'true',
    minPrice: params.get('minPrice') || '',
    maxPrice: params.get('maxPrice') || '',
    platforms: params.get('platforms') ? params.get('platforms').split(',').filter(Boolean) : (params.get('platform') ? [params.get('platform')] : []),
    regions: params.get('regions') ? params.get('regions').split(',').filter(Boolean) : (params.get('region') ? [params.get('region')] : []),
    sort: params.get('sort') || 'popular',
    view: params.get('view') || 'grid',
    page: Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1),
  };
};

const syncInputsFromQuery = (state) => {
  if (searchInput) {
    searchInput.value = state.search;
  }

  if (sortSelect && state.sort) {
    sortSelect.value = state.sort;
  }

  if (priceMinInput) {
    priceMinInput.value = state.minPrice;
  }

  if (priceMaxInput) {
    priceMaxInput.value = state.maxPrice;
  }

  if (priceRangeInput) {
    priceRangeInput.value = state.maxPrice || priceRangeInput.max || '10000';
  }

  if (categoryFiltersRoot) {
    categoryFiltersRoot.querySelectorAll('input[name="category-filter"]').forEach((input) => {
      input.checked = input.value === state.category;
    });
  }

  if (platformFiltersRoot) {
    platformFiltersRoot.querySelectorAll('input[name="platform-filter"]').forEach((input) => {
      input.checked = state.platforms.includes(input.value);
    });
  }

  if (regionFiltersRoot) {
    regionFiltersRoot.querySelectorAll('input[name="region-filter"]').forEach((input) => {
      input.checked = state.regions.includes(input.value);
    });
  }

  setViewMode(state.view);
};

const pushState = (state) => {
  const params = new URLSearchParams();

  if (state.search) {
    params.set('search', state.search);
  }

  if (state.category) {
    params.set('category', state.category);
  }

  if (state.productType) {
    params.set('productType', state.productType);
  }

  if (state.deals) {
    params.set('deals', 'true');
  }

  if (state.minPrice) {
    params.set('minPrice', state.minPrice);
  }

  if (state.maxPrice) {
    params.set('maxPrice', state.maxPrice);
  }

  if (state.platforms?.length) {
    params.set('platforms', state.platforms.join(','));
  }

  if (state.regions?.length) {
    params.set('regions', state.regions.join(','));
  }

  if (state.sort && state.sort !== 'popular') {
    params.set('sort', state.sort);
  }

  if (state.view && state.view !== 'grid') {
    params.set('view', state.view);
  }

  if (state.page && Number(state.page) > 1) {
    params.set('page', String(state.page));
  }

  const nextUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
  window.history.replaceState({}, '', nextUrl);
};

const applyClientFilters = (games, state) => {
  const minPrice = Number(state.minPrice || 0);
  const maxPrice = Number(state.maxPrice || 0);

  return games.filter((game) => {
    const displayPrice = Number(game.startingPrice || game.price || 0);

    if (Number.isFinite(minPrice) && minPrice > 0 && displayPrice < minPrice) {
      return false;
    }

    if (Number.isFinite(maxPrice) && maxPrice > 0 && displayPrice > maxPrice) {
      return false;
    }

    return true;
  });
};

const renderActiveFilters = (state) => {
  if (!activeFiltersRoot) {
    return;
  }

  const filters = [];

  if (state.search) {
    filters.push({ key: 'search', label: t('filter_search_label', 'Search:') + ' ' + state.search });
  }

  if (state.category) {
    filters.push({ key: 'category', label: t('filter_category_label', 'Category:') + ' ' + state.category });
  }

  if (state.productType) {
    const typeLabels = { GIFT_CARD: t('filter_type_gift_card', 'Gift Cards'), TOP_UP: t('filter_type_top_up', 'Top-Ups'), GAME_KEY: t('filter_type_game_key', 'Game Keys') };
    filters.push({ key: 'productType', label: `Type: ${typeLabels[state.productType] || state.productType}` });
  }

  if (state.deals) {
    filters.push({ key: 'deals', label: t('filter_deals', 'Deals only') });
  }

  if (state.sort && state.sort !== 'popular') {
    const sortLabels = {
      discount: t('sort_discount', 'Biggest Discount'),
      new: t('sort_new', 'Newest'),
      'price-low': t('sort_price_low', 'Price: Low → High'),
      'price-high': t('sort_price_high', 'Price: High → Low'),
      rating: t('sort_rating', 'Top Rated'),
    };
    filters.push({ key: 'sort', label: `${t('filter_sort_label', 'Sort:')} ${sortLabels[state.sort] || state.sort}` });
  }

  if (state.minPrice || state.maxPrice) {
    filters.push({ key: 'price', label: `Price: ${state.minPrice || '0'} - ${state.maxPrice || t('filter_price_any', 'Any')}` });
  }

  (state.platforms || []).forEach((platform) => {
    filters.push({ key: `platform:${platform}`, label: `Platform: ${platform}` });
  });

  (state.regions || []).forEach((region) => {
    filters.push({ key: `region:${region}`, label: `${t('filter_region_label', 'Region:')} ${region}` });
  });

  activeFiltersRoot.innerHTML = filters
    .map(
      (filter) => `
        <span class="filter-tag">
          ${escapeHtml(filter.label)}
          <button type="button" data-clear-filter="${escapeHtml(filter.key)}" aria-label="Remove ${escapeHtml(filter.label)}">&times;</button>
        </span>
      `
    )
    .join('');

  // Update filter toggle badge
  const toggleBtn = document.getElementById('filter-toggle-btn');
  if (toggleBtn) {
    const drawerFilters = filters.filter((f) => !f.key.startsWith('search'));
    const count = drawerFilters.length;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" x2="20" y1="6" y2="6"/><line x1="7" x2="17" y1="12" y2="12"/><line x1="10" x2="14" y1="18" y2="18"/></svg>';
    toggleBtn.innerHTML = count > 0
      ? `${svg} Filters <span class="filter-count-badge">${count}</span>`
      : `${svg} Filters`;
    toggleBtn.setAttribute('aria-label', count > 0
      ? `Filters (${count} active)`
      : 'Filters');
  }
};

const fetchGames = async (state) => {
  const sort = getSortOptions(state.sort);
  const params = new URLSearchParams({
    page: String(Math.max(1, Number(state.page || 1))),
    limit: String(PAGE_SIZE),
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
  });

  if (state.search) {
    params.set('search', state.search);
  }

  if (state.category) {
    params.set('category', state.category);
  }

  if (state.deals) {
    params.set('isDiscounted', 'true');
  }

  if (state.productType) {
    params.set('productType', state.productType);
  }

  if (state.platforms?.length) {
    params.set('platforms', state.platforms.join(','));
  }

  if (state.regions?.length) {
    params.set('regions', state.regions.join(','));
  }

  if (state.minPrice) {
    params.set('minPrice', state.minPrice);
  }

  if (state.maxPrice) {
    params.set('maxPrice', state.maxPrice);
  }

  const response = await apiGet(`/games?${params.toString()}`);
  return {
    games: Array.isArray(response?.data) ? response.data : [],
    total: Number(response?.meta?.total || 0),
  };
};

const loadCategories = async () => {
  if (!categoryFiltersRoot) {
    return;
  }

  try {
    const response = await apiGet('/games/categories');
    const categories = Array.isArray(response?.data) ? response.data : [];
    if (!categories.length) {
      return;
    }

    categoryFiltersRoot.innerHTML = [
      `
        <label class="filter-option">
          <input type="radio" name="category-filter" value="" checked>
          All Categories
        </label>
      `,
      ...categories.slice(0, 12).map(categoryFilterTemplate),
    ].join('');
  } catch {
    // Keep fallback category filters.
  }
};

const loadPriceRange = async () => {
  try {
    const response = await apiGet('/games?limit=1&sortBy=price&sortOrder=desc');
    const maxPrice = response?.data?.[0]?.price;
    if (maxPrice && Number(maxPrice) > 0) {
      const roundedMax = Math.ceil(Number(maxPrice) / 1000) * 1000;
      if (priceRangeInput) priceRangeInput.max = String(roundedMax);
      if (priceMaxInput) priceMaxInput.placeholder = String(roundedMax);
    }
  } catch {
    // Keep defaults
  }
};

const loadPlatforms = async () => {
  if (!platformFiltersRoot) {
    return;
  }

  try {
    const response = await apiGet('/games/platforms');
    const platforms = Array.isArray(response?.data) ? response.data : [];
    if (!platforms.length) {
      // Keep fallback static checkboxes if present
      return;
    }

    const state = readQueryState();
    platformFiltersRoot.innerHTML = platforms
      .map((platform) => {
        const checked = state.platforms.includes(platform) ? ' checked' : '';
        return platformFilterTemplate(platform).replace('<input ', `<input${checked} `);
      })
      .join('');
  } catch {
    // Keep any fallback platform filters.
  }
};

const loadRegions = async () => {
  if (!regionFiltersRoot) {
    return;
  }

  try {
    const response = await apiGet('/games/regions');
    const regions = Array.isArray(response?.data) ? response.data : [];
    if (!regions.length) {
      return;
    }

    const state = readQueryState();
    regionFiltersRoot.innerHTML = regions
      .map((region) => {
        const checked = state.regions.includes(region) ? ' checked' : '';
        return regionFilterTemplate(region).replace('<input ', `<input${checked} `);
      })
      .join('');
  } catch {
    // Region filter unavailable.
  }
};

const loadWishlist = async () => {
  wishlistGameIds.clear();

  if (!isAuthenticated()) {
    return;
  }

  try {
    const response = await apiGet('/wishlist', true);
    const items = Array.isArray(response?.data?.items) ? response.data.items : [];
    items.forEach((item) => {
      const gameId = item?.game?.id;
      if (gameId) {
        wishlistGameIds.add(gameId);
      }
    });
  } catch {
    // Keep wishlist UI non-blocking.
  }
};

const renderSkeletonCards = (count = 8) => {
  if (!gamesGrid) return;
  gamesGrid.setAttribute('aria-busy', 'true');
  gamesGrid.innerHTML = Array.from({ length: count })
    .map(
      () => `
        <div class="game-card game-card--skeleton" aria-hidden="true">
          <div class="card-image skeleton-surface"></div>
          <div class="game-card__body">
            <div class="skeleton-line" style="width:55%;height:10px"></div>
            <div class="skeleton-line" style="width:85%;height:14px;margin-top:10px"></div>
            <div class="skeleton-line" style="width:70%;height:10px;margin-top:8px"></div>
            <div class="skeleton-line" style="width:40%;height:16px;margin-top:14px"></div>
          </div>
        </div>
      `
    )
    .join('');
};

const renderEmptyState = (state) => {
  if (!gamesGrid) return;
  const hasSearch = Boolean(state.search);
  const hasFilters = hasSearch || state.category || state.productType || state.deals
    || state.minPrice || state.maxPrice || (state.platforms?.length > 0) || (state.regions?.length > 0);

  const suggestionChips = ['PlayStation', 'Steam', 'PUBG', 'Free Fire', 'Xbox', 'Robux']
    .map(
      (term) => `
        <button type="button" class="suggestion-chip" data-suggest="${escapeHtml(term)}">
          ${escapeHtml(term)}
        </button>
      `
    )
    .join('');

  const heading = hasSearch
    ? `${t('browse_empty_no_matches', 'No matches for')} "${escapeHtml(state.search)}"`
    : hasFilters
      ? t('browse_empty_no_products_filter', 'No products match your filters')
      : t('browse_empty_no_products_yet', 'No products available yet');

  const body = hasFilters
    ? t('browse_empty_try_adjusting', 'Try adjusting or clearing your filters. Here are some popular searches:')
    : t('browse_empty_check_back', "Check back soon — we're adding new products regularly.");

  const clearAllLabel = t('browse_empty_clear_all', 'CLEAR ALL FILTERS');

  gamesGrid.innerHTML = `
    <div class="browse-grid__empty flex-col items-center justify-center py-16 text-center" role="status">
      <svg aria-hidden="true" class="mb-4" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="7"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <h3 class="font-display text-xl font-bold text-[var(--text-primary)] mb-2" tabindex="-1" id="empty-state-heading">${heading}</h3>
      <p class="text-[var(--muted)] mb-5 max-w-sm text-sm">${body}</p>
      ${hasFilters ? `<div class="flex flex-wrap justify-center gap-2 mb-6 max-w-md">${suggestionChips}</div>
      <button
        id="empty-state-clear-filters"
        class="btn-cyber btn-primary px-6 py-2 font-display text-sm font-bold"
      >${clearAllLabel}</button>` : ''}
    </div>`;

  // Move focus to the empty state heading so screen readers announce it
  const headingEl = document.getElementById('empty-state-heading');
  if (headingEl) {
    requestAnimationFrame(() => headingEl.focus());
  }
};

const renderGames = (games) => {
  if (!gamesGrid) {
    return;
  }

  gamesById.clear();
  games.forEach((game) => {
    gamesById.set(game.id, game);
  });

  gamesGrid.removeAttribute('aria-busy');

  if (!games.length) {
    renderEmptyState(readQueryState());
    if (searchStatusEl) searchStatusEl.textContent = t('search_no_results', 'No games found');
    return;
  }

  gamesGrid.innerHTML = games.map((game) => gameCardBrowse(game, wishlistGameIds)).join('');
  syncLucide();
  renderI18n();
  renderItemListJsonLd(games);

  if (searchStatusEl) {
    searchStatusEl.textContent = `${games.length} ${games.length !== 1 ? t('search_results_found', 'games found') : t('search_result_found', 'game found')}`;
  }
};

const updateLoadMore = (visibleCount, total) => {
  if (!loadMoreRoot || !loadMoreButton) {
    return;
  }

  const hasMore = visibleCount < total;

  // Update or create "showing X of Y" label above the button
  let label = loadMoreRoot.querySelector('.load-more__label');
  if (!label) {
    label = document.createElement('p');
    label.className = 'load-more__label';
    loadMoreRoot.insertBefore(label, loadMoreButton);
  }
  label.textContent = total > 0
    ? t('browse_showing_of', 'Showing {count} of {total} products').replace('{count}', visibleCount).replace('{total}', total.toLocaleString())
    : '';

  loadMoreRoot.classList.toggle('hidden', !hasMore);
  loadMoreRoot.hidden = !hasMore;
  loadMoreButton.disabled = catalogState.loadingMore;
  loadMoreButton.textContent = catalogState.loadingMore
    ? t('browse_loading', 'LOADING...')
    : t('browse_load_more', 'LOAD MORE');
};

const renderItemListJsonLd = (games) => {
  let el = document.getElementById('jsonld-item-list');
  if (!el && document.head) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'jsonld-item-list';
    document.head.appendChild(el);
  }
  if (!el) return;

  const itemList = games.slice(0, 20).map((game, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: game.title,
    url: `https://sizo.uk/game-detail.html?slug=${encodeURIComponent(game.slug)}`,
    image: game.coverImage,
    offers: {
      '@type': 'Offer',
      price: game.price ?? 0,
      priceCurrency: 'DZD',
      availability: game.stockCount > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  }));

  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    'name': 'Browse Games — SIZO Digital Store',
    'description': t('jsonld_browse_desc', 'Digital gift cards, top-ups and game keys at SIZO.'),
    'numberOfItems': games.length,
    'itemListElement': itemList,
  });
};

const refreshList = async () => {
  const state = readQueryState();
  syncInputsFromQuery(state);
  pushState(state);

  catalogState.loading = true;
  renderSkeletonCards();

  try {
    await loadWishlist();
    const { games, total } = await fetchGames(state);
    catalogState.serverGames = games;
    catalogState.total = total;
    catalogState.page = state.page || 1;
    const filteredGames = applyClientFilters(games, state);
    renderGames(filteredGames);
    renderActiveFilters(state);
    setResultCount(filteredGames.length, total);
    updateLoadMore(filteredGames.length, total);
  } catch (error) {
    catalogState.serverGames = [];
    catalogState.total = 0;
    catalogState.page = 1;
    renderGames([]);
    renderActiveFilters(state);
    updateLoadMore(0, 0);
    showToast(error.message || 'Unable to load games', 'error');
  } finally {
    catalogState.loading = false;
  }
};

const loadMoreGames = async () => {
  if (catalogState.loadingMore) {
    return;
  }

  const state = readQueryState();
  state.page = (catalogState.page || 1) + 1;
  catalogState.loadingMore = true;
  updateLoadMore(catalogState.serverGames.length, catalogState.total);

  // Append skeleton cards at the bottom while loading
  const skeletonHtml = Array.from({ length: 4 })
    .map(() => `
      <div class="game-card game-card--skeleton" aria-hidden="true">
        <div class="card-image skeleton-surface"></div>
        <div class="game-card__body">
          <div class="skeleton-line" style="width:55%;height:10px"></div>
          <div class="skeleton-line" style="width:85%;height:14px;margin-top:10px"></div>
          <div class="skeleton-line" style="width:70%;height:10px;margin-top:8px"></div>
          <div class="skeleton-line" style="width:40%;height:16px;margin-top:14px"></div>
        </div>
      </div>
    `).join('');
  const currentHtml = gamesGrid?.innerHTML || '';
  if (gamesGrid) gamesGrid.innerHTML = currentHtml + skeletonHtml;

  try {
    const { games, total } = await fetchGames(state);
    const existingIds = new Set(catalogState.serverGames.map((game) => game.id));
    catalogState.serverGames = [
      ...catalogState.serverGames,
      ...games.filter((game) => !existingIds.has(game.id)),
    ];
    catalogState.total = total;
    catalogState.page = state.page;
    pushState(state);

    const filteredGames = applyClientFilters(catalogState.serverGames, state);
    renderGames(filteredGames);
    renderActiveFilters(state);
    setResultCount(filteredGames.length, total);
    updateLoadMore(filteredGames.length, total);
  } catch (error) {
    // Remove appended skeletons on error
    renderGames(applyClientFilters(catalogState.serverGames, readQueryState()));
    showToast(error.message || 'Unable to load more games', 'error');
  } finally {
    catalogState.loadingMore = false;
    updateLoadMore(applyClientFilters(catalogState.serverGames, readQueryState()).length, catalogState.total);
  }
};

const toggleWishlist = async (button) => {
  const gameId = button.getAttribute('data-game-id');
  if (!gameId) return;
  if (!isAuthenticated()) { ensureAuthenticated(); return; }
  const wasInWishlist = wishlistGameIds.has(gameId);
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = wasInWishlist ? 'Removing' : 'Saving';
  try {
    if (wasInWishlist) {
      const ok = await removeFromWishlist(gameId);
      if (ok) wishlistGameIds.delete(gameId);
    } else {
      const ok = await addToWishlist(gameId);
      if (ok) wishlistGameIds.add(gameId);
    }
    const state = readQueryState();
    renderGames(applyClientFilters(catalogState.serverGames, state));
  } catch (error) {
    button.textContent = originalText;
  } finally {
    button.disabled = false;
  }
};

const applyPriceFilter = () => {
  const state = readQueryState();
  let min = priceMinInput?.value?.trim() || '';
  let max = priceMaxInput?.value?.trim() || '';
  const priceError = document.getElementById('price-error');

  const minNum = Number(min);
  const maxNum = Number(max);
  if (min && max && Number.isFinite(minNum) && Number.isFinite(maxNum) && minNum > maxNum) {
    // Show inline error instead of silently swapping
    if (priceError) {
      priceError.textContent = t('price_min_max_error', 'Min price cannot be greater than max');
      priceError.hidden = false;
    }
    if (priceMinInput) priceMinInput.classList.add('error');
    if (priceMaxInput) priceMaxInput.classList.add('error');
    return;
  }

  // Clear inline error on valid input
  if (priceError) priceError.hidden = true;
  if (priceMinInput) priceMinInput.classList.remove('error');
  if (priceMaxInput) priceMaxInput.classList.remove('error');

  state.minPrice = min;
  state.maxPrice = max;
  state.page = 1;

  if (priceRangeInput && state.maxPrice) {
    priceRangeInput.value = state.maxPrice;
  }

  pushState(state);
  refreshList();
};

const addToCart = async (button) => {
  const gameId = button.getAttribute('data-game-id');
  if (!gameId) return;
  const game = gamesById.get(gameId);
  if (game?.hasVariants) {
    window.location.href = `game-detail.html?slug=${encodeURIComponent(game.slug)}`;
    return;
  }
  await addToCartAction({ gameId, button, game, successTimeout: 1100 });
};

const activateTypeTab = (btn) => {
  const filter = btn.dataset.quickFilter;
  const state = readQueryState();

  document.querySelectorAll('.type-tab').forEach((b) => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
    b.tabIndex = -1;
  });
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
  btn.tabIndex = 0;

  // Reset state that other tabs may have set
  state.deals = false;
  state.maxPrice = '';
  if (state.sort === 'discount') state.sort = 'popular';
  if (priceMaxInput) priceMaxInput.value = '';
  if (priceRangeInput) priceRangeInput.value = priceRangeInput?.max || '10000';
  if (sortSelect && state.sort === 'popular') sortSelect.value = 'popular';

  if (filter === 'all') {
    state.productType = '';
    state.page = 1;
  } else if (filter === 'gift-cards') {
    state.productType = 'GIFT_CARD';
    state.page = 1;
  } else if (filter === 'top-ups') {
    state.productType = 'TOP_UP';
    state.page = 1;
  } else if (filter === 'game-keys') {
    state.productType = 'GAME_KEY';
    state.page = 1;
  } else if (filter === 'deals') {
    state.deals = true;
    state.sort = 'discount';
    state.page = 1;
    if (sortSelect) sortSelect.value = 'discount';
  } else if (filter === 'under-1000') {
    if (priceMaxInput) priceMaxInput.value = '1000';
    state.maxPrice = '1000';
    state.page = 1;
  }

  pushState(state);
  refreshList();
};

const bindQuickFilters = () => {
  const tabs = document.querySelectorAll('[data-quick-filter]');
  const tabList = document.querySelector('.type-tabs__inner');

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => activateTypeTab(btn));
  });

  if (tabList) {
    tabList.addEventListener('keydown', (event) => {
      const current = document.activeElement;
      if (!current || !current.hasAttribute('data-quick-filter')) return;

      const items = Array.from(tabList.querySelectorAll('[data-quick-filter]'));
      const idx = items.indexOf(current);
      let next;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        next = items[(idx + 1) % items.length];
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        next = items[(idx - 1 + items.length) % items.length];
      } else if (event.key === 'Home') {
        event.preventDefault();
        next = items[0];
      } else if (event.key === 'End') {
        event.preventDefault();
        next = items[items.length - 1];
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateTypeTab(current);
        return;
      }

      if (next) {
        next.focus();
      }
    });
  }
};

const bindEvents = () => {
  bindQuickFilters();

  if (searchInput) {
    const triggerSearch = () => {
      const state = readQueryState();
      const nextTerm = searchInput.value.trim();
      if (nextTerm === state.search) return;
      state.search = nextTerm;
      state.page = 1;
      pushState(state);
      refreshList();
    };
    const debouncedSearch = debounce(triggerSearch, 450);
    searchInput.addEventListener('input', debouncedSearch);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      triggerSearch();
    });
  }

  if (sortSelect) {
    const applySort = () => {
      if (catalogState.loading) return;
      const state = readQueryState();
      const nextSort = sortSelect.value;
      if (nextSort === state.sort) return;
      state.sort = nextSort;
      state.page = 1;
      pushState(state);
      refreshList();
      if (searchStatusEl) {
        searchStatusEl.textContent = `${t('search_sorted_by', 'Sorted by')} ${sortSelect.options[sortSelect.selectedIndex]?.text || nextSort}`;
      }
    };
    const debouncedSort = debounce(applySort, 300);
    sortSelect.addEventListener('change', debouncedSort);
  }

  if (gridViewButton) {
    gridViewButton.addEventListener('click', () => {
      const state = readQueryState();
      state.view = 'grid';
      pushState(state);
      setViewMode('grid');
    });
  }

  if (listViewButton) {
    listViewButton.addEventListener('click', () => {
      const state = readQueryState();
      state.view = 'list';
      pushState(state);
      setViewMode('list');
    });
  }

  if (clearFiltersButton) {
    clearFiltersButton.addEventListener('click', () => {
      const nextState = {
        search: '',
        category: '',
        productType: '',
        deals: false,
        minPrice: '',
        maxPrice: '',
        platforms: [],
        sort: 'popular',
        view: readQueryState().view,
        page: 1,
      };
      pushState(nextState);
      if (searchInput) {
        searchInput.value = '';
      }
      if (sortSelect) {
        sortSelect.value = 'popular';
      }
      if (priceMinInput) {
        priceMinInput.value = '';
      }
      if (priceMaxInput) {
        priceMaxInput.value = '';
      }
      if (priceRangeInput) {
        priceRangeInput.value = priceRangeInput.max || '10000';
      }
      const allCategoriesInput = categoryFiltersRoot?.querySelector('input[name="category-filter"][value=""]');
      if (allCategoriesInput) {
        allCategoriesInput.checked = true;
      }
      // Reset type tabs to "All"
      document.querySelectorAll('.type-tab').forEach((tab) => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
        tab.tabIndex = -1;
      });
      const allTab = document.querySelector('.type-tab[data-quick-filter="all"]');
      if (allTab) {
        allTab.classList.add('active');
        allTab.setAttribute('aria-selected', 'true');
        allTab.tabIndex = 0;
      }
      platformFiltersRoot?.querySelectorAll('input[name="platform-filter"]').forEach((checkbox) => {
        checkbox.checked = false;
      });
      regionFiltersRoot?.querySelectorAll('input[name="region-filter"]').forEach((checkbox) => {
        checkbox.checked = false;
      });
      refreshList();
    });
  }

  if (categoryFiltersRoot) {
    categoryFiltersRoot.addEventListener('change', (event) => {
      const input = event.target.closest('input[name="category-filter"]');
      if (!input) {
        return;
      }

      const state = readQueryState();
      state.category = input.checked ? input.value : '';
      state.page = 1;
      pushState(state);
      refreshList();
    });
  }

  if (platformFiltersRoot) {
    platformFiltersRoot.addEventListener('change', (event) => {
      const input = event.target.closest('input[name="platform-filter"]');
      if (!input) return;
      const state = readQueryState();
      state.platforms = getSelectedPlatforms();
      state.page = 1;
      pushState(state);
      refreshList();
    });
  }

  if (regionFiltersRoot) {
    regionFiltersRoot.addEventListener('change', (event) => {
      const input = event.target.closest('input[name="region-filter"]');
      if (!input) return;
      const state = readQueryState();
      state.regions = getSelectedRegions();
      state.page = 1;
      pushState(state);
      refreshList();
    });
  }

  if (priceMinInput) {
    const debouncedMin = debounce(applyPriceFilter, 400);
    priceMinInput.addEventListener('input', debouncedMin);
    priceMinInput.addEventListener('change', applyPriceFilter);
  }

  if (priceMaxInput) {
    const debouncedMax = debounce(applyPriceFilter, 400);
    priceMaxInput.addEventListener('input', debouncedMax);
    priceMaxInput.addEventListener('change', applyPriceFilter);
  }

  if (priceRangeInput) {
    priceRangeInput.addEventListener('input', () => {
      if (priceMaxInput) {
        priceMaxInput.value = priceRangeInput.value;
      }
      priceRangeInput.setAttribute('aria-valuenow', priceRangeInput.value);
    });
    priceRangeInput.addEventListener('change', applyPriceFilter);
  }

  const filterToggleBtn = document.getElementById('filter-toggle-btn');
  const filterDrawer = document.getElementById('filter-drawer');

  if (filterToggleBtn && filterDrawer) {
    const openDrawer = () => {
      filterDrawer.classList.add('open');
      filterToggleBtn.setAttribute('aria-expanded', 'true');
    };
    const closeDrawer = () => {
      filterDrawer.classList.remove('open');
      filterToggleBtn.setAttribute('aria-expanded', 'false');
    };
    filterToggleBtn.addEventListener('click', () => {
      filterDrawer.classList.contains('open') ? closeDrawer() : openDrawer();
    });
    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && filterDrawer.classList.contains('open')) {
        e.preventDefault();
        closeDrawer();
      }
    });
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (filterDrawer.classList.contains('open') &&
          !filterDrawer.contains(e.target) &&
          e.target !== filterToggleBtn &&
          !filterToggleBtn.contains(e.target)) {
        closeDrawer();
      }
    });
  }

  document.body.addEventListener('click', (event) => {
    const suggestButton = event.target.closest('button[data-suggest]');
    if (suggestButton) {
      event.preventDefault();
      const term = suggestButton.getAttribute('data-suggest') || '';
      // Suggestion chips are an escape hatch from a "no results" dead end.
      // Start fresh: clear all filters and just search for the suggested term.
      const state = {
        search: term,
        category: '',
        productType: '',
        deals: false,
        minPrice: '',
        maxPrice: '',
        platforms: [],
        regions: [],
        sort: 'popular',
        view: readQueryState().view,
        page: 1,
      };
      // Reset type tabs to "All"
      document.querySelectorAll('.type-tab').forEach((tab) => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
        tab.tabIndex = -1;
      });
      const allTab = document.querySelector('.type-tab[data-quick-filter="all"]');
      if (allTab) {
        allTab.classList.add('active');
        allTab.setAttribute('aria-selected', 'true');
        allTab.tabIndex = 0;
      }
      // Uncheck all platform/region/category checkboxes
      document.querySelectorAll('input[name="platform-filter"], input[name="region-filter"]')
        .forEach((cb) => { cb.checked = false; });
      const allCat = document.querySelector('input[name="category-filter"][value=""]');
      if (allCat) allCat.checked = true;
      // Reset price inputs and slider
      if (priceMinInput) priceMinInput.value = '';
      if (priceMaxInput) priceMaxInput.value = '';
      if (priceRangeInput) priceRangeInput.value = priceRangeInput?.max || '10000';
      // Reset sort
      if (sortSelect) sortSelect.value = 'popular';
      // Push and refresh
      pushState(state);
      if (searchInput) searchInput.value = term;
      refreshList();
      return;
    }

    const emptyStateClear = event.target.closest('#empty-state-clear-filters');
    if (emptyStateClear) {
      event.preventDefault();
      clearFiltersButton?.click();
      return;
    }

    const button = event.target.closest('button[data-action="add-to-cart"]');
    const buyNowButton = event.target.closest('button[data-action="buy-now"]');
    const wishlistButton = event.target.closest('button[data-action="toggle-wishlist"]');
    const clearFilterButton = event.target.closest('button[data-clear-filter]');
    if (clearFilterButton) {
      const state = readQueryState();
      const key = clearFilterButton.getAttribute('data-clear-filter') || '';

      if (key === 'search') {
        state.search = '';
      } else if (key === 'category') {
        state.category = '';
      } else if (key === 'sort') {
        state.sort = 'popular';
      } else if (key === 'deals') {
        state.deals = false;
      } else if (key === 'productType') {
        state.productType = '';
        // Reset type tabs to "All"
        document.querySelectorAll('.type-tab').forEach((tab) => {
          tab.classList.remove('active');
          tab.setAttribute('aria-selected', 'false');
          tab.tabIndex = -1;
        });
        const allTab = document.querySelector('.type-tab[data-quick-filter="all"]');
        if (allTab) {
          allTab.classList.add('active');
          allTab.setAttribute('aria-selected', 'true');
          allTab.tabIndex = 0;
        }
      } else if (key === 'price') {
        state.minPrice = '';
        state.maxPrice = '';
      } else if (key.startsWith('platform:')) {
        state.platforms = (state.platforms || []).filter((platform) => `platform:${platform}` !== key);
      } else if (key.startsWith('region:')) {
        state.regions = (state.regions || []).filter((region) => `region:${region}` !== key);
      }

      state.page = 1;
      pushState(state);
      refreshList();
      return;
    }
    if (wishlistButton) {
      event.preventDefault();
      toggleWishlist(wishlistButton);
      return;
    }
    if (buyNowButton) {
      event.preventDefault();
      const gameId = buyNowButton.getAttribute('data-game-id');
      if (gameId) {
        const game = gamesById.get(gameId);
        if (game?.hasVariants) {
          window.location.href = `game-detail.html?slug=${encodeURIComponent(game.slug)}`;
        } else {
          buyNowAction({ gameId, game, button: buyNowButton });
        }
      }
      return;
    }
    if (!button) {
      return;
    }

    event.preventDefault();
    addToCart(button);
  });

  loadMoreButton?.addEventListener('click', () => {
    loadMoreGames();
  });

  // Scroll-to-top button
  const scrollToTopBtn = document.getElementById('scroll-to-top');
  if (scrollToTopBtn) {
    const toggleScrollToTop = () => {
      const scrolled = window.scrollY > 500;
      scrollToTopBtn.classList.toggle('visible', scrolled);
    };
    window.addEventListener('scroll', toggleScrollToTop, { passive: true });
    scrollToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

};

const init = async () => {
  if (!(await initShell())) {
    return;
  }
  bindEvents();
  await Promise.all([loadCategories(), loadPlatforms(), loadRegions(), loadPriceRange()]);
  await refreshList();
};

init();
