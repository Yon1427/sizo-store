import { apiGet, apiPost, guestOrderClient } from '../core/http.js';
import { formatMoney, escapeHtml } from '../core/format.js';
import { clearGuestCart, getGuestCartItems } from '../core/guest-cart.js';
import { createTurnstileGuard } from '../core/security.js';
import { initShell, syncLucide, renderI18n, refreshCartCount } from '../core/shell.js';
import { clearGuestOrderToken, getGuestOrderToken, getUser, isAuthenticated, setGuestOrderToken } from '../core/session.js';
import { debounce } from '../core/utils.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';

let currentStep = 1;
const totalSteps = 2;
let cartItems = [];
let shippingData = null;
let resumeOrderId = '';
let guestCheckoutToken = '';
let paymentNeedsStatusCheck = false;
let appliedCoupon = null;
let guestCheckoutTurnstileGuard = null;
let autoSkipped = false;
let useWallet = true;
let walletCoversFull = false;

const TAX_RATE = 0;
const SUCCESS_STATUSES = new Set(['PAID']);
const FAILURE_STATUSES = new Set(['FAILED', 'CANCELLED']);
const CHECKOUT_COUPON_KEY = 'sizo_checkout_coupon';
const CHECKOUT_GUEST_TOKEN_KEY = 'sizo_checkout_guest_token';
const PAYMENT_INIT_TIMEOUT_MS = 45000;

const shippingForm = document.getElementById('shipping-form');
const placeOrderButton = document.getElementById('place-order');

const applyPlaceOrderLabel = () => {
  if (!placeOrderButton) return;
  if (paymentNeedsStatusCheck) {
    placeOrderButton.textContent = t('btn_verify_payment', 'VERIFY PAYMENT');
    return;
  }
  if (useWallet && walletCoversFull) {
    placeOrderButton.textContent = t('checkout_pay_full_wallet', 'Complete Order — Pay from Wallet');
    return;
  }
  // Distinguish RETRY PAYMENT (post-hydrate FAILED) from the default.
  // We rely on the fact that the only path that sets the button to RETRY is hydrateReturnOrder.
  // After hydrate has run, paymentNeedsStatusCheck is false, so we only need to check if hydrate set RETRY.
  placeOrderButton.textContent = placeOrderButton.dataset.intendedLabel === 'retry'
    ? t('btn_retry_payment', 'RETRY PAYMENT')
    : t('btn_place_order', 'PLACE ORDER');
};

const couponInput = document.getElementById('coupon-code');
const applyCouponButton = document.getElementById('apply-coupon');
const couponFeedbackNode = document.getElementById('coupon-feedback');
const couponDiscountNode = document.getElementById('coupon-discount');
const couponDiscountRow = document.getElementById('coupon-discount-row');
const confirmItemsListNode = document.getElementById('confirm-items-list');
const confirmCustomerTextNode = document.getElementById('confirm-customer-text');
const confirmTotalInlineNode = document.getElementById('confirm-total-inline');
const editDetailsLink = document.getElementById('edit-details-link');
const editDetailsBtn = document.getElementById('edit-details-btn');
const backToDetailsBtn = document.getElementById('back-to-details-btn');
const successOrderNumberNode = document.getElementById('success-order-number');


const getItemUnitPrice = (item) =>
  // Prefer historical unitPrice for resumed orders, then fall back to current prices
  Number(item?.unitPrice ?? item?.variant?.price ?? item?.game?.price ?? 0);

const getItemOriginalPrice = (item) =>
  Number(item?.variant?.originalPrice ?? item?.game?.originalPrice ?? getItemUnitPrice(item));

const getStep = (step) => document.getElementById(`step${step}`);

const normalizeText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const normalizePrice = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const splitName = (value = '') => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
};

const getOrderIdFromQuery = () => new URLSearchParams(window.location.search).get('order') || '';
const getGuestTokenFromQuery = () => new URLSearchParams(window.location.search).get('guest') || '';
const readStoredGuestToken = () => window.sessionStorage.getItem(CHECKOUT_GUEST_TOKEN_KEY) || getGuestOrderToken() || '';

const getGuestCheckoutTurnstileGuard = () => {
  if (!guestCheckoutTurnstileGuard) {
    guestCheckoutTurnstileGuard = createTurnstileGuard({ containerId: 'checkout-turnstile' });
  }
  return guestCheckoutTurnstileGuard;
};

const persistGuestToken = () => {
  if (guestCheckoutToken) {
    window.sessionStorage.setItem(CHECKOUT_GUEST_TOKEN_KEY, guestCheckoutToken);
    setGuestOrderToken(guestCheckoutToken);
  } else {
    window.sessionStorage.removeItem(CHECKOUT_GUEST_TOKEN_KEY);
    clearGuestOrderToken();
  }
};

const clearCheckoutState = async (isGuestOrder) => {
  appliedCoupon = null;
  persistCoupon();
  clearCheckoutForm();
  if (isGuestOrder) clearGuestCart();
  await refreshCartCount();
};

const buildOrderDetailUrl = (orderId, token = '') =>
  token
    ? `order-detail.html?order=${encodeURIComponent(orderId)}&guest=${encodeURIComponent(token)}`
    : `order-detail.html?order=${encodeURIComponent(orderId)}`;

