import { apiGet } from '../core/http.js';
import { t } from '../core/i18n.js';
import { formatMoney, escapeHtml } from '../core/format.js';
import { initShell, syncLucide } from '../core/shell.js';


const popularGrid = document.getElementById('nf-popular-grid');
const searchForm = document.getElementById('nf-search-form');
const searchInput = document.getElementById('nf-search-input');

const popularCard = (game) => {
  const price = Number(game.startingPrice || game.price || 0);
  const original = Number(game.startingOriginalPrice || game.originalPrice || 0);
  const hasDiscount = original > price;
  const hasVariants = Boolean(game.hasVariants);

  return `
    <a href="game-detail.html?slug=${encodeURIComponent(game.slug)}" class="nf-card group">
      <div class="nf-card__image">
        <img src="${escapeHtml(game.coverImage)}" alt="${escapeHtml(game.title)}" loading="lazy">
      </div>
      <div class="nf-card__body">
        <h3 class="nf-card__title">${escapeHtml(game.title)}</h3>
        <div class="nf-card__price">
          <span class="nf-card__price-now">${hasVariants ? 'From ' : ''}${formatMoney(price)}</span>
          ${hasDiscount ? `<span class="nf-card__price-was">${formatMoney(original)}</span>` : ''}
        </div>
      </div>
    </a>
  `;
};

const renderSkeletons = () => {
  if (!popularGrid) return;
  popularGrid.innerHTML = Array.from({ length: 3 })
    .map(
      () => `
        <div class="nf-card nf-card--skeleton" aria-hidden="true">
          <div class="nf-card__image"><div class="skeleton-shimmer"></div></div>
          <div class="nf-card__body">
            <div class="skeleton-line skeleton-line--title"></div>
            <div class="skeleton-line skeleton-line--price"></div>
          </div>
        </div>
      `
    )
    .join('');
};

const loadPopular = async () => {
  if (!popularGrid) return;
  renderSkeletons();

  try {
    let games = [];
    const featured = await apiGet('/games/featured');
    games = Array.isArray(featured?.data) ? featured.data : [];
    if (!games.length) {
      const fallback = await apiGet('/games?limit=3');
      games = Array.isArray(fallback?.data) ? fallback.data : [];
    }

    const top = games.slice(0, 3);
    if (!top.length) {
      popularGrid.innerHTML = '';
      popularGrid.closest('section')?.setAttribute('hidden', '');
      return;
    }

    popularGrid.innerHTML = top.map(popularCard).join('');
    syncLucide();
  } catch (error) {
    // Popular games request failed
    popularGrid.innerHTML = '';
    popularGrid.closest('section')?.setAttribute('hidden', '');
  }
};

const bindSearch = () => {
  if (!searchForm || !searchInput) return;
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const term = searchInput.value.trim();
    const target = term
      ? `browse.html?search=${encodeURIComponent(term)}`
      : 'browse.html';
    window.location.href = target;
  });
};

const init = async () => {
  if (!(await initShell())) return;
  bindSearch();
  await loadPopular();
};

init();
