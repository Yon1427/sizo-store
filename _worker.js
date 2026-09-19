/**
 * Pages Function — Advanced mode (_worker.js)
 *
 * Proxies `/api/*`, `/health`, `/health/db` and `/_email/send` to the backend,
 * and serves static assets for everything else.
 *
 * Architecture:
 *   Browser → sizo.uk/api/*  → this Function → fetch(env.API_ORIGIN) → Railway
 *   Browser → sizo.uk/*      → env.ASSETS.fetch() → static assets
 *
 * Why it proxies at all, rather than the storefront calling the API origin
 * directly: keeping `/api/*` same-origin is what lets the session cookie be
 * first-party. A cross-origin API would need `SameSite=None; Secure` plus CORS on
 * every authenticated route, and the cookie would be third-party.
 *
 * **This used to call `env.API.fetch()`, a Cloudflare Service Binding to a Worker
 * named `sizo-api`.** That could never work: a Service Binding can only target
 * another Cloudflare Worker, and the backend now runs as a Railway container.
 * Nothing in this repository defined such a Worker, so every `/api/*` request
 * would have failed. It fetches the API origin over the network instead.
 *
 * The raw request body is streamed through unchanged, which is load-bearing:
 * Chargily signs the exact bytes it sends, and `preserveRawBody` on the Medusa
 * route can only verify that signature if those bytes arrive unmodified.
 * `duplex: 'half'` is required by the fetch spec when streaming a request body.
 */

/** Paths that belong to the backend rather than to static assets. */
const isProxied = (pathname) =>
  pathname.startsWith("/api/") ||
  pathname === "/health" ||
  pathname === "/health/db" ||
  pathname === "/_email/send";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!isProxied(url.pathname)) {
      return env.ASSETS.fetch(request);
    }

    const origin = (env.API_ORIGIN ?? "").replace(/\/+$/, "");

    /**
     * Fail loudly and visibly.
     *
     * A missing origin previously meant every API call failed somewhere deep in
     * the proxy, which presents as an inexplicable broken storefront. A 503 naming
     * the missing variable is diagnosable in one look.
     */
    if (!origin) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            "API_ORIGIN is not configured for this Pages deployment, so API requests cannot be proxied.",
        }),
        { status: 503, headers: { "content-type": "application/json" } }
      );
    }

    const target = `${origin}${url.pathname}${url.search}`;

    /**
     * Rebuild the headers rather than forwarding `request.headers` wholesale.
     *
     * `host` must not be copied: it would name the Pages host instead of the API
     * origin, and Medusa's CORS and absolute-URL handling read it. The rest are
     * passed through, because the backend needs `authorization`, `cookie`,
     * `signature` (Chargily) and `x-guest-token`.
     */
    const headers = new Headers(request.headers);
    headers.delete("host");

    let upstream;

    try {
      upstream = await fetch(target, {
        method: request.method,
        headers,
        // Streamed, never buffered - see the note above about signature bytes.
        body: request.body,
        duplex: "half",
        /**
         * Do not follow redirects here.
         *
         * `/api/auth/google` answers with a 302 to Google. Following it would
         * fetch Google's page server-side and hand the browser HTML instead of the
         * redirect, silently breaking sign-in. Cloudflare Workers expose the
         * redirect response rather than an opaque one, so it passes straight
         * through.
         */
        redirect: "manual",
      });
    } catch {
      // An unreachable backend is a gateway problem, not a client error, and must
      // not look like a generic 500 from the storefront's own code.
      return new Response(
        JSON.stringify({
          success: false,
          message: `The API at ${origin} could not be reached.`,
        }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    /**
     * Returned as-is, including `Set-Cookie`.
     *
     * Constructing a new Response would drop `Set-Cookie`, which is how login and
     * the Google callback establish the session. Passing the upstream response
     * through keeps every header intact.
     */
    return upstream;
  },
};