const syncCheckoutUrl = () => {
  const params = new URLSearchParams(window.location.search);
  if (resumeOrderId) params.set('order', resumeOrderId);
  else params.delete('order');
  // Preserve guest token in URL so guest orders survive sessionStorage loss on reload
  if (guestCheckoutToken) params.set('guest', guestCheckoutToken);
  else params.delete('guest');
  window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
};

const readCouponStorage = () => {
  try {
    // Prefer a coupon applied on this checkout page (session), then fall back to
    // one applied on the cart page (local). The two pages historically used
    // different stores, so a cart-page coupon silently vanished at checkout.
    const raw = window.sessionStorage.getItem(CHECKOUT_COUPON_KEY)
      || window.localStorage.getItem(CHECKOUT_COUPON_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const code = String(parsed?.code || '').trim().toUpperCase();
    const discount = Number(parsed?.discount || 0);
    if (!code) return null;
    // discount may be absent for a cart-page coupon (validated lazily below)
    if (!Number.isFinite(discount)) return { code, discount: 0 };
    return { code, discount };
  } catch { return null; }
};

const persistCoupon = () => {
  if (!appliedCoupon?.code || !(Number(appliedCoupon.discount) > 0)) {
    window.sessionStorage.removeItem(CHECKOUT_COUPON_KEY);
    window.localStorage.removeItem(CHECKOUT_COUPON_KEY);
    return;
  }
  window.sessionStorage.setItem(CHECKOUT_COUPON_KEY, JSON.stringify({ code: appliedCoupon.code, discount: appliedCoupon.discount }));
  window.localStorage.setItem(CHECKOUT_COUPON_KEY, JSON.stringify(appliedCoupon));
};

const setCouponFeedback = (message, tone = 'muted') => {
  if (!couponFeedbackNode) return;
  couponFeedbackNode.textContent = message;
  couponFeedbackNode.className = 'promo-feedback';
  if (tone === 'success') couponFeedbackNode.classList.add('promo-feedback--success');
  else if (tone === 'error') couponFeedbackNode.classList.add('promo-feedback--error');
};

const syncCouponUi = () => {
  if (couponInput) couponInput.value = appliedCoupon?.code || couponInput.value || '';
  if (couponDiscountNode) couponDiscountNode.textContent = appliedCoupon?.discount > 0 ? `-${formatMoney(appliedCoupon.discount)}` : '—';
  if (applyCouponButton) applyCouponButton.textContent = appliedCoupon?.code ? 'UPDATE' : 'APPLY';
  if (appliedCoupon?.code && appliedCoupon.discount > 0) {
    setCouponFeedback(`${appliedCoupon.code} applied successfully.`, 'success');
  } else {
    setCouponFeedback('Enter a promo code to save on your order.');
  }
  if (couponDiscountRow) couponDiscountRow.style.display = appliedCoupon?.discount > 0 ? '' : 'none';
};

const updateStepIndicator = (checkoutStep) => {
  // ol data-step: 1=Cart (always done), 2=Details, 3=Pay
  // checkoutStep 1 → ol active node 2; checkoutStep 2 → ol active node 3
  const activeOlNode = checkoutStep + 1;
  document.querySelectorAll('#checkout-steps [data-step]').forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle('completed', n < activeOlNode);
    el.classList.toggle('active', n === activeOlNode);
  });
  document.querySelectorAll('#checkout-steps .step-line').forEach((el, i) => {
    el.classList.toggle('completed', i < checkoutStep);
    el.classList.remove('active');
  });
  document.querySelectorAll('[aria-current="step"]').forEach((el) => el.removeAttribute('aria-current'));
  document.querySelector(`#checkout-steps [data-step="${activeOlNode}"]`)?.setAttribute('aria-current', 'step');
  syncLucide();
  renderI18n();
};

