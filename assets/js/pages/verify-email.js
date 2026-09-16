import { apiPost } from '../core/http.js';
import { getUser, setUser } from '../core/session.js';
import { showToast } from '../core/toast.js';
import { t } from '../core/i18n.js';

const titleNode = document.getElementById('verify-email-title');
const copyNode = document.getElementById('verify-email-copy');
const iconNode = document.getElementById('verify-email-icon');
const primaryLink = document.getElementById('verify-email-primary');

const setState = ({ title, copy, icon, tone = 'info', href = 'login.html', label = 'GO TO SIGN IN' }) => {
  if (titleNode) {
    titleNode.textContent = title;
  }

  if (copyNode) {
    copyNode.textContent = copy;
  }

  if (iconNode) {
    iconNode.className = `mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
      tone === 'success'
        ? 'bg-success/15 text-success'
        : tone === 'error'
          ? 'bg-red-400/15 text-red-500 dark:text-red-300'
          : 'bg-cyan/15 text-cyan'
    }`;
    iconNode.innerHTML = icon;
  }

  if (primaryLink) {
    primaryLink.href = href;
    primaryLink.textContent = label;
  }

  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
};

const token = new URLSearchParams(window.location.search).get('token') || '';

if (!token) {
  setState({
    title: t('verify_link_missing', 'Verification link missing'),
    copy: t('verify_link_missing_copy', 'This page needs a valid email verification token. Request a fresh verification email from your account settings.'),
    icon: '<i data-lucide="triangle-alert" class="h-6 w-6"></i>',
    tone: 'error',
    href: 'profile.html?tab=settings',
    label: t('btn_open_settings', 'OPEN SETTINGS'),
  });
} else {
  apiPost('/auth/verify-email/confirm', { token })
    .then((response) => {
      const cachedUser = getUser();
      if (cachedUser) {
        setUser({ ...cachedUser, isVerified: true });
      }

      setState({
        title: t('toast_email_verified', 'Email verified'),
        copy: response?.message || t('email_verified_copy', 'Your email address is now verified and ready to use.'),
        icon: '<i data-lucide="badge-check" class="h-6 w-6"></i>',
        tone: 'success',
        href: cachedUser ? 'profile.html?tab=settings' : 'login.html',
        label: cachedUser ? t('btn_open_account', 'OPEN ACCOUNT') : t('btn_go_to_sign_in', 'GO TO SIGN IN'),
      });
      showToast(t('toast_email_verified', 'Email verified successfully'), 'success');
    })
    .catch((error) => {
      setState({
        title: t('verify_failed', 'Verification failed'),
        copy:
          error.message ||
          t('verify_failed_copy', 'This verification link is invalid or has expired. Request a fresh one from account settings.'),
        icon: '<i data-lucide="circle-x" class="h-6 w-6"></i>',
        tone: 'error',
        href: 'profile.html?tab=settings',
        label: t('btn_open_settings', 'OPEN SETTINGS'),
      });
      showToast(error.message || t('toast_email_verify_failed', 'Unable to verify email'), 'error');
    });
}
