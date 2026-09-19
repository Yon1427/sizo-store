import { apiDelete, apiGet, apiPatch } from '../core/http.js';
import { formatMoney, escapeHtml } from '../core/format.js';
import {
  clearGuestCart,
  getGuestCartItems,
  removeGuestCartItem,
  updateGuestCartItemQuantity,
} from '../core/guest-cart.js';
import { initShell, syncLucide, renderI18n, refreshCartCount } from '../core/shell.js';
import { isAuthenticated } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';
import { showConfirmModal } from '../core/components.js';

// Keep storefront totals aligned with the backend until tax rules are implemented server-side.
const TAX_RATE = 0;

let isUpdatingCart = false;
let currentPromo = null;
// Money as Medusa computed it, set by fetchCart for a signed-in customer. Null
// for a guest, whose cart only exists in localStorage.
let serverTotals = null;

const cartItemsRoot = document.getElementById('cart-items');
const emptyState = document.getElementById('empty-cart');
const cartActionsRow = document.getElementById('cart-actions-row');
const clearCartButton = document.getElementById('clear-cart');
const subtotalNode = document.getElementById('subtotal');
const discountNode = document.getElementById('discount');
const taxNode = document.getElementById('tax');
const totalNode = document.getElementById('total');
const checkoutLink = document.querySelector('a[href="checkout.html"]');
const cartStatusEl = document.getElementById('cart-status');


const getItemUnitPrice = (item) => Number(item?.variant?.price ?? item?.game?.price ?? 0);
const getItemOriginalPrice = (item) => Number(item?.variant?.originalPrice ?? item?.game?.originalPrice ?? getItemUnitPrice(item));

/**
 * The coupon discount as a preview, off a set of already-computed totals.
 *
 * Shared by both paths so the server-total cart and the guest cart discount a
 * code identically. `PERCENTAGE` applies to the post-sale subtotal (not the
 * original price, which would discount money the customer never paid and could
 * exceed the order), then respects the cap when one is set. `FIXED` cannot take
 * the total below zero.
 *
 * This is display only: nothing here is ever sent to the server as a discount,
 * and checkout recomputes it from the promotion itself.
 */
const applyCouponPreview = (base, promo) => {
  const taxable = Math.max(base.subtotal - base.discount, 0);
  let couponDiscount = 0;

  if (promo.type === 'PERCENTAGE') {
    couponDiscount = taxable * (promo.value / 100);
    if (promo.maxDiscount > 0) couponDiscount = Math.min(couponDiscount, promo.maxDiscount);
  } else {
    couponDiscount = Math.min(promo.value, taxable);
  }

  const discount = base.discount + couponDiscount;
  const tax = (base.subtotal - discount) * TAX_RATE;

  return { discount, tax, total: base.subtotal - discount + tax };
};

const computeTotals = (items) => {
  const subtotal = items.reduce((sum, item) => sum + getItemUnitPrice(item) * item.quantity, 0);
  const storeDiscount = items.reduce((sum, item) => {
    const original = getItemOriginalPrice(item);
    const current = getItemUnitPrice(item);
    if (original > current) {
      return sum + (original - current) * item.quantity;
    }
    return sum;
  }, 0);

  const base = {
    subtotal,
    discount: storeDiscount,
    tax: 0,
    total: subtotal - storeDiscount,
  };

  return currentPromo ? { ...base, ...applyCouponPreview(base, currentPromo) } : base;
};

const renderTotals = (items) => {
  /**
   * Medusa's arithmetic wins whenever there is a server cart.
   *
   * The local path exists only for the guest cart, where there is no server
   * row. It reproduces the same shapes: the store-wide sale shows up as the
   * difference between an item's original and current price, and the coupon is
   * a preview off the top — a preview because applying it is checkout's job.
   */
  let totals = serverTotals;

  if (!totals) {
    totals = computeTotals(items);
  } else if (currentPromo) {
    totals = { ...totals, ...applyCouponPreview(totals, currentPromo) };
  }

  if (subtotalNode) {
    subtotalNode.textContent = formatMoney(totals.subtotal);
  }

  if (discountNode) {
    discountNode.textContent = totals.discount > 0 ? `-${formatMoney(totals.discount)}` : formatMoney(0);
  }

  if (taxNode) {
    taxNode.textContent = formatMoney(totals.tax);
  }

  if (totalNode) {
    totalNode.textContent = formatMoney(totals.total);
  }
};

