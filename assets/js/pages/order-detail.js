import { formatDate, formatMoney, escapeHtml } from '../core/format.js';
import { apiGet, apiPost, guestOrderClient } from '../core/http.js';
import { initShell, syncLucide, renderI18n } from '../core/shell.js';
import { getGuestOrderToken, isAuthenticated, setGuestOrderToken } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';

const renderSkeletons = () => {
  if (dom.items) {
    dom.items.innerHTML = Array.from({ length: 2 }, () => `
      <div class="border border-[var(--border)] bg-[var(--void)] p-4">
        <div class="flex flex-col gap-4 sm:flex-row">
          <div class="skeleton w-20 h-28 rounded"></div>
          <div class="flex-1">
            <div class="skeleton h-6 w-48 mb-3"></div>
            <div class="skeleton h-4 w-32 mb-4"></div>
            <div class="skeleton h-4 w-full mb-2"></div>
            <div class="skeleton h-4 w-3/4"></div>
          </div>
        </div>
      </div>
    `).join('');
  }
  if (dom.heading) dom.heading.textContent = t('loading_order', 'Loading order...');
};


const dom = {
  heading: document.getElementById('order-detail-heading'),
  orderNumber: document.getElementById('order-number'),
  orderStatusBadge: document.getElementById('order-status-badge'),
  paymentStatusBadge: document.getElementById('payment-status-badge'),
  orderMeta: document.getElementById('order-meta'),
  orderTotal: document.getElementById('order-total'),
  deliveryDeliveredCount: document.getElementById('delivery-delivered-count'),
  deliveryReservedCount: document.getElementById('delivery-reserved-count'),
  deliveryPendingCount: document.getElementById('delivery-pending-count'),
  itemCount: document.getElementById('order-item-count'),
  items: document.getElementById('order-items'),
  receiptSubtotal: document.getElementById('receipt-subtotal'),
  receiptDiscount: document.getElementById('receipt-discount'),
  receiptQuantity: document.getElementById('receipt-quantity'),
  receiptTotal: document.getElementById('receipt-total'),
  revealCard: document.getElementById('order-reveal-card'),
  revealPanel: document.getElementById('order-reveal-panel'),
  paymentPanel: document.getElementById('order-payment-panel'),
  shippingPanel: document.getElementById('order-shipping-panel'),
  backLink: document.getElementById('order-detail-back'),
  downloadAction: document.getElementById('order-detail-download-action'),
  primaryAction: document.getElementById('order-detail-primary-action'),
};

let currentOrder = null;

const statusBadgeClass = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PAID' || normalized === 'COMPLETED') {
    return 'rounded bg-success/15 px-3 py-1 font-mono text-xs text-success';
  }

  if (normalized === 'PROCESSING' || normalized === 'RESERVED' || normalized === 'FULFILLING') {
    return 'rounded bg-cyan/15 px-3 py-1 font-mono text-xs text-cyan';
  }

  if (normalized === 'FAILED' || normalized === 'CANCELLED' || normalized === 'REFUNDED') {
    return 'rounded bg-red-400/15 px-3 py-1 font-mono text-xs text-red-500 dark:text-red-300';
  }

  return 'rounded bg-gold/15 px-3 py-1 font-mono text-xs text-gold';
};

const getOrderId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('order') || params.get('id') || '';
};

const getGuestToken = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || params.get('guest') || getGuestOrderToken() || '';
};

const stripGuestTokenFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('token') && !params.has('guest')) {
    return;
  }

  params.delete('token');
  params.delete('guest');
  const nextQuery = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
};

const getDeliveredItems = (order) =>
  (Array.isArray(order?.items) ? order.items : [])
    .map((item) => {
      const keys = Array.isArray(item?.keys) ? item.keys.filter(Boolean) : [];
      if (!keys.length) {
        return null;
      }

      return {
        title: item?.variant?.name ? `${item?.game?.title || t('label_game', 'Game')} - ${item.variant.name}` : item?.game?.title || t('label_game', 'Game'),
        platform: item?.game?.platform || '',
        keys,
      };
    })
    .filter(Boolean);

const hasDownloadableKeys = (order) =>
  Boolean(order?.reveal?.verified) && getDeliveredItems(order).length > 0;

