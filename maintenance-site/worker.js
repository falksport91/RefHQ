export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetPath = url.pathname === "/law18ref-logo.png" || url.pathname === "/fs91-logo.svg"
      ? url.pathname
      : "/index.html";
    const response = await env.ASSETS.fetch(new Request(new URL(assetPath, url), request));
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", assetPath === "/index.html" ? "no-store, max-age=0" : "public, max-age=86400");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
};