const goToStep = (step) => {
  for (let i = 1; i <= totalSteps; i += 1) {
    getStep(i)?.classList.remove('active');
  }
  const panel = getStep(step);
  panel?.classList.add('active');
  currentStep = step;
  updateStepIndicator(step);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Move keyboard/screen-reader focus into the newly revealed panel so focus is
  // not stranded on a now-hidden element.
  if (panel) {
    const heading = panel.querySelector('.checkout-card__title, h2, h3');
    const target = heading || panel;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
};

window.goToStep = goToStep;

const computeTotals = () => {
  const subtotal = cartItems.reduce((sum, item) => sum + getItemUnitPrice(item) * item.quantity, 0);
  const storeSavings = cartItems.reduce((sum, item) => {
    const original = getItemOriginalPrice(item);
    const current = getItemUnitPrice(item);
    return original > current ? sum + (original - current) * item.quantity : sum;
  }, 0);
  const tax = subtotal * TAX_RATE;
  const couponDiscount = Math.min(subtotal + tax, Number(appliedCoupon?.discount || 0));
  const total = Math.max(0, subtotal + tax - couponDiscount);
  return { subtotal, storeSavings, couponDiscount, tax, total };
};

let walletBalance = 0;

const fetchWalletBalance = async () => {
  if (!useWallet || !isAuthenticated()) {
    walletBalance = 0;
    updateSummaryTotals();
    return;
  }
  try {
    const data = await apiGet('/wallet', true);
    walletBalance = data?.balance || 0;
  } catch { walletBalance = 0; }
  updateSummaryTotals();
};

const updateSummaryTotals = () => {
  const totals = computeTotals();
  const subtotalNode = document.getElementById('summary-subtotal');
  const savingsNode = document.getElementById('summary-savings');
  const totalNode = document.getElementById('summary-total');
  const walletRow = document.getElementById('wallet-deduction-row');
  const walletNode = document.getElementById('summary-wallet');
  const remainingRow = document.getElementById('remaining-row');
  const remainingNode = document.getElementById('summary-remaining');
  const walletToggleRow = document.getElementById('wallet-toggle-row');

  if (subtotalNode) subtotalNode.textContent = formatMoney(totals.subtotal);
  if (savingsNode) savingsNode.textContent = totals.storeSavings > 0 ? `-${formatMoney(totals.storeSavings)}` : '—';

  // Wallet deduction is opt-out (M2): only applied while the "Use wallet
  // balance" checkbox stays checked.
  walletCoversFull = false;
  const walletActive = useWallet && walletBalance > 0 && totals.total > 0;
  if (walletActive) {
    const walletDeduction = Math.min(walletBalance, totals.total);
    const remaining = totals.total - walletDeduction;
    if (walletRow) walletRow.style.display = '';
    if (walletNode) walletNode.textContent = `-${formatMoney(walletDeduction)}`;
    if (remainingRow && remaining > 0) {
      remainingRow.style.display = '';
      if (remainingNode) remainingNode.textContent = formatMoney(remaining);
    } else if (remainingRow) {
      remainingRow.style.display = 'none';
    }
    // Total shown is the wallet remainder (0 when the wallet covers everything)
    if (totalNode) totalNode.textContent = remaining > 0 ? formatMoney(remaining) : formatMoney(0);
    if (confirmTotalInlineNode) confirmTotalInlineNode.textContent = remaining > 0 ? formatMoney(remaining) : formatMoney(0);
    walletCoversFull = remaining <= 0;
  } else {
    if (walletRow) walletRow.style.display = 'none';
    if (remainingRow) remainingRow.style.display = 'none';
    if (totalNode) totalNode.textContent = formatMoney(totals.total);
    if (confirmTotalInlineNode) confirmTotalInlineNode.textContent = formatMoney(totals.total);
  }

  // Offer the wallet opt-out only when there is a balance to spend
  if (walletToggleRow) walletToggleRow.style.display = walletBalance > 0 && totals.total > 0 ? '' : 'none';

  // L6 — the CTA label is always routed through applyPlaceOrderLabel so the
  // wallet "Complete Order" state can never fight the verify/retry state machine.
  applyPlaceOrderLabel();
  if (couponDiscountRow) couponDiscountRow.style.display = totals.couponDiscount > 0 ? '' : 'none';
  syncCouponUi();
};

const normalizeCheckoutItems = (items = []) =>
  Array.isArray(items)
    ? items
      .map((item) => {
        const game = item?.game || {};
        const quantity = Number(item?.quantity || 1);
        const unitPrice = normalizePrice(item?.unitPrice, normalizePrice(item?.totalPrice, 0));
        const gameId = normalizeText(item?.gameId || game?.id || '');
        if (!gameId || !Number.isFinite(quantity) || quantity < 1) return null;
        return {
          ...item, id: item?.id || gameId, gameId,
          variantId: normalizeText(item?.variantId || item?.variant?.id || ''),
          quantity,
          game: { ...game, id: gameId, title: normalizeText(game?.title, 'Game'), slug: normalizeText(game?.slug), coverImage: normalizeText(game?.coverImage), platform: normalizeText(game?.platform, 'PC'), price: normalizePrice(game?.price, unitPrice), originalPrice: normalizePrice(game?.originalPrice, unitPrice) },
          variant: item?.variant ? { ...item.variant, id: normalizeText(item.variant.id), name: normalizeText(item.variant.name, 'Option'), price: normalizePrice(item.variant.price, unitPrice), originalPrice: normalizePrice(item.variant.originalPrice, unitPrice) } : null,
        };
      }).filter(Boolean)
    : [];

const renderConfirmItems = () => {
  if (!confirmItemsListNode) return;
  if (!cartItems.length) {
    confirmItemsListNode.innerHTML = '<p class="text-sm text-[var(--muted)] py-2">' + t('no_items', 'No items.') + '</p>';
    return;
  }
  confirmItemsListNode.innerHTML = cartItems.map((item) => `
    <div class="mini-item">
      <img class="mini-item__img" src="${escapeHtml(item.game.coverImage || '')}" alt="${escapeHtml(item.game.title)}" loading="lazy">
      <div class="mini-item__info">
        <p class="mini-item__title">${escapeHtml(item.game.title)}</p>
        ${item.variant?.name ? `<p class="mini-item__variant">${escapeHtml(item.variant.name)}</p>` : ''}
      </div>
      <div class="mini-item__right">
        <p class="mini-item__qty">×${item.quantity}</p>
        <p class="mini-item__price">${formatMoney(getItemUnitPrice(item) * item.quantity)}</p>
      </div>
    </div>
  `).join('');
};

const renderConfirmCustomer = () => {
  if (!shippingData || !confirmCustomerTextNode) return;
  confirmCustomerTextNode.innerHTML = `${escapeHtml(shippingData.firstName)} ${escapeHtml(shippingData.lastName)} &bull; ${escapeHtml(shippingData.email)}${shippingData.phone ? ` &bull; ${escapeHtml(shippingData.phone)}` : ''}`;
};

const renderConfirm = () => {
  renderConfirmItems();
  renderConfirmCustomer();
  updateSummaryTotals();
  syncLucide();
  renderI18n();
};

// ---- Validation ----
const validateField = (input) => {
  if (!input) return { valid: true };
  const value = String(input.value || '').trim();
  const id = input.id;

  const errorNode = document.getElementById(`${id}-error`);
  if (errorNode) errorNode.classList.remove('visible');
  input.classList.remove('error', 'valid');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');

  if (input.required && !value) {
    input.classList.add('error');
    input.setAttribute('aria-invalid', 'true');
    if (errorNode) {
      input.setAttribute('aria-describedby', errorNode.id);
      errorNode.textContent = t('field_required', 'This field is required');
      errorNode.classList.add('visible');
    }
    return { valid: false, input };
  }

  if (id === 'email' && value) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(value)) {
      input.classList.add('error');
      input.setAttribute('aria-invalid', 'true');
      if (errorNode) {
        input.setAttribute('aria-describedby', errorNode.id);
        errorNode.textContent = t('email_invalid', 'Enter a valid email address');
        errorNode.classList.add('visible');
      }
      return { valid: false, input };
    }
  }

  if (value) {
    input.classList.add('valid');
  }
  return { valid: true };
};

