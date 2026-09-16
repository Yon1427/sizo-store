import { buildApiPath } from './config.js';
import { t } from './i18n.js';

const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_TIMEOUT_MS = 15000;

let publicConfigPromise = null;
let turnstileScriptPromise = null;

const readTurnstileConfig = (payload) => {
  const turnstile = payload?.data?.turnstile;
  const siteKey = typeof turnstile?.siteKey === 'string' ? turnstile.siteKey.trim() : '';
  const enabled = Boolean(turnstile?.enabled && siteKey);

  return {
    enabled,
    siteKey: enabled ? siteKey : '',
  };
};

const loadPublicConfig = async () => {
  if (!publicConfigPromise) {
    publicConfigPromise = fetch(buildApiPath('/public/config'))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load public security config (${response.status})`);
        }

        const payload = await response.json();
        return readTurnstileConfig(payload);
      })
      .catch((error) => {
        publicConfigPromise = null;
        throw error instanceof Error
          ? new Error(t('security_load_error', 'Unable to load security verification. Refresh the page and try again.'))
          : new Error(t('security_load_error', 'Unable to load security verification. Refresh the page and try again.'));
      });
  }

  return publicConfigPromise;
};

const loadTurnstileScript = async () => {
  if (window.turnstile) {
    return window.turnstile;
  }

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      let script = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);

      if (script?.dataset?.state === 'error') {
        script.remove();
        script = null;
      }

      const handleLoad = () => {
        if (script) {
          script.dataset.state = 'loaded';
        }

        if (window.turnstile) {
          resolve(window.turnstile);
          return;
        }

        reject(new Error(t('security_load_error', 'Unable to load security verification. Refresh the page and try again.')));
      };

      const handleError = () => {
        if (script) {
          script.dataset.state = 'error';
        }

        reject(new Error(t('security_load_error', 'Unable to load security verification. Refresh the page and try again.')));
      };

      if (!script) {
        script = document.createElement('script');
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }

      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
    }).catch((error) => {
      turnstileScriptPromise = null;
      throw error instanceof Error
        ? error
        : new Error(t('security_load_error', 'Unable to load security verification. Refresh the page and try again.'));
    });
  }

  return turnstileScriptPromise;
};

export const createTurnstileGuard = ({ containerId } = {}) => {
  let initialized = false;
  let initPromise = null;
  let config = null;
  let container = null;
  let widgetId = null;
  let pendingRequest = null;

  const clearPending = () => {
    if (!pendingRequest) {
      return null;
    }

    window.clearTimeout(pendingRequest.timeoutId);
    const activeRequest = pendingRequest;
    pendingRequest = null;
    return activeRequest;
  };

  const initialize = async () => {
    if (initialized) {
      return config;
    }

    if (!initPromise) {
      initPromise = (async () => {
        const nextConfig = await loadPublicConfig();

        if (!nextConfig.enabled) {
          return nextConfig;
        }

        const nextContainer = containerId ? document.getElementById(containerId) : null;
        if (!nextContainer) {
          throw new Error(t('security_container_error', 'Security verification is unavailable on this page. Refresh the page and try again.'));
        }

        await loadTurnstileScript();

        container = nextContainer;
        container.classList.remove('hidden');
        return nextConfig;
      })().then((resolvedConfig) => {
        config = resolvedConfig;
        initialized = true;
        return resolvedConfig;
      }).catch((error) => {
        initPromise = null;
        throw error;
      });
    }

    return initPromise;
  };

  const ensureWidget = async () => {
    const resolvedConfig = await initialize();
    if (!resolvedConfig?.enabled || !container) {
      return null;
    }

    if (widgetId !== null) {
      return container;
    }

    container.innerHTML = '';
    widgetId = window.turnstile.render(container, {
      sitekey: config.siteKey,
      theme: 'auto',
      size: 'flexible',
      appearance: 'interaction-only',
      execution: 'execute',
      callback: (token) => {
        const activeRequest = clearPending();
        if (activeRequest) {
          activeRequest.resolve(token);
        }
      },
      'expired-callback': () => {
        clearPending()?.reject(new Error(t('security_check_expired', 'The security check expired. Please try again.')));
      },
      'timeout-callback': () => {
        clearPending()?.reject(new Error(t('security_check_timed_out', 'The security check timed out. Please try again.')));
      },
      'error-callback': () => {
        clearPending()?.reject(new Error(t('security_verification_failed', 'Security verification failed. Please try again.')));
      },
    });

    return container;
  };

  const reset = () => {
    clearPending();

    if (widgetId !== null && window.turnstile?.reset) {
      window.turnstile.reset(widgetId);
    }
  };

  const ensureToken = async () => {
    const activeContainer = await ensureWidget();
    if (!activeContainer) {
      return '';
    }

    if (
      widgetId !== null &&
      window.turnstile?.getResponse &&
      typeof window.turnstile.getResponse(widgetId) === 'string'
    ) {
      const response = window.turnstile.getResponse(widgetId).trim();
      const expired = window.turnstile?.isExpired
        ? window.turnstile.isExpired(widgetId)
        : false;

      if (response && !expired) {
        return response;
      }
    }

    reset();

    return new Promise((resolve, reject) => {
      pendingRequest = {
        resolve,
        reject,
        timeoutId: window.setTimeout(() => {
          clearPending()?.reject(
            new Error(t('security_check_timed_out', 'The security check timed out. Please try again.'))
          );
        }, TURNSTILE_TIMEOUT_MS),
      };

      try {
        window.turnstile.execute(activeContainer);
      } catch (error) {
        clearPending();
        reject(
          error instanceof Error
            ? error
            : new Error(t('security_start_failed', 'Unable to start security verification.'))
        );
      }
    });
  };

  return {
    get enabled() {
      return Boolean(config?.enabled);
    },
    ensureToken,
    consumeToken: ensureToken,
    reset,
  };
};
