# FS91 Account Lifecycle: Law18Ref Adapter Audit

Status: design audit only. No account actions, schema deployments, permission changes, or destructive operations are authorized by this document.

## Durable identity

Law18Ref's durable operational identity is the group-scoped `public.officials.id`. Assignments, check-ins, ratings, guest check-in sessions, attendance overrides, provisional event access, and most coaching scope refer to an official record. This identity should survive removal of a login.

`officials.linked_user_id` points to `auth.users.id` with `ON DELETE SET NULL`. Existing merge logic can move operational rows to a primary official and retain the secondary official as an import alias. A lifecycle implementation should build on that model.

Do not use `auth.users.id` or `profiles.id` as the permanent deleted-user reference. Add a stable lifecycle subject identifier independent of Supabase Auth, map retained official records and attribution to it, and update `linked_user_id` only after an approved, verified restoration or re-import. Restoration must not automatically restore permissions.

## Personal records

These records belong in the account export and may be eligible for explicit personal-data erasure after retention requirements are satisfied:

- `profiles`: names, primary and secondary email, phone, date of birth, preferred name, contact lock, schedule display preferences, rating display preferences, last activity/login, and site-owner state.
- `personal_calendar_feeds`: encrypted private feed URL and feed configuration.
- `external_calendar_assignments`: events imported from personal feeds.
- `user_notifications`: the user's private notification inbox, although entries may reference shared group or event activity.
- Supabase Auth identity, provider, recovery, and session metadata.
- Objects under `appearance-logos/{auth-user-id}/...` when they are not referenced by an active shared appearance campaign or theme.

Group-scoped `officials` rows also contain contact details. They are operational group records and cannot be erased automatically with the profile. Optional erasure needs an explicit policy that can redact selected personal fields while retaining the stable official identity and the minimum display information needed to understand schedules, check-ins, and ratings.

## Shared records that must survive

- Groups, events, games, assignments, officials, check-ins, ratings, coach assignments, attendance overrides, guest check-in sessions, and provisional event access.
- Event documents, import jobs, import conflicts, audit log entries, rating revision history, group join links, and appearance campaigns/themes.
- Group and event permission history, including who granted or revoked access and the previous scope.
- Group logos and event documents in Supabase Storage. Appearance logos are also shared when referenced by a live theme or campaign.

Shared attribution should use a stable lifecycle subject plus an immutable display-name or email-at-the-time snapshot. Current screens often resolve names from `profiles`; deleting a profile without a snapshot would make historical attribution incomplete.

## Current foreign-key risks

### Expected personal cascades

- `profiles.id -> auth.users.id ON DELETE CASCADE`.
- `personal_calendar_feeds.user_id -> auth.users.id ON DELETE CASCADE`.
- `external_calendar_assignments.user_id -> auth.users.id ON DELETE CASCADE`.
- `user_notifications.user_id -> profiles.id ON DELETE CASCADE`.

These should run only after export and an explicit personal-data purge decision.

### Permission-history loss

- `organization_memberships.user_id` and `event_memberships.user_id` cascade on auth deletion.
- `remove_organization_member` archives group memberships but deletes event memberships.
- Account merge transfers permissions and deletes the secondary permission rows.

Lifecycle revocation should retain these as archived/revoked grant records with grant/revoke timestamps, actors, reason, lifecycle operation ID, and prior scope.

### Shared rows at risk of deletion

- `coach_assignments.coach_id` and legacy `referee_id` reference profiles with cascade behavior.
- Legacy `assignments.referee_id` and `check_ins.referee_id` reference profiles with cascade behavior. Newer records normally use `official_id`, but any populated legacy reference could cause a shared row to disappear when the profile is deleted.

Before auth/profile deletion, legacy profile references must be inventoried, relinked to durable official/subject identity, and then nulled or replaced.

### Deletion blockers and attribution loss

Restrictive or no-action profile/auth references can prevent deletion: event creator, import uploader, check-in recorder, provisional event-access creator, attendance-override creator, membership creator, join-link creator, event-document creator, appearance creator, import-conflict resolver, and group deactivator.

Ratings now restrict deletion of their coach and referee profile references. This correctly protects records, but those references must move to stable lifecycle subjects before auth deletion becomes possible.

Several attribution references use `ON DELETE SET NULL`, including audit actors and rating edit/approval/archive actors. Rows survive, but attribution becomes anonymous unless a stable subject and immutable snapshot are stored.

## Ownership dependencies

- Site ownership currently comes from `profiles.is_site_owner`. Removing that profile removes the site-owner authorization path.
- A site owner must be transferred or otherwise protected before lifecycle action.
- Last-director/administrator protections must be evaluated before revocation so groups are not left without accountable control.
- Branding and document storage may have a creator/owner that is being archived even though the object remains active and shared.

## Revocation and restoration gates

### Client authentication

The browser stores refresh credentials locally and refreshes them on timers, focus, visibility, and network reconnection. Client sign-out only clears local state; it does not revoke server-side refresh sessions.

Account archive must revoke or ban Supabase Auth sessions using an administrative server path. Every protected request must also fail closed when the lifecycle subject is not active.

### Dashboard bootstrap

Startup may claim a group join link, link imported officials by email, load the profile, materialize event archives, and load memberships. The lifecycle check must occur before any claim, link, activation, or materialization action.

### Automatic linkage

The following paths can restore associations and must require an active lifecycle subject plus explicit restoration approval:

- The `auth.users` trigger that links imported officials and inserts a profile after account creation or email change.
- `link_current_referee` and related activation functions that link officials and materialize staged group or event roles.
- Group join-link claims that create or reactivate membership and link/create an official.
- Same-email signup, password recovery, and Google sign-in.

A deleted-email tombstone or equivalent stable subject mapping must prevent unreviewed automatic relinking. A restored login begins with no roles until permissions are separately re-granted.

### RLS and RPC authorization

Root helpers such as `is_site_owner`, `has_org_role`, and `has_event_role` do not currently include an account-lifecycle deny. Add one fail-closed `account_active(auth.uid())` predicate to root helpers and to direct self-access policies/RPCs. UI checks alone are insufficient.

Active membership status is not a complete lifecycle gate because direct official linkage, email matching, or a retained site-owner profile can still provide access.

### Cloudflare Worker and scheduled synchronization

The calendar-feed API validates a Supabase bearer token, then operates with the service role. It needs a lifecycle-state check after token validation.

The scheduled feed synchronizer selects every active feed with service-role access. Without a lifecycle join, archived accounts continue syncing. Archive must pause feeds immediately, and cron must synchronize only lifecycle-active subjects.

Owner documentation downloads need the same lifecycle-active check in addition to the site-owner permission check.

## Export coverage

Existing exports cover officials, ratings, schedules, and post-event operations, but there is no complete per-account export.

The Law18Ref lifecycle adapter should export:

- Profile and personal preferences.
- Group official identities and linkage provenance.
- Group and event permission history.
- Assignments, check-ins, ratings authored and received, and coach assignments.
- Notifications.
- Personal calendar feed metadata and imported events. The encrypted feed URL belongs only in a protected machine-readable archive.
- Audit/revision attribution involving the subject.
- An owned/referenced storage manifest with object path, classification, retention disposition, size, and checksum.

Produce separate sections for personal export data and retained shared-record provenance.

## Recommended implementation order

1. Introduce a stable central lifecycle subject, lifecycle operation log, provenance mapping, and immutable attribution snapshots.
2. Backfill every auth/profile reference and identify all populated legacy referee, coach, recorder, uploader, and creator references.
3. Replace shared-record cascades and restrictive user references with stable subject references or nullable attribution plus snapshots.
4. Convert permission deletion into retained revocation history.
5. Add the lifecycle-active gate to RLS/RPC roots, application bootstrap, Worker APIs, owner documentation, and cron synchronization.
6. Implement archive as one coordinated operation: revoke permission grants, pause feeds, unlink operational officials, revoke Auth sessions, and record the operation. Do not delete personal data yet.
7. Export and verify checksums and record counts.
8. Permit optional personal-data purge only after shared relinking and export verification succeeds.
9. Verified restoration or re-import links a new auth identity to the stable subject and retained official records, but restores no permission grant automatically.

## Implemented adapter contract

The Worker now supports an inactive-by-default integration contract. No production behavior changes until both outbound lifecycle settings are configured.

- `FS91_ACCOUNT_LIFECYCLE_URL`
- `FS91_ACCOUNT_LIFECYCLE_SERVICE_TOKEN`
- `FS91_ACCOUNT_LIFECYCLE_ADAPTER_TOKEN`

Law18Ref resolves state with an authenticated server request:

`GET {FS91_ACCOUNT_LIFECYCLE_URL}/v1/account-lifecycle/resolve?application=law18ref&application_user_id={uuid}`

The central response must contain:

```json
{
  "status": "active",
  "subject_id": "stable-central-subject-id",
  "revision": "monotonic-version-or-timestamp"
}
```

Accepted states are `active`, `archived`, `deletion_pending`, `deleted`, and `revoked`. Any configured-but-unavailable or malformed response fails closed. When the integration is entirely unconfigured, the adapter reports enforcement as disabled and preserves existing Law18Ref behavior.

The central account service can request a server-only export inventory at:

`GET /api/account-lifecycle/inventory?application_user_id={uuid}`

with `X-FS91-Adapter-Token`. The response includes official references, categorized record counts, an appearance-storage manifest, explicit secret exclusions, and a SHA-256 manifest digest. It does not return personal calendar feed URLs, ciphertext, credentials, or file contents.

The browser checks `/api/account-lifecycle/status` before any join-link claim, automatic official linking, membership load, or event load. Calendar API calls, background synchronization, scheduled synchronization, and owner-document downloads use the same server-side lifecycle decision.

Database root authorization remains a coordinated dependency. Direct PostgREST/RPC access cannot be considered fully revoked until the primary lifecycle migration adds the shared fail-closed predicate to Law18Ref root RLS and authorization helpers.

### Proposed coordinated database helper

Do not apply this independently. The primary lifecycle schema must first define how Law18Ref resolves an Auth UUID to the central stable subject and how state is synchronized transactionally.

The Law18Ref migration should then expose one private, security-definer predicate with execution revoked from `PUBLIC`, `anon`, and `authenticated`; public authorization helpers may call it internally:

```sql
-- Illustrative contract only; table/schema names belong to the primary migration.
create function private.account_lifecycle_active(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user is not null
    and exists (
      select 1
      from private.application_account_subjects link
      join private.account_subjects subject on subject.id = link.subject_id
      where link.application = 'law18ref'
        and link.application_user_id = target_user
        and subject.status = 'active'
        and link.revoked_at is null
    )
$$;
```

`is_site_owner`, `has_org_role`, `has_event_role`, direct self-service RLS policies, and every security-definer function callable by an authenticated user must require this predicate before evaluating ownership or role scope. Lifecycle orchestration itself must use a separate narrowly granted service path so it can export and revoke an already archived subject without reopening ordinary app access.

## Required tests before enabling destructive actions

- Legacy assignment/check-in rows with populated profile references survive.
- A coach with submitted ratings can be archived without losing ratings or attribution.
- Recorder, uploader, creator, approver, and editor attribution remains intelligible after profile deletion.
- Site-owner transfer and last-administrator protections hold.
- Same-email signup and join-link use cannot relink an archived/deleted subject without approval.
- Existing access and refresh tokens stop working immediately after archive.
- Calendar cron stops syncing archived users.
- Restoration grants no prior roles automatically.
- Archived users cannot call protected REST/RPC endpoints directly.
- Export manifests reconcile counts, checksums, and retained shared references before a purge can proceed.