const validateForm = (form) => {
  const inputs = form.querySelectorAll('input[required], input[type="email"]');
  let allValid = true;
  let firstInvalid = null;
  inputs.forEach((input) => {
    const result = validateField(input);
    if (!result.valid) {
      allValid = false;
      if (!firstInvalid) firstInvalid = result.input || input;
    }
  });
  // Expose both the validity flag and the first bad field so callers can move
  // focus to it (WCAG 3.3.1). Explicit shape — no more truthy/falsy overloads.
  return { valid: allValid, invalid: firstInvalid };
};

const collectShippingData = () => {
  if (!shippingForm) return null;
  const formData = new FormData(shippingForm);
  return {
    firstName: String(formData.get('firstName') || '').trim(),
    lastName: String(formData.get('lastName') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
  };
};

const setFormValue = (fieldName, value) => {
  const field = shippingForm?.elements?.namedItem(fieldName);
  if (!(field instanceof HTMLInputElement)) return;
  field.value = value || '';
};

const hydrateCheckoutDetails = async () => {
  // Returns false when a stale local session (expired JWT) is detected so the
  // caller can re-branch to the guest flow instead of erroring mid-checkout.
  if (!isAuthenticated() || !shippingForm) return true;
  const sessionUser = getUser() || {};
  let profile = null;
  try {
    const response = await apiGet('/auth/profile', true);
    profile = response?.data || null;
  } catch {
    // 401 → http.js clears the session; treat as not authenticated.
    profile = null;
    return false;
  }
  const source = profile || sessionUser;
  const { firstName, lastName } = splitName(source?.name || '');
  setFormValue('firstName', firstName);
  setFormValue('lastName', lastName);
  setFormValue('email', normalizeText(source?.email));
  setFormValue('phone', normalizeText(source?.phone));
  return true;
};

const buildGuestOrderItems = () =>
  cartItems
    .map((item) => {
      const entry = { gameId: item.gameId || item.game?.id || '', variantId: item.variantId || item.variant?.id || null, quantity: Number(item.quantity || 1) };
      if (item.metadata && Object.keys(item.metadata).length) entry.metadata = item.metadata;
      return entry;
    })
    .filter((item) => item.gameId && Number.isFinite(item.quantity) && item.quantity > 0);


const hydrateReturnOrder = async () => {
  const orderId = getOrderIdFromQuery();
  if (!orderId) return { resumed: false, status: 'UNKNOWN' };
  const encodedOrderId = encodeURIComponent(orderId);
  resumeOrderId = orderId;
  const guestTokenFromQuery = getGuestTokenFromQuery() || readStoredGuestToken();
  const authenticated = isAuthenticated();
  const isGuestReturn = !authenticated && Boolean(guestTokenFromQuery);

  let orderResponse = null;
  let paymentResponse = null;
  if (isGuestReturn) {
    guestCheckoutToken = guestTokenFromQuery;
    persistGuestToken();
    syncCheckoutUrl();
    [orderResponse, paymentResponse] = await Promise.all([
      guestOrderClient.get(`/orders/guest/${encodedOrderId}`),
      guestOrderClient.get(`/payments/guest/status/${encodedOrderId}`).catch(() => null),
    ]);
  } else if (authenticated) {
    [orderResponse, paymentResponse] = await Promise.all([
      apiGet(`/orders/${encodedOrderId}`, true),
      apiGet(`/payments/status/${encodedOrderId}`, true).catch(() => null),
    ]);
  } else { return { resumed: false, status: 'UNKNOWN' }; }

  const order = orderResponse?.data;
  if (!order) throw new Error('Unable to load order details');
  const normalizedStatus = String(paymentResponse?.data?.status || order.paymentStatus || order.status || 'PENDING').toUpperCase();

  cartItems = normalizeCheckoutItems(order.items);
  shippingData = order.shippingAddress || shippingData || collectShippingData();
  // Pre-fill the shipping form from resumed order so Edit Details works after reload
  if (shippingData) {
    setFormValue('firstName', shippingData.firstName || '');
    setFormValue('lastName', shippingData.lastName || '');
    setFormValue('email', shippingData.email || '');
    setFormValue('phone', shippingData.phone || '');
  }
  appliedCoupon = order.couponCode && Number(order.discountAmount || 0) > 0 ? { code: String(order.couponCode).toUpperCase(), discount: Number(order.discountAmount || 0) } : null;
  persistCoupon();
  renderConfirmItems();
  updateSummaryTotals();
  renderConfirm();

  if (SUCCESS_STATUSES.has(normalizedStatus)) {
    paymentNeedsStatusCheck = false;
    if (placeOrderButton) placeOrderButton.dataset.intendedLabel = 'place';
    await clearCheckoutState(isGuestReturn);
    showSuccessState(order.orderNumber || order.id, 'PAYMENT CONFIRMED', 'Payment is confirmed. Your game keys were sent by email.');
    const link = document.querySelector('#success-message a');
    if (link) link.href = buildOrderDetailUrl(order.id, isGuestReturn ? guestCheckoutToken : '');
    return { resumed: true, status: 'PAID' };
  }

  goToStep(2);
  if (FAILURE_STATUSES.has(normalizedStatus)) {
    paymentNeedsStatusCheck = false;
    if (placeOrderButton) {
      placeOrderButton.textContent = t('btn_retry_payment', 'RETRY PAYMENT');
      placeOrderButton.dataset.intendedLabel = 'retry';
    }
    showToast(t('toast_payment_failed', 'Previous payment failed.'), 'error');
    return { resumed: true, status: 'FAILED' };
  }
  paymentNeedsStatusCheck = true;
  if (placeOrderButton) {
    placeOrderButton.textContent = t('btn_verify_payment', 'VERIFY PAYMENT');
    placeOrderButton.dataset.intendedLabel = 'verify';
  }
  showToast(t('toast_payment_checking', 'Checking payment status...'), 'info');

  // Show "Get Fresh Link" button if we're in a pending state with no checkout URL (stale session)
  const getFreshLinkBtn = document.getElementById('get-fresh-link-btn');
  if (getFreshLinkBtn) {
    const hasCheckoutUrl = paymentResponse?.data?.checkoutUrl;
    if (!hasCheckoutUrl) {
      // Show the button for stale pending sessions
      getFreshLinkBtn.style.display = 'block';
      // Add click handler
      getFreshLinkBtn.onclick = async () => {
        const orderId = getOrderIdFromQuery();
        if (!orderId) return;
        try {
          let response;
          if (isAuthenticated()) {
            response = await apiPost(`/payments/${orderId}/regenerate`, undefined, true);
          } else {
            const token = getGuestOrderToken();
            if (!token) {
              showToast(t('err_sign_in_required', 'Please sign in or open your guest order link again'), 'error');
              return;
            }
            response = await guestOrderClient.post(`/payments/guest/${orderId}/regenerate`);
          }
          if (response && response.data && response.data.checkoutUrl) {
            window.location.href = response.data.checkoutUrl;
          } else {
            showToast(t('toast_checkout_url_missing', 'Checkout URL missing. Please contact support.'), 'error');
          }
        } catch (error) {
          // Handle known error codes from the API
          if (error.data && error.data.error === 'SESSION_NOT_STALE') {
            showToast(t('toast_session_not_stale', 'Checkout session is still active.'), 'info');
          } else if (error.data && error.data.error === 'REGENERATION_LIMIT_EXCEEDED') {
            showToast(t('toast_regeneration_capped', 'Maximum checkout regenerations exceeded. Please contact support.'), 'error');
          } else if (error.data && error.data.error === 'ORDER_NOT_PAYABLE') {
            showToast(t('toast_order_not_payable', 'This order can no longer accept payments.'), 'error');
          } else {
            showToast(error.message || t('toast_regeneration_failed', 'Failed to regenerate checkout.'), 'error');
          }
        }
      };
    } else {
      getFreshLinkBtn.style.display = 'none';
    }
  }

  return { resumed: true, status: 'PENDING' };
};

const loadCart = async () => {
  if (isAuthenticated()) {
    const response = await apiGet('/cart', true);
    cartItems = normalizeCheckoutItems(response?.data?.items);
  } else {
    cartItems = normalizeCheckoutItems(getGuestCartItems());
  }
  if (!cartItems.length) {
    showToast('Your cart is empty', 'error');
    window.setTimeout(() => { window.location.href = 'cart.html'; }, 500);
    return;
  }
  renderConfirmItems();
  updateSummaryTotals();
  renderConfirm();
  // Re-validate a coupon carried over from the cart page (or restored from
  // storage) against the live subtotal so the discount is accurate server-side.
  if (appliedCoupon?.code) {
    try { await applyCoupon(); } catch { /* feedback already shown */ }
  }
  await refreshCartCount();
};

const applyCoupon = async () => {
  const enteredCode = String(couponInput?.value || '').trim().toUpperCase();
  if (!enteredCode) {
    appliedCoupon = null;
    persistCoupon();
    updateSummaryTotals();
    setCouponFeedback('Enter a promo code to apply a discount.');
    return;
  }
  const subtotal = cartItems.reduce((sum, item) => sum + getItemUnitPrice(item) * item.quantity, 0);
  if (subtotal <= 0) throw new Error('Add items to your cart first');

  if (applyCouponButton) { applyCouponButton.disabled = true; applyCouponButton.textContent = t('btn_checking', 'CHECKING'); }
  try {
    const response = await apiPost('/coupons/validate', { code: enteredCode, orderTotal: subtotal });
    const discount = Number(response?.data?.discount || 0);
    if (!(discount > 0)) throw new Error('Coupon did not apply a discount');
    appliedCoupon = { code: response?.data?.coupon?.code || enteredCode, discount };
    persistCoupon();
    updateSummaryTotals();
    setCouponFeedback(`${appliedCoupon.code} applied successfully.`, 'success');
    showToast(t('coupon_applied', 'Coupon {code} applied').replace('{code}', appliedCoupon.code), 'success');
  } catch (error) {
    appliedCoupon = null;
    persistCoupon();
    updateSummaryTotals();
    setCouponFeedback(error.message || 'Invalid coupon code', 'error');
    throw error;
  } finally {
    if (applyCouponButton) { applyCouponButton.disabled = false; applyCouponButton.textContent = appliedCoupon?.code ? 'UPDATE' : 'APPLY'; }
  }
};

const verifyPendingPayment = async () => {
  if (!resumeOrderId) throw new Error('No checkout waiting for verification');
  const encodedOrderId = encodeURIComponent(resumeOrderId);
  let verification = null;
  if (isAuthenticated()) {
    verification = await apiGet(`/payments/verify/${encodedOrderId}`, true);
  } else {
    const token = guestCheckoutToken || getGuestTokenFromQuery();
    if (!token) throw new Error('Guest token missing');
    setGuestOrderToken(token);
    verification = await guestOrderClient.get(`/payments/guest/verify/${encodedOrderId}`);
    guestCheckoutToken = token;
    persistGuestToken();
  }

  const checkoutUrl = verification?.data?.checkoutUrl;
  if (checkoutUrl) {
    showToast(t('toast_payment_link_refreshed', 'Payment link refreshed. Redirecting...'), 'info');
    window.location.href = checkoutUrl;
    return { redirected: true, status: 'REDIRECTED' };
  }

  // hydrate has already updated button text + paymentNeedsStatusCheck + shown its own toast.
  // We propagate the same status hydrate decided, so callers can branch uniformly.
  const hydrated = await hydrateReturnOrder();
  return { redirected: false, status: hydrated.status };
};

const showSuccessState = (orderNumber, title, message) => {
  for (let i = 1; i <= totalSteps; i += 1) getStep(i)?.classList.remove('active');
  const successNode = document.getElementById('success-message');
  if (!successNode) return;
  const titleNode = successNode.querySelector('h2');
  const textNode = successNode.querySelector('p');
  if (titleNode) titleNode.textContent = title;
  if (textNode) textNode.textContent = message;
  if (successOrderNumberNode) successOrderNumberNode.textContent = orderNumber;
  successNode.classList.remove('hidden');
};

const handlePlaceOrder = async () => {
  if (!placeOrderButton) return;

  if (paymentNeedsStatusCheck) {
    placeOrderButton.disabled = true;
    placeOrderButton.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> ' + t('btn_checking', 'CHECKING...');
    syncLucide();
  renderI18n();
    try {
      const result = await verifyPendingPayment();
      if (result.redirected) return;
      // hydrate already updated button text + paymentNeedsStatusCheck + showed the right toast.
      // No additional toast from here — that was the source of the double-toast bug.
    } catch (error) {
      showToast(error.message || 'Unable to verify yet', 'error');
    } finally {
      placeOrderButton.disabled = false;
      applyPlaceOrderLabel();
      syncLucide();
  renderI18n();
    }
    return;
  }

  const original = placeOrderButton.innerHTML;
  placeOrderButton.disabled = true;
  placeOrderButton.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> ' + t('btn_processing', 'PROCESSING...');
  syncLucide();
  renderI18n();

  try {
    const authenticated = isAuthenticated();
    let order = null;
    let orderId = resumeOrderId;

    if (!orderId) {
      const payload = {
        paymentMethod: 'CHARGILY',
        customerDetails: shippingData || collectShippingData(),
        couponCode: appliedCoupon?.code || undefined,
      };
      if (authenticated) {
        const orderResponse = await apiPost('/orders', payload, true);
        order = orderResponse?.data?.order;
        orderId = order?.id;
      } else {
        const items = buildGuestOrderItems();
        if (!items.length) throw new Error('Your cart is empty');
        const turnstileGuard = await getGuestCheckoutTurnstileGuard();
        const turnstileToken = await turnstileGuard.consumeToken();
        const orderResponse = await apiPost('/orders/guest', { ...payload, items, turnstileToken });
        order = orderResponse?.data?.order;
        orderId = order?.id;
        guestCheckoutToken = orderResponse?.data?.token || guestCheckoutToken;
        persistGuestToken();
      }
    }

    if (!orderId) throw new Error('Order could not be created');
    resumeOrderId = orderId;
    syncCheckoutUrl();

    // H1 — reconcile the total the user confirmed against the authoritative
    // server total before redirecting to the gateway, so a guest is never
    // charged an amount they did not see (silent price drift on re-pricing).
    const confirmedTotal = computeTotals().total;
    if (order?.items) {
      cartItems = normalizeCheckoutItems(order.items);
      if (order.couponCode && Number(order.discountAmount || 0) > 0) {
        appliedCoupon = { code: String(order.couponCode).toUpperCase(), discount: Number(order.discountAmount || 0) };
      }
      persistCoupon();
      renderConfirm();
    }
    const serverTotal = normalizePrice(order?.totalAmount, confirmedTotal);
    if (Math.abs(Number(serverTotal) - Number(confirmedTotal)) > 0.01) {
      placeOrderButton.innerHTML = original;
      placeOrderButton.disabled = false;
      syncLucide();
      renderI18n();
      showToast(t('toast_price_changed', 'Item prices have changed. Please review the updated total and confirm again.'), 'error');
      goToStep(2);
      return;
    }

    const payPayload = { orderId };
    if (authenticated) payPayload.useWallet = useWallet;

    const paymentResponse = isAuthenticated()
      ? await apiPost('/payments/initiate', payPayload, true, { timeout: PAYMENT_INIT_TIMEOUT_MS })
      : await guestOrderClient.post('/payments/guest/initiate', payPayload, { timeout: PAYMENT_INIT_TIMEOUT_MS });

    const checkoutUrl = paymentResponse?.data?.checkoutUrl;
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
      return;
    }
    // Free order: payment was auto-confirmed. Detect via the structured signal
    // (explicit flag or a null checkoutUrl) rather than matching message text,
    // which breaks on any backend wording/translation change.
    const isFreeOrder = paymentResponse?.data?.freeOrder === true
      || (paymentResponse?.success && paymentResponse?.data && paymentResponse.data.checkoutUrl === null);
    if (isFreeOrder) {
      const orderRes = isAuthenticated()
        ? await apiGet(`/orders/${orderId}`, true)
        : await apiGet(`/orders/guest/${orderId}`, false, { guestOrder: true });
      const confirmedOrder = orderRes?.data || orderRes;
      showSuccessState(confirmedOrder?.orderNumber || orderId, 'Order Confirmed', 'Free order — your items are ready.');
      return;
    }
    // Still processing: show verify button
    placeOrderButton.innerHTML = original;
    placeOrderButton.disabled = false;
    showToast('Payment is being processed. Click Verify to check status.', 'info');
    document.getElementById('verify-payment-btn')?.classList.remove('hidden');
  } catch (error) {
    guestCheckoutTurnstileGuard?.reset?.();
    placeOrderButton.innerHTML = original;
    placeOrderButton.disabled = false;
    syncLucide();
  renderI18n();

    if (error?.data?.error === 'INVALID_CART_VARIANT') {
      showToast(t('error_invalid_variant', 'A product in your cart requires selecting an option (e.g., denomination). Please go back to your cart, remove it, and re-add with the correct option.'), 'error');
      return;
    }

    if (error?.data?.error === 'INSUFFICIENT_STOCK') {
      // Give a specific, actionable message instead of the generic fallback.
      showToast(t('error_insufficient_stock', 'An item in your cart is out of stock. Please review your cart and try again.'), 'error');
      // Surface which item(s) failed when the backend provides them.
      const detail = Array.isArray(error?.data?.items) ? error.data.items.join(', ') : null;
      if (detail) showToast(detail, 'info');
      return;
    }

    // Distinguish retryable network/timeout failures from hard server errors.
    if (error?.status === 408 || error?.status === 0 || /timed out|failed to fetch|network/i.test(error?.message || '')) {
      showToast(t('error_network_retry', 'Network problem — please check your connection and try again.'), 'error');
      return;
    }

    showToast(error.message || t('error_checkout_generic', 'Unable to process checkout'), 'error');
  }
};

const bindForms = () => {
  shippingForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateForm(shippingForm);
    if (!result.valid) {
      showToast(t('fill_required_fields', 'Please fill in all required fields'), 'error');
      // Move focus to the first invalid field so keyboard/screen-reader users
      // land on the problem instead of hunting for it.
      result.invalid?.focus();
      return;
    }
    shippingData = collectShippingData();
    autoSkipped = false;
    if (editDetailsLink) editDetailsLink.classList.add('hidden');
    renderConfirm();
    goToStep(2);
  });

  placeOrderButton?.addEventListener('click', handlePlaceOrder);

  backToDetailsBtn?.addEventListener('click', () => {
    autoSkipped = false;
    if (editDetailsLink) editDetailsLink.classList.add('hidden');
    goToStep(1);
  });

  editDetailsBtn?.addEventListener('click', () => {
    autoSkipped = false;
    if (editDetailsLink) editDetailsLink.classList.add('hidden');
    goToStep(1);
  });

  applyCouponButton?.addEventListener('click', async () => {
    try { await applyCoupon(); }
    catch (error) { showToast(error.message || 'Unable to apply coupon', 'error'); }
  });

  couponInput?.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    try { await applyCoupon(); }
    catch (error) { showToast(error.message || 'Unable to apply coupon', 'error'); }
  });

  // M2 — wallet participation is opt-out: unchecking forces a full Chargily
  // payment and hides the wallet/remaining breakdown.
  const walletCheckbox = document.getElementById('use-wallet-checkbox');
  walletCheckbox?.addEventListener('change', () => {
    useWallet = walletCheckbox.checked;
    if (useWallet && isAuthenticated()) {
      fetchWalletBalance();
    } else {
      walletBalance = 0;
      updateSummaryTotals();
    }
  });
};

