import { apiGet } from '../core/http.js';
import { formatMoney, escapeHtml } from '../core/format.js';
import { gameCardFeatured, skeletonCard } from '../core/templates.js';
import { addToCartAction, buyNowAction } from '../core/cart-helpers.js';
import { initShell, syncLucide, renderI18n } from '../core/shell.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';

const bestSellersSection = document.getElementById('best-sellers');
const bestSellersGrid =
  bestSellersSection?.querySelector('.featured-grid') ||
  bestSellersSection?.querySelector('.grid.grid-cols-1.gap-6');
const featuredGamesById = new Map();


const setupRevealAnimation = () => {
  const revealElements = document.querySelectorAll('.reveal');
  if (!revealElements.length) {
    return;
  }

  // Respect prefers-reduced-motion: reveal elements immediately without
  // animating. CSS @media rule also kills the .reveal transition, but
  // marking .active here keeps the JS contract consistent.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealElements.forEach((el) => el.classList.add('active'));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  revealElements.forEach((element) => revealObserver.observe(element));
};

const setupSmoothAnchors = () => {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
};

const renderBestSellers = (games) => {
  if (!bestSellersGrid || !games.length) {
    return;
  }

  games.forEach((game) => {
    featuredGamesById.set(game.id, game);
  });

  bestSellersGrid.innerHTML = games.slice(0, 4).map(gameCardFeatured).join('');

  syncLucide();
  renderI18n();
  setupRevealAnimation();
};

const addToCart = async (gameId, button) => {
  const game = featuredGamesById.get(gameId);
  if (game?.hasVariants) {
    window.location.href = `game-detail.html?slug=${encodeURIComponent(game.slug)}`;
    return;
  }
  await addToCartAction({ gameId, button, game, useLucideIcons: true, successTimeout: 1300 });
};

const bindAddToCartEvents = () => {
  document.body.addEventListener('click', (event) => {
    const cartButton = event.target.closest('button[data-action="add-to-cart"]');
    if (cartButton) {
      event.preventDefault();
      const gameId = cartButton.getAttribute('data-game-id');
      if (gameId) addToCart(gameId, cartButton);
      return;
    }

    const buyNowButton = event.target.closest('button[data-action="buy-now"]');
    if (buyNowButton) {
      event.preventDefault();
      const gameId = buyNowButton.getAttribute('data-game-id');
      if (!gameId) return;
      const game = featuredGamesById.get(gameId);
      if (game?.hasVariants) {
        window.location.href = `game-detail.html?slug=${encodeURIComponent(game.slug)}`;
        return;
      }
      buyNowAction({ gameId, game, button: buyNowButton });
    }
  });
};

const startCountdown = (endsAt) => {
  const container = document.getElementById('flash-sale-countdown');
  if (!container) return;

  const pad = (n) => String(n).padStart(2, '0');
  let intervalId;

  const render = () => {
    const remaining = Math.max(0, new Date(endsAt).getTime() - Date.now());
    if (remaining <= 0) {
      container.innerHTML = `<span class="font-mono text-coral text-sm">${t('flash_sale_ended', 'SALE ENDED')}</span>`;
      clearInterval(intervalId);
      return;
    }

    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    container.innerHTML = `
      <div class="countdown-unit"><span class="countdown-unit__value">${pad(hours)}</span><span class="countdown-unit__label">${t('flash_hours', 'Hours')}</span></div>
      <span class="countdown-separator">:</span>
      <div class="countdown-unit"><span class="countdown-unit__value">${pad(minutes)}</span><span class="countdown-unit__label">${t('flash_min', 'Min')}</span></div>
      <span class="countdown-separator">:</span>
      <div class="countdown-unit"><span class="countdown-unit__value">${pad(seconds)}</span><span class="countdown-unit__label">${t('flash_sec', 'Sec')}</span></div>
    `;
  };

  render();
  intervalId = setInterval(render, 1000);
};

