/**
 * Page-load reveal orchestration.
 *
 * The actual animation is CSS-only — see `[data-anim]` rules in
 * tailwind-input.css. CSS `animation-fill-mode: backwards` keeps the element
 * hidden during its delay, and `forwards` keeps the end state after it
 * finishes, so the page works correctly even with JS disabled.
 *
 * This module exists to:
 *   1. Document the contract: any element with a `data-anim` attribute gets
 *      a page-load entrance animation.
 *   2. Provide a future hook (`revealIn(node)`) for re-running the animation
 *      after dynamic DOM insertion (e.g. SPA-style swaps, tab content).
 *   3. Honour `prefers-reduced-motion: reduce` — the global CSS rule already
 *      collapses animations to ~0ms, but this file is the documented seam if
 *      we ever need to do something more sophisticated (e.g. swap the
 *      animation for a fade).
 */

const REVEAL_ATTR = 'data-anim';

/**
 * Re-trigger the entrance animation on a single element (or NodeList).
 * Useful when content is mounted after the initial page paint — e.g. when a
 * profile tab panel is swapped in.
 *
 * Implementation: clone-and-replace the node so the CSS `animation` declaration
 * restarts. We can't just toggle a class because the animation is bound to
 * the [data-anim] attribute, not a class.
 */
export const revealIn = (target) => {
  if (!target) return;
  const nodes =
    target instanceof Element ? [target] : Array.from(target || []);

  for (const node of nodes) {
    if (!(node instanceof Element)) continue;
    if (!node.hasAttribute(REVEAL_ATTR)) continue;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) continue;

    // Force animation restart by removing the attribute, reflowing, and
    // re-adding it. Cheaper than clone-and-replace and preserves listeners.
    const value = node.getAttribute(REVEAL_ATTR);
    const delay = node.getAttribute('data-anim-delay') || '';
    node.removeAttribute(REVEAL_ATTR);
    // eslint-disable-next-line no-unused-expressions
    node.offsetWidth; // force reflow
    node.setAttribute(REVEAL_ATTR, value);
    if (delay) node.setAttribute('data-anim-delay', delay);
  }
};

// No-op on initial load: CSS handles it. Exists for symmetry and as a
// documented entry point for future dynamic-reveal use cases.
export const initPageReveal = () => {
  // Intentionally empty. See file header.
};