const init = async () => {
  if (!(await initShell())) return;
  bindForms();
  initValidation();

  // Load saved form data and set up auto-save
  const debouncedSave = debounce(saveCheckoutForm, 500);
  const fields = ['firstName', 'lastName', 'email', 'phone'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', debouncedSave);
  });
  loadCheckoutForm();

  appliedCoupon = readCouponStorage();
  guestCheckoutToken = getGuestTokenFromQuery() || readStoredGuestToken();
  persistGuestToken();
  syncCouponUi();
  try {
    // L3 — probe the session before branching: a stale local user object routes
    // here, /auth/profile clears the session on 401, and the guest flow below is
    // used instead of failing the checkout with a hard error.
    const sessionValid = isAuthenticated() && (await hydrateCheckoutDetails());

    if (sessionValid) {
      // Fetch wallet balance for checkout display
      fetchWalletBalance();

      const firstName = document.getElementById('firstName')?.value.trim();
      const lastName = document.getElementById('lastName')?.value.trim();
      const email = document.getElementById('email')?.value.trim();
      if (firstName && lastName && email && validateForm(shippingForm).valid) {
        shippingData = collectShippingData();
        autoSkipped = true;
        if (editDetailsLink) editDetailsLink.classList.remove('hidden');
      }
    }

    const hydrated = await hydrateReturnOrder();
    if (hydrated.resumed) return;

    await loadCart();

    if (autoSkipped) {
      renderConfirm();
      goToStep(2);
    }
  } catch (error) {
    showToast(error.message || 'Unable to load checkout data', 'error');
  }
};

