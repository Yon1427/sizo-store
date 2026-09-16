import { apiPost } from './http.js';
import { t } from './i18n.js';
import {
  addGuestCartItem,
  clearGuestCart,
  consumeGuestCartTruncationNotice,
  getGuestCartItems,
} from './guest-cart.js';
import { isAuthenticated } from './session.js';
import { showToast } from './toast.js';
import { refreshCartCount, syncLucide } from './shell.js';

/**
 * Unified add-to-cart action.
 * Handles auth vs guest flow, button state, toast, and cart count refresh.
 *
 * @param {Object} options
 * @param {string} options.gameId - Game ID
 * @param {string|null} [options.variantId] - Variant ID
 * @param {number} [options.quantity=1] - Quantity
 * @param {Object|null} [options.metadata] - Extra metadata (playerId, etc.)
 * @param {HTMLElement|null} [options.button] - Button element for loading state
 * @param {Object|null} [options.game] - Full game object for guest cart
 * @param {Object|null} [options.variant] - Variant object for guest cart
 * @param {boolean} [options.useLucideIcons=false] - Whether button uses lucide icons
 * @param {number} [options.successTimeout=1200] - Success state duration (ms)
 * @returns {Promise<boolean>} true on success, false on error
 */
export async function addToCartAction({
  gameId,
  variantId = null,
  quantity = 1,
  metadata = null,
  button = null,
  game = null,
  variant = null,
  useLucideIcons = false,
  successTimeout = 1200,
} = {}) {
  if (!gameId) return false;

  const originalHTML = button ? button.innerHTML : '';

  if (button) {
    button.disabled = true;
    if (useLucideIcons) {
      button.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> ' + t('btn_adding', 'ADDING...');
      syncLucide();
    } else {
      button.textContent = t('btn_adding', 'ADDING...');
    }
  }

  try {
    if (isAuthenticated()) {
      const payload = { gameId, quantity };
      if (variantId) payload.variantId = variantId;
      if (metadata) payload.metadata = metadata;
      await apiPost('/cart', payload, true);
    } else {
      if (!game) throw new Error('Unable to add this game right now.');
      addGuestCartItem(game, quantity, variant, metadata);
      if (consumeGuestCartTruncationNotice()) {
        showToast(t('toast_guest_cart_truncated', 'Cart is limited to 50 items — older items were dropped.'), 'error');
      }
    }

    if (button) {
      if (useLucideIcons) {
        button.innerHTML = '<i data-lucide="check" class="w-5 h-5"></i> ' + t('btn_added_to_cart', 'ADDED TO CART');
        syncLucide();
      } else {
        button.textContent = t('btn_added', 'ADDED');
      }
      button.classList.add('bg-success');
    }
    showToast(t('toast_added_to_cart', 'Added to cart'), 'success');
    await refreshCartCount();

    if (button) {
      setTimeout(() => {
        button.disabled = false;
        button.innerHTML = originalHTML;
        button.classList.remove('bg-success');
        if (useLucideIcons) syncLucide();
      }, successTimeout);
    }
    return true;
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.innerHTML = originalHTML;
      button.classList.remove('bg-success');
      if (useLucideIcons) syncLucide();
    }
    showToast(error.message || t('toast_cart_load_failed', 'Unable to add to cart'), 'error');
    return false;
  }
}

/**
 * Buy-now action: add item to cart, then redirect to checkout.
 * Skips the cart page for a one-click purchase flow.
 */
export async function buyNowAction({
  gameId,
  variantId = null,
  quantity = 1,
  game = null,
  variant = null,
  button = null,
} = {}) {
  const added = await addToCartAction({
    gameId,
    variantId,
    quantity,
    game,
    variant,
    button,
    useLucideIcons: true,
    successTimeout: 800,
  });

  if (added) {
    // Brief delay so the user sees the "ADDED" feedback before redirect
    setTimeout(() => {
      window.location.href = 'checkout.html';
    }, 400);
  }

  return added;
}

/**
 * Merge the localStorage guest cart into the authenticated server cart.
 * Each item is replayed through POST /cart so the server re-validates stock,
 * variant and price. Items that fail server validation are skipped and left
 * in the guest cart (the cart is only cleared when everything merged).
 *
 * Call after a successful login/registration, before redirecting away.
 *
 * @returns {Promise<{merged: number, failed: number, skipped: boolean}|null>}
 *   null when there was nothing to merge or the merge was interrupted.
 */
export async function mergeGuestCartIntoAccount() {
  if (!isAuthenticated()) return null;

  const items = getGuestCartItems();
  if (!items.length) return { merged: 0, failed: 0, skipped: false };

  let merged = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const payload = { gameId: item.gameId, quantity: item.quantity };
      if (item.variantId) payload.variantId = item.variantId;
      if (item.metadata && Object.keys(item.metadata).length) {
        payload.metadata = item.metadata;
      }
      await apiPost('/cart', payload, true);
      merged += 1;
    } catch {
      // Out of stock / variant changed / game delisted — keep it in the guest
      // cart rather than losing it silently.
      failed += 1;
    }
  }

  if (failed === 0) {
    clearGuestCart();
  }
  try { await refreshCartCount(); } catch { /* non-fatal */ }

  return { merged, failed, skipped: false };
}