const cartItemTemplate = (item) => {
  const game = item.game;
  const variant = item.variant || null;
  const unitPrice = getItemUnitPrice(item);
  const originalPrice = getItemOriginalPrice(item);
  const hasDiscount = originalPrice > unitPrice;
  const platform = game.platform ? String(game.platform).toUpperCase() : 'PC';
  const category = game.category?.name ? String(game.category.name).toUpperCase() : 'GAME';

  return `
    <div class="cart-item" data-item-id="${item.id}" data-quantity="${item.quantity}">
      <div class="cart-item__image">
        <img loading="lazy" src="${escapeHtml(game.coverImage)}" alt="${escapeHtml(game.title)}">
      </div>
      <div class="cart-item__info">
        <span class="cart-item__platform">${escapeHtml(category)}</span>
        <a href="game-detail.html?slug=${encodeURIComponent(game.slug)}" class="cart-item__title">${escapeHtml(game.title)}</a>
        <div class="cart-item__meta">
          <span>${escapeHtml(platform)} Download</span>
          <span>•</span>
          <span>Digital Key</span>
        </div>
        ${variant?.name ? `<span class="cart-item__variant">${escapeHtml(variant.name)}</span>` : ''}
      </div>
      <div class="cart-item__right">
        <div>
          ${hasDiscount ? `<span class="cart-item__original">${formatMoney(originalPrice)}</span>` : ''}
          <span class="cart-item__price${hasDiscount ? '' : ' cart-item__price--normal'}">${formatMoney(unitPrice)}</span>
        </div>
        <div class="qty-stepper" aria-label="Quantity selector">
          <button data-action="decrease" aria-label="Decrease quantity" ${item.quantity <= 1 ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <input type="number" value="${item.quantity}" min="1" max="99" readonly aria-label="Quantity for ${escapeHtml(game.title)}" aria-live="polite" aria-atomic="true">
          <button data-action="increase" aria-label="Increase quantity">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <button class="cart-item__remove" data-action="remove-item" aria-label="Remove ${escapeHtml(game.title)} from cart">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `;
};

const renderCart = (items) => {
  if (!cartItemsRoot || !emptyState) {
    return;
  }

  if (!items.length) {
    cartItemsRoot.classList.add('hidden');
    emptyState.classList.remove('hidden');
    cartActionsRow?.classList.add('hidden');
    if (checkoutLink) {
      checkoutLink.classList.add('opacity-50', 'pointer-events-none');
    }
    renderTotals([]);
    if (cartStatusEl) cartStatusEl.textContent = 'Cart is empty';
    return;
  }

  cartItemsRoot.classList.remove('hidden');
  emptyState.classList.add('hidden');
  cartActionsRow?.classList.remove('hidden');
  cartItemsRoot.innerHTML = items.map(cartItemTemplate).join('');
  renderTotals(items);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  if (cartStatusEl) cartStatusEl.textContent = `Cart updated: ${totalItems} item${totalItems !== 1 ? 's' : ''}`;

  if (checkoutLink) {
    checkoutLink.classList.remove('opacity-50', 'pointer-events-none');
  }

  syncLucide();
  renderI18n();
};

const fetchCart = async () => {
  // Show skeleton while loading
  if (cartItemsRoot) {
    cartItemsRoot.innerHTML = Array.from({ length: 3 }, () => `
      <div class="cart-item cart-item--skeleton">
        <div class="cart-item__image skeleton"></div>
        <div class="cart-item__info">
          <div class="skeleton h-4 w-24 mb-2"></div>
          <div class="skeleton h-5 w-40 mb-3"></div>
          <div class="skeleton h-4 w-32"></div>
        </div>
      </div>
    `).join('');
  }

  let items = [];
  // Totals come from Medusa when there is a server cart. The guest path has no
  // server cart at all, so it stays computed locally — that is the only case
  // where computeTotals runs.
  serverTotals = null;

  if (isAuthenticated()) {
    const response = await apiGet('/cart', true);
    items = Array.isArray(response?.data?.items) ? response.data.items : [];
    serverTotals = response?.data
      ? {
          subtotal: Number(response.data.subtotal ?? 0),
          discount: Number(response.data.discountTotal ?? 0),
          tax: Number(response.data.taxTotal ?? 0),
          total: Number(response.data.total ?? 0),
        }
      : null;
  } else {
    items = getGuestCartItems();
  }

  renderCart(items);
  await refreshCartCount();
};

const updateQuantity = async (itemId, quantity) => {
  if (isAuthenticated()) {
    await apiPatch(`/cart/${itemId}`, { quantity }, true);
  } else {
    updateGuestCartItemQuantity(itemId, quantity);
  }

  await fetchCart();
};

const removeItem = async (itemId) => {
  if (isAuthenticated()) {
    await apiDelete(`/cart/${itemId}`, true);
  } else {
    removeGuestCartItem(itemId);
  }

  await fetchCart();
};

const clearCart = async () => {
  if (isAuthenticated()) {
    await apiDelete('/cart', true);
  } else {
    clearGuestCart();
  }

  await fetchCart();
};