// Form persistence
const FORM_STORAGE_KEY = 'sizo_checkout_draft';

const saveCheckoutForm = () => {
  const formData = {
    firstName: document.getElementById('firstName')?.value || '',
    lastName: document.getElementById('lastName')?.value || '',
    email: document.getElementById('email')?.value || '',
    phone: document.getElementById('phone')?.value || '',
    savedAt: Date.now()
  };
  localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formData));
};

const loadCheckoutForm = () => {
  const saved = localStorage.getItem(FORM_STORAGE_KEY);
  if (!saved) return false;

  try {
    const formData = JSON.parse(saved);
    const savedAt = formData.savedAt || 0;
    const hoursSinceSave = (Date.now() - savedAt) / (1000 * 60 * 60);

    if (hoursSinceSave > 24) {
      localStorage.removeItem(FORM_STORAGE_KEY);
      return false;
    }

    const fields = ['firstName', 'lastName', 'email', 'phone'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el && formData[id]) el.value = formData[id];
    });
    return true;
  } catch (e) {
    localStorage.removeItem(FORM_STORAGE_KEY);
    return false;
  }
};

const clearCheckoutForm = () => {
  localStorage.removeItem(FORM_STORAGE_KEY);
};



// Validation utilities
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPhone = (phone) => {
  if (!phone) return true; // Optional
  return /^[\+]?[\d\s\-\(\)]{8,}$/.test(phone);
};

