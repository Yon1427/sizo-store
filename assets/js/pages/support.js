import { apiGet, apiPost } from '../core/http.js';
import { createTurnstileGuard } from '../core/security.js';
import { getUser, isAuthenticated } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';
import { escapeHtml } from '../core/format.js';

const dom = {
  form: document.getElementById('support-ticket-form'),
  name: document.getElementById('support-name'),
  email: document.getElementById('support-email'),
  orderNumber: document.getElementById('support-order-number'),
  category: document.getElementById('support-category'),
  subject: document.getElementById('support-subject'),
  message: document.getElementById('support-message'),
  submit: document.getElementById('support-submit'),
  response: document.getElementById('support-ticket-response'),
  history: document.getElementById('support-ticket-history'),
};
const turnstileGuardPromise = createTurnstileGuard({ containerId: 'support-turnstile' });


const statusClass = (status = '') => {
  switch (String(status).toUpperCase()) {
    case 'RESOLVED':
      return 'text-success';
    case 'IN_PROGRESS':
      return 'text-cyan';
    case 'CLOSED':
      return 'text-red-500 dark:text-red-300';
    default:
      return 'text-gold';
  }
};

const fillProfileDefaults = () => {
  const user = getUser();
  if (!user) {
    return;
  }

  if (dom.name && !dom.name.value) {
    dom.name.value = user.name || '';
  }

  if (dom.email && !dom.email.value) {
    dom.email.value = user.email || '';
  }
};

const renderHistory = (tickets = []) => {
  if (!dom.history) {
    return;
  }

  if (!tickets.length) {
    dom.history.innerHTML = `
      <div class="rounded-2xl border border-[var(--border)] bg-[var(--void)] p-4 text-[var(--muted)] dark:border-[var(--border)] dark:bg-[var(--void)] dark:text-[var(--muted)]">
        ${t('no_support_tickets', 'No recent support tickets yet.')}
      </div>
    `;
    return;
  }

  dom.history.innerHTML = tickets
    .map((ticket) => `
      <article class="rounded-2xl border border-[var(--border)] bg-[var(--void)] p-4 dark:border-[var(--border)] dark:bg-[var(--void)]">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-mono text-xs uppercase tracking-[0.2em] text-cyan">${escapeHtml(ticket.ticketNumber || ticket.id)}</p>
            <h3 class="mt-2 font-display text-lg font-bold">${escapeHtml(ticket.subject || 'Support Ticket')}</h3>
          </div>
          <span class="font-mono text-xs uppercase tracking-[0.2em] ${statusClass(ticket.status)}">${escapeHtml(ticket.status || 'OPEN')}</span>
        </div>
        <p class="mt-2 text-sm text-[var(--muted)]">${escapeHtml(ticket.category || 'GENERAL')}${ticket.orderNumber ? ` • ${escapeHtml(ticket.orderNumber)}` : ''}</p>
        <p class="mt-3 text-sm text-[var(--ivory)]">${escapeHtml(ticket.message || '').slice(0, 180)}</p>
        ${ticket.resolution ? `<p class="mt-3 text-sm text-cyan">Resolution: ${escapeHtml(ticket.resolution)}</p>` : ''}
      </article>
    `)
    .join('');
};

const loadHistory = async () => {
  if (!isAuthenticated()) {
    return;
  }

  try {
    const response = await apiGet('/support/tickets', true);
    renderHistory(Array.isArray(response?.data) ? response.data : []);
  } catch (error) {
    renderHistory([]);
    showToast(error.message || 'Unable to load support history', 'error');
  }
};

const setSubmitting = (submitting) => {
  if (!dom.submit) {
    return;
  }

  dom.submit.disabled = submitting;
  dom.submit.textContent = submitting ? t('btn_submitting', 'SUBMITTING...') : t('btn_submit_ticket', 'SUBMIT TICKET');
};

const init = () => {
  fillProfileDefaults();
  void loadHistory();

  dom.form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      name: String(dom.name?.value || '').trim(),
      email: String(dom.email?.value || '').trim(),
      orderNumber: String(dom.orderNumber?.value || '').trim(),
      category: String(dom.category?.value || 'GENERAL').trim(),
      subject: String(dom.subject?.value || '').trim(),
      message: String(dom.message?.value || '').trim(),
    };

    if (!payload.name || !payload.email || !payload.subject || !payload.message) {
      showToast(t('toast_support_fields_required', 'Please complete the required support fields'), 'error');
      return;
    }

    setSubmitting(true);
    if (dom.response) {
      dom.response.textContent = '';
    }

    try {
      const turnstileGuard = await turnstileGuardPromise;
      const turnstileToken = await turnstileGuard.consumeToken();
      const response = await apiPost('/support/tickets', {
        ...payload,
        turnstileToken,
      });
      const ticket = response?.data;
      const ticketNumber = ticket?.ticketNumber || 'your ticket';

      if (dom.response) {
        dom.response.textContent = `${ticketNumber} created successfully.`;
      }

      dom.form?.reset();
      fillProfileDefaults();
      await loadHistory();
      showToast(t('toast_support_submitted', 'Support ticket submitted'), 'success');
    } catch (error) {
      turnstileGuardPromise?.reset?.();
      if (dom.response) {
        dom.response.textContent = error.message || 'Unable to submit support ticket.';
      }
      showToast(error.message || 'Unable to submit support ticket', 'error');
    } finally {
      setSubmitting(false);
    }
  });
};

init();