const bindEvents = () => {
  if (cartItemsRoot) {
    cartItemsRoot.addEventListener('click', async (event) => {
      if (isUpdatingCart) {
        return;
      }

      const button = event.target.closest('button');
      if (!button) {
        return;
      }

      const item = button.closest('.cart-item');
      const itemId = item?.getAttribute('data-item-id');
      const currentQuantity = Number(item?.getAttribute('data-quantity') || 1);

      if (!itemId) {
        return;
      }

      try {
        isUpdatingCart = true;

        if (button.getAttribute('data-action') === 'remove-item') {
          const itemTitle = item.querySelector('.cart-item__title')?.textContent || 'this item';
          showConfirmModal(
            `Remove "${itemTitle}" from your cart?`,
            async () => {
              await removeItem(itemId);
              showToast('Item removed', 'success');
            }
          );
          return;
        }

        if (button.getAttribute('data-action') === 'increase') {
          await updateQuantity(itemId, currentQuantity + 1);
          return;
        }

        if (button.getAttribute('data-action') === 'decrease' && currentQuantity > 1) {
          await updateQuantity(itemId, currentQuantity - 1);
        }
      } catch (error) {
        showToast(error.message || 'Unable to update cart', 'error');
      } finally {
        isUpdatingCart = false;
      }
    });
  }

  if (clearCartButton) {
    clearCartButton.addEventListener('click', async () => {
      try {
        await clearCart();
        showToast('Cart cleared', 'success');
      } catch (error) {
        showToast(error.message || 'Unable to clear cart', 'error');
      }
    });
  }
};

// Promo code handling
const initPromoCode = () => {
  const promoInput = document.getElementById('cart-promo-code');
  const promoBtn = document.getElementById('cart-apply-promo');
  const promoMessage = document.getElementById('cart-promo-message');
  const promoApplied = document.getElementById('cart-promo-applied');
  const appliedCodeSpan = document.getElementById('cart-applied-code');
  const removePromoBtn = document.getElementById('cart-remove-promo');

  if (!promoInput || !promoBtn) return;

  const showPromoMessage = (message, type) => {
    if (!promoMessage) return;
    promoMessage.textContent = message;
    promoMessage.style.color = type === 'success' ? 'var(--success)' : 'var(--error)';
    if (type === 'success') {
      setTimeout(() => { promoMessage.textContent = ''; }, 3000);
    }
  };

  const updatePromoUI = () => {
    if (!promoApplied) return;
    if (currentPromo) {
      promoApplied.classList.remove('hidden');
      if (appliedCodeSpan) appliedCodeSpan.textContent = currentPromo.code;
      promoInput.value = '';
      promoInput.disabled = true;
      promoBtn.disabled = true;
      promoBtn.style.opacity = '0.5';
    } else {
      promoApplied.classList.add('hidden');
      promoInput.disabled = false;
      promoBtn.disabled = false;
      promoBtn.style.opacity = '1';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  };

  const applyPromoCode = async () => {
    const code = promoInput.value.trim().toUpperCase();
    if (!code) {
      showPromoMessage('Please enter a promo code', 'error');
      return;
    }

    promoBtn.disabled = true;
    promoBtn.textContent = t('promo_checking', '...');

    try {
      const { apiPost } = await import('../core/http.js');
      const response = await apiPost('/coupons/validate', { code });

      if (response.success && response.data?.valid) {
        currentPromo = response.data.coupon;
        localStorage.setItem('sizo_checkout_coupon', JSON.stringify(currentPromo));
        const promoLabel = currentPromo.type === 'PERCENTAGE'
          ? `${currentPromo.value}% off`
          : `${currentPromo.value} DZD off`;
        showPromoMessage(t('promo_applied', 'Coupon applied') + `: ${promoLabel}`, 'success');
        updatePromoUI();
        // Refresh cart to update totals
        await fetchCart();
      } else {
        showPromoMessage(response.data?.message || 'Invalid coupon code', 'error');
      }
    } catch (error) {
      showPromoMessage('Unable to validate coupon', 'error');
    } finally {
      promoBtn.disabled = false;
      promoBtn.textContent = t('btn_apply', 'APPLY');
    }
  };

  promoBtn.addEventListener('click', applyPromoCode);
  promoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') applyPromoCode();
  });

  removePromoBtn?.addEventListener('click', () => {
    currentPromo = null;
    localStorage.removeItem('sizo_checkout_coupon');
    updatePromoUI();
    fetchCart();
  });

  // Load saved promo on init — validate server-side to avoid stale data
  const savedPromo = localStorage.getItem('sizo_checkout_coupon');
  if (savedPromo) {
    try {
      currentPromo = JSON.parse(savedPromo);
      updatePromoUI();
      // Re-validate the stored coupon against the server
      (async () => {
        try {
          const { apiPost } = await import('../core/http.js');
          const response = await apiPost('/coupons/validate', { code: currentPromo.code });
          if (response.success && response.data?.valid) {
            // Always trust server-authoritative coupon data, not localStorage
            currentPromo = response.data.coupon;
            localStorage.setItem('sizo_checkout_coupon', JSON.stringify(currentPromo));
          } else {
            currentPromo = null;
            localStorage.removeItem('sizo_checkout_coupon');
          }
          updatePromoUI();
        } catch {
          // Keep local promo if validation request fails (offline tolerance)
        }
      })();
    } catch (e) {
      localStorage.removeItem('sizo_checkout_coupon');
    }
  }
};

const init = async () => {
  if (!(await initShell())) {
    return;
  }

  bindEvents();
  initPromoCode();

  try {
    await fetchCart();
  } catch (error) {
    showToast(error.message || 'Unable to load cart', 'error');
  }
};

init();
