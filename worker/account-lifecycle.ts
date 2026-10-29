export type AccountLifecycleStatus =
  | "active"
  | "access_removed"
  | "banned"
  | "archived"
  | "deletion_pending"
  | "deleted"
  | "revoked";

export type PlatformAccessAction = "remove" | "ban" | "unban";

export type AccountLifecycleEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FS91_ACCOUNT_LIFECYCLE_URL?: string;
  FS91_ACCOUNT_LIFECYCLE_SERVICE_TOKEN?: string;
  FS91_ACCOUNT_LIFECYCLE_ADAPTER_TOKEN?: string;
};

export type AccountLifecycleDecision = {
  enforced: boolean;
  active: boolean;
  status: AccountLifecycleStatus;
  subject_id: string | null;
  revision: string | number | null;
};

export class AccountLifecycleUnavailableError extends Error {
  constructor(message = "Account lifecycle verification is unavailable.") {
    super(message);
    this.name = "AccountLifecycleUnavailableError";
  }
}

const allowedStatuses = new Set<AccountLifecycleStatus>([
  "active", "access_removed", "banned", "archived", "deletion_pending", "deleted", "revoked",
]);

function lifecycleConfiguration(env: AccountLifecycleEnv) {
  const url = env.FS91_ACCOUNT_LIFECYCLE_URL?.trim().replace(/\/$/, "");
  const token = env.FS91_ACCOUNT_LIFECYCLE_SERVICE_TOKEN?.trim();
  if (!url && !token) return null;
  if (!url || !token) throw new AccountLifecycleUnavailableError("Account lifecycle enforcement is only partially configured.");
  return { url, token };
}

export async function accountLifecycleDecision(
  env: AccountLifecycleEnv,
  userId: string,
  fetcher: typeof fetch = fetch,
): Promise<AccountLifecycleDecision> {
  const config = lifecycleConfiguration(env);
  if (!config) return { enforced: false, active: true, status: "active", subject_id: null, revision: null };
  const url = new URL("/v1/account-lifecycle/resolve", config.url);
  url.searchParams.set("application", "law18ref");
  url.searchParams.set("application_user_id", userId);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new AccountLifecycleUnavailableError();
  }
  if (!response.ok) throw new AccountLifecycleUnavailableError(`Account lifecycle verification returned HTTP ${response.status}.`);
  const payload = await response.json().catch(() => null) as null | {
    status?: string;
    subject_id?: string | null;
    revision?: string | number | null;
  };
  if (!payload || !allowedStatuses.has(payload.status as AccountLifecycleStatus)) {
    throw new AccountLifecycleUnavailableError("Account lifecycle verification returned an invalid state.");
  }
  const status = payload.status as AccountLifecycleStatus;
  return {
    enforced: true,
    active: status === "active",
    status,
    subject_id: payload.subject_id || null,
    revision: payload.revision ?? null,
  };
}

function inventoryConfiguration(env: AccountLifecycleEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AccountLifecycleUnavailableError("Law18Ref inventory storage is not configured.");
  }
  return {
    url: env.SUPABASE_URL.replace(/\/$/, ""),
    service: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function serviceRequest(env: AccountLifecycleEnv, path: string, init: RequestInit = {}) {
  const config = inventoryConfiguration(env);
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.service,
      Authorization: `Bearer ${config.service}`,
      Accept: "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new AccountLifecycleUnavailableError(payload.message || "Law18Ref inventory query failed.");
  }
  return response;
}

async function rows<T>(env: AccountLifecycleEnv, path: string): Promise<T[]> {
  return serviceRequest(env, path).then((response) => response.json() as Promise<T[]>);
}

async function count(env: AccountLifecycleEnv, path: string): Promise<number> {
  const response = await serviceRequest(env, `${path}${path.includes("?") ? "&" : "?"}select=id&limit=1`, {
    method: "GET",
    headers: { Prefer: "count=exact" },
  });
  const range = response.headers.get("Content-Range") || "";
  const total = range.match(/\/(\d+)$/)?.[1];
  if (total) return Number(total);
  const values = await response.json().catch(() => []) as unknown[];
  return values.length;
}

