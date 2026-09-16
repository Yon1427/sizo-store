// assets/js/core/i18n.js
// Lightweight i18n — no library.

const DEFAULT_LANG = 'en';
const SUPPORTED_LANGS = ['en', 'fr', 'ar'];

let _currentLang = localStorage.getItem('sizo-lang') || detectLang();
let _translations = {};

export function detectLang() {
  const nav = navigator.language || navigator.userLanguage || '';
  const base = nav.split('-')[0];
  return SUPPORTED_LANGS.includes(base) ? base : DEFAULT_LANG;
}

export async function loadTranslations(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
  try {
    const mod = await import(`../i18n/${lang}.js`);
    _translations = mod.default || mod;
    _currentLang = lang;
  } catch (e) {
    /* i18n load failed */
    try {
      const fallback = await import(`../i18n/${DEFAULT_LANG}.js`);
      _translations = fallback.default || fallback;
      _currentLang = DEFAULT_LANG;
    } catch (e2) {
      /* i18n fallback failed */
      _translations = {};
      _currentLang = DEFAULT_LANG;
    }
  }
}

export function t(key, fallback = '') {
  return _translations[key] || fallback || key;
}

export function getLang() {
  return _currentLang;
}

export async function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  try {
    localStorage.setItem('sizo-lang', lang);
  } catch (e) {
    /* i18n: localStorage unavailable */
  }
  _currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  await loadTranslations(lang);
  renderI18n();
}

export function renderI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key, el.textContent);
    if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
      el.placeholder = text;
    } else {
      el.textContent = text;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key, el.placeholder);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    const fallback = el.getAttribute('aria-label') || '';
    el.setAttribute('aria-label', t(key, fallback));
  });
}

export async function initI18n() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlLang = urlParams.get('lang');
  if (urlLang && SUPPORTED_LANGS.includes(urlLang)) {
    try {
      localStorage.setItem('sizo-lang', urlLang);
    } catch (e) {
      /* i18n: localStorage unavailable */
    }
    _currentLang = urlLang;
  }
  await loadTranslations(_currentLang);
  document.documentElement.lang = _currentLang;
  document.documentElement.dir = _currentLang === 'ar' ? 'rtl' : 'ltr';
  renderI18n();
}