const activateTab = (selectedBtn, allBtns, panels) => {
  allBtns.forEach(btn => {
    btn.setAttribute('aria-selected', 'false');
    btn.classList.remove('active');
  });
  selectedBtn.setAttribute('aria-selected', 'true');
  selectedBtn.classList.add('active');

  const targetPanel = document.getElementById(selectedBtn.getAttribute('aria-controls'));
  panels.forEach(panel => {
    if (panel === targetPanel) {
      panel.removeAttribute('hidden');
      panel.classList.add('active');
    } else {
      panel.setAttribute('hidden', '');
      panel.classList.remove('active');
    }
  });
};

const initTabbedDiscovery = async () => {
  const tabBar = document.querySelector('[role="tablist"]');
  if (!tabBar) return;

  const tabButtons = tabBar.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('.tabbed-discovery__panel');
  const trendingGrid = document.getElementById('trending-grid');
  const flashGrid = document.getElementById('flash-sale-grid');
  const newlyAddedGrid = document.getElementById('newly-added-grid');
  const dealsGrid = document.getElementById('deals-grid');

  // Render skeletons in trending panel
  const skeletonHTML = Array.from({ length: 4 }, skeletonCard).join('');
  if (trendingGrid) trendingGrid.innerHTML = skeletonHTML;

  // Fetch all data in parallel
  const [trendingRes, flashRes, newlyAddedRes, dealsRes] = await Promise.all([
    apiGet('/games?limit=4&sortBy=soldCount&sortOrder=desc').catch(() => null),
    apiGet('/games/flash-sales').catch(() => null),
    apiGet('/games?limit=4&sortBy=createdAt&sortOrder=desc').catch(() => null),
    apiGet('/games?deals=true&limit=4&sortBy=discount&sortOrder=desc').catch(() => null),
  ]);

  // --- Trending ---
  const trendingGames = trendingRes?.data || [];
  if (trendingGames.length && trendingGrid) {
    trendingGrid.innerHTML = trendingGames.slice(0, 4).map(gameCardFeatured).join('');
    trendingGames.forEach(g => { if (!featuredGamesById.has(g.id)) featuredGamesById.set(g.id, g); });
  } else if (!trendingGames.length) {
    const trendingTab = document.getElementById('tab-trending');
    if (trendingTab) trendingTab.style.display = 'none';
  }

  // --- Flash Sale ---
  const flashSales = Array.isArray(flashRes?.data) ? flashRes.data : [];
  if (flashSales.length && flashGrid) {
    const flashTab = document.getElementById('tab-flash');
    if (flashTab) flashTab.style.display = '';

    const games = flashSales.map((sale) => ({
      ...sale.game,
      flashSale: {
        id: sale.id,
        discountPercent: sale.discountPercent,
        flashPrice: sale.flashPrice,
        startsAt: sale.startsAt,
        endsAt: sale.endsAt,
        bannerText: sale.bannerText,
        isLive: true,
      },
    }));

    flashGrid.innerHTML = games.slice(0, 4).map(gameCardFeatured).join('');
    flashGrid.querySelectorAll('.game-card').forEach(card => card.classList.add('game-card--flash'));

    // Start countdown using earliest end time
    const earliestEnd = flashSales.reduce((min, s) => {
      const end = new Date(s.endsAt).getTime();
      return end < min ? end : min;
    }, Infinity);
    if (earliestEnd !== Infinity) {
      startCountdown(new Date(earliestEnd).toISOString());
    }
  } else {
    const flashTab = document.getElementById('tab-flash');
    if (flashTab) flashTab.style.display = 'none';
  }

  // --- Newly Added ---
  const newlyAddedGames = newlyAddedRes?.data || [];
  if (newlyAddedGames.length && newlyAddedGrid) {
    newlyAddedGrid.innerHTML = newlyAddedGames.slice(0, 4).map(gameCardFeatured).join('');
    newlyAddedGames.forEach(g => { if (!featuredGamesById.has(g.id)) featuredGamesById.set(g.id, g); });
  } else {
    const newlyAddedTab = document.getElementById('tab-newly-added');
    if (newlyAddedTab) newlyAddedTab.style.display = 'none';
  }

  // --- Deals ---
  const dealsGames = dealsRes?.data || [];
  if (dealsGames.length && dealsGrid) {
    dealsGrid.innerHTML = dealsGames.slice(0, 4).map(gameCardFeatured).join('');
    dealsGames.forEach(g => { if (!featuredGamesById.has(g.id)) featuredGamesById.set(g.id, g); });
  } else {
    const dealsTab = document.getElementById('tab-deals');
    if (dealsTab) dealsTab.style.display = 'none';
  }

  syncLucide();
  renderI18n();

  // If the default tab (Trending) was hidden, activate the first visible tab
  const activeTab = tabBar.querySelector('[aria-selected="true"]');
  if (activeTab && activeTab.style.display === 'none') {
    const firstVisible = tabBar.querySelector('[role="tab"]:not([style*="display: none"])');
    if (firstVisible) {
      activateTab(firstVisible, tabButtons, panels);
    }
  }

  // --- Tab click handler ---
  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn || btn.getAttribute('aria-selected') === 'true') return;
    activateTab(btn, tabButtons, panels);
  });

  // --- Keyboard navigation ---
  tabBar.addEventListener('keydown', (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn) return;
    const visibleBtns = [...tabButtons].filter(b => b.style.display !== 'none');
    const idx = visibleBtns.indexOf(btn);
    let nextBtn = null;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextBtn = visibleBtns[idx + 1] || visibleBtns[0];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextBtn = visibleBtns[idx - 1] || visibleBtns[visibleBtns.length - 1];
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextBtn = visibleBtns[0];
    } else if (e.key === 'End') {
      e.preventDefault();
      nextBtn = visibleBtns[visibleBtns.length - 1];
    }

    if (nextBtn) {
      activateTab(nextBtn, tabButtons, panels);
      nextBtn.focus();
    }
  });

  setupRevealAnimation();
};

