/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { documentationDownload } from "./documentation";
import {
  AccountLifecycleUnavailableError,
  accountInventoryResponse,
  accountLifecycleDecision,
  type AccountLifecycleEnv,
} from "./account-lifecycle";

interface Env extends AccountLifecycleEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CALENDAR_FEED_ENCRYPTION_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type FeedRecord = {
  id: string;
  user_id: string;
  provider: string;
  display_name: string;
  feed_url_ciphertext: string;
  feed_url_iv: string;
  active: boolean;
};

type CalendarItem = {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  description: string | null;
  sourceUrl: string | null;
  status: string;
  updatedAt: string | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; "),
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(self), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function secureResponse(response: Response, request?: Request) {
  const secured = new Response(response.body, response);
  Object.entries(securityHeaders).forEach(([name, value]) => secured.headers.set(name, value));
  const pathname = request ? new URL(request.url).pathname : "";
  const contentType = secured.headers.get("Content-Type") || "";
  if (request?.mode === "navigate" || contentType.includes("text/html") || pathname === "/sw.js" || pathname === "/version.json") {
    secured.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    secured.headers.set("Pragma", "no-cache");
    secured.headers.set("Expires", "0");
  }
  return secured;
}

function calendarConfiguration(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.CALENDAR_FEED_ENCRYPTION_KEY) {
    throw new Error("Connected Schedules is not configured on this deployment.");
  }
  return {
    url: env.SUPABASE_URL.replace(/\/$/, ""),
    anon: env.SUPABASE_ANON_KEY,
    service: env.SUPABASE_SERVICE_ROLE_KEY,
    encryptionKey: env.CALENDAR_FEED_ENCRYPTION_KEY,
  };
}

function authConfiguration(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("Authentication is not configured on this deployment.");
  return { url: env.SUPABASE_URL.replace(/\/$/, ""), anon: env.SUPABASE_ANON_KEY };
}

async function currentUser(request: Request, env: Env) {
  const config = authConfiguration(env);
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.anon, Authorization: authorization },
  });
  if (!response.ok) return null;
  return response.json() as Promise<{ id: string; email?: string }>;
}

async function serviceRest<T>(env: Env, path: string, init: RequestInit = {}, prefer?: string): Promise<T> {
  const config = calendarConfiguration(env);
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.service,
      Authorization: `Bearer ${config.service}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || "Calendar storage request failed.");
  return payload as T;
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
};

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptFeedUrl(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), new TextEncoder().encode(value));
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
}

async function decryptFeedUrl(ciphertext: string, iv: string, secret: string) {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(secret), base64ToBytes(ciphertext));
  return new TextDecoder().decode(plaintext);
}

function assertSafeFeedUrl(rawValue: string) {
  if (rawValue.length > 2048) throw new Error("The calendar-feed URL is too long.");
  const url = new URL(rawValue);
  if (url.protocol !== "https:") throw new Error("Calendar feeds must use HTTPS.");
  if (url.username || url.password) throw new Error("Calendar-feed URLs cannot contain embedded login credentials.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const forbidden = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  if (forbidden) throw new Error("That calendar-feed host is not allowed.");
  return url;
}

async function fetchCalendar(rawUrl: string) {
  let url = assertSafeFeedUrl(rawUrl);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { Accept: "text/calendar, application/ics, text/plain;q=0.8" },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) throw new Error("The calendar feed returned an invalid redirect.");
      url = assertSafeFeedUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`The calendar feed returned HTTP ${response.status}.`);
    const text = await response.text();
    if (text.length > 5_000_000) throw new Error("The calendar feed is larger than 5 MB.");
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("The URL did not return an iCalendar feed.");
    return text;
  }
  throw new Error("The calendar feed redirected too many times.");
}

const unescapeIcs = (value: string) => value
  .replace(/\\n/gi, "\n")
  .replace(/\\,/g, ",")
  .replace(/\\;/g, ";")
  .replace(/\\\\/g, "\\");

function safeSourceUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function zonedDateToIso(value: string, timeZone?: string) {
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Unsupported calendar date: ${value}`);
    return parsed.toISOString();
  }
  const [, year, month, day, hour, minute, second, utc] = match;
  const target = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  if (utc || !timeZone) return new Date(target).toISOString();
  let candidate = target;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second);
    candidate += target - represented;
  }
  return new Date(candidate).toISOString();
}

function parseCalendar(text: string): CalendarItem[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  return [...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/gi)].flatMap((match) => {
    const properties = new Map<string, { value: string; parameters: string }>();
    for (const line of match[1].split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const descriptor = line.slice(0, separator);
      const [name, ...parameters] = descriptor.split(";");
      if (!properties.has(name.toUpperCase())) properties.set(name.toUpperCase(), { value: line.slice(separator + 1), parameters: parameters.join(";") });
    }
    const uid = properties.get("UID")?.value;
    const start = properties.get("DTSTART");
    if (!uid || !start) return [];
    const timezone = start.parameters.match(/TZID=([^;:]+)/i)?.[1];
    const end = properties.get("DTEND");
    const endTimezone = end?.parameters.match(/TZID=([^;:]+)/i)?.[1];
    try {
      return [{
        uid,
        title: unescapeIcs(properties.get("SUMMARY")?.value || "External assignment"),
        startsAt: zonedDateToIso(start.value, timezone),
        endsAt: end ? zonedDateToIso(end.value, endTimezone || timezone) : null,
        venue: properties.has("LOCATION") ? unescapeIcs(properties.get("LOCATION")!.value) : null,
        description: properties.has("DESCRIPTION") ? unescapeIcs(properties.get("DESCRIPTION")!.value) : null,
        sourceUrl: safeSourceUrl(properties.get("URL")?.value),
        status: properties.get("STATUS")?.value?.toLowerCase() === "cancelled" ? "cancelled" : "external",
        updatedAt: properties.has("LAST-MODIFIED") ? zonedDateToIso(properties.get("LAST-MODIFIED")!.value) : null,
      }];
    } catch {
      return [];
    }
  });
}