const buildKeysDownloadText = (order) => {
  const deliveredItems = getDeliveredItems(order);
  const lines = [
    t('order_export_title', 'SIZO ORDER EXPORT'),
    `Order Number: ${order?.orderNumber || order?.id || ''}`,
    `${t('label_customer', 'Customer')}: ${order?.customerName || t('label_customer', 'Customer')}`,
    `Email: ${order?.customerEmail || ''}`,
    `Created At: ${order?.createdAt ? formatDate(order.createdAt) : ''}`,
    `Total: ${formatMoney(order?.totalAmount || 0)}`,
    '',
    t('order_export_product_keys', 'PRODUCT KEYS'),
    '------------',
  ];

  deliveredItems.forEach((item) => {
    lines.push(`${item.title}${item.platform ? ` (${item.platform})` : ''}`);
    item.keys.forEach((keyCode, index) => {
      lines.push(`  ${index + 1}. ${keyCode}`);
    });
    lines.push('');
  });

  lines.push(t('order_export_footer', 'Keep these keys secure. This file contains purchased digital goods.'));
  return lines.join('\n');
};

const triggerTextDownload = (filename, content) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const updateDownloadAction = (order) => {
  if (!dom.downloadAction) {
    return;
  }

  if (!hasDownloadableKeys(order)) {
    dom.downloadAction.classList.add('hidden');
    return;
  }

  dom.downloadAction.classList.remove('hidden');
};

const getRevealPath = (orderId) => {
  const guestToken = getGuestToken();
  return guestToken
    ? `/orders/guest/${encodeURIComponent(orderId)}/reveal`
    : `/orders/${encodeURIComponent(orderId)}/reveal`;
};

const loadOrder = async () => {
  const orderId = getOrderId();
  const guestToken = getGuestToken();

  if (!orderId) {
    throw new Error(t('err_order_id_missing', 'Order ID is missing from the page URL'));
  }

  if (guestToken) {
    setGuestOrderToken(guestToken);
    stripGuestTokenFromUrl();
    return guestOrderClient.get(`/orders/guest/${encodeURIComponent(orderId)}`);
  }

  if (!isAuthenticated()) {
    throw new Error(t('err_sign_in_required', 'Please sign in or open your guest order link again'));
  }

  return apiGet(`/orders/${encodeURIComponent(orderId)}`, true);
};

const renderItems = (order) => {
  if (!dom.items) {
    return;
  }

  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) {
    dom.items.innerHTML = '<div class="border border-[var(--border)] bg-[var(--void)] p-4 text-[var(--muted)] dark:border-[var(--border)] dark:bg-[var(--void)] dark:text-[var(--muted)]">' + t('no_items_found', 'No items found for this order.') + '</div>';
    return;
  }

  dom.items.innerHTML = items
    .map((item) => {
      const keys = Array.isArray(item.keys) ? item.keys : [];
      const keyBlock = keys.length
        ? `
          <div class="mt-4 border border-cyan/20 bg-cyan/5 p-4">
            <p class="font-mono text-xs uppercase tracking-[0.25em] text-cyan">${t('order_export_product_keys', 'Purchased Keys')}</p>
            <div class="mt-3 grid gap-2">
              ${keys
                .map(
                  (keyCode) => `
                    <div class="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--void)] px-3 py-2 dark:border-[var(--border)] dark:bg-[var(--void)]">
                      <code class="font-mono text-xs text-[var(--ivory)]">${escapeHtml(keyCode)}</code>
                      <span class="font-mono text-[10px] uppercase tracking-[0.25em] text-success">${t('status_ready', 'Ready')}</span>
                    </div>
                  `
                )
                .join('')}
            </div>
          </div>
        `
        : `
          <div class="mt-4 border border-[var(--border)] bg-[var(--void)] p-4 text-sm text-[var(--muted)] dark:border-[var(--border)] dark:bg-[var(--void)] dark:text-[var(--muted)]">
            ${order?.reveal?.required && !order?.reveal?.verified && Number(item.delivery?.deliveredKeyCount || 0) > 0
              ? t('order_keys_ready_verify', 'Keys are ready. Complete the quick verification step to reveal them here.')
              : item.delivery?.status === 'PENDING'
              ? t('order_keys_pending_payment', 'Keys will appear here after payment confirmation.')
              : t('order_keys_being_prepared', 'Keys are being prepared and will appear here once delivery completes.')}
          </div>
        `;

      return `
        <article class="border border-[var(--border)] bg-[var(--void)] p-4 dark:border-[var(--border)] dark:bg-[var(--void)]">
          <div class="flex flex-col gap-4 sm:flex-row">
            <a href="game-detail.html?slug=${encodeURIComponent(item.game?.slug || '')}" class="shrink-0">
              <img loading="lazy" src="${escapeHtml(item.game?.coverImage || '')}" alt="${escapeHtml(item.game?.title || t('label_game', 'Game'))}" class="h-28 w-20 rounded object-cover">
            </a>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <a href="game-detail.html?slug=${encodeURIComponent(item.game?.slug || '')}" class="font-display text-xl font-bold text-[var(--ivory)] hover:text-cyan dark:text-[var(--ivory)]">${escapeHtml(item.game?.title || t('label_game', 'Game'))}</a>
                <span class="${statusBadgeClass(item.delivery?.status)}">${escapeHtml(item.delivery?.status || 'PENDING')}</span>
              </div>
              <p class="mt-2 font-mono text-xs uppercase tracking-[0.25em] text-[var(--muted)]">${escapeHtml(item.game?.platform || t('label_platform_pc', 'PC'))} • ${t('label_qty', 'Qty')} ${Number(item.quantity || 0)}</p>
              ${item.variant?.name ? `<p class="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-gold">${escapeHtml(item.variant.name)}</p>` : ''}
              <div class="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                <div>
                  <p class="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">${t('label_line_total', 'Line Total')}</p>
                  <p class="mt-1 text-[var(--ivory)]">${formatMoney(item.totalPrice || 0)}</p>
                </div>
                <div>
                  <p class="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">${t('label_qty_delivered', 'Delivered')}</p>
                  <p class="mt-1 text-[var(--ivory)]">${Number(item.delivery?.deliveredKeyCount || 0)}</p>
                </div>
                <div>
                  <p class="font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">${t('label_qty_pending', 'Pending')}</p>
                  <p class="mt-1 text-[var(--ivory)]">${Number(item.delivery?.pendingKeyCount || 0)}</p>
                </div>
              </div>
              ${keyBlock}
            </div>
          </div>
        </article>
      `;
    })
    .join('');
};