const loadBestSellers = async () => {
  if (!bestSellersGrid) {
    return;
  }

  try {
    const response = await apiGet('/games?productType=GIFT_CARD&sortBy=soldCount&sortOrder=desc&limit=4');
    const giftCards = Array.isArray(response?.data) ? response.data : [];
    if (giftCards.length) {
      renderBestSellers(giftCards);
      return;
    }
    // Fallback to featured if no gift cards yet
    const fallback = await apiGet('/games/featured');
    const games = Array.isArray(fallback?.data) ? fallback.data : [];
    if (games.length) {
      renderBestSellers(games);
      return;
    }
    // No gift cards or featured products found
  } catch (error) {
    // Gift cards request failed

    const cards = bestSellersGrid.querySelectorAll('.game-card');
    cards.forEach((card) => {
      const title = card.querySelector('h3');
      const button = card.querySelector('button');
      if (title) {
        title.textContent = t('load_failed_title', 'Unable to load products');
      }
      if (button) {
        button.textContent = t('try_again_later', 'TRY AGAIN LATER');
        button.setAttribute('disabled', 'disabled');
        button.classList.add('opacity-60', 'cursor-not-allowed');
      }
    });

    if (window.location.hostname !== 'localhost') {
      showToast(t('toast_product_data_stale', 'Product data could not be loaded. Refresh after clearing stale site data if needed.'), 'error');
    }
  }
};