async function syncFeed(feed: FeedRecord, env: Env) {
  const config = calendarConfiguration(env);
  const lifecycle = await accountLifecycleDecision(env, feed.user_id);
  if (!lifecycle.active) {
    await serviceRest(env, `personal_calendar_feeds?id=eq.${encodeURIComponent(feed.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        active: false,
        sync_status: "paused",
        last_error: "Synchronization paused because this account is not active.",
        updated_at: new Date().toISOString(),
      }),
    }, "return=minimal");
    return 0;
  }
  await serviceRest(env, `personal_calendar_feeds?id=eq.${encodeURIComponent(feed.id)}`, {
    method: "PATCH", body: JSON.stringify({ sync_status: "syncing", last_error: null, updated_at: new Date().toISOString() }),
  }, "return=minimal");
  try {
    const feedUrl = await decryptFeedUrl(feed.feed_url_ciphertext, feed.feed_url_iv, config.encryptionKey);
    const items = parseCalendar(await fetchCalendar(feedUrl));
    if (!items.length) throw new Error("No dated calendar events were found in this feed.");
    const now = new Date().toISOString();
    await serviceRest(env, "external_calendar_assignments?on_conflict=feed_id,external_uid", {
      method: "POST",
      body: JSON.stringify(items.map((item) => ({
        user_id: feed.user_id, feed_id: feed.id, external_uid: item.uid, title: item.title,
        starts_at: item.startsAt, ends_at: item.endsAt, venue: item.venue,
        description: item.description, source_url: item.sourceUrl,
        assignment_status: item.status, source_updated_at: item.updatedAt,
        last_seen_at: now, updated_at: now,
      }))),
    }, "resolution=merge-duplicates,return=minimal");
    await serviceRest(env, `personal_calendar_feeds?id=eq.${encodeURIComponent(feed.id)}`, {
      method: "PATCH", body: JSON.stringify({ sync_status: "connected", last_synced_at: now, last_error: null, updated_at: now }),
    }, "return=minimal");
    return items.length;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Calendar synchronization failed.";
    await serviceRest(env, `personal_calendar_feeds?id=eq.${encodeURIComponent(feed.id)}`, {
      method: "PATCH", body: JSON.stringify({ sync_status: "error", last_error: message.slice(0, 500), updated_at: new Date().toISOString() }),
    }, "return=minimal");
    throw reason;
  }
}

async function calendarFeedApi(request: Request, env: Env, ctx: ExecutionContext) {
  let user: { id: string; email?: string } | null;
  try { user = await currentUser(request, env); } catch (reason) { return json({ message: reason instanceof Error ? reason.message : "Connected Schedules is unavailable." }, 503); }
  if (!user) return json({ message: "Your session has expired." }, 401);
  try {
    const lifecycle = await accountLifecycleDecision(env, user.id);
    if (!lifecycle.active) return json({ message: "This account is not active." }, 403);
  } catch (reason) {
    if (reason instanceof AccountLifecycleUnavailableError) return json({ message: reason.message }, 503);
    throw reason;
  }
  const url = new URL(request.url);
  const suffix = url.pathname.slice("/api/calendar-feeds".length).replace(/^\//, "");
  const [feedId, action] = suffix.split("/");
  try {
    if (!feedId && request.method === "GET") {
      const feeds = await serviceRest<Omit<FeedRecord, "feed_url_ciphertext" | "feed_url_iv">[]>(env,
        `personal_calendar_feeds?user_id=eq.${encodeURIComponent(user.id)}&select=id,provider,display_name,active,sync_status,last_synced_at,last_error,created_at&order=created_at.asc`);
      return json(feeds);
    }
    if (!feedId && request.method === "POST") {
      const body = await request.json() as { provider?: string; display_name?: string; feed_url?: string };
      const provider = ["assignr", "arbiter", "usofficials", "refquest", "other"].includes(body.provider || "") ? body.provider! : "other";
      const displayName = body.display_name?.trim().slice(0, 80);
      const feedUrl = body.feed_url?.trim();
      if (!displayName || !feedUrl) return json({ message: "A name and calendar-feed URL are required." }, 400);
      assertSafeFeedUrl(feedUrl);
      const encrypted = await encryptFeedUrl(feedUrl, calendarConfiguration(env).encryptionKey);
      const rows = await serviceRest<FeedRecord[]>(env, "personal_calendar_feeds", {
        method: "POST",
        body: JSON.stringify({ user_id: user.id, provider, display_name: displayName, feed_url_ciphertext: encrypted.ciphertext, feed_url_iv: encrypted.iv }),
      }, "return=representation");
      const feed = rows[0];
      ctx.waitUntil(syncFeed(feed, env).catch(() => undefined));
      return json({ id: feed.id, provider, display_name: displayName, active: true, sync_status: "pending", last_synced_at: null, last_error: null }, 201);
    }
    const feeds = await serviceRest<FeedRecord[]>(env, `personal_calendar_feeds?id=eq.${encodeURIComponent(feedId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*`);
    const feed = feeds[0];
    if (!feed) return json({ message: "Calendar connection not found." }, 404);
    if (request.method === "DELETE") {
      await serviceRest(env, `personal_calendar_feeds?id=eq.${encodeURIComponent(feed.id)}`, { method: "DELETE" }, "return=minimal");
      return new Response(null, { status: 204 });
    }
    if (request.method === "PATCH") {
      const body = await request.json() as { active?: boolean };
      const active = body.active !== false;
      await serviceRest(env, `personal_calendar_feeds?id=eq.${encodeURIComponent(feed.id)}`, {
        method: "PATCH", body: JSON.stringify({ active, sync_status: active ? "pending" : "paused", updated_at: new Date().toISOString() }),
      }, "return=minimal");
      if (active) ctx.waitUntil(syncFeed({ ...feed, active }, env).catch(() => undefined));
      return json({ active, sync_status: active ? "pending" : "paused" });
    }
    if (request.method === "POST" && action === "sync") {
      const count = await syncFeed(feed, env);
      return json({ synchronized: count, last_synced_at: new Date().toISOString() });
    }
    return json({ message: "Unsupported calendar-feed operation." }, 405);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Calendar-feed operation failed.";
    return json({ message }, /duplicate key|unique constraint/i.test(message) ? 409 : 400);
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/account-lifecycle/inventory") {
      return secureResponse(await accountInventoryResponse(request, env), request);
    }

    if (url.pathname === "/api/account-lifecycle/status") {
      let user: { id: string; email?: string } | null;
      try { user = await currentUser(request, env); } catch { return secureResponse(json({ message: "Account verification is unavailable." }, 503), request); }
      if (!user) return secureResponse(json({ message: "Please sign in again." }, 401), request);
      try {
        const lifecycle = await accountLifecycleDecision(env, user.id);
        return secureResponse(json(lifecycle, lifecycle.active ? 200 : 403), request);
      } catch (reason) {
        return secureResponse(json({ message: reason instanceof Error ? reason.message : "Account verification is unavailable." }, 503), request);
      }
    }

    if (url.pathname.startsWith("/api/owner-documents/")) {
      return secureResponse(await documentationDownload(request, env), request);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return secureResponse(await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths), request);
    }

    if (url.pathname === "/api/calendar-feeds" || url.pathname.startsWith("/api/calendar-feeds/")) {
      return secureResponse(await calendarFeedApi(request, env, ctx), request);
    }

    return secureResponse(await handler.fetch(request, env, ctx), request);
  },
  async scheduled(_controller: unknown, env: Env, ctx: ExecutionContext) {
    try {
      const feeds = await serviceRest<FeedRecord[]>(env, "personal_calendar_feeds?active=eq.true&select=*&order=last_synced_at.asc.nullsfirst&limit=100");
      for (const feed of feeds) ctx.waitUntil(syncFeed(feed, env).catch(() => undefined));
    } catch {
      // A missing deployment secret should not affect the hosted web application.
    }
  },
};

export default worker;
