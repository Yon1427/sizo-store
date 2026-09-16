import { apiPost, apiDelete } from './http.js';
import { t } from './i18n.js';
import { isAuthenticated } from './session.js';
import { showToast } from './toast.js';

/**
 * Add a game to the user's wishlist. Requires authentication.
 * @param {string} gameId
 * @returns {Promise<boolean>}
 */
export async function addToWishlist(gameId) {
  if (!isAuthenticated()) {
    showToast(t('toast_sign_in_wishlist', 'Sign in to save to wishlist'), 'info');
    return false;
  }
  try {
    await apiPost('/wishlist', { gameId }, true);
    showToast(t('toast_added_to_wishlist', 'Added to wishlist'), 'success');
    return true;
  } catch (error) {
    showToast(error.message || t('toast_wishlist_add_failed', 'Unable to add to wishlist'), 'error');
    return false;
  }
}

/**
 * Remove a game from the user's wishlist. Requires authentication.
 * @param {string} gameId
 * @returns {Promise<boolean>}
 */
export async function removeFromWishlist(gameId) {
  if (!isAuthenticated()) {
    showToast(t('toast_sign_in_wishlist_alt', 'Sign in to use wishlist'), 'info');
    return false;
  }
  try {
    await apiDelete(`/wishlist/game/${encodeURIComponent(gameId)}`, true);
    showToast(t('toast_removed_from_wishlist', 'Removed from wishlist'), 'success');
    return true;
  } catch (error) {
    showToast(error.message || t('toast_wishlist_remove_failed', 'Unable to remove from wishlist'), 'error');
    return false;
  }
}