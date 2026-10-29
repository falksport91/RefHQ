import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AccountLifecycleUnavailableError,
  accountAccessChangeResponse,
  accountAccessPreviewResponse,
  accountInventoryResponse,
  accountLifecycleDecision,
  buildAccountExportInventory,
} from "../worker/account-lifecycle.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("unconfigured lifecycle enforcement preserves current behavior", async () => {
  const decision = await accountLifecycleDecision({}, "00000000-0000-4000-8000-000000000001", () => {
    throw new Error("must not call central service");
  });
  assert.deepEqual(decision, { enforced: false, active: true, status: "active", subject_id: null, revision: null });
});

test("configured lifecycle resolution allows only active accounts", async () => {
  const env = { FS91_ACCOUNT_LIFECYCLE_URL: "https://accounts.example.com", FS91_ACCOUNT_LIFECYCLE_SERVICE_TOKEN: "secret" };
  const calls = [];
  const active = await accountLifecycleDecision(env, "00000000-0000-4000-8000-000000000001", async (url, init) => {
    calls.push([url, init]);
    return Response.json({ status: "active", subject_id: "subject-1", revision: 7 });
  });
  assert.equal(active.active, true);
  assert.equal(active.enforced, true);
  assert.equal(active.subject_id, "subject-1");
  assert.match(calls[0][0].toString(), /application=law18ref/);
  assert.equal(calls[0][1].headers.Authorization, "Bearer secret");
  const archived = await accountLifecycleDecision(env, "00000000-0000-4000-8000-000000000001", async () => Response.json({ status: "archived" }));
  assert.equal(archived.active, false);
  assert.equal(archived.status, "archived");
  const accessRemoved = await accountLifecycleDecision(env, "00000000-0000-4000-8000-000000000001", async () => Response.json({ status: "access_removed" }));
  assert.equal(accessRemoved.active, false);
  const banned = await accountLifecycleDecision(env, "00000000-0000-4000-8000-000000000001", async () => Response.json({ status: "banned" }));
  assert.equal(banned.active, false);
});

test("partial, failed, and malformed lifecycle configuration fails closed", async () => {
  await assert.rejects(() => accountLifecycleDecision({ FS91_ACCOUNT_LIFECYCLE_URL: "https://accounts.example.com" }, "user"), AccountLifecycleUnavailableError);
  await assert.rejects(() => accountLifecycleDecision({ FS91_ACCOUNT_LIFECYCLE_URL: "https://accounts.example.com", FS91_ACCOUNT_LIFECYCLE_SERVICE_TOKEN: "secret" }, "user", async () => new Response("bad", { status: 503 })), AccountLifecycleUnavailableError);
  await assert.rejects(() => accountLifecycleDecision({ FS91_ACCOUNT_LIFECYCLE_URL: "https://accounts.example.com", FS91_ACCOUNT_LIFECYCLE_SERVICE_TOKEN: "secret" }, "user", async () => Response.json({ status: "unknown" })), AccountLifecycleUnavailableError);
});

test("inventory endpoint is server-token protected before data access", async () => {
  const request = new Request("https://law18ref.com/api/account-lifecycle/inventory?application_user_id=00000000-0000-4000-8000-000000000001");
  assert.equal((await accountInventoryResponse(request, {})).status, 403);
  assert.equal((await accountInventoryResponse(request, { FS91_ACCOUNT_LIFECYCLE_ADAPTER_TOKEN: "expected" })).status, 403);
  const authorized = new Request(request, { headers: { "X-FS91-Adapter-Token": "expected" } });
  assert.equal((await accountInventoryResponse(authorized, { FS91_ACCOUNT_LIFECYCLE_ADAPTER_TOKEN: "expected" })).status, 503);
});

test("verified inventory contains counts and references but no feed URLs or credentials", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).includes("/rest/v1/officials?linked_user_id=")) {
      return Response.json([{ id: "10000000-0000-4000-8000-000000000001", organization_id: "20000000-0000-4000-8000-000000000001", identity_status: "linked", merged_into_official_id: null }]);
    }
    if (String(url).includes("/storage/v1/object/list/appearance-logos")) return Response.json([]);
    return new Response("[]", { headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" } });
  };
  try {
    const manifest = await buildAccountExportInventory({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-secret" }, "00000000-0000-4000-8000-000000000001");
    assert.equal(manifest.official_references.length, 1);
    assert.equal(manifest.secret_handling.personal_calendar_feed_urls_included, false);
    assert.equal(manifest.secret_handling.credentials_included, false);
    assert.match(manifest.verification.manifest_digest, /^[0-9a-f]{64}$/);
    assert.ok(requested.some((url) => url.includes("personal_calendar_feeds?user_id=")));
    assert.ok(requested.every((url) => !url.includes("feed_url_ciphertext") && !url.includes("feed_url_iv")));
    assert.doesNotMatch(JSON.stringify(manifest), /service-secret/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("platform-access preview and change endpoints are token-protected and validate actions", async () => {
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-secret",
    FS91_ACCOUNT_LIFECYCLE_ADAPTER_TOKEN: "adapter-secret",
  };
  const previewUrl = "https://law18ref.com/api/account-lifecycle/preview?application_user_id=00000000-0000-4000-8000-000000000001&action=delete_access";
  assert.equal((await accountAccessPreviewResponse(new Request(previewUrl), env)).status, 403);
  const invalid = new Request(previewUrl.replace("delete_access", "restore"), { headers: { "X-FS91-Adapter-Token": "adapter-secret" } });
  assert.equal((await accountAccessPreviewResponse(invalid, env)).status, 400);

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push([String(url), JSON.parse(init.body)]);
    return Response.json({ application: "law18ref", can_apply: true, action: calls.length === 1 ? "remove" : "ban" });
  };
  try {
    const preview = new Request(previewUrl, { headers: { "X-FS91-Adapter-Token": "adapter-secret" } });
    assert.equal((await accountAccessPreviewResponse(preview, env)).status, 200);
    assert.match(calls[0][0], /rpc\/law18ref_platform_access_preview$/);
    assert.equal(calls[0][1].requested_action, "remove");

    const change = new Request("https://law18ref.com/api/account-lifecycle/change", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-FS91-Adapter-Token": "adapter-secret" },
      body: JSON.stringify({
        application_user_id: "00000000-0000-4000-8000-000000000001",
        action: "ban",
        reason: "owner-requested test",
        request_id: "00000000-0000-4000-8000-000000000099",
      }),
    });
    assert.equal((await accountAccessChangeResponse(change, env)).status, 200);
    assert.match(calls[1][0], /rpc\/law18ref_platform_access_change$/);
    assert.equal(calls[1][1].operation_request_id, "00000000-0000-4000-8000-000000000099");
    assert.equal(calls[1][1].requested_action, "ban");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("local platform-access migration archives grants, blocks ownership removal, and never restores old grants", async () => {
  const migration = await read("supabase/migrations/20260925153518_platform_access_lifecycle_adapter.sql");
  assert.match(migration, /platform_access_action_requests/);
  assert.match(migration, /primary key \(request_id, source_table, grant_id\)/);
  assert.match(migration, /site_owner_protected/);
  assert.match(migration, /last_group_leader/);
  assert.match(migration, /set status = 'archived'/);
  assert.match(migration, /delete from public\.event_memberships where user_id = target_user/);
  assert.match(migration, /delete from public\.provisional_event_access/);
  assert.match(migration, /platform_access_banned_at = null/);
  assert.match(migration, /'restored_grants', 0/);
  assert.match(migration, /official\.platform_access_removed_at is null/);
  assert.match(migration, /when access_was_removed then array\[target_link\.default_role\]/);
  assert.doesNotMatch(migration, /delete from auth\.users/);
  assert.doesNotMatch(migration, /delete from public\.profiles/);
});

test("existing authenticated tokens are restricted after local access removal", async () => {
  const migration = await read("supabase/migrations/20260925153518_platform_access_lifecycle_adapter.sql");
  assert.match(migration, /law18ref_current_user_access_allowed/);
  assert.match(migration, /as restrictive for all to authenticated/);
  assert.match(migration, /platform_access_removed_at is null/);
  assert.match(migration, /platform_access_banned_at is null/);
  assert.match(migration, /Anonymous external check-in remains unaffected/);
});

test("bootstrap, calendar API, cron and documentation use lifecycle gates", async () => {
  const [page, client, worker, documentation, adapter] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"), read("worker/index.ts"),
    read("worker/documentation.ts"), read("worker/account-lifecycle.ts"),
  ]);
  const bootstrap = page.split("useEffect(() => {\n    (async () => {")[1].split("const joinToken")[0];
  assert.match(bootstrap, /ensureAccountLifecycleAccess\(session\)/);
  assert.match(client, /\/api\/account-lifecycle\/status/);
  assert.match(worker, /accountLifecycleDecision\(env, user\.id\)/);
  assert.match(worker, /accountLifecycleDecision\(env, feed\.user_id\)/);
  assert.match(worker, /syncFeed\(feed, env\)/);
  assert.match(worker, /sync_status: "paused"/);
  assert.match(documentation, /accountLifecycleDecision\(env, authenticated\.id, fetcher\)/);
  assert.match(adapter, /personal_calendar_feed_urls_included: false/);
  assert.doesNotMatch(adapter, /select=id,provider,display_name,feed_url_ciphertext/);
});
