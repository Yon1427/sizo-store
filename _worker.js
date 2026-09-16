/**
 * Pages Function — Advanced mode (_worker.js)
 *
 * Proxies all /api/* requests to the Worker via Cloudflare Service Binding.
 * Falls through to static assets for all other paths.
 *
 * Architecture:
 *   Browser → sizo.uk/api/* → this Function → env.API.fetch() → Worker → Container
 *   Browser → sizo.uk/*    → env.ASSETS.fetch() → static assets
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy /api/* and /health to the Worker via Service Binding
    if (url.pathname.startsWith("/api/") || url.pathname === "/health" || url.pathname === "/health/db") {
      const internalUrl = new URL(url.pathname + url.search, "https://internal");

      // Forward with streaming body (duplex: 'half' required for
      // webhook raw-body preservation — Chargily signature verification
      // depends on exact byte content).
      const forwarded = new Request(internalUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        duplex: "half",
      });

      return env.API.fetch(forwarded);
    }

    // Internal email sidecar — forward to Worker before serving static assets
    if (url.pathname === "/_email/send") {
      const forwarded = new Request(new URL(url.pathname + url.search, "https://internal"), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        duplex: "half",
      });
      return env.API.fetch(forwarded);
    }

    // All other paths → serve static assets
    return env.ASSETS.fetch(request);
  },
};