async function appearanceObjects(env: AccountLifecycleEnv, userId: string) {
  const config = inventoryConfiguration(env);
  const collected: Array<{ id: string | null; name: string; updated_at: string | null; size: number | null }> = [];
  for (let offset = 0; offset < 10_000; offset += 1_000) {
    const response = await fetch(`${config.url}/storage/v1/object/list/appearance-logos`, {
      method: "POST",
      headers: {
        apikey: config.service,
        Authorization: `Bearer ${config.service}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: userId, limit: 1_000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!response.ok) throw new AccountLifecycleUnavailableError("Law18Ref storage inventory failed.");
    const page = await response.json() as Array<{ id?: string; name: string; updated_at?: string; metadata?: { size?: number } }>;
    collected.push(...page.map((item) => ({
      id: item.id || null,
      name: `${userId}/${item.name}`.replace(/\/+/g, "/"),
      updated_at: item.updated_at || null,
      size: typeof item.metadata?.size === "number" ? item.metadata.size : null,
    })));
    if (page.length < 1_000) break;
  }
  return collected;
}

function inFilter(values: string[]) {
  return values.length ? `in.(${values.join(",")})` : "in.(00000000-0000-0000-0000-000000000000)";
}

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildAccountExportInventory(env: AccountLifecycleEnv, userId: string) {
  const encodedUser = encodeURIComponent(userId);
  const officials = await rows<{
    id: string;
    organization_id: string;
    identity_status: string;
    merged_into_official_id: string | null;
  }>(env, `officials?linked_user_id=eq.${encodedUser}&select=id,organization_id,identity_status,merged_into_official_id&order=id.asc`);
  const officialIds = officials.map((official) => official.id);
  const officialFilter = encodeURIComponent(inFilter(officialIds));
  const recordCounts = Object.fromEntries(await Promise.all([
    ["profiles", `profiles?id=eq.${encodedUser}`],
    ["group_permissions", `organization_memberships?user_id=eq.${encodedUser}`],
    ["event_permissions", `event_memberships?user_id=eq.${encodedUser}`],
    ["personal_calendar_feeds", `personal_calendar_feeds?user_id=eq.${encodedUser}`],
    ["external_calendar_assignments", `external_calendar_assignments?user_id=eq.${encodedUser}`],
    ["notifications", `user_notifications?user_id=eq.${encodedUser}`],
    ["assignments", `assignments?official_id=${officialFilter}`],
    ["check_ins", `check_ins?official_id=${officialFilter}`],
    ["ratings_received", `assessments?official_id=${officialFilter}`],
    ["ratings_authored", `assessments?coach_id=eq.${encodedUser}`],
    ["coach_assignments", `coach_assignments?or=(coach_id.eq.${encodedUser},coach_official_id.${inFilter(officialIds)})`],
    ["attendance_overrides", `attendance_expectation_overrides?official_id=${officialFilter}`],
    ["guest_check_in_sessions", `guest_check_in_sessions?official_id=${officialFilter}`],
    ["provisional_event_access", `provisional_event_access?official_id=${officialFilter}`],
    ["audit_actions", `audit_log?actor_id=eq.${encodedUser}`],
    ["rating_revisions", `assessment_revisions?edited_by=eq.${encodedUser}`],
    ["event_documents_created", `event_documents?created_by=eq.${encodedUser}`],
    ["imports_uploaded", `import_jobs?uploaded_by=eq.${encodedUser}`],
    ["events_created", `events?created_by=eq.${encodedUser}`],
  ].map(async ([name, path]) => [name, await count(env, path)])));
  const storageObjects = await appearanceObjects(env, userId);
  const manifest = {
    schema_version: 1,
    application: "law18ref",
    application_user_id: userId,
    generated_at: new Date().toISOString(),
    official_references: officials,
    record_counts: recordCounts,
    storage: {
      objects: storageObjects,
      excludes_file_contents: true,
      shared_references_require_separate_retention_review: true,
    },
    secret_handling: {
      personal_calendar_feed_urls_included: false,
      credentials_included: false,
    },
  };
  return { ...manifest, verification: { algorithm: "SHA-256", manifest_digest: await digest(manifest) } };
}

function timingSafeEqual(left: string, right: string) {
  const size = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < size; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function normalizedAccessAction(value: unknown): PlatformAccessAction | null {
  const action = String(value || "").trim().toLowerCase();
  if (action === "delete" || action === "delete_access") return "remove";
  return action === "remove" || action === "ban" || action === "unban" ? action : null;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function adapterAuthorized(request: Request, env: AccountLifecycleEnv) {
  const configuredToken = env.FS91_ACCOUNT_LIFECYCLE_ADAPTER_TOKEN?.trim();
  const suppliedToken = request.headers.get("X-FS91-Adapter-Token") || "";
  return Boolean(configuredToken && timingSafeEqual(configuredToken, suppliedToken));
}

async function lifecycleRpc(env: AccountLifecycleEnv, name: string, body: Record<string, unknown>) {
  const response = await serviceRequest(env, `rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<Record<string, unknown>>;
}

export async function accountAccessPreviewResponse(request: Request, env: AccountLifecycleEnv) {
  if (request.method !== "GET") return new Response("Method not allowed.", { status: 405 });
  if (!adapterAuthorized(request, env)) return new Response("Lifecycle adapter authorization required.", { status: 403 });
  const url = new URL(request.url);
  const userId = url.searchParams.get("application_user_id")?.trim();
  const action = normalizedAccessAction(url.searchParams.get("action"));
  if (!validUuid(userId) || !action) return new Response("A valid application_user_id and action are required.", { status: 400 });
  try {
    return Response.json(await lifecycleRpc(env, "law18ref_platform_access_preview", {
      target_user: userId,
      requested_action: action,
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (reason) {
    return Response.json({ message: reason instanceof Error ? reason.message : "Unable to preview platform access." }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function accountAccessChangeResponse(request: Request, env: AccountLifecycleEnv) {
  if (request.method !== "POST") return new Response("Method not allowed.", { status: 405 });
  if (!adapterAuthorized(request, env)) return new Response("Lifecycle adapter authorization required.", { status: 403 });
  const body = await request.json().catch(() => null) as null | {
    application_user_id?: unknown;
    action?: unknown;
    reason?: unknown;
    request_id?: unknown;
  };
  const userId = body?.application_user_id;
  const action = normalizedAccessAction(body?.action);
  const requestId = body?.request_id;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!validUuid(userId) || !validUuid(requestId) || !action) {
    return new Response("A valid application_user_id, request_id, and action are required.", { status: 400 });
  }
  try {
    return Response.json(await lifecycleRpc(env, "law18ref_platform_access_change", {
      target_user: userId,
      requested_action: action,
      change_reason: reason || null,
      operation_request_id: requestId,
    }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (reasonCaught) {
    const message = reasonCaught instanceof Error ? reasonCaught.message : "Unable to change platform access.";
    return Response.json({ message }, {
      status: /blocked|already used/i.test(message) ? 409 : 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function accountInventoryResponse(request: Request, env: AccountLifecycleEnv) {
  if (request.method !== "GET") return new Response("Method not allowed.", { status: 405 });
  if (!adapterAuthorized(request, env)) {
    return new Response("Lifecycle adapter authorization required.", { status: 403 });
  }
  const userId = new URL(request.url).searchParams.get("application_user_id")?.trim();
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)) {
    return new Response("A valid application_user_id is required.", { status: 400 });
  }
  try {
    return Response.json(await buildAccountExportInventory(env, userId), {
      headers: { "Cache-Control": "private, no-store", Vary: "X-FS91-Adapter-Token" },
    });
  } catch (reason) {
    return new Response(reason instanceof Error ? reason.message : "Unable to build inventory.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
