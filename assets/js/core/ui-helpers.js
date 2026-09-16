import { syncLucide } from './shell.js';
import { escapeHtml } from './format.js';
import { t } from './i18n.js';

/**
 * Render a not-found state into the #main-content container.
 * @param {Object} options
 * @param {string} options.title - H1 text
 * @param {string} options.message - Description text
 * @param {string} options.browseFilter - Query filter for browse CTA (e.g. "?type=GIFT_CARD")
 * @param {string} options.browseLabel - CTA label
 * @param {string} options.browseIcon - Lucide icon name for CTA
 */
export function renderNotFoundState({
  title = t('not_found_title', 'Product not found'),
  message = t('not_found_message', 'This product is no longer available or the link is invalid.'),
  browseFilter = '',
  browseLabel = t('not_found_browse_label', 'Browse products'),
  browseIcon = 'search',
} = {}) {
  const main = document.getElementById('main-content');
  if (!main) return;

  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeFilter = escapeHtml(browseFilter);
  const safeLabel = escapeHtml(browseLabel);
  const safeIcon = escapeHtml(browseIcon);
  const backHome = t('not_found_back_home', 'Back to home');
  main.innerHTML = `
    <div class="mx-auto max-w-md py-16 text-center">
      <div class="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full" style="background:rgba(255,77,109,0.1);color:var(--coral)">
        <i data-lucide="package-x" class="w-8 h-8"></i>
      </div>
      <h1 class="font-display text-2xl font-bold mb-2" style="color:var(--text-primary)">${safeTitle}</h1>
      <p class="text-sm mb-6" style="color:var(--muted)">${safeMessage}</p>
      <div class="flex flex-col sm:flex-row gap-3 justify-center">
        <a href="browse.html${safeFilter}" class="btn-cyber bg-cyan px-6 py-3 font-display font-bold text-[var(--on-accent)] inline-flex items-center justify-center gap-2">
          <i data-lucide="${safeIcon}" class="w-4 h-4"></i> ${safeLabel}
        </a>
        <a href="index.html" class="btn-cyber border px-6 py-3 font-display font-bold inline-flex items-center justify-center gap-2" style="border-color:var(--border);color:var(--text-primary)">
          <i data-lucide="home" class="w-4 h-4"></i> ${backHome}
        </a>
      </div>
    </div>
  `;
  syncLucide();
}

/**
 * Initialize a mobile sticky bar that appears when a CTA button scrolls out of view.
 * @param {Object} options
 * @param {string} options.barId - ID of the sticky bar element
 * @param {HTMLElement|null} options.observeButton - The button to observe (bar appears when hidden)
 * @param {Function|null} options.onPriceSync - Callback to sync price display
 * @returns {IntersectionObserver|null} The observer for cleanup
 */
export function initStickyBar({
  barId = 'mobile-sticky-bar',
  observeButton = null,
  onPriceSync = null,
} = {}) {
  const stickyBar = document.getElementById(barId);
  if (!stickyBar) return null;

  const observer = new IntersectionObserver(([entry]) => {
    stickyBar.classList.toggle('mobile-sticky-bar--visible', !entry.isIntersecting);
  }, { threshold: 0 });

  if (observeButton) {
    observer.observe(observeButton);
  }

  if (onPriceSync) {
    onPriceSync();
  }

  return observer;
}