const renderPayment = (payment) => {
  if (!dom.paymentPanel) {
    return;
  }

  if (!payment) {
    dom.paymentPanel.innerHTML = '<p class="text-[var(--muted)]">' + t('payment_not_created', 'Payment record has not been created yet.') + '</p>';
    return;
  }

  dom.paymentPanel.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-[var(--muted)]">${t('label_provider', 'Provider')}</span>
      <span class="font-mono text-[var(--ivory)]">${escapeHtml(payment.provider || 'CHARGILY')}</span>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-[var(--muted)]">${t('label_status', 'Status')}</span>
      <span class="${statusBadgeClass(payment.status)}">${escapeHtml(payment.status || 'PENDING')}</span>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-[var(--muted)]">${t('label_amount', 'Amount')}</span>
      <span class="font-mono text-[var(--ivory)]">${formatMoney(payment.amount || 0)}</span>
    </div>
    <div class="flex items-center justify-between">
      <span class="text-[var(--muted)]">${t('label_paid_at', 'Paid At')}</span>
      <span class="font-mono text-[var(--ivory)]">${payment.paidAt ? formatDate(payment.paidAt) : t('payment_not_paid', 'Not paid yet')}</span>
    </div>
    ${payment.failureReason ? `<div class="border border-red-400/30 bg-red-400/10 p-3 text-red-500 dark:text-red-300">${escapeHtml(payment.failureReason)}</div>` : ''}
  `;
};

const renderShipping = (shippingAddress, order) => {
  if (!dom.shippingPanel) {
    return;
  }

  const displayName = `${shippingAddress?.firstName || ''} ${shippingAddress?.lastName || ''}`.trim()
    || order.customerName
    || t('label_customer', 'Customer');
  const displayEmail = shippingAddress?.email || order.customerEmail || '';
  const displayPhone = shippingAddress?.phone || order.customerPhone || '';

  if (!shippingAddress) {
    dom.shippingPanel.innerHTML = `
      <p class="text-[var(--ivory)]">${escapeHtml(displayName)}</p>
      <p class="text-[var(--muted)]">${escapeHtml(displayEmail)}</p>
      <p class="mt-2 text-[var(--muted)]">${escapeHtml(displayPhone || t('shipping_no_phone', 'No phone provided'))}</p>
    `;
    return;
  }

  dom.shippingPanel.innerHTML = `
    <p class="text-[var(--ivory)]">${escapeHtml(displayName)}</p>
    <p class="text-[var(--muted)]">${escapeHtml(displayEmail)}</p>
    <p class="mt-2 text-[var(--muted)]">${escapeHtml(displayPhone || t('shipping_no_phone', 'No phone provided'))}</p>
  `;
};

const renderReveal = (order) => {
  if (!dom.revealCard || !dom.revealPanel) {
    return;
  }

  const reveal = order?.reveal || null;
  if (!reveal?.required) {
    dom.revealCard.classList.add('hidden');
    dom.revealPanel.innerHTML = '';
    return;
  }

  dom.revealCard.classList.remove('hidden');

  if (reveal.verified) {
    dom.revealPanel.innerHTML = `
      <div class="border border-success/30 bg-success/10 p-4 text-success">
        ${t('order_keys_unlocked', 'Keys are unlocked for this browser session. Your purchase was also sent to {email}.').replace('{email}', escapeHtml(order.customerEmail || 'your email'))}
      </div>
    `;
    return;
  }

  dom.revealPanel.innerHTML = `
    <p class="text-[var(--ivory)]">${t('order_reveal_instruction', 'To reveal purchased keys here, confirm the order email address.')}</p>
    <p class="mt-2 text-[var(--muted)]">${t('order_reveal_hint', 'Use the email matching {hint}. Keys are also sent by email after delivery.').replace('{hint}', escapeHtml(reveal.hint || 'this order'))}</p>
    <form id="order-reveal-form" class="mt-4 space-y-3">
      <input
        id="order-reveal-email"
        type="email"
        autocomplete="email"
        placeholder="${t('order_reveal_email_placeholder', 'Enter the order email')}"
        class="w-full border border-[var(--border)] dark:border-white/20 bg-[var(--void)] px-4 py-3 text-[var(--ivory)] rounded"
        required
      >
      <button
        id="order-reveal-submit"
        type="submit"
        class="btn-cyber w-full bg-cyan py-3 font-display font-bold text-void rounded"
      >
        ${t('btn_reveal_keys', 'REVEAL KEYS')}
      </button>
    </form>
  `;

  const form = document.getElementById('order-reveal-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const emailInput = document.getElementById('order-reveal-email');
    const submitButton = document.getElementById('order-reveal-submit');
    const email = String(emailInput?.value || '').trim();

    if (!email) {
      showToast(t('toast_order_keys_email', 'Enter the order email to reveal keys'), 'error');
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = t('btn_verifying', 'VERIFYING');
    }

    try {
      const response = getGuestToken()
        ? await guestOrderClient.post(getRevealPath(order.id), { email })
        : await apiPost(getRevealPath(order.id), { email }, true);
      const revealedOrder = response?.data;

      if (!revealedOrder) {
        throw new Error(t('order_reveal_failed', 'Unable to reveal purchased keys'));
      }

      renderOrder(revealedOrder);
      showToast(t('toast_order_keys_revealed', 'Purchased keys are now visible'), 'success');
    } catch (error) {
      showToast(error.message || t('toast_order_email_verify_failed', 'Unable to verify order email'), 'error');
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = t('btn_reveal_keys', 'REVEAL KEYS');
      }
    }
  });
};

const renderOrder = (order) => {
  currentOrder = order;

  document.title = `${t('order_title_prefix', 'Order #{order}').replace('{order}', order.orderNumber || order.id)} | SIZO Digital Store`;

  if (dom.heading) {
    dom.heading.textContent = t('order_heading_prefix', 'ORDER {order}').replace('{order}', order.orderNumber || '');
  }

  if (dom.orderNumber) {
    dom.orderNumber.textContent = `#${order.orderNumber || order.id}`;
  }

  if (dom.orderStatusBadge) {
    dom.orderStatusBadge.className = statusBadgeClass(order.status);
    dom.orderStatusBadge.textContent = order.status || 'PENDING';
  }

  if (dom.paymentStatusBadge) {
    dom.paymentStatusBadge.className = statusBadgeClass(order.paymentStatus);
    dom.paymentStatusBadge.textContent = order.paymentStatus || 'PENDING';
  }

  if (dom.orderMeta) {
    const parts = [
      order.createdAt ? t('order_meta_placed', 'Placed {date}').replace('{date}', formatDate(order.createdAt)) : '',
      order.paidAt ? t('order_meta_paid', 'Paid {date}').replace('{date}', formatDate(order.paidAt)) : '',
      order.deliveredAt ? t('order_meta_delivered', 'Delivered {date}').replace('{date}', formatDate(order.deliveredAt)) : '',
    ].filter(Boolean);
    dom.orderMeta.textContent = parts.join(' • ') || t('order_meta_placeholder', 'Order activity will appear here.');
  }

  if (dom.orderTotal) {
    dom.orderTotal.textContent = formatMoney(order.totalAmount || 0);
  }

  if (dom.deliveryDeliveredCount) {
    dom.deliveryDeliveredCount.textContent = String(order.delivery?.deliveredKeyCount || 0);
  }

  if (dom.deliveryReservedCount) {
    dom.deliveryReservedCount.textContent = String(order.delivery?.reservedKeyCount || 0);
  }

  if (dom.deliveryPendingCount) {
    dom.deliveryPendingCount.textContent = String(order.delivery?.pendingKeyCount || 0);
  }

  if (dom.itemCount) {
    dom.itemCount.textContent = t('order_items_count', '{count} items').replace('{count}', String(Array.isArray(order.items) ? order.items.length : 0));
  }

  if (dom.receiptSubtotal) {
    dom.receiptSubtotal.textContent = formatMoney(order.receipt?.subtotalAmount || 0);
  }

  if (dom.receiptDiscount) {
    const discountAmount = Number(order.receipt?.discountAmount || 0);
    dom.receiptDiscount.textContent = discountAmount > 0 ? `-${formatMoney(discountAmount)}` : formatMoney(0);
  }

  if (dom.receiptQuantity) {
    dom.receiptQuantity.textContent = String(order.receipt?.totalQuantity || 0);
  }

  if (dom.receiptTotal) {
    dom.receiptTotal.textContent = formatMoney(order.receipt?.totalAmount || order.totalAmount || 0);
  }

  if (dom.backLink && getGuestToken()) {
    const token = getGuestToken();
    dom.backLink.href = `checkout.html?order=${encodeURIComponent(order.id)}&guest=${encodeURIComponent(token)}`;
    dom.backLink.textContent = t('back_to_checkout', 'BACK TO CHECKOUT');
  }

  if (dom.primaryAction) {
    if ((order.paymentStatus || '').toUpperCase() !== 'PAID') {
      dom.primaryAction.href = '#'; // Prevent default link behavior
      dom.primaryAction.textContent = t('btn_get_fresh_link', 'Get Fresh Link');
      dom.primaryAction.removeAttribute('data-i18n');
      dom.primaryAction.addEventListener('click', async (e) => {
        e.preventDefault();
        const orderId = order.id;
        try {
          let response;
          if (isAuthenticated()) {
            response = await apiPost(`/payments/${orderId}/regenerate`, undefined, true);
          } else {
            const token = getGuestToken();
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
      });
    } else {
      dom.primaryAction.href = 'browse.html';
      dom.primaryAction.textContent = t('btn_continue_shopping', 'CONTINUE SHOPPING');
    }
  }

  renderItems(order);
  renderReveal(order);
  renderPayment(order.payment || null);
  renderShipping(order.shippingAddress || null, order);
  updateDownloadAction(order);
  syncLucide();
  renderI18n();
};

const init = async () => {
  await initShell();
  renderSkeletons();

  dom.downloadAction?.addEventListener('click', () => {
    if (!hasDownloadableKeys(currentOrder)) {
      showToast(t('toast_order_keys_verify_first', 'Verify the order email before downloading keys'), 'error');
      return;
    }

    const filenameBase = (currentOrder?.orderNumber || currentOrder?.id || 'order')
      .toString()
      .toLowerCase();
    triggerTextDownload(`sizo-${filenameBase}-keys.txt`, buildKeysDownloadText(currentOrder));
    showToast(t('toast_keys_downloaded', 'Keys download started'), 'success');
  });

  try {
    const response = await loadOrder();
    const order = response?.data;

    if (!order) {
      throw new Error(t('toast_order_load_failed', 'Unable to load order details'));
    }

    renderOrder(order);
  } catch (error) {
    showToast(error.message || t('toast_order_load_failed', 'Unable to load order'), 'error');
    if (dom.items) {
      dom.items.innerHTML = `<div class="border border-red-400/30 bg-red-400/10 p-4 text-red-500 dark:text-red-300">${escapeHtml(error.message || t('toast_order_load_failed', 'Unable to load order'))}</div>`;
    }
  }
};

init();