const initHeroSearch = () => {
  const input = document.getElementById('hero-search-input');
  const dropdown = document.getElementById('hero-search-dropdown');
  if (!input || !dropdown) return;

  let debounce;
  input.addEventListener('input', (e) => {
    clearTimeout(debounce);
    const q = e.target.value.trim();
    if (!q) {
      dropdown.style.display = 'none';
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    debounce = setTimeout(async () => {
      try {
        const data = await apiGet(`/games?search=${encodeURIComponent(q)}&limit=6`);
        dropdown.innerHTML = (data?.data || []).map(g => `
          <a href="/game-detail.html?slug=${encodeURIComponent(g.slug)}" class="search-dropdown__item" role="option" aria-selected="false">
            <img loading="lazy" src="${escapeHtml(g.coverImage || '/assets/placeholder-game.png')}" alt="">
            <span class="search-dropdown__title">${escapeHtml(g.title)}</span>
            <span class="search-dropdown__price">${g.price ? formatMoney(g.price) : ''}</span>
          </a>
        `).join('') || `<div class="search-dropdown__empty">${t('search_no_results', 'No results')}</div>`;
        dropdown.style.display = 'block';
        input.setAttribute('aria-expanded', 'true');
      } catch {
        dropdown.innerHTML = `<div class="search-dropdown__empty">${t('search_error', 'Unable to search')}</div>`;
        dropdown.style.display = 'block';
        input.setAttribute('aria-expanded', 'true');
      }
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      input.setAttribute('aria-expanded', 'false');
      input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
      input.setAttribute('aria-expanded', 'false');
    }
  });
};

// ─── Platform Tabs ──────────────────────────────────────────────────────────

const PLATFORM_CONFIG = [
  { id: 'steam', label: 'Steam', icon: 'gamepad-2', color: '#1b2838' },
  { id: 'xbox', label: 'Xbox', icon: 'gamepad-2', color: '#107c10' },
  { id: 'playstation', label: 'PlayStation', icon: 'gamepad-2', color: '#003791' },
  { id: 'nintendo', label: 'Nintendo', icon: 'gamepad-2', color: '#e60012' },
  { id: 'epic', label: 'Epic Games', icon: 'gamepad-2', color: '#313131' },
];

const initPlatformTabs = async () => {
  const tabBar = document.getElementById('platform-tab-bar');
  if (!tabBar) return;

  const tabButtons = tabBar.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('#platform-tabs-section .tabbed-discovery__panel');

  // Render skeletons in default panel
  const skeletonHTML = Array.from({ length: 4 }, skeletonCard).join('');
  PLATFORM_CONFIG.forEach(({ id }) => {
    const grid = document.getElementById(`plat-grid-${id}`);
    if (grid) grid.innerHTML = skeletonHTML;
  });

  // Fetch all platforms in parallel
  const results = await Promise.all(
    PLATFORM_CONFIG.map(({ label }) =>
      apiGet(`/games?platform=${encodeURIComponent(label)}&limit=4&sortBy=soldCount&sortOrder=desc`).catch(() => null)
    )
  );

  PLATFORM_CONFIG.forEach(({ id, label }, i) => {
    const grid = document.getElementById(`plat-grid-${id}`);
    if (!grid) return;
    const games = results[i]?.data || [];
    if (games.length) {
      grid.innerHTML = games.slice(0, 4).map(gameCardFeatured).join('');
      games.forEach(g => { if (!featuredGamesById.has(g.id)) featuredGamesById.set(g.id, g); });
    } else {
      // Hide tab if no products
      const tab = document.getElementById(`plat-tab-${id}`);
      if (tab) tab.style.display = 'none';
      grid.innerHTML = '';
    }
  });

  syncLucide();
  renderI18n();

  // Activate first visible tab if default is hidden
  const activeTab = tabBar.querySelector('[aria-selected="true"]');
  if (activeTab && activeTab.style.display === 'none') {
    const firstVisible = tabBar.querySelector('[role="tab"]:not([style*="display: none"])');
    if (firstVisible) activateTab(firstVisible, tabButtons, panels);
  }

  // Click handler
  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn || btn.getAttribute('aria-selected') === 'true') return;
    activateTab(btn, tabButtons, panels);
  });

  // Keyboard nav
  tabBar.addEventListener('keydown', (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn) return;
    const visibleBtns = [...tabButtons].filter(b => b.style.display !== 'none');
    const idx = visibleBtns.indexOf(btn);
    let nextBtn = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault(); nextBtn = visibleBtns[idx + 1] || visibleBtns[0];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); nextBtn = visibleBtns[idx - 1] || visibleBtns[visibleBtns.length - 1];
    } else if (e.key === 'Home') {
      e.preventDefault(); nextBtn = visibleBtns[0];
    } else if (e.key === 'End') {
      e.preventDefault(); nextBtn = visibleBtns[visibleBtns.length - 1];
    }
    if (nextBtn) { activateTab(nextBtn, tabButtons, panels); nextBtn.focus(); }
  });

  setupRevealAnimation();
};

const init = async () => {
  if (!(await initShell())) {
    return;
  }
  setupRevealAnimation();
  setupSmoothAnchors();
  bindAddToCartEvents();
  initHeroSearch();
  initTabbedDiscovery();
  loadBestSellers();
  initPlatformTabs();
};

init();
