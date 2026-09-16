import { t } from './i18n.js';

const TOAST_ID = 'sizo-toast-root';
const MAX_TOASTS = 3;
const EXIT_DURATION = 300;

const getRoot = () => {
  let root = document.getElementById(TOAST_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = TOAST_ID;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', t('aria_notifications', 'Notifications'));
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-relevant', 'additions');
    root.className = 'toast-container';
    document.body.appendChild(root);
  }
  return root;
};

const dismissToast = (toast) => {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('toast--exiting');
  setTimeout(() => toast.remove(), EXIT_DURATION);
};

export const showToast = (message, type = 'info') => {
  const root = getRoot();

  // Remove oldest toast if we're at max
  const existing = root.querySelectorAll('.toast:not(.toast--exiting)');
  if (existing.length >= MAX_TOASTS) {
    dismissToast(existing[0]);
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.setAttribute('aria-atomic', 'true');
  toast.className = `toast ${type}`;

  root.appendChild(toast);

  const DURATION = 2600;
  let remaining = DURATION;
  let startedAt = Date.now();
  let timeoutId = window.setTimeout(() => {
    dismissToast(toast);
  }, remaining);

  // Pause auto-dismiss on hover, resuming with the time actually left rather
  // than a fixed 1s (so brushing over an old toast doesn't kill it instantly).
  toast.addEventListener('mouseenter', () => {
    clearTimeout(timeoutId);
    remaining -= Date.now() - startedAt;
  });

  toast.addEventListener('mouseleave', () => {
    startedAt = Date.now();
    timeoutId = window.setTimeout(() => {
      dismissToast(toast);
    }, Math.max(remaining, 300));
  });
};