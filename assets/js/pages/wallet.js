import { t } from '../core/i18n.js';
import { apiGet, apiPost } from '../core/http.js';
import { formatMoney, escapeHtml } from '../core/format.js';
import { showToast } from '../core/toast.js';
import { syncLucide } from '../core/shell.js';

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000];
let currentPage = 1;
let currentFilter = 'ALL';
let walletBalance = 0;

const txTypeBadge = (type) => {
  const map = {
    DEPOSIT: 'badge-success',
    PURCHASE: 'badge-coral',
    REFUND: 'badge-info',
    ADJUSTMENT: 'badge-warning',
    GIFT_CARD_REDEEM: 'badge-cyan',
  };
  const i18nType = type === 'GIFT_CARD_REDEEM' ? 'gift_card' : type.toLowerCase();
  const fallback = type.replace(/_/g, ' ');
  return `<span class="badge ${map[type] || 'badge-neutral'}">${t('wallet_tx_' + i18nType, escapeHtml(fallback))}</span>`;
};

const loadTransactions = async (append = false) => {
  const container = document.getElementById('wallet-tx-container');
  if (!container) return;

  if (!append) {
    container.innerHTML = '<div class="skeleton-pulse" style="height:200px"></div>';
  }

  try {
    const res = await apiGet('/wallet/transactions?page=' + currentPage + '&limit=20&type=' + currentFilter, true);
    const data = res.data || {};
    walletBalance = data.balance;

    const balanceEl = document.querySelector('.wallet-balance-amount');
    if (balanceEl) balanceEl.textContent = formatMoney(walletBalance);

    const txHtml = data.transactions && data.transactions.length > 0
      ? data.transactions.map((tx) => `
        <tr>
          <td data-label="Date">${new Date(tx.createdAt).toLocaleDateString()}</td>
          <td data-label="Type">${txTypeBadge(tx.type)}</td>
          <td data-label="Amount" class="${tx.amount >= 0 ? 'text-success' : 'text-coral'}">${tx.amount >= 0 ? '+' : ''}${formatMoney(tx.amount)}</td>
          <td data-label="Balance">${formatMoney(tx.runningBalance)}</td>
          <td data-label="Details" class="text-muted">${escapeHtml(tx.description || '')}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="5" class="text-muted text-center">' + t('wallet_no_transactions', 'No transactions yet.') + '</td></tr>';

    if (append) {
      const tbody = container.querySelector('table tbody');
      if (tbody) {
        tbody.insertAdjacentHTML('beforeend', txHtml);
        const hasMore = data.pagination.page < data.pagination.totalPages;
        document.getElementById('wallet-load-more-row').style.display = hasMore ? '' : 'none';
        return;
      }
    }

    container.innerHTML = '<div class="table-responsive"><table class="wallet-tx-table">' +
      '<thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Details</th></tr></thead>' +
      '<tbody>' + txHtml + '</tbody></table></div>';

    const hasMore = data.pagination.page < data.pagination.totalPages;
    document.getElementById('wallet-load-more-row').style.display = hasMore ? '' : 'none';
  } catch (err) {
    container.innerHTML = '<p class="text-coral text-center">' + (err.message || 'Failed to load transactions.') + '</p>';
  }
};

const showTopUpModal = () => {
  const modal = document.getElementById('wallet-modal-container');
  if (!modal) return;
  let selectedAmount = 0;

  modal.innerHTML = `
    <div class="modal-overlay" id="topup-modal-overlay">
      <div class="modal-content" role="dialog" aria-labelledby="topup-modal-title">
        <div class="modal-header">
          <h3 id="topup-modal-title">${t('wallet_top_up_title', 'Add Funds to Wallet')}</h3>
          <button class="modal-close" id="topup-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="denomination-grid" role="radiogroup" aria-label="${t('wallet_top_up_title', 'Top-up amounts')}">
            ${PRESET_AMOUNTS.map((amt, i) => `
              <button class="gc-denomination" role="radio" aria-pressed="false" data-amount="${amt}" id="topup-preset-${i}">${formatMoney(amt)}</button>
            `).join('')}
          </div>
          <div class="custom-amount-row">
            <label for="topup-custom-amount">${t('wallet_top_up_custom', 'Custom amount')}</label>
            <div class="input-group">
              <input type="number" id="topup-custom-amount" class="input-cyber" min="500" max="100000" step="100" placeholder="500">
              <span class="input-suffix">DZD</span>
            </div>
            <small class="text-muted">${t('wallet_top_up_min', 'Minimum 500 DZD')}</small>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cyber btn-primary" id="topup-proceed-btn" disabled>${t('wallet_top_up_proceed', 'Proceed to Payment')}</button>
        </div>
      </div>
    </div>
  `;

  const proceedBtn = document.getElementById('topup-proceed-btn');
  const customInput = document.getElementById('topup-custom-amount');

  modal.querySelectorAll('.gc-denomination').forEach((btn) => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.gc-denomination').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      selectedAmount = parseInt(btn.dataset.amount);
      if (customInput) customInput.value = '';
      if (proceedBtn) proceedBtn.disabled = false;
    });
  });

  if (customInput) {
    customInput.addEventListener('input', () => {
      const val = parseInt(customInput.value);
      if (val >= 500 && val <= 100000) {
        selectedAmount = val;
        if (proceedBtn) proceedBtn.disabled = false;
        modal.querySelectorAll('.gc-denomination').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      } else {
        if (proceedBtn) proceedBtn.disabled = true;
      }
    });
  }

  proceedBtn?.addEventListener('click', async () => {
    if (selectedAmount < 500) return;
    proceedBtn.disabled = true;
    proceedBtn.textContent = '...';
    try {
      const result = await apiPost('/wallet/top-up', { amount: selectedAmount }, true);
      window.location.href = result.data?.checkoutUrl;
    } catch (err) {
      showToast(err.message || 'Top-up failed', 'error');
      proceedBtn.disabled = false;
      proceedBtn.textContent = t('wallet_top_up_proceed', 'Proceed to Payment');
    }
  });

  document.getElementById('topup-modal-close')?.addEventListener('click', () => { modal.innerHTML = ''; });
  document.getElementById('topup-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) modal.innerHTML = '';
  });
};

const showRedeemModal = () => {
  const modal = document.getElementById('wallet-modal-container');
  if (!modal) return;
  let validatedAmount = 0;

  modal.innerHTML = `
    <div class="modal-overlay" id="redeem-modal-overlay">
      <div class="modal-content" role="dialog" aria-labelledby="redeem-modal-title">
        <div class="modal-header">
          <h3 id="redeem-modal-title">${t('gift_card_redeem_title', 'Redeem Gift Card')}</h3>
          <button class="modal-close" id="redeem-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="giftcard-code-input">${t('gift_card_code', 'Gift Card Code')}</label>
            <input type="text" id="giftcard-code-input" class="input-cyber" placeholder="SIZO-XXXX-XXXX" maxlength="19" autocomplete="off">
          </div>
          <div id="giftcard-validation-result" class="hidden" style="margin-top:0.5rem"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-cyber btn-secondary" id="redeem-validate-btn">${t('gift_card_validate', 'Validate')}</button>
          <button class="btn-cyber btn-primary" id="redeem-confirm-btn" disabled>${t('gift_card_redeem', 'Redeem')}</button>
        </div>
      </div>
    </div>
  `;

  const codeInput = document.getElementById('giftcard-code-input');
  const validateBtn = document.getElementById('redeem-validate-btn');
  const confirmBtn = document.getElementById('redeem-confirm-btn');
  const resultDiv = document.getElementById('giftcard-validation-result');

  codeInput?.addEventListener('input', () => {
    let val = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val.length > 8) val = 'SIZO-' + val.slice(4, 8) + '-' + val.slice(8, 12);
    else if (val.length > 4) val = 'SIZO-' + val.slice(4, 8);
    else if (val.length > 0) val = 'SIZO-' + val;
    codeInput.value = val.substring(0, 19);
    validatedAmount = 0;
    if (confirmBtn) confirmBtn.disabled = true;
    if (resultDiv) { resultDiv.classList.add('hidden'); resultDiv.innerHTML = ''; }
  });

  validateBtn?.addEventListener('click', async () => {
    const code = codeInput?.value.trim();
    if (!code || code.length < 10) return;
    validateBtn.disabled = true;
    try {
      const result = await apiGet('/gift-cards/validate/' + encodeURIComponent(code));
      const cardData = result.data || {};
      if (cardData.valid) {
        validatedAmount = cardData.amount;
        if (resultDiv) {
          resultDiv.classList.remove('hidden');
          resultDiv.innerHTML = '<div class="alert alert-success">' + t('gift_card_amount', '{amount} DZD').replace('{amount}', cardData.amount) + '</div>';
        }
        if (confirmBtn) confirmBtn.disabled = false;
      } else {
        validatedAmount = 0;
        if (resultDiv) {
          resultDiv.classList.remove('hidden');
          const msg = cardData.reason === 'EXPIRED' ? t('gift_card_expired', 'This gift card has expired.') : t('gift_card_invalid', 'Invalid or expired code.');
          resultDiv.innerHTML = '<div class="alert alert-error">' + msg + '</div>';
        }
        if (confirmBtn) confirmBtn.disabled = true;
      }
    } catch (err) {
      if (resultDiv) {
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = '<div class="alert alert-error">' + t('gift_card_invalid', 'Invalid code.') + '</div>';
      }
    } finally {
      validateBtn.disabled = false;
    }
  });

  confirmBtn?.addEventListener('click', async () => {
    const code = codeInput?.value.trim();
    if (!code || validatedAmount <= 0) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = '...';
    try {
      await apiPost('/gift-cards/redeem', { code }, true);
      showToast(t('gift_card_redeem_confirm', 'Added {amount} DZD to your wallet.').replace('{amount}', String(validatedAmount)), 'success');
      modal.innerHTML = '';
      currentPage = 1;
      await loadTransactions();
    } catch (err) {
      if (err.message && err.message.indexOf('already redeemed') !== -1) {
        showToast(t('gift_card_redeemed', 'This gift card was already redeemed.'), 'error');
      } else {
        showToast(err.message || 'Redemption failed', 'error');
      }
      confirmBtn.disabled = false;
      confirmBtn.textContent = t('gift_card_redeem', 'Redeem');
    }
  });

  document.getElementById('redeem-modal-close')?.addEventListener('click', () => { modal.innerHTML = ''; });
  document.getElementById('redeem-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) modal.innerHTML = '';
  });
};

const exportCSV = async () => {
  try {
    const res = await apiGet('/wallet/transactions?limit=1000&type=ALL', true);
    const transactions = (res.data && res.data.transactions) || [];
    const rows = [
      ['Date', 'Type', 'Amount', 'Balance', 'Description'].join(','),
      ...transactions.map((tx) =>
        [tx.createdAt, tx.type, tx.amount, tx.runningBalance, '"' + (tx.description || '').replace(/"/g, '""') + '"'].join(',')
      ),
    ];
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sizo-wallet-transactions-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported!', 'success');
  } catch (err) {
    showToast('Export failed: ' + (err.message || 'Unknown error'), 'error');
  }
};

export const renderWalletTab = async (container) => {
  container.innerHTML = `
    <div class="wallet-page">
      <div class="wallet-balance-card">
        <div class="wallet-balance-header">${t('wallet_balance', 'Your Balance')}</div>
        <div class="wallet-balance-amount">${formatMoney(0)}</div>
        <div class="wallet-actions">
          <button class="btn-cyber" id="wallet-topup-btn">
            <i data-lucide="plus-circle" style="width:16px;height:16px"></i>
            ${t('wallet_top_up', 'Top Up')}
          </button>
          <button class="btn-cyber" id="wallet-redeem-btn">
            <i data-lucide="gift" style="width:16px;height:16px"></i>
            ${t('wallet_redeem_gift_card', 'Redeem Gift Card')}
          </button>
        </div>
      </div>

      <div class="wallet-stats-row">
        <div class="stat-card">
          <div class="stat-label">${t('wallet_deposits', 'Deposits')}</div>
          <div class="stat-value" id="wallet-stat-deposits">--</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">${t('wallet_total_spent', 'Total spent')}</div>
          <div class="stat-value" id="wallet-stat-spent">--</div>
        </div>
      </div>

      <div class="wallet-tx-section">
        <div class="wallet-tx-header">
          <h3>Transaction History</h3>
          <div class="wallet-tx-controls">
            <select id="wallet-filter" class="input-cyber input-sm" aria-label="Filter transactions">
              <option value="ALL">${t('wallet_filter_all', 'All')}</option>
              <option value="DEPOSIT">${t('wallet_tx_deposit', 'Deposits')}</option>
              <option value="PURCHASE">${t('wallet_tx_purchase', 'Purchases')}</option>
              <option value="REFUND">${t('wallet_tx_refund', 'Refunds')}</option>
              <option value="GIFT_CARD_REDEEM">${t('wallet_tx_gift_card', 'Gift Cards')}</option>
              <option value="ADJUSTMENT">${t('wallet_tx_adjustment', 'Adjustments')}</option>
            </select>
            <button class="btn-cyber btn-sm" id="wallet-export-btn" aria-label="${t('wallet_export_csv', 'Export CSV')}">
              <i data-lucide="download" style="width:16px;height:16px"></i>
              ${t('wallet_export_csv', 'Export CSV')}
            </button>
          </div>
        </div>
        <div id="wallet-tx-container"></div>
        <div id="wallet-load-more-row" class="text-center" style="display:none;margin-top:1rem">
          <button class="btn-cyber" id="wallet-load-more">Load More</button>
        </div>
      </div>

      <div id="wallet-modal-container"></div>
    </div>
  `;

  syncLucide();
  await loadTransactions();

  // Quick stats — show error state on failure instead of stale '--' values
  (async () => {
    try {
      const res = await apiGet('/wallet/transactions?limit=1000', true);
      const transactions = (res.data && res.data.transactions) || [];
      const deposits = transactions.filter((t) => t.type === 'DEPOSIT' || t.type === 'GIFT_CARD_REDEEM').length;
      const spent = transactions.filter((t) => t.type === 'PURCHASE').reduce((sum, t) => sum + Math.abs(t.amount), 0);
      document.getElementById('wallet-stat-deposits').textContent = deposits;
      document.getElementById('wallet-stat-spent').textContent = formatMoney(spent);
    } catch (err) {
      console.warn('Failed to load wallet stats:', err);
      const errorMsg = t('wallet_stats_error', '—');
      document.getElementById('wallet-stat-deposits').textContent = errorMsg;
      document.getElementById('wallet-stat-spent').textContent = errorMsg;
    }
  })();

  // Event listeners
  document.getElementById('wallet-topup-btn')?.addEventListener('click', showTopUpModal);
  document.getElementById('wallet-redeem-btn')?.addEventListener('click', showRedeemModal);
  document.getElementById('wallet-filter')?.addEventListener('change', (e) => {
    currentFilter = e.target.value;
    currentPage = 1;
    loadTransactions();
  });
  document.getElementById('wallet-load-more')?.addEventListener('click', () => {
    currentPage++;
    loadTransactions(true);
  });
  document.getElementById('wallet-export-btn')?.addEventListener('click', exportCSV);
};