const showFieldError = (input, message) => {
  input.classList.add('error');
  input.classList.remove('valid');
  input.setAttribute('aria-invalid', 'true');
  const errorEl = document.getElementById(`${input.id}-error`);
  if (errorEl) {
    input.setAttribute('aria-describedby', errorEl.id);
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }
};

const markFieldValid = (input) => {
  input.classList.remove('error');
  input.classList.add('valid');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
  const errorEl = document.getElementById(`${input.id}-error`);
  if (errorEl) {
    errorEl.classList.remove('visible');
  }
};

const clearFieldValidation = (input) => {
  input.classList.remove('error', 'valid');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
  const errorEl = document.getElementById(`${input.id}-error`);
  if (errorEl) {
    errorEl.classList.remove('visible');
  }
};

// Real-time validation setup
const initValidation = () => {
  const firstName = document.getElementById('firstName');
  const lastName = document.getElementById('lastName');
  const email = document.getElementById('email');
  const phone = document.getElementById('phone');

  // Validate on blur
  firstName?.addEventListener('blur', () => {
    if (!firstName.value.trim()) {
      showFieldError(firstName, 'First name is required');
    } else {
      markFieldValid(firstName);
    }
  });

  lastName?.addEventListener('blur', () => {
    if (!lastName.value.trim()) {
      showFieldError(lastName, 'Last name is required');
    } else {
      markFieldValid(lastName);
    }
  });

  email?.addEventListener('blur', () => {
    if (!email.value.trim()) {
      showFieldError(email, 'Email is required');
    } else if (!isValidEmail(email.value)) {
      showFieldError(email, 'Please enter a valid email address');
    } else {
      markFieldValid(email);
    }
  });

  phone?.addEventListener('blur', () => {
    if (phone.value && !isValidPhone(phone.value)) {
      showFieldError(phone, 'Please enter a valid phone number');
    } else {
      markFieldValid(phone);
    }
  });

  // Clear validation on input
  [firstName, lastName, email, phone].forEach(input => {
    input?.addEventListener('input', () => {
      clearFieldValidation(input);
    });
  });
};

init();
