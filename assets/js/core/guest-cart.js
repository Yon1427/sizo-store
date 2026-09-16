const GUEST_CART_KEY = 'sizo_guest_cart';
const MAX_CART_ITEMS = 50;

// One-shot flag set by persistItems when the cart exceeded MAX_CART_ITEMS and
// was silently truncated. Surface it via consumeGuestCartTruncationNotice().
let lastPersistTruncated = false;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampQuantity = (value) => {
  const quantity = Math.trunc(toNumber(value, 1));
  if (quantity < 1) {
    return 1;
  }
  if (quantity > 99) {
    return 99;
  }
  return quantity;
};

const normalizeText = (value, fallback = '') => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
};

export const normalizeGameSnapshot = (game = {}) => {
  const id = normalizeText(game.id);
  if (!id) {
    return null;
  }

  return {
    id,
    title: normalizeText(game.title, 'Game'),
    slug: normalizeText(game.slug),
    coverImage: normalizeText(game.coverImage),
    price: toNumber(game.price, 0),
    startingPrice: toNumber(game.startingPrice, toNumber(game.price, 0)),
    originalPrice: toNumber(game.originalPrice, toNumber(game.price, 0)),
    startingOriginalPrice: toNumber(game.startingOriginalPrice, toNumber(game.originalPrice, toNumber(game.price, 0))),
    platform: normalizeText(game.platform, 'PC'),
    hasVariants: Boolean(game.hasVariants),
    category: {
      name: normalizeText(game.category?.name, 'GAME'),
      slug: normalizeText(game.category?.slug),
    },
  };
};

const normalizeVariantSnapshot = (variant = {}) => {
  const id = normalizeText(variant.id);
  if (!id) {
    return null;
  }

  return {
    id,
    sku: normalizeText(variant.sku),
    name: normalizeText(variant.name, 'Option'),
    description: normalizeText(variant.description),
    price: toNumber(variant.price, 0),
    originalPrice: toNumber(variant.originalPrice, toNumber(variant.price, 0)),
  };
};

const normalizeMetadata = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value)
    .filter(
      ([key, val]) =>
        typeof key === 'string' &&
        key.length > 0 &&
        key.length <= 50 &&
        (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')
    )
    .slice(0, 10)
    .map(([key, val]) => [key, typeof val === 'string' ? val.slice(0, 255) : val]);

  return entries.length ? Object.fromEntries(entries) : null;
};

const buildItemId = (gameId, variantId = '') =>
  variantId ? `${gameId}:${variantId}` : gameId;

const parseStoredItems = () => {
  const raw = window.localStorage.getItem(GUEST_CART_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const game = normalizeGameSnapshot(item?.game || {});
        const id = normalizeText(item?.id || item?.gameId || game?.id || '');
        if (!game || !id) {
          return null;
        }

        return {
          id,
          gameId: game.id,
          variantId: normalizeText(item?.variantId || item?.variant?.id || ''),
          quantity: clampQuantity(item?.quantity),
          metadata: normalizeMetadata(item?.metadata),
          game,
          variant: normalizeVariantSnapshot(item?.variant || {}),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const persistItems = (items) => {
  const sanitized = Array.isArray(items)
    ? items
      .map((item) => {
        const game = normalizeGameSnapshot(item?.game || {});
        const id = normalizeText(item?.id || item?.gameId || game?.id || '');
        if (!game || !id) {
          return null;
        }

        return {
          id,
          gameId: game.id,
          variantId: normalizeText(item?.variantId || item?.variant?.id || ''),
          quantity: clampQuantity(item?.quantity),
          metadata: normalizeMetadata(item?.metadata),
          game,
          variant: normalizeVariantSnapshot(item?.variant || {}),
        };
      })
      .filter(Boolean)
    : [];

  if (!sanitized.length) {
    window.localStorage.removeItem(GUEST_CART_KEY);
    lastPersistTruncated = false;
    return [];
  }

  // Enforce maximum cart items limit to prevent unbounded localStorage growth
  lastPersistTruncated = sanitized.length > MAX_CART_ITEMS;
  const limited = lastPersistTruncated ? sanitized.slice(0, MAX_CART_ITEMS) : sanitized;

  window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(limited));
  return limited;
};

export const getGuestCartItems = () => parseStoredItems();

export const setGuestCartItems = (items) => persistItems(items);

export const addGuestCartItem = (game, quantity = 1, variant = null, metadata = null) => {
  const snapshot = normalizeGameSnapshot(game);
  const variantSnapshot = normalizeVariantSnapshot(variant || {});
  const itemMetadata = normalizeMetadata(metadata);
  if (!snapshot) {
    return getGuestCartItems();
  }

  const items = getGuestCartItems();
  const itemId = buildItemId(snapshot.id, variantSnapshot?.id || '');
  const existing = items.find(
    (item) => item.gameId === snapshot.id && normalizeText(item.variantId) === normalizeText(variantSnapshot?.id || '')
  );
  if (existing) {
    existing.quantity = clampQuantity(existing.quantity + quantity);
    existing.game = snapshot;
    existing.variant = variantSnapshot;
    existing.variantId = variantSnapshot?.id || '';
    if (itemMetadata) existing.metadata = itemMetadata;
    return persistItems(items);
  }

  items.push({
    id: itemId,
    gameId: snapshot.id,
    variantId: variantSnapshot?.id || '',
    quantity: clampQuantity(quantity),
    metadata: itemMetadata,
    game: snapshot,
    variant: variantSnapshot,
  });

  return persistItems(items);
};

/**
 * Returns true once if the last persist truncated the cart to MAX_CART_ITEMS,
 * then resets the flag. Used to surface a warning toast on add-to-cart.
 */
export const consumeGuestCartTruncationNotice = () => {
  const truncated = lastPersistTruncated;
  lastPersistTruncated = false;
  return truncated;
};

export const updateGuestCartItemQuantity = (itemId, quantity) => {
  const id = normalizeText(itemId);
  if (!id) {
    return getGuestCartItems();
  }

  const items = getGuestCartItems();
  const item = items.find((entry) => entry.id === id || entry.gameId === id);
  if (!item) {
    return items;
  }

  item.quantity = clampQuantity(quantity);
  return persistItems(items);
};

export const removeGuestCartItem = (itemId) => {
  const id = normalizeText(itemId);
  if (!id) {
    return getGuestCartItems();
  }

  const items = getGuestCartItems().filter((item) => item.id !== id && item.gameId !== id);
  return persistItems(items);
};

export const clearGuestCart = () => {
  window.localStorage.removeItem(GUEST_CART_KEY);
};

export const getGuestCartCount = () =>
  getGuestCartItems().reduce((sum, item) => sum + clampQuantity(item.quantity), 0);
