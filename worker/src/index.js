const WINDOW_MS = 60_000;
const WRITE_MAX = 6;
const READ_MAX = 90;
const PASS = [
  "content-type",
  "content-disposition",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "etag",
  "last-modified",
];

const FWD = ["range", "if-range", "content-type"];

const buckets = new Map();

function allow(key, max) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    if (buckets.size > 4096) {
      for (const [k, v] of buckets) {
        if (now - v.start >= WINDOW_MS) buckets.delete(k);
      }
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function merge(target, headers) {
  for (const [name, value] of Object.entries(headers)) target.set(name, value);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 });
    }

    const origin = request.headers.get("origin");
    let allowedOrigin = null;
    if (origin) {
      try {
        const allowed = env.SITE_ORIGIN ? new URL(env.SITE_ORIGIN).origin : url.origin;
        if (new URL(origin).origin === allowed) allowedOrigin = origin;
      } catch {
        allowedOrigin = null;
      }
      if (!allowedOrigin) return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      const headers = new Headers();
      if (allowedOrigin) merge(headers, corsHeaders(allowedOrigin));
      return new Response(null, { status: 204, headers });
    }

    const write = request.method === "POST";
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (!allow(`${write ? "w" : "r"}:${ip}`, write ? WRITE_MAX : READ_MAX)) {
      return new Response("Too many requests", { status: 429 });
    }

    if (!env.ORIGIN) {
      return new Response("Misconfigured", { status: 502 });
    }
    const target = env.ORIGIN;

    const headers = new Headers();
    headers.set("X-Api-Key", env.API_KEY || "");
    for (const name of FWD) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const upstream = await fetch(new URL(url.pathname + url.search, target), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    const out = new Headers();
    for (const name of PASS) {
      const value = upstream.headers.get(name);
      if (value) out.set(name, value);
    }
    if (allowedOrigin) merge(out, corsHeaders(allowedOrigin));

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
  },
};
