import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("calendar color menus escape the card and align inward on desktop", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.panel\.connected-schedules-card\{overflow:visible\}/);
  assert.match(css, /@media\(min-width:521px\)\{\.connected-schedules-card \.assignment-filter-menu>\.filter-menu-panel\{left:auto;right:0;max-width:calc\(100vw - 40px\)\}\}/);
});

test("group departure is tucked away and password-confirmed without deleting profiles", async () => {
  const page = await read('app/page.tsx');
  const client = await read('app/supabase-client.ts');
  const sql = await read('supabase/migrations/20260826000707_password_confirmed_group_leave.sql');
  const groups = page.split('function GroupsSettings(')[1].split('function SiteGroupsAdmin(')[0];
  assert.match(groups, /<summary>Membership Options<\/summary>/);
  assert.match(groups, /auth.verifyPassword\(session.user.email/);
  assert.match(groups, /leaveCurrentOrganization\(verified, organization.id\)/);
  assert.match(groups, /setLeaveCaptchaToken\(""\)/);
  assert.doesNotMatch(groups, /window.confirm|auth.signOut/);
  assert.match(client, /rpc\/leave_group_membership/);
  assert.match(sql, /m->>'method' = 'password'/);
  assert.match(sql, /m->>'timestamp'/);
  assert.match(sql, /interval '2 minutes'/);
  assert.match(sql, /for update/);
  assert.match(sql, /user_id=actor/);
  assert.match(sql, /membership.left/);
  assert.doesNotMatch(sql, /delete from public.profiles/i);
  assert.match(sql, /revoke all on function public.leave_current_organization\(\) from public, anon, authenticated/);
});

test("Turnstile renews one-use tokens after authentication attempts", async () => {
  const panel = await read("app/auth-panel.tsx");
  const widget = await read("app/turnstile.tsx");
  const page = await read("app/page.tsx");
  for (const name of ["signIn", "sendRecovery", "createAccount"]) {
    const body = panel.split(`async function ${name}`)[1].split("\n  async function")[0];
    assert.match(body, /finally \{\s*refreshChallenge\(\)/);
    assert.match(body, /captchaRequired && !captchaToken/);
  }
  assert.match(panel, /key=\{`\$\{mode\}-\$\{captchaAttempt\}`\}/);
  assert.match(widget, /if \(!cancelled\) onToken\(token\)/);
  const verification = page.split("async function requestVerification()")[1].split("\n  return")[0];
  assert.match(verification, /finally \{\s*setCaptchaToken\(""\);\s*setCaptchaAttempt/);
});

test("Version 0.35.4 uses the dashboard loading label, favicon metadata, and preserved Worker secrets", async () => {
  const [page, layout, manifest, packageJson, viteConfig] = await Promise.all([
    read("app/page.tsx"),
    read("app/layout.tsx"),
    read("public/manifest.webmanifest"),
    read("package.json"),
    read("vite.config.ts"),
  ]);
  assert.match(page, /Loading Dashboard/);
  assert.doesNotMatch(page, /Loading tournament data/);
  assert.match(page, /Version \{APP_VERSION\}/);
  assert.match(page, /<small>by Falksport91 LLC<\/small>/);
  assert.match(layout, /favicon\.png/);
  assert.match(layout, /const title = "Tournament referee operations"/);
  assert.match(layout, /const fullTitle = "Law18Referee Management - Tournament referee operations"/);
  assert.match(manifest, /law18ref-icon-192\.png/);
  assert.match(manifest, /"name": "Law18Referee Management"/);
  assert.doesNotMatch(manifest, /Law18Referee Management by FalkSport91/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
  assert.match(viteConfig, /keep_vars: true/);
});

test("provisional coach activation waits for the linked user's public profile", async () => {
  const migration = await read("supabase/migrations/202608140053_provisional_coach_profile_activation.sql");
  assert.match(migration, /exists \(\s*select 1 from public\.profiles where id = new\.linked_user_id/);
  assert.match(migration, /after insert on public\.profiles/);
  assert.match(migration, /assignment\.coach_official_id = official\.id/);
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke execute on function public\.activate_profile_provisional_coach_assignments\(\)/);
});

test("v0.23.0 scopes Site Supervisor operations and tracks posted schedule corrections", async () => {
  const [page, client, styles, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/20260814170247_scoped_site_supervisor_assignment_operations.sql"),
  ]);

  for (const field of [
    "site_supervisor_assignment_editing_enabled",
    "assigned_dates",
    "assigned_sites",
    "assignment_editing_override",
    "schedule_changed_at",
  ]) assert.match(migration, new RegExp(field));
  for (const routine of [
    "site_supervisor_game_in_scope",
    "replace_game_assignments",
    "confirm_game_schedule_change",
    "official_event_day_context",
  ]) assert.match(migration, new RegExp(routine));
  assert.match(migration, /notifications_sent/);
  assert.match(migration, /assignment\.updated/);
  assert.match(client, /replace_game_assignments/);
  assert.match(client, /confirm_game_schedule_change/);
  assert.match(client, /official_event_day_context/);
  assert.match(page, /Apply All Matching Games/);
  assert.match(page, /Edit Assignments/);
  assert.match(page, /Change Confirmed/);
  assert.match(page, /No notification was sent/);
  assert.match(page, /Allow Site Supervisors to Edit Assignments by Default/);
  assert.match(page, /Outside your management scope/);
  assert.match(styles, /schedule-updated/);
});

test("v0.23.1 retires the secondary email before an official merge claims it", async () => {
  const migration = await read("supabase/migrations/20260814181120_fix_official_merge_email_collision.sql");
  assert.match(migration, /before update of merged_into_official_id on public\.officials/);
  assert.match(migration, /old\.merged_into_official_id is null/);
  assert.match(migration, /merged\+' \|\| new\.id::text \|\| '@invalid\.law18ref\.local'/);
  assert.match(migration, /revoke all on function public\.retire_merged_official_email\(\) from public, anon, authenticated/);
});

test("beta account and owner confirmations stay inside the site without confirmation email", async () => {
  const [page, authClient, authPanel, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/auth-client.ts"),
    read("app/auth-panel.tsx"),
    read("supabase/migrations/202608140054_beta_password_confirmed_group_actions.sql"),
  ]);
  assert.doesNotMatch(authClient, /sendOrganizationVerification/);
  assert.doesNotMatch(authClient, /email_redirect_to/);
  assert.doesNotMatch(authPanel, /Check your email to confirm your account/);
  assert.match(page, /Your password confirms this action directly during the beta phase/);
  assert.match(page, /AutomaticRecovery/);
  assert.match(page, /reloadFreshApplication/);
  assert.doesNotMatch(page, /Please reload the page to continue/);
  assert.doesNotMatch(page, /Log back in, session expired/);
  assert.doesNotMatch(page, /Unable to Load Law18Ref/);
  assert.match(migration, /jwt_has_recent_method\('password', interval '5 minutes'\)/);
  assert.doesNotMatch(migration, /jwt_has_recent_method\('otp'/);
});

test("linked and provisional official records can merge with last-name ordered selectors", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608140055_provisional_official_record_merges.sql"),
  ]);
  assert.match(page, /const mergeCandidates = officials/);
  assert.match(page, /\.sort\(comparePeopleByLastName\)/);
  assert.match(page, /Linked" : "Provisional/);
  assert.match(page, /choose that linked account as the survivor/i);
  assert.match(client, /rpc\/merge_group_official_records_with_profile/);
  assert.match(migration, /Choose the linked account as the surviving record/);
  assert.match(migration, /update public\.coach_assignments set coach_id = primary_user, coach_official_id = null/);
  assert.match(migration, /insert into public\.provisional_event_access/);
  assert.match(migration, /official_records_merged/);
  assert.match(migration, /revoke execute on function public\.merge_group_official_records_with_profile.*from public, anon/);
});

test("event settings respect organization feature ceilings and enforce disabled modules", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608050041_event_feature_settings.sql"),
  ]);
  assert.match(page, /function EventSettingsPanel/);
  assert.match(page, /event_settings", "Event Settings"/);
  assert.match(page, /eventFeatureEnabled\(event, "check_in"\)/);
  assert.match(page, /Not enabled for this organization/);
  assert.match(client, /updateEventSettings/);
  assert.match(migration, /feature_entitlements jsonb not null/);
  assert.match(migration, /feature_settings jsonb not null/);
  assert.match(migration, /enforce_event_feature_enabled/);
  assert.match(migration, /enforce_check_in_feature/);
  assert.match(migration, /enforce_rating_feature/);
});

test("user-facing groups replace organization terminology and Site Owner controls group features", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/admin-features.css"),
    read("supabase/migrations/202608060045_group_feature_entitlements.sql"),
  ]);
  assert.match(page, /organization_director: "Group Director"/);
  assert.match(page, /organization_admin: "Group Admin"/);
  assert.match(page, /Enabled Group Features/);
  assert.match(page, /Law18Ref Groups/);
  assert.match(page, /workspace-context-bar/);
  assert.match(page, /<span>Group<\/span>/);
  assert.match(client, /feature_entitlements\?: EventFeatureSettings/);
  assert.match(css, /\.site-owner-feature-settings/);
  assert.match(migration, /Only the Site Owner can change group feature entitlements/);
  assert.match(migration, /apply_group_feature_entitlements/);
  assert.match(migration, /update public\.events/);
});

test("external check-in supports configurable identity, messages, links, and two-stage failures", async () => {
  const [page, client, css, migration, configurationMigration, arrivalMigration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202608060044_guest_check_in.sql"),
    read("supabase/migrations/202608070047_external_check_in_configuration.sql"),
    read("supabase/migrations/202608080048_external_check_in_arrival_options.sql"),
  ]);
  assert.match(page, /function ExternalCheckInPage/);
  assert.match(page, /exactly as they appear in your Assignr account/);
  assert.match(page, /Confirm Schedule & Check In/);
  assert.match(page, /external=1/);
  assert.match(page, /Enable External Check-In/);
  assert.match(page, /second_failure_message/);
  assert.match(page, /Show Account Sign-In Option/);
  assert.match(page, /config\?\.arrival_message/);
  assert.match(page, /config\?\.allow_account_sign_in/);
  assert.match(client, /findExternalCheckIn/);
  assert.match(client, /confirmExternalCheckIn/);
  assert.match(client, /Authorization: `Bearer \$\{config\.anonKey\}`/);
  assert.match(css, /\.guest-checkin-page/);
  assert.match(css, /\.guest-schedule-list/);
  assert.match(migration, /guest_check_in_enabled boolean not null default false/);
  assert.match(migration, /security definer/);
  assert.match(migration, /find_guest_check_in/);
  assert.match(migration, /confirm_guest_check_in/);
  assert.match(migration, /grant execute .* to anon, authenticated/);
  assert.match(configurationMigration, /external_check_in_fields text\[\]/);
  assert.match(configurationMigration, /get_external_check_in_config/);
  assert.match(configurationMigration, /find_external_check_in/);
  assert.match(configurationMigration, /external_check_in_second_failure_message/);
  assert.match(configurationMigration, /valid_check_in_links/);
  assert.match(arrivalMigration, /external_check_in_arrival_message/);
  assert.match(arrivalMigration, /external_check_in_allow_account_sign_in/);
});

test("event types and private Rules of Competition documents are available throughout assigned-event views", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608050040_event_types_and_documents.sql"),
  ]);
  assert.match(migration, /event_type text not null default 'tournament'/);
  assert.match(migration, /parent_league_id uuid references public\.events/);
  assert.match(migration, /check_in_enabled boolean not null default true/);
  assert.match(migration, /create table if not exists public\.event_documents/);
  assert.match(migration, /values \('event-documents', 'event-documents', false/);
  assert.match(client, /uploadEventDocument/);
  assert.match(client, /loadMyRulesDocuments/);
  assert.match(page, /ROC — Rules of Competition/);
  assert.match(page, /function EventSettingsPanel/);
  assert.match(page, /Parent league/);
  assert.match(page, /eventFeatureEnabled\(event, "check_in"\)/);
});

test("referees use an account-wide workspace without active organization or event selectors", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /function PersonalDashboard/);
  assert.match(page, /function PersonalCheckInHub/);
  assert.match(page, /<div className="personal-header-spacer" aria-hidden="true"/);
  assert.match(page, /isPersonalWorkspace \? <PersonalDashboard/);
  assert.match(page, /isPersonalWorkspace \? <PersonalCheckInHub/);
  assert.match(page, /You have assignments in more than one event today/);
  assert.match(css, /\.personal-header-spacer/);
});

test("application header remains visible while scrolling", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.topbar\{position:fixed/);
  assert.match(css, /\.eventbar\{margin-top:var\(--fixed-topbar-height\)/);
  assert.match(css, /--fixed-topbar-height:120px/);
});

test("mobile header and administrative context no longer overlap a persistent event bar", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.doesNotMatch(page, /className="eventbar"/);
  assert.match(page, /showAdministrativeContext/);
  assert.match(page, /workspace-context-bar/);
  assert.match(page, /contextViews\.includes\(view\)/);
  assert.match(css, /grid-template-rows:58px 50px/);
  assert.match(css, /--fixed-topbar-height:132px/);
});

test("personal calendar feeds are encrypted and appear in a unified private schedule", async () => {
  const [page, client, worker, css, migration, serviceGrants] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("worker/index.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202607310031_personal_calendar_feeds.sql"),
    read("supabase/migrations/202607310032_calendar_feed_service_role_grants.sql"),
  ]);
  assert.match(page, /function ConnectedSchedules/);
  assert.match(page, /function UnifiedAssignmentsView/);
  assert.match(page, /Connect Feed/);
  assert.match(page, /Schedule conflict/);
  assert.match(client, /loadUnifiedAssignments/);
  assert.match(client, /loadCalendarFeedConnections/);
  assert.match(worker, /AES-GCM/);
  assert.match(worker, /assertSafeFeedUrl/);
  assert.match(worker, /async scheduled/);
  assert.match(worker, /BEGIN:VCALENDAR/);
  assert.match(css, /\.connected-schedules-card/);
  assert.match(css, /\.unified-assignment-row/);
  assert.match(page, /className="panel unified-assignment-list"/);
  assert.match(page, /Calendar Imports/);
  assert.match(page, /Law18Ref Events/);
  assert.match(page, /Law18Ref Groups/);
  assert.match(client, /my_law18_assignment_context/);
  assert.match(migration, /create table if not exists public\.personal_calendar_feeds/);
  assert.match(migration, /revoke all on public\.personal_calendar_feeds from authenticated/);
  assert.match(migration, /create or replace function public\.my_law18_assignments/);
  assert.match(migration, /create or replace function public\.my_external_assignments/);
  assert.match(serviceGrants, /personal_calendar_feeds to service_role/);
  assert.match(serviceGrants, /external_calendar_assignments to service_role/);
});

test("Version 0.11.0 adds color-coded date-filtered assignments and reusable session filters", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202608030034_personal_schedule_display_preferences.sql"),
  ]);
  assert.match(page, /my-assignments:dates/);
  assert.match(page, /from: today/);
  assert.match(page, /personal_schedule_colors/);
  assert.match(page, /SavedFilterControls/);
  assert.match(page, /activeFilterMemory/);
  assert.match(page, /coaching-dates:/);
  assert.match(page, /checkin-status:/);
  assert.match(page, /historyEventIds/);
  assert.match(client, /updateDisplayPreferences/);
  assert.match(css, /--assignment-color/);
  assert.match(migration, /rating_average_preferences/);
});

test("calendar colors support combined presentation modes and custom dropdowns close outside", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202608030035_personal_schedule_color_modes.sql"),
  ]);
  assert.match(page, /Color mark/);
  assert.match(page, /Highlight entire assignment/);
  assert.match(page, /Color calendar label/);
  assert.match(page, /calendar-color-card/);
  assert.match(page, /document\.querySelectorAll<HTMLDetailsElement>\("details\[open\]"\)/);
  assert.match(page, /closest\?\.\("\.account-menu"\)/);
  assert.match(client, /personal_schedule_color_modes/);
  assert.match(css, /calendar-color-label/);
  assert.match(migration, /personal_schedule_color_modes/);
});

test("v0.12.0 prevents profile self-escalation and enforces the organization role hierarchy", async () => {
  const [page, client, roleMigration, securityMigration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608040036_organization_director_role.sql"),
    read("supabase/migrations/202608040037_role_hierarchy_security.sql"),
  ]);
  assert.match(roleMigration, /organization_director/);
  assert.match(securityMigration, /protect_profile_security_fields/);
  assert.match(securityMigration, /new\.is_site_owner is distinct from old\.is_site_owner/);
  assert.match(securityMigration, /protect_official_pending_roles/);
  assert.match(securityMigration, /cleared leaders insert organization memberships/);
  assert.match(securityMigration, /cleared staff insert event memberships/);
  assert.match(securityMigration, /role in \('site_coordinator','referee_coach'\)/);
  assert.match(securityMigration, /organization_join_links_referee_only/);
  assert.match(securityMigration, /secure_merge_organization_accounts/);
  assert.match(securityMigration, /revoke execute on function public\.merge_organization_accounts/);
  assert.match(page, /Group Director/);
  assert.match(page, /canChangeOrganizationRole/);
  assert.match(page, /canChangeEventRole/);
  assert.match(client, /rpc\/merge_group_official_records_with_profile/);
});

test("users can lock personal contact fields without locking organization or event permissions", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608040038_personal_contact_lock.sql"),
  ]);
  assert.match(page, /Lock personal contact information/);
  assert.match(page, /editing\.personal_contact_locked/);
  assert.match(page, /They can still manage your organization and event permissions/);
  assert.match(client, /personal_contact_locked\?: boolean/);
  assert.match(migration, /protect_locked_official_contact/);
  assert.match(migration, /Only the account owner can change the personal contact lock/);
  assert.match(migration, /This user has locked their personal contact information/);
});

test("event access can be staged for provisional officials and activates when accounts link", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608040039_provisional_event_access.sql"),
  ]);
  assert.match(page, /Event permissions for \{event\.name\}/);
  assert.match(page, /These permissions will activate automatically when this provisional official creates their account/);
  assert.match(page, /saveProvisionalEventAccess\(session, event\.id, created\.id/);
  assert.match(client, /export async function loadProvisionalEventAccess/);
  assert.match(client, /export async function saveProvisionalEventAccess/);
  assert.match(migration, /create table if not exists public\.provisional_event_access/);
  assert.match(migration, /create or replace function public\.save_provisional_event_access/);
  assert.match(migration, /insert into public\.event_memberships/);
  assert.match(migration, /delete from public\.provisional_event_access/);
});

test("administrative operations show rating averages and richer attendance context", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /administrativeRatingAverage/);
  assert.match(page, /administrativeRatingLabel/);
  assert.match(page, /Position and overall averages/);
  assert.match(page, /Ovr/);
  assert.match(page, /rating_average_preferences/);
  assert.match(page, /firstAssignment/);
  assert.match(page, /firstGame\.age_group/);
  assert.match(page, /firstGame\.gender/);
  assert.match(page, /schedule-crew-checked/);
  assert.match(page, /official-directory-actions/);
  assert.match(page, /manual-entry-modal/);
  assert.match(css, /\.official-directory-actions/);
});

test("sessions refresh automatically and failures use the neutral reload screen", async () => {
  const [authClient, dataClient, page] = await Promise.all([
    read("app/auth-client.ts"),
    read("app/supabase-client.ts"),
    read("app/page.tsx"),
  ]);
  assert.match(authClient, /grant_type=refresh_token/);
  assert.match(authClient, /refreshLeadSeconds = 120/);
  assert.match(authClient, /navigator\.locks\.request\("law18ref-session-refresh"/);
  assert.match(authClient, /document\.addEventListener\("visibilitychange"/);
  assert.match(authClient, /window\.addEventListener\("online"/);
  assert.match(dataClient, /if \(response\.status === 401\)/);
  assert.match(dataClient, /ensureValidSession\(activeSession, true\)/);
  assert.match(dataClient, /throw new SessionExpiredError\("Please sign in again\."\)/);
  assert.match(page, /if \(isSessionExpiredError\(reason\)\) onSessionExpired\(\)/);
  assert.match(page, /reloadFreshApplication/);
});

test("public ratings support approval, unread referee badges, and retained deletion", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/202607300030_public_rating_approval_notifications.sql"),
  ]);
  assert.match(page, /Public Eval Approval/);
  assert.match(page, /Approve & Share/);
  assert.match(page, /nav-notification-badge/);
  assert.match(page, /markEventRatingsSeen/);
  assert.match(client, /approvePublicRating/);
  assert.match(client, /keep_for_referee: retainForReferee/);
  assert.match(css, /\.nav-notification-badge/);
  assert.match(migration, /effective_public_rating_approval_role/);
  assert.match(migration, /referee_seen_at/);
  assert.match(migration, /retained_for_referee/);
  assert.match(migration, /rating\.approved/);
});

test("ratings can be filtered and sorted by score with match crews in position order", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /scores: \[\] as string\[\]/);
  assert.match(page, /<option value="score">Rating Score<\/option>/);
  assert.match(page, /\["scores", "Rating Scores", filterOptions\.scores\]/);
  assert.match(page, /if \(ratingSort === "score"\)/);
  assert.match(page, /function crewPositionPriority/);
  assert.match(page, /position === "assistant_referee"/);
  assert.match(page, /position === "fourth_official"/);
  assert.match(page, /orderGameRatings\(ratings\)\.map/);
});

test("rating history identifies each rating submitter", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300029_rating_submitter_names.sql"),
  ]);
  assert.match(page, /const ratingAttribution = \(assessment: AssessmentRecord\)/);
  assert.match(page, /Submitted by \$\{submittedBy\}, edited by/);
  assert.match(client, /submitters: \{ id: string; full_name: string \}\[\]/);
  assert.match(migration, /visible_submitters as/);
  assert.match(migration, /join visible_assessments a on a\.coach_id = p\.id/);
  assert.match(migration, /'submitters'/);
});

test("full-game ratings use one collapsible horizontal official row", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /collapsedRatingGameIds/);
  assert.match(page, /className="game-rating-collapse"/);
  assert.match(page, /aria-expanded=\{!collapsed\}/);
  assert.match(css, /\.game-rating-officials\{display:flex;align-items:stretch;overflow-x:auto/);
  assert.match(css, /\.game-rating-officials>div\{display:grid;[\s\S]*flex:1 0 230px/);
});

test("rating selection checkbox uses a compact column beside rating information", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /selectable-rating-row/);
  assert.match(css, /\.ratings-history article\.selectable-rating-row\{grid-template-columns:16px minmax\(0,1fr\) 45px 78px auto\}/);
  assert.match(css, /\.selectable-rating-row>\.bulk-row-check\{width:16px!important;height:16px;margin:0\}/);
  assert.match(css, /article\.selectable-rating-row\{grid-template-columns:16px minmax\(0,1fr\) 40px\}/);
});

test("role help uses an isolated single-column scrollable dialog", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /<aside className="role-help-roles"/);
  assert.match(page, /<main className="role-help-content"/);
  assert.match(page, /<footer className="role-help-actions"/);
  assert.match(css, /\.confirmation-dialog\.role-help-dialog\{display:grid;grid-template-rows:auto auto minmax\(0,1fr\) auto/);
  assert.match(css, /\.role-help-content\{display:block;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto/);
  assert.match(css, /\.role-help-dialog \.modal-close-button\{flex:0 0 38px;width:38px;height:38px\}/);
});

test("event members and assigned referee coaches load into officials and check-in rosters", async () => {
  const [page, client] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
  ]);
  assert.ok(client.includes("event_memberships?event_id=eq.${enc(eventId)}&select=user_id"));
  assert.match(client, /coachAssignments\.map\(\(assignment\) => assignment\.coach_id\)/);
  assert.ok(client.includes("officials?organization_id=eq.${enc(eventOrganizationId)}&linked_user_id=in.(${eventUserIds.join(\",\")})"));
  assert.match(client, /new Map\(\[\.\.\.assignedOfficials, \.\.\.linkedEventOfficials\]/);
  assert.match(page, /const eventOfficialIds = new Set\(data\.officials\.map/);
  assert.match(page, /official\.id === assignment\.coach_official_id \|\| official\.linked_user_id === assignment\.coach_id/);
});

test("page refresh restores the current view and active event", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /function refreshCurrentPage\(\)/);
  assert.match(page, /sessionStorage\.setItem\("law18ref-refresh-view", view\)/);
  assert.match(page, /sessionStorage\.setItem\("law18ref-refresh-event", eventId\)/);
  assert.match(page, /refreshableViews\.includes\(refreshView\)/);
  assert.match(page, /onClick=\{refreshCurrentPage\}/);
});

test("organization administrators can upload a logo for the active organization bar", async () => {
  const [page, client, css, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/admin-features.css"),
    read("supabase/migrations/202607300028_organization_logos.sql"),
  ]);
  assert.match(page, /function OrganizationLogoEditor/);
  assert.match(page, /className="event-organization-logo"/);
  assert.match(page, /Save Group Settings/);
  assert.match(client, /export async function uploadOrganizationLogo/);
  assert.match(client, /organization-logos/);
  assert.match(css, /\.event-organization-logo/);
  assert.match(migration, /add column if not exists logo_url text/);
  assert.match(migration, /public\.has_org_role/);
  assert.match(migration, /organization_admin/);
});

test("official directory sorts populated values before missing values", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /function personLastNameSortKey/);
  assert.match(page, /name: \[officialSelectorLabel\(a\), officialSelectorLabel\(b\)\]/);
  assert.match(page, /const compareDirectoryValues/);
  assert.match(page, /if \(leftMissing !== rightMissing\) return leftMissing \? 1 : -1/);
  assert.match(page, /last_active: \[a\.last_login_at, b\.last_login_at\]/);
  assert.match(page, /rating: \[officialAverage\(a\.id\), officialAverage\(b\.id\)\]/);
  assert.match(page, /const \[sortDirection, setSortDirection\]/);
  assert.match(page, /direction === "desc" \? -comparison : comparison/);
  assert.match(page, /Low–High/);
  assert.match(page, /Newest–Oldest/);
  assert.match(page, />Order<select/);
});

test("site owner and delegated administrator access follow protected removal hierarchy", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300027_protected_administrator_roles.sql"),
  ]);
  assert.match(page, /Site Owner, Group Director, and Group Admin accounts cannot be mass deleted/);
  assert.match(page, /protectedRole/);
  assert.match(page, /protectedEventAdmin && !canRemoveProtectedEventAdmin/);
  assert.match(client, /preserveEventAdmin/);
  assert.match(migration, /The site-owner account cannot be removed/);
  assert.match(migration, /Organization administrators can only remove their own access/);
  assert.match(migration, /last organization administrator must deactivate the organization before leaving/);
  assert.match(migration, /Site owners and organization administrators cannot be deleted in bulk/);
  assert.match(migration, /role <> 'event_admin' or user_id = auth\.uid\(\)/);
});

test("archived event selection and restore control share one compact row", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/admin-features.css")]);
  assert.match(page, /className="archived-event-actions"><input className="bulk-row-check"/);
  assert.match(css, /\.archived-event-row > \.archived-event-actions/);
  assert.match(css, /\.archived-event-actions > \.secondary \{[\s\S]*width: max-content/);
  assert.doesNotMatch(css, /\.archived-event-row button \{[\s\S]*width: 100%/);
});

test("responsive shell and header remain contained within the viewport", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /html,body\{width:100%;max-width:100%;overflow-x:hidden\}/);
  assert.match(css, /\.topbar nav\{flex:1 1 auto;min-width:0;max-width:100%;overflow-x:auto/);
  assert.match(css, /\.topbar-account-actions\{max-width:100%;min-width:0\}/);
  assert.match(css, /\.eventbar>div\{display:grid;width:100%;grid-template-columns:35px repeat\(2,minmax\(0,1fr\)\)/);
});

test("expired authentication automatically clears stale app caches and reloads", async () => {
  const [page, authPanel] = await Promise.all([read("app/page.tsx"), read("app/auth-panel.tsx")]);
  assert.doesNotMatch(page, /Setup needed/);
  assert.doesNotMatch(page, /Log back in, session expired\./);
  assert.match(page, /setReloadRequired\(true\)/);
  assert.match(page, /sessionStorage\.removeItem\(AUTOMATIC_RECOVERY_KEY\)/);
  assert.match(page, /<AutomaticRecovery reason="session"/);
  assert.match(page, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(page, /name\.startsWith\("law18referee-"\)/);
  assert.match(page, /window\.location\.replace\(nextUrl\.toString\(\)\)/);
  assert.doesNotMatch(page, /Please reload the page to continue/);
  assert.match(page, /isSessionExpiredError\(reason\)/);
  assert.match(page, /dashboardLoadError/);
  assert.match(authPanel, /initialMessage/);
});

test("schedule imports support Assignr CSV and GotSport XLSX drag and drop", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /onDragEnter=\{enterDropZone\}/);
  assert.match(page, /onDrop=\{dropFile\}/);
  assert.match(page, /Assignr CSV or GotSport XLSX/);
  assert.match(page, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(page, /GotSport competition/);
  assert.match(page, /parseGotSportWorksheet/);
});

test("officials directory displays all organization roles", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Group Roles/);
  assert.match(page, /roles\.map\(\(role\) => <span className="role-badge"/);
});

test("official editor uses structured fields and role cards", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /official-fields-grid/);
  assert.match(page, /official-role-grid/);
  assert.match(page, /official-edit-actions/);
});

test("active-event permissions are integrated into the official editor and site-owner access is locked", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /ACTIVE EVENT PERMISSIONS/);
  assert.match(page, /These permissions apply only to the current active event/);
  assert.match(page, /saveUserEventAccess\(session, event\.id, editing\.linked_user_id/);
  assert.match(page, /Full schedule access/);
  assert.match(page, /Enable coaching tools/);
  assert.match(page, /Site Owner — Full Access/);
  assert.match(page, /owner-locked/);
});

test("daily check-in uses the camera scanner and hides it after check-in", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Scan QR Code/);
  assert.match(page, /\{!isCheckedIn && <QrScanner/);
  assert.match(page, /Check-in complete/);
});

test("coaches can be assigned in bulk or from the filtered full schedule", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Multiple selected games/);
  assert.match(page, /Assign Coaches by Game/);
  assert.match(page, /coach-schedule-filters/);
  assert.match(page, /Promise\.all\(newTargets/);
});

test("filtered coaching schedules support checkbox selection and one-action bulk assignment", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /Select All Filtered Games/);
  assert.match(page, /Clear Filtered Games/);
  assert.match(page, /className="coach-game-checkbox"/);
  assert.match(page, /assignCoachToSelectedGames/);
  assert.match(page, /selectedGameIds\.filter\(\(target\) => !assignmentExists/);
  assert.match(page, /existing assignment.*skipped/);
  assert.match(css, /\.coach-bulk-selection-bar/);
  assert.match(css, /\.coach-schedule-row\.selected/);
});

test("provisional referee coaches can be assigned before account creation", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608140050_provisional_referee_coach_assignments.sql"),
  ]);
  assert.match(client, /coach_official_id/);
  assert.match(client, /provisional_event_access\?event_id/);
  assert.match(page, /official\.id === assignment\.coach_official_id/);
  assert.match(page, /Provisional/);
  assert.match(migration, /coach_assignments_one_coach_identity/);
  assert.match(migration, /activate_provisional_coach_assignments/);
  assert.match(migration, /Give this provisional official Referee Coach permission/);
});

test("ratings remain group-scoped and the Site Owner can coach and submit ratings", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608140051_group_scoped_ratings_and_owner_coaching.sql"),
  ]);
  assert.match(client, /loadAuthorizedRatingHistory\(session: Law18Session, organizationId: string\)/);
  assert.match(client, /target_organization: organizationId/);
  assert.match(page, /ownerCoachRecord/);
  assert.match(page, /profile\.is_site_owner && official\.linked_user_id === profile\.id/);
  assert.match(migration, /event\.organization_id = target_organization/);
  assert.match(migration, /assessment\.organization_id = target_organization/);
  assert.match(migration, /public\.is_site_owner\(\)/);
  assert.match(migration, /enforce_assessment_group_ownership/);
});

test("top bar has an accessible page refresh button beside the account menu", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /className="topbar-account-actions"/);
  assert.match(page, /className="page-refresh-button" aria-label="Refresh page"/);
  assert.match(page, /window\.location\.reload\(\)/);
});

test("site owner appearance supports secure drag-and-drop logo uploads", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607290025_appearance_logo_storage.sql"),
  ]);
  assert.match(page, /className=\{`appearance-logo-upload/);
  assert.match(page, /onDrop=\{\(event\) =>/);
  assert.match(page, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(page, /uploadAppearanceLogo\(session, file\)/);
  assert.match(client, /storage\/v1\/object\/appearance-logos/);
  assert.match(migration, /file_size_limit/);
  assert.match(migration, /public\.is_site_owner\(\)/);
});

test("coach schedule lists crews and opens the selected game's rating modal", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /schedule-crew-list/);
  assert.match(page, />Rate Crew</);
  assert.match(page, /onRateCrew=\{\(gameId, targetEventId\) => \{ setRatingEditAssessmentId\(null\);/);
  assert.match(page, /initialGameId=\{ratingModalGameId \|\| undefined\} initialAssessmentId=\{ratingEditAssessmentId \|\| undefined\}/);
  assert.match(page, /if \(modal\) onClose\?\.\(\)/);
  assert.match(page, /else chooseGame\(""\)/);
  assert.match(page, /hideWorkspace=\{canAssess\}/);
  assert.match(page, />Rate a Crew<\/button>/);
  assert.match(page, /onOpenRating=\{\(\) => \{ setRatingEditAssessmentId\(null\); setRatingModalGameId\(""\); \}\}/);
});

test("coach crew visibility is scoped by a dedicated RLS migration", async () => {
  const migration = await read("supabase/migrations/202607290022_coach_crew_visibility.sql");
  assert.match(migration, /coach_can_view_game/);
  assert.match(migration, /coaches view assigned game crews/);
  assert.match(migration, /coaches view assigned crew officials/);
  assert.match(migration, /full_schedule_access/);
});

test("ratings game options are concise and mobile controls stay within the workspace", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /\{formatDate\(game\.starts_at\)\} · \{game\.field_name\} · \{formatTime\(game\.starts_at\)\}/);
  assert.match(css, /\.assessment-selects select\{[^}]*width:100%[^}]*min-width:0[^}]*max-width:100%/);
  assert.match(css, /\.crew-rating-workspace\{[^}]*overflow:hidden/);
});

test("coach-only schedules exclude operational and HQ locations", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /coachView\s*\?\s*data\.games\.filter\(\(game\) => isRateableGame\(game\)/);
  assert.match(page, /toLowerCase\(\)\.includes\("hq"\)/);
  assert.match(page, /coachView=\{isCoach && !isAdministrativeStaff\}/);
});

test("coaching administration is hidden from referee coaches", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /isCoach\s*\?\s*\[\["dashboard", "Dashboard"\], \.\.\.\(eventFeatureEnabled\(event, "check_in"\) && coachHasCurrentOrFutureAssignment/);
  assert.match(page, /view === "coaching" && isAdministrativeStaff/);
});

test("assigned referee coaches participate in daily check-in", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /coachHasCurrentOrFutureAssignment/);
  assert.match(page, /coachingOfficialIds/);
  assert.match(page, /assignedToday\.add\(coachOfficial\.id\)/);
  assert.match(page, /Referee Coach/);
  assert.match(page, /assignment\.full_schedule\) data\.games\.forEach\(\(game\) => assignmentDates\.add/);
});

test("administrative dashboard exposes compact role-aware navigation", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /className="dashboard-compact-access"/);
  assert.match(page, /canManageCheckIns && <button className="dashboard-checkin-card"/);
  assert.match(page, /\{checkedIn\}\/\{expectedToday\.size\}/);
  assert.match(page, /className="dashboard-navigation-grid"/);
  assert.match(page, /navigation\.filter\(\(\[id\]\) => id !== "dashboard"\)/);
});

test("official names open the shared full-event schedule modal", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /className="checkin-official-button"/);
  assert.match(page, /function OfficialEventScheduleModal/);
  assert.match(page, /FULL EVENT SCHEDULE/);
  assert.match(page, /onSelectOfficial=\{selectScheduleOfficial\}/);
  assert.match(page, /Edit Official/);
  assert.match(css, /\.official-event-schedule-dialog/);
});

test("official schedule modal is scrollable and grays completed assignments", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /completionCutoff = Date\.now\(\) - \(2 \* 60 \* 60 \* 1000\)/);
  assert.match(page, /official-event-schedule-card \$\{completed \? "completed"/);
  assert.match(page, /className="selected-position"/);
  assert.match(page, /data\.assignments\.filter\(\(item\) => item\.game_id === game\.id\)/);
  assert.match(page, /positionLabel\(crewAssignment\.position, crewAssignment\.position_title\)/);
  assert.match(css, /\.official-event-schedule-dialog\{[^}]*overflow-y:auto/);
  assert.match(css, /\.official-event-schedule-card\.completed/);
  assert.match(css, /\.checkin-crew-member\.selected-official/);
});

test("rating configuration requires an explicit reliable save and Basic Eval stores notes", async () => {
  const [page, client, migration] = await Promise.all([read("app/page.tsx"), read("app/supabase-client.ts"), read("supabase/migrations/202608050042_rating_configuration_save.sql")]);
  assert.match(page, /Save Configuration/);
  assert.match(page, /saveConfiguration/);
  assert.match(page, /rating-config-message/);
  assert.match(client, /rpc\/update_event_rating_settings/);
  assert.match(migration, /create or replace function public\.update_event_rating_settings/);
  assert.match(migration, /organization_director/);
  assert.match(page, /configuration\.ratingType === event\.rating_type/);
  assert.match(page, /className="basic-eval-notes"/);
  assert.match(page, /coach_notes: rating\.coach_notes \|\| null/);
  assert.match(page, /className="inline-basic-rating"/);
  assert.match(page, /<option value="">N\/A<\/option>/);
  assert.match(page, /overall_rating: e\.target\.value \? Number\(e\.target\.value\) : null/);
  assert.match(page, /<textarea rows=\{2\}/);
});

test("Skills Eval uses position-specific categories and expanded written feedback", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202608050043_position_specific_skills_eval.sql"),
  ]);
  assert.match(page, /Match Control/);
  assert.match(page, /Signaling\/Offside/);
  assert.match(page, /Teamwork/);
  assert.match(page, /Positioning and Movement/);
  assert.match(page, /Management of the Technical Area/);
  assert.match(page, /Positive Areas of Performance/);
  assert.match(page, /Areas for Improvement/);
  assert.match(page, /Additional Comments\/Suggestions/);
  assert.match(page, /Private Coach\/Admin Notes/);
  assert.match(page, /skillValuesForAssignment/);
  assert.match(client, /additional_comments: string \| null/);
  assert.match(migration, /add column if not exists additional_comments text/);
});

test("administrative roster supports immediate manual check-in and undo", async () => {
  const [page, client] = await Promise.all([read("app/page.tsx"), read("app/supabase-client.ts")]);
  assert.match(page, /canManageCheckIns=\{isStaff\}/);
  assert.match(page, /toggleManualCheckIn/);
  assert.match(page, /Undo Check-In/);
  assert.match(page, /"Check In"/);
  assert.doesNotMatch(page, /confirm\([^)]*check.?in/i);
  assert.match(client, /export async function undoCheckIn/);
  assert.match(client, /method: "DELETE"/);
});

test("check-in roster sorts by first assignment field instead of site", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /firstField: firstGame\?\.field_name \|\| "Unspecified field"/);
  assert.match(page, /rosterSort === "field"/);
  assert.match(page, /<option value="field">Field<\/option>/);
  assert.doesNotMatch(page, /<option value="site">Site<\/option><\/select><\/label><label>Site/);
});

test("authorized administrators can create an event without importing a schedule", async () => {
  const [page, client] = await Promise.all([read("app/page.tsx"), read("app/supabase-client.ts")]);
  assert.match(page, /Create New Event/);
  assert.match(page, /Create an event without a schedule/);
  assert.match(page, /canCreateEvent=\{Boolean\(profile\.is_site_owner \|\| organizationRoles\.includes\("organization_director"\) \|\| organizationRoles\.includes\("organization_admin"\) \|\| organizationRoles\.includes\("event_admin"\)\)\}/);
  assert.match(client, /export async function createEvent\(/);
  assert.match(client, /The end date cannot be before the start date/);
  assert.match(client, /check_in_slug: `\$\{slugBase\}-\$\{Date\.now\(\)\.toString\(36\)\}`/);
});

test("Rate Crew buttons and rating choices exclude HQ and operational games", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /function isRateableGame/);
  assert.match(page, /!game\.operational/);
  assert.match(page, /canRateGame\(game\)/);
  assert.match(page, /eligibleGames = data\.games\.filter\(isRateableGame\)/);
});

test("schedule rating buttons follow game-level and full-event coaching scope", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /myCoachingAssignments/);
  assert.match(page, /fullRatingAccessEventIds/);
  assert.match(page, /assignedCoachingGameIds/);
  assert.match(page, /fullRatingAccessEventIds\.has\(game\.event_id\) \|\| assignedCoachingGameIds\.has\(game\.id\)/);
  assert.match(page, /canRateGame\(game\)/);
  assert.match(page, /canRateCrew=\{canAssess\}/);
});

test("complete game crews use referee, numbered assistant, fourth-official order everywhere", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /function crewPositionPriority/);
  assert.match(page, /function sortGameCrew/);
  assert.match(page, /return 100 \+ \(ordinal \? Number\(ordinal\) : 50\)/);
  assert.match(page, /return 300/);
  assert.ok((page.match(/sortGameCrew\(data\.assignments\.filter/g) || []).length >= 3);
  assert.match(page, /const gameAssignments = assignmentsForRatingGame\(gameId\)/);
  assert.match(page, /orderGameRatings\(ratings\)\.forEach/);
  assert.match(page, /orderGameRatings\(ratings\)\.map/);
});

test("all users have active-group role-aware help", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /className="help-button"/);
  assert.match(page, /HELP & HOW-TO/);
  assert.match(page, /How to Navigate Law18Ref/);
  assert.match(page, /Open My Assignments to view one schedule containing all of your Law18Ref games/);
  assert.match(page, /Select Rate Crew on a game to open its evaluation form/);
  assert.match(page, /activeGroupRoles/);
  assert.match(page, /Follow the directions below for your role/);
  for (const role of ["site_owner", "organization_director", "organization_admin", "event_admin", "assignor", "site_coordinator", "referee_coach", "referee"]) {
    assert.match(page, new RegExp(`${role}: \\{ title:`));
  }
});

test("v0.35.4 shows the application version beside Help for the Site Owner only", async () => {
  const [page, css, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /const APP_VERSION = "0\.44\.2"/);
  assert.match(page, /profile\?\.is_site_owner && <span className="owner-version"/);
  assert.match(page, /<button className="help-button"/);
  assert.match(page, /Version \{APP_VERSION\}/);
  assert.match(css, /\.owner-version\{/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("the application footer identifies the legal operator without changing product ownership", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /© 2026 Law18Ref · Version \{APP_VERSION\}/);
  assert.match(page, /<small>by Falksport91 LLC<\/small>/);
  assert.doesNotMatch(page, /© 2026 Falksport91 LLC/);
});

test("rating saves use the protected rating RPC and matching unique index", async () => {
  const [client, migration, protectedMigration] = await Promise.all([
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607290023_assessment_upsert_constraint.sql"),
    read("supabase/migrations/20260823233442_immutable_coach_ratings_and_admin_revision_history.sql"),
  ]);
  assert.match(client, /rpc\/save_rating/);
  assert.match(migration, /create unique index assessments_game_official_coach_unique/);
  assert.doesNotMatch(migration, /where official_id is not null/i);
  assert.match(protectedMigration, /protect_submitted_rating_edits/);
});

test("v0.35.4 gives combined Site Supervisor and Referee Coach users the Ratings tab", async () => {
  const [page, packageJson] = await Promise.all([read("app/page.tsx"), read("package.json")]);
  assert.match(page, /: isSiteCoordinator[\s\S]*canAssess && eventFeatureEnabled\(event, "ratings"\)[\s\S]*\["assessments", "Ratings"\]/);
  assert.match(page, /const canAssess = isCoach/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("rating drafts are readable only by their creator", async () => {
  const migration = await read("supabase/migrations/202607290024_private_rating_drafts.sql");
  assert.match(migration, /as restrictive/);
  assert.match(migration, /status <> 'draft'/);
  assert.match(migration, /coach_id = auth\.uid\(\)/);
});

test("ratings history supports multi-select filters independent of sorting", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /historyFilters/);
  assert.match(page, /toggleHistoryFilter/);
  assert.match(page, /Filter Ratings/);
  assert.match(page, /Clear All Filters/);
  assert.match(page, /className="rating-filter-dropdown"/);
  assert.match(page, /historyFilters\[key\]\.length \? `\$\{historyFilters\[key\]\.length\} selected` : "All"/);
  for (const label of ["Referees", "Age Groups", "Genders", "Positions"]) {
    assert.match(page, new RegExp(`\"${label}\"`));
  }
  assert.match(page, /className="rating-referee-search"/);
  assert.match(page, /placeholder="Search referees…"/);
  assert.match(page, /className="rating-date-range"/);
  assert.match(page, /historyDateRange\.from/);
  assert.match(page, /historyDateRange\.through/);
  assert.doesNotMatch(page, /\["dates", "Dates"/);
  assert.match(page, /const filteredAverage = filteredScores\.length/);
  assert.match(page, /Average Score <strong>\{filteredAverage\?\.toFixed\(2\) \|\| "—"\}/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(110px,1fr\)\) minmax\(220px,1\.35fr\)/);
  assert.match(css, /@media\(max-width:900px\)\{\.ratings-filter-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:520px\)\{\.ratings-filter-grid\{grid-template-columns:1fr/);
});

test("ratings history survives event archiving and supports grouped export and lifecycle controls", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300025_rating_history_lifecycle.sql"),
  ]);
  assert.match(page, /Individual Ratings/);
  assert.match(page, /Full Game Ratings/);
  assert.match(page, /Export Spreadsheet/);
  assert.match(page, /Select All/);
  assert.match(page, /Show Archived Ratings/);
  assert.match(client, /rpc\/authorized_rating_history/);
  assert.match(client, /rpc\/set_rating_archived/);
  assert.match(client, /rpc\/delete_rating/);
  assert.match(migration, /create or replace function public\.authorized_rating_history/);
  assert.match(migration, /rating\.archived/);
  assert.match(migration, /rating\.deleted/);
});

test("administrators can bulk manage officials, ratings, and events", async () => {
  const [page, client, migration, readme] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300026_bulk_record_lifecycle.sql"),
    read("README.md"),
  ]);
  assert.match(page, /Select All Visible/);
  assert.match(page, /Delete Eligible/);
  assert.match(page, /Archive Selected/);
  assert.match(page, /Delete Archived/);
  assert.match(client, /rpc\/bulk_manage_records/);
  assert.match(migration, /record_type not in \('officials', 'ratings', 'events'\)/);
  assert.match(migration, /Events must be archived before permanent deletion/);
  assert.match(migration, /officials with history must be archived, not deleted/);
  assert.match(readme, /Games and assignments are designed to join the same workflow/);
});

test("officials directory shows authorized submitted-rating averages", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /setDirectoryRatingHistory\(\{ assessments: result\.assessments, assignments: result\.assignments \}\)/);
  assert.match(page, /assessment\.status !== "draft"/);
  assert.match(page, /<span className="directory-average">Rating Summary<\/span>/);
  assert.match(page, /Ovr \$\{summary\.overall\?\.toFixed\(1\)/);
  assert.match(page, /Ref \$\{summary\.referee\?\.toFixed\(1\)/);
  assert.match(page, /AR \$\{summary\.assistantReferee\?\.toFixed\(1\)/);
  assert.match(page, /<option value="rating">Average Rating<\/option>/);
});

test("only administrators can revise a submitted crew rating with retained history", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /assessment\.coach_id === session\.user\.id && assessment\.status === "draft"/);
  assert.match(page, /className="secondary edit-rating-button"/);
  assert.match(page, /onEditRating\(assessment\.game_id, ratedGame\.event_id, assessment\.id\)/);
  assert.match(page, /if \(targetEventId !== event\.id\) await switchEvent\(targetEventId\)/);
  assert.match(page, /setRatingEditAssessmentId\(assessmentId\)/);
  assert.match(page, /setRatingModalGameId\(gameId\)/);
  assert.match(page, /assignmentsForRatingGame\(nextGameId\)\.forEach/);
});

test("account merge migration transfers operational records and audits the merge", async () => {
  const migration = await read("supabase/migrations/202607290021_phase_one_identity_merge.sql");
  for (const table of ["assignments", "check_ins", "assessments", "coach_assignments"]) {
    assert.match(migration, new RegExp(`update public\\.${table}`));
  }
  assert.match(migration, /organization_memberships/);
  assert.match(migration, /event_memberships/);
  assert.match(migration, /accounts_merged/);
  assert.match(migration, /merged_into_official_id/);
});

test("account merge review supports field-by-field profile resolution", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  const client = await read("app/supabase-client.ts");
  const migration = await read("supabase/migrations/202608140055_provisional_official_record_merges.sql");
  assert.match(page, /merge-profile-review/);
  assert.match(page, /className="merge-dialog-actions"/);
  assert.match(css, /\.confirmation-dialog\.merge-dialog\{display:flex/);
  assert.match(css, /\.merge-dialog>\.merge-profile-review\{display:grid/);
  assert.match(css, /max-height:300px/);
  assert.match(css, /overflow:auto/);
  for (const field of ["full_name", "secondary_email", "date_of_birth", "phone", "badge_level"]) {
    assert.match(page, new RegExp(field));
  }
  assert.match(client, /merge_group_official_records_with_profile/);
  assert.match(migration, /primary_official\.personal_contact_locked/);
  assert.match(migration, /field_sources/);
});

test("event schedules support reusable filters, ordered sorting, and Excel or PDF exports", async () => {
  const [page, exporter, client, css, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/schedule-export.ts"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("package.json"),
  ]);
  for (const filter of ["dateFilters", "fieldFilters", "siteFilters", "officialFilters", "timeFilters", "ageFilters", "genderFilters", "competitionFilters"]) assert.match(page, new RegExp(filter));
  assert.match(page, /Date \/ Field \/ Time/);
  assert.match(page, /Date \/ Time \/ Field/);
  assert.match(page, /Only \{visibleGames\.length\} filtered game/);
  assert.match(page, /All \{baseVisibleGames\.length\} game/);
  assert.match(page, /breakBefore/);
  assert.match(exporter, /exportScheduleExcel/);
  assert.match(exporter, /exportSchedulePdf/);
  assert.match(exporter, /downloadExcelWorkbook/);
  assert.match(exporter, /autoTable\(document/);
  assert.match(client, /schedule\.exported/);
  assert.match(css, /\.schedule-filter-bar/);
  const dependencies = JSON.parse(packageJson).dependencies;
  assert.ok(dependencies.exceljs && dependencies.jspdf && dependencies["jspdf-autotable"]);
});

test("v0.35.4 creates paper-efficient schedule PDFs with one dynamic column per crew position", async () => {
  const [page, exporter, css, packageJson] = await Promise.all([read("app/page.tsx"), read("app/schedule-export.ts"), read("app/globals.css"), read("package.json")]);
  assert.match(exporter, /export type SchedulePdfOptions/);
  assert.match(exporter, /function crewColumns/);
  assert.match(exporter, /label: `AR\$\{assistantNumber\}`/);
  assert.match(exporter, /label: "4th"/);
  assert.match(exporter, /positionColumns\.forEach\(\(column\) => cells\.push/);
  assert.match(exporter, /orientation: "landscape"/);
  assert.match(exporter, /margin: \{ top: 20, right: 20, bottom: 22, left: 20 \}/);
  assert.match(exporter, /rowPageBreak: "avoid"/);
  assert.match(page, /PDF Layout/);
  assert.match(page, /Ultra Compact/);
  assert.match(page, /First Initial \+ Last Name/);
  assert.match(page, /Group Separator Rows/);
  assert.match(page, /Each crew position receives its own column/);
  assert.match(css, /\.schedule-pdf-options/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("assignment board exposes all three Phase 1 views", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /Time and Field Grid/);
  assert.match(page, />By Field</);
  assert.match(page, />First Assignment</);
  assert.match(page, /className="board-day-picker"/);
  assert.match(page, />Event Day</);
  assert.match(page, /const visibleGames = useMemo\(\(\) => data\.games\.filter/);
  assert.match(page, /dateKeyInTimeZone\(game\.starts_at, event\.timezone\) === boardDate/);
  assert.match(page, /visibleGames\.find\(\(item\) => item\.field_name === field/);
  assert.match(page, /visibleGames\.filter\(\(game\) => game\.field_name === field\)/);
  assert.match(page, /const fields = \[\.\.\.new Set\(visibleGames\.map\(\(game\) => game\.field_name\)\)\][\s\S]*?localeCompare\(b, undefined, \{ numeric: true, sensitivity: "base" \}\)/);
  assert.match(page, /<thead><tr><th scope="col">Time<\/th>\{fields\.map/);
  assert.match(page, /className="field-board-list">\{fields\.map/);
  assert.match(css, /\.board-day-picker/);
  assert.match(page, /const timeOrder = a\.game\.starts_at\.localeCompare\(b\.game\.starts_at\)/);
  assert.match(page, /const fieldOrder = a\.game\.field_name\.localeCompare\(b\.game\.field_name, undefined, \{ numeric: true, sensitivity: "base" \}\)/);
  assert.match(page, /return aLastName\.localeCompare\(bLastName/);
});

test("v0.32.5 refreshes check-ins from Schedule and Assignment Board without a full event reload", async () => {
  const [page, css] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /function RefreshCheckInsButton/);
  assert.match(page, /Refreshing…" : "Refresh Check-Ins"/);
  assert.match(page, /onRefreshCheckIns=\{refreshCheckIns\}/);
  assert.match(page, /canManageCheckIns=\{isStaff && eventFeatureEnabled\(event, "check_in"\)\}/);
  assert.match(page, /loadEventCheckIns\(session, eventId\)/);
  assert.match(page, /loadEventAttendanceOverrides\(session, eventId\)/);
  assert.match(page, /setData\(\(current\) => \(\{ \.\.\.current, checkIns, attendanceOverrides \}\)\)/);
  assert.match(css, /\.refresh-checkins-button\{/);
});

test("v0.34.0 retains ratings that administrators exclude from scoring averages", async () => {
  const [page, client, css, migration, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"), read("app/globals.css"),
    read("supabase/migrations/20260821175328_rating_average_inclusion.sql"), read("package.json"),
  ]);
  assert.match(migration, /include_in_averages boolean not null default true/);
  assert.match(migration, /create or replace function public\.set_rating_average_inclusion/);
  assert.match(migration, /public\.has_org_role\(target\.organization_id, array\['organization_director','organization_admin'\]/);
  assert.match(migration, /public\.has_event_role\(target\.event_id, array\['event_admin'\]/);
  assert.match(migration, /rating\.average_excluded/);
  assert.match(migration, /assessments\.include_in_averages\s+and assessments\.visibility = 'public'/);
  assert.match(migration, /assessment\.include_in_averages\s+and assessment\.visibility = 'public'/);
  assert.match(migration, /and assessment\.include_in_averages/);
  assert.match(migration, /when should_include and visibility = 'public' and status = 'shared' then null/);
  assert.match(migration, /revoke all on function public\.set_rating_average_inclusion\(uuid, boolean\) from public, anon/);
  assert.match(client, /export async function setRatingAverageInclusion/);
  assert.match(page, /assessment\.include_in_averages === false/);
  assert.match(page, /"Exclude from Averages"/);
  assert.match(page, /"Count in Averages"/);
  assert.match(page, /hidden from the referee/);
  assert.match(page, /assessment\.include_in_averages !== false\s+&& assessment\.visibility === "public"/);
  assert.match(page, /Official \$\{index\} Counted in Averages/);
  assert.match(css, /\.excluded-from-average\{/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("roadmap records organization capability and check-in method controls", async () => {
  const readme = await read("README.md");
  assert.match(readme, /Organization capability controls/);
  assert.match(readme, /site-owner organization entitlements followed by organization-admin member permissions/);
  assert.match(readme, /organization’s capability ceiling/);
  assert.match(readme, /remove any site-owner-enabled capability from the organization generally, from a role, or from an individual member/);
  assert.match(readme, /Never let an organization administrator enable a capability that the site owner has disabled/);
  assert.match(readme, /Control access to check-ins, assigning, and ratings\/coaching independently/);
  assert.match(readme, /enable or disable every supported evaluation form type independently/);
  assert.match(readme, /enable or disable public evaluations/);
  assert.match(readme, /daily QR code, reusable NFC tag, and administrator manual check-in/);
  assert.match(readme, /reject related database\/API mutations/);
});

test("organization admins can review audited actions and copy one officials join link", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300023_audit_join_links_and_member_removal.sql"),
  ]);
  assert.match(page, /Copy Join Link/);
  assert.match(page, /async function copyJoinLink/);
  assert.doesNotMatch(page, /Create Join Group Link/);
  assert.doesNotMatch(page, /ACTIVE LINKS/);
  assert.match(page, /organizationRoles\.includes\("organization_admin"\).*"activity"/);
  assert.match(client, /export async function loadOrganizationActivity/);
  assert.match(client, /export async function createOrganizationJoinLink/);
  assert.match(migration, /create table if not exists public\.organization_join_links/);
  assert.match(migration, /create or replace function public\.audit_organization_mutation/);
  for (const table of ["events", "games", "assignments", "officials", "assessments", "check_ins", "coach_assignments", "import_jobs", "organization_memberships", "event_memberships"]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
});

test("officials directory shows last activity and supports recoverable member removal", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300023_audit_join_links_and_member_removal.sql"),
  ]);
  assert.match(page, />Last Active</);
  assert.match(page, /Remove From Group/);
  assert.match(page, /Their Law18Ref account, assignments, ratings, check-ins, and audit history are preserved/);
  assert.match(client, /last_login_at\?: string \| null/);
  assert.match(client, /export async function removeOrganizationMember/);
  assert.match(migration, /create or replace function public\.record_current_login/);
  assert.match(migration, /The last organization administrator cannot be removed/);
  assert.match(migration, /set status = 'archived'/);
});

test("Join Group tokens survive account creation and are claimed after authentication", async () => {
  const [authPanel, authClient, page, migration] = await Promise.all([
    read("app/auth-panel.tsx"),
    read("app/auth-client.ts"),
    read("app/page.tsx"),
    read("supabase/migrations/202607300023_audit_join_links_and_member_removal.sql"),
  ]);
  assert.match(authPanel, /law18ref-join-token/);
  assert.match(authPanel, /JOIN GROUP INVITATION/);
  assert.doesNotMatch(authClient, /email_redirect_to/);
  assert.match(page, /claimOrganizationJoinLink\(session, joinToken\)/);
  assert.match(migration, /create or replace function public\.claim_organization_join_link/);
  assert.match(migration, /membership\.joined_via_link/);
});

test("authorized event staff can manually or automatically archive events", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300024_event_lifecycle_archiving.sql"),
  ]);
  assert.match(page, /EVENT LIFECYCLE/);
  assert.match(page, /Save Archive Schedule/);
  assert.match(page, /Archive Now/);
  assert.match(page, /After the final event day/);
  assert.match(client, /export async function configureEventAutoArchive/);
  assert.match(client, /export async function archiveEvent/);
  assert.match(migration, /create or replace function public\.configure_event_auto_archive/);
  assert.match(migration, /array\['event_admin'\]::public\.membership_role\[\]/);
  assert.match(migration, /event\.manually_archived/);
});

test("past-due events leave active views and organization admins can restore them", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/202607300024_event_lifecycle_archiving.sql"),
  ]);
  assert.match(page, /ARCHIVED EVENTS/);
  assert.match(page, /Restore Event/);
  assert.match(page, /Automatic archiving was cleared/);
  assert.match(client, /rpc\/materialize_due_event_archives/);
  assert.match(client, /export async function loadArchivedEvents/);
  assert.match(client, /export async function restoreEvent/);
  assert.match(migration, /auto_archive_at <= now\(\)/);
  assert.match(migration, /e\.auto_archive_at is null or e\.auto_archive_at > now\(\)/);
  assert.match(migration, /event\.automatically_archived/);
  assert.match(migration, /event\.restored/);
});

test("v0.24.0 securely copies selected officials into another managed group", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260818161806_cross_group_official_copy.sql"),
  ]);
  assert.match(page, /Add to Another Group/);
  assert.match(page, /canManageOfficials/);
  assert.match(page, /No invitations or emails were sent/);
  assert.match(page, /canManageOrganizationRoles && <><button className="secondary"/);
  assert.match(client, /rpc\/groups_available_for_official_addition/);
  assert.match(client, /rpc\/add_officials_to_group/);
  assert.match(migration, /create or replace function public\.can_add_officials_to_group/);
  assert.match(migration, /array\['organization_director','organization_admin','assignor'\]/);
  assert.match(migration, /membership\.role in \('event_admin','assignor'\)/);
  assert.match(migration, /permission to add officials in both groups/);
  assert.match(migration, /'law18ref_cross_group'/);
  assert.match(migration, /array\['referee'\]::public\.membership_role\[\]/);
  assert.match(migration, /'invitation_sent', false/);
  assert.match(migration, /revoke all on function public\.add_officials_to_group/);
  assert.match(migration, /grant execute on function public\.add_officials_to_group.*authenticated/);
});

test("v0.25.0 upgrades assignment board grouping and Site Supervisor schedules", async () => {
  const [page, styles, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
    read("supabase/migrations/20260818173810_site_supervisor_hq_schedule_visibility.sql"),
  ]);
  assert.match(page, /Today&apos;s Assignments/);
  assert.match(page, /assignment-board-venues/);
  assert.match(page, /Add.*Venues|label="Venues"/s);
  assert.match(page, /firstAssignmentGroups/);
  assert.match(page, /collapsedFirstTimes/);
  assert.match(page, /Group Schedule By/);
  assert.match(page, /siteSupervisorView/);
  assert.match(page, /schedule-group-toggle/);
  assert.doesNotMatch(page, /<details className="panel schedule-group"/);
  assert.match(styles, /\.field-board-games\{display:flex/);
  assert.match(styles, /\.schedule-group-toggle.*touch-action:pan-y/);
  assert.match(migration, /site_supervisor_can_view_operational_game/);
  assert.match(migration, /target_game\.operational/);
  assert.match(migration, /like '%hq%'/);
  assert.match(migration, /site supervisors view visible game crews/);
  assert.match(migration, /revoke all on function public\.site_supervisor_can_view_operational_game.*public, anon/);
});

test("v0.25.1 filters coaching games by venue or site", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /coaching-sites:/);
  assert.match(page, /label="Venue \/ Site"/);
  assert.match(page, /scheduleSitesFilter\.includes\(game\.venue_name \|\| "Unspecified site"\)/);
  assert.match(page, /scheduleSitesFilter, scheduleFieldsFilter/);
});

test("v0.25.3 filters the officials directory by one or more group roles", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /officials-group-roles:/);
  assert.match(page, /label="Group Role" options=\{organizationRoleChoices/);
  assert.match(page, /groupRoleFilters\.some\(\(role\) => officialRoles\.includes\(role\)\)/);
  assert.match(page, /groupRoleFilters, sortBy/);
});

test("v0.26.0 keeps authentication private and makes shared filters mobile friendly", async () => {
  const [authPanel, page, styles] = await Promise.all([
    read("app/auth-panel.tsx"),
    read("app/page.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(authPanel, /const \[email, setEmail\] = useState\(""\)/);
  assert.doesNotMatch(authPanel, /falkref91@gmail\.com/);
  assert.match(authPanel, /name=\{mode === "login" \? "username"/);
  assert.match(page, /className="filter-menu-panel"/);
  assert.match(page, />Clear<\/button>/);
  assert.match(page, />Done\{/);
  assert.match(styles, /\.assignment-filter-menu>\.filter-menu-panel\{position:fixed/);
  assert.match(styles, /min-height:48px/);
});

test("the background is locked while the complete official schedule modal scrolls", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /document\.body\.style\.position = "fixed"/);
  assert.match(page, /window\.scrollTo\(0, scrollPosition\)/);
  assert.match(styles, /official-event-schedule-dialog\{[^}]*height:min\(780px,calc\(100dvh - 28px\)\)/);
  assert.match(styles, /official-event-schedule-dialog\{[^}]*overflow-x:hidden[^}]*overflow-y:auto[^}]*touch-action:pan-y/);
  assert.match(styles, /official-event-schedule-card\{[^}]*flex:0 0 auto/);
});

test("v0.32.2 keeps tall modal tops reachable and opens the complete dialog at the top", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /scheduleDialogRef\.current\?\.scrollTo\(\{ top: 0, left: 0 \}\)/);
  assert.match(page, /className="confirmation-dialog official-event-schedule-dialog" ref=\{scheduleDialogRef\}/);
  assert.match(styles, /confirmation-backdrop\{[^}]*align-items:flex-start[^}]*overflow-y:auto/);
  assert.match(styles, /confirmation-dialog\{[^}]*max-height:calc\(100dvh - 40px\)[^}]*overflow-y:auto/);
  assert.match(styles, /official-event-schedule-dialog>\.official-event-schedule-list\{[^}]*margin-top:0/);
  assert.match(styles, /official-event-schedule-dialog>\.official-contact-summary\{position:static/);
});

test("v0.29.2 imports nonblank assignment contact details into the officials directory", async () => {
  const [page, client] = await Promise.all([read("app/page.tsx"), read("app/supabase-client.ts")]);
  assert.match(client, /official_phone: normalizePhoneNumber\(cell\(record, headers, "mobile phone"\)\) \|\| null/);
  assert.match(client, /const contactsByName = new Map/);
  assert.match(client, /if \(matched\.personal_contact_locked\) \{/);
  assert.match(client, /if \(contact\.phone\) changes\.phone = contact\.phone/);
  assert.match(client, /source: "assignr_assignments"/);
  assert.match(page, /Nonblank email addresses and phone numbers in this assignments export will also update matching officials/);
});

test("v0.29.3 prefers an unambiguous name when assignment emails are shared", async () => {
  const client = await read("app/supabase-client.ts");
  assert.match(client, /const matched = \(nameMatches\.length === 1 \? nameMatches\[0\] : undefined\) \|\| emailMatch/);
  assert.match(client, /const officialId = \(nameMatches\.length === 1 \? nameMatches\[0\]\.id : undefined\) \|\| emailMatch/);
});

test("v0.29.4 limits coaching assignments to ratings-enabled games", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260820152724_rateable_coach_assignments_only.sql"),
  ]);
  assert.match(page, /const scheduleGames = data\.games\.filter\(isRateableGame\)/);
  assert.match(page, /Full Rateable Schedule/);
  assert.match(client, /Referee coaches can only be assigned through Coaching to ratings-enabled games/);
  assert.match(migration, /create trigger validate_rateable_coach_assignment/);
  assert.match(migration, /not like '%hq%'/);
  assert.match(migration, /delete from public\.coach_assignments ca/);
  assert.match(migration, /Imported Referee Coach, Site Coordinator/);
  assert.doesNotMatch(migration, /delete from public\.assignments/);
});

test("v0.29.5 completes schedule imports with isolated contact warnings and recipient notifications", async () => {
  const [page, client, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260820153115_import_conflict_notifications.sql"),
  ]);
  assert.match(client, /recordEmailConflict/);
  assert.match(client, /status: conflicts\.length \? "completed_with_warnings" : "completed"/);
  assert.match(client, /errors: conflicts/);
  assert.match(client, /return \{ event, conflicts \}/);
  assert.match(page, /conflicting contact field/);
  assert.match(page, /loadUserNotifications/);
  assert.match(page, /notification-popover/);
  assert.match(migration, /create table if not exists public\.user_notifications/);
  assert.match(migration, /users view own notifications/);
  assert.match(migration, /import\.completed_with_warnings/);
  assert.match(migration, /select new\.uploaded_by as user_id[\s\S]*select p\.id from public\.profiles p where p\.is_site_owner/);
  assert.match(migration, /revoke all on function public\.report_import_warnings\(\) from authenticated/);
});

test("v0.30.0 removes implicit privileged RPC access while preserving external check-in", async () => {
  const migration = await read("supabase/migrations/20260820154444_security_definer_access_hardening.sql");
  assert.match(migration, /where n\.nspname = 'public' and p\.prosecdef/);
  assert.match(migration, /revoke execute on function %s from public, anon/);
  assert.match(migration, /grant execute on function public\.get_external_check_in_config\(text, date\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.find_external_check_in\(text, date, jsonb\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.confirm_guest_check_in\(uuid\) to anon, authenticated/);
  assert.match(migration, /join pg_trigger t on t\.tgfoid = p\.oid/);
  assert.match(migration, /revoke execute on function %s from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.rls_auto_enable\(\) from authenticated/);
  assert.match(migration, /no direct guest check-in session access/);
  assert.match(migration, /no direct organization challenge access/);
  assert.match(migration, /no direct personal calendar feed access/);
  assert.match(migration, /revoke all on table public\.personal_calendar_feeds from anon, authenticated/);
});

test("v0.30.1 supports review-first or immediate External Check-In", async () => {
  const [page, client, styles, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/20260820160315_external_check_in_completion_mode.sql"),
  ]);
  assert.match(client, /external_check_in_confirmation_required: boolean/);
  assert.match(client, /confirmation_required: boolean/);
  assert.match(page, /Review and Confirm/);
  assert.match(page, /Check In Immediately/);
  assert.match(page, /!result\.confirmation_required && result\.checked_in/);
  assert.match(page, /config\?\.confirmation_required === false \? "Check In" : "Show My Schedule"/);
  assert.match(page, /guest-checkin-complete[\s\S]*Your schedule for today[\s\S]*guest-schedule-list/);
  assert.match(styles, /external-checkin-completion-mode/);
  assert.match(migration, /external_check_in_confirmation_required boolean not null default true/);
  assert.match(migration, /if not selected_event\.external_check_in_confirmation_required then[\s\S]*perform public\.confirm_guest_check_in\(lookup_token\)/);
  assert.match(migration, /'confirmation_required', selected_event\.external_check_in_confirmation_required/);
  assert.match(migration, /revoke all on function public\.find_external_check_in\(text, date, jsonb\) from public/);
});

test("v0.30.2 identifies check-in time and source and filters both roster views by name", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /checkInMethodLabel/);
  assert.match(page, /Manual check-in/);
  assert.match(page, /External check-in/);
  assert.match(page, /Account check-in/);
  assert.match(page, /checkInRecord\.checked_in_at/);
  assert.match(page, /Type a first or last name/);
  assert.match(page, /official\.full_name\.toLocaleLowerCase\(\)\.includes/);
  assert.match(styles, /checkin-record-summary/);
});

test("v0.30.3 keeps scoped Site Supervisor HQ crews visible and exposes hidden filters", async () => {
  const [page, migration] = await Promise.all([
    read("app/page.tsx"),
    read("supabase/migrations/20260820170853_supervisor_hq_site_scope.sql"),
  ]);
  assert.match(page, /Clear All Filters/);
  assert.match(page, /const totalFilterCount = dateFilters\.length \+ additionalFilterCount/);
  assert.match(migration, /site supervisors view scoped game crews/);
  assert.match(migration, /public\.site_supervisor_game_in_scope\(game\.id, game\.event_id\)/);
  assert.doesNotMatch(migration, /can_manage_assignment/);
});

test("v0.30.4 opens coach schedules on one collapsed field-sorted event date", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /const defaultScheduleDate = defaultEventDate\(scheduleEventDates, event\.timezone, event\.starts_on\)/);
  assert.match(page, /coachView \? \["field", "time", "date"\] : \["date", "field", "time"\]/);
  assert.match(page, /`schedule-date:\$\{event\.id\}`, \[defaultScheduleDate\]/);
  assert.match(page, /setCollapsedScheduleGroups\(new Set\(Object\.keys\(groupedGames\)\)\)/);
  assert.match(page, /coachGroupsInitialized\.current = true/);
});

test("v0.30.5 shows help and guides for active and subordinate roles", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /const subordinateHelpRoles: Record<MembershipRole, MembershipRole\[\]>/);
  assert.match(page, /site_owner: \["site_owner", "organization_director", "organization_admin", "event_admin", "assignor", "site_coordinator", "referee_coach", "referee"\]/);
  assert.match(page, /assignor: \["assignor", "site_coordinator", "referee_coach", "referee"\]/);
  assert.match(page, /site_coordinator: \["site_coordinator", "referee"\]/);
  assert.match(page, /referee_coach: \["referee_coach", "referee"\]/);
  assert.match(page, /\.flatMap\(\(role\) => quickGuidesByRole\[role\] \|\| \[\]\)/);
  assert.match(page, /active roles and the roles you oversee/);
  assert.match(page, /helpVisibleRoles\.map\(\(role\) => <section/);
});

test("v0.31.0 moves page navigation into the user badge side tray", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.doesNotMatch(page, /<button className="brand"[^>]*><Mark \/><\/button>\s*<nav>/);
  assert.match(page, /aria-label="Open navigation and account menu"/);
  assert.match(page, /className="account-tray-backdrop"/);
  assert.match(page, /className="account-popover account-tray"/);
  assert.match(page, /className="account-tray-navigation"[^>]*>\{nav\.map/);
  assert.match(page, /if \(event\.key === "Escape"\) setAccountOpen\(false\)/);
  assert.match(styles, /\.account-tray-backdrop\{position:fixed;inset:0/);
  assert.match(styles, /\.account-popover\.account-tray\{position:absolute;inset:0 0 0 auto/);
  assert.match(styles, /Version 0\.31\.0 right-side navigation tray/);
});

test("v0.31.1 excludes date-specific Not Expected officials from attendance totals", async () => {
  const [page, client, styles, migration] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/20260820180150_attendance_expectation_overrides.sql"),
  ]);
  assert.match(page, /className={`expectation-toggle/);
  assert.match(page, /title={isExpected \? "Mark not expected" : "Restore as expected"}/);
  assert.match(page, /id: "not_expected", name: "Not expected"/);
  assert.match(page, /visibleExpectedRoster\.length/);
  assert.match(page, /attendanceOverrides\.filter\(\(item\) => item\.event_date === today/);
  assert.match(client, /export async function setAttendanceExpected/);
  assert.match(styles, /Version 0\.31\.1 attendance expectation overrides/);
  assert.match(migration, /create table public\.attendance_expectation_overrides/);
  assert.match(migration, /can_view_scoped_check_in\(event_id, official_id, event_date\)/);
  assert.match(migration, /audit_attendance_expectation_overrides_mutation/);
});

test("v0.31.2 provides prominent schedule access on every dashboard", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /className="dashboard-schedule-link" onClick={\(\) => onNavigate\("board"\)}/);
  assert.match(page, /className="dashboard-navigation-grid"/);
  assert.match(page, /View My Assignments/);
  assert.match(page, /navigation\.filter/);
  assert.match(styles, /Version 0\.31\.2 prominent dashboard schedule access/);
  assert.match(styles, /\.dashboard-schedule-link\{display:grid;grid-template-columns:46px minmax\(0,1fr\)/);
});

test("v0.31.3 lets Site Supervisors resolve names only for visible game crews", async () => {
  const migration = await read("supabase/migrations/20260820231029_site_supervisor_crew_official_visibility.sql");
  assert.match(migration, /function public\.site_supervisor_can_view_crew_official\(target_official uuid\)/);
  assert.match(migration, /public\.site_supervisor_game_in_scope\(game\.id, game\.event_id\)/);
  assert.match(migration, /public\.site_supervisor_can_view_operational_game\(game\.id, game\.event_id\)/);
  assert.match(migration, /revoke all on function public\.site_supervisor_can_view_crew_official\(uuid\) from public, anon/);
  assert.match(migration, /on public\.officials for select to authenticated/);
  assert.doesNotMatch(migration, /grant (?:select|all) on public\.officials/);
});

test("v0.31.4 lets every linked coach view games from coaching assignments", async () => {
  const migration = await read("supabase/migrations/20260821001612_linked_coach_assignment_game_visibility.sql");
  assert.match(migration, /function public\.can_view_game\(game_uuid uuid, event_uuid uuid\)/);
  assert.match(migration, /from public\.coach_assignments coaching/);
  assert.match(migration, /coaching\.coach_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /coaching\.event_id = event_uuid/);
  assert.match(migration, /coaching\.full_schedule or coaching\.game_id = game_uuid/);
  assert.match(migration, /revoke all on function public\.can_view_game\(uuid, uuid\) from public, anon/);
  assert.doesNotMatch(migration, /coach_official_id = \(select auth\.uid\(\)\)/);
});

test("v0.31.5 contains and scrolls the assignment editor at every viewport", async () => {
  const styles = await read("app/globals.css");
  assert.match(styles, /Version 0\.31\.5 assignment editor containment and scrolling/);
  assert.match(styles, /\.confirmation-dialog\.assignment-editor-dialog\{display:flex;flex-direction:column/);
  assert.match(styles, /max-height:calc\(100dvh - 32px\)/);
  assert.match(styles, /\.assignment-editor-dialog>\.assignment-editor-rows\{display:grid;flex:1 1 auto/);
  assert.match(styles, /overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain/);
  assert.match(styles, /\.assignment-editor-dialog \.assignment-editor-row\{display:grid;grid-template-columns:34px/);
  assert.match(styles, /@media\(max-width:650px\)/);
  assert.match(styles, /@media\(max-width:410px\)/);
});

test("v0.31.6 derives check-in totals from the filtered roster", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /const visibleExpectedRoster = visibleRoster\.filter\(\(item\) => item\.isExpected\)/);
  assert.match(page, /const visibleCheckedCount = visibleExpectedRoster\.filter\(\(item\) => item\.isChecked\)\.length/);
  assert.match(page, /\{visibleCheckedCount\}\/\{visibleExpectedRoster\.length\} checked in/);
  assert.doesNotMatch(page, /\{checked\.size\}\/\{rosterDetails\.filter/);
});

test("v0.31.7 defaults check-in to today or the nearest valid event date", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /const defaultCheckInDate = defaultEventDate\(eventDates, event\.timezone, event\.starts_on\)/);
  assert.match(page, /useState\(defaultCheckInDate\)/);
  assert.doesNotMatch(page, /useState\(eventDates\[0\] \|\| event\.starts_on\)/);
});

test("v0.31.8 applies one timezone-aware event-day default across operational tabs", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /function defaultEventDate\(dates: string\[\], timeZone: string, fallback: string\)/);
  assert.match(page, /sortedDates\.find\(\(date\) => date > today\) \|\| sortedDates\.at\(-1\) \|\| fallback/);
  assert.match(page, /const defaultBoardDate = defaultEventDate\(availableDates, event\.timezone, event\.starts_on\)/);
  assert.match(page, /const defaultScheduleDate = defaultEventDate\(scheduleEventDates, event\.timezone, event\.starts_on\)/);
  assert.match(page, /`schedule-date:\$\{event\.id\}`, \[defaultScheduleDate\]/);
  assert.match(page, /const defaultCoachingDate = defaultEventDate\(scheduleDates, event\.timezone, event\.starts_on\)/);
  assert.match(page, /`coaching-dates:\$\{event\.id\}`, \[defaultCoachingDate\]/);
  assert.match(page, /defaultEventDate\(availableDates, event\.timezone, event\.starts_on\)/);
});

test("v0.27.0 separates schedule date, filters, and sorting controls", async () => {
  const [page, styles] = await Promise.all([read("app/page.tsx"), read("app/globals.css")]);
  assert.match(page, /className="section-title schedule-section-title"/);
  assert.match(page, /className="panel schedule-filter-deck"/);
  assert.match(page, /AssignmentFilterMenu label="Dates"/);
  assert.match(page, /<details className="panel schedule-control-card schedule-sort-card"><summary>/);
  assert.doesNotMatch(page, /schedule-filters-card/);
  assert.match(styles, /Version 0\.27\.0 schedule control hierarchy/);
  assert.match(styles, /schedule-control-card\[open\]>summary b:after\{content:"−"\}/);
});

test("v0.27.1 consolidates coaching access into one card per coach", async () => {
  const [page, styles] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(page, /const coachAccessGroups = \[\.\.\.visibleAssignments\.reduce/);
  assert.match(page, /coachAccessGroups\.map\(\(\{ coach, assignments \}\)/);
  assert.match(page, /className="panel coach-access-card"/);
  assert.match(page, /Full event schedule access/);
  assert.match(styles, /Version 0\.27\.1 consolidated coaching-access cards/);
});

test("v0.27.2 exposes role-aware quick guides", async () => {
  const [page, styles, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
    read("package.json"),
  ]);
  assert.match(page, /const quickGuidesByRole: Partial<Record<MembershipRole/);
  assert.match(page, /const activeQuickGuides = \[\.\.\.new Map\(helpVisibleRoles/);
  assert.match(page, /className="role-quick-guides"/);
  assert.match(page, /Law18Ref-Referee-Coach-Quick-Guide\.pdf/);
  assert.match(page, /target="_blank" rel="noreferrer"/);
  assert.match(styles, /Version 0\.27\.2 role-aware quick guides/);
});

test("v0.27.3 normalizes and links displayed phone numbers", async () => {
  const [page, client, phone, styles, migration, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"), read("app/phone.ts"), read("app/globals.css"),
    read("supabase/migrations/20260819182024_normalize_official_phone_numbers.sql"), read("package.json"),
  ]);
  assert.match(phone, /digits\.length !== 10/);
  assert.match(phone, /`tel:\+1\$\{digits\}`/);
  assert.match(page, /function PhoneLink/);
  assert.match(page, /<PhoneLink className="checkin-phone-link"/);
  assert.match(page, /<PhoneLink phone=\{official\.phone\} fallback="No phone imported"/);
  assert.match(client, /normalizePhoneNumber\(cell\(record, headers, "mobile phone"\)/);
  assert.match(styles, /Version 0\.27\.3 normalized callable phone numbers/);
  assert.match(migration, /update public\.officials/);
  assert.match(migration, /update public\.profiles/);
});

test("v0.27.4 adds aligned detailed and grid check-in views", async () => {
  const [page, styles, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /useState<"detailed" \| "grid">\("detailed"\)/);
  assert.match(page, />Detailed Roster<\/button>/);
  assert.match(page, />Attendance Grid<\/button>/);
  assert.match(page, /const attendanceGridRoster = visibleRoster\.slice\(\)\.sort/);
  assert.match(page, /a\.firstField\.localeCompare\(b\.firstField/);
  assert.match(page, /className="attendance-official-grid"/);
  assert.match(page, /onClick=\{\(\) => onSelectOfficial\(official\.id, eventDate\)\}/);
  assert.match(styles, /grid-auto-rows:108px/);
  assert.match(styles, /Version 0\.27\.4 compact check-in attendance grid/);
});

test("v0.27.5 prints one labeled check-in QR page for every event day", async () => {
  const [page, styles, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /const checkInUrlForDate = \(date: string\)/);
  assert.match(page, /Print All Daily QR Codes/);
  assert.match(page, /className="checkin-print-document"/);
  assert.match(page, /eventDates\.map\(\(date\) => <section className="checkin-print-page"/);
  assert.match(page, /Scan QR code for Referee Check-In/);
  assert.match(styles, /\.checkin-print-document\{display:none\}/);
  assert.match(styles, /\.checkin-print-page:last-child\{break-after:auto;page-break-after:auto\}/);
  assert.match(styles, /\.shell>\*:not\(\.page-section\),\.page-section>\*:not\(\.checkin-print-document\)\{display:none!important\}/);
});

test("v0.27.6 suppresses browser print headers and footers", async () => {
  const [styles, packageJson] = await Promise.all([read("app/globals.css"), read("package.json")]);
  assert.match(styles, /@page\{size:portrait;margin:0\}/);
  assert.match(styles, /\.checkin-print-page\{display:flex!important;box-sizing:border-box;width:100%;height:100vh;padding:\.45in/);
});

test("v0.27.7 only shows a coach field when their earliest time has one field", async () => {
  const [page, packageJson] = await Promise.all([read("app/page.tsx"), read("package.json")]);
  assert.match(page, /const coachIsFirstAssignment = coachingOfficialIds\.has\(official\.id\) && !firstAssignment/);
  assert.match(page, /const firstTimeFields = firstGame \? \[\.\.\.new Set\(games\.filter\(\(game\) => game\.starts_at === firstGame\.starts_at\)/);
  assert.match(page, /const displayedFirstField = coachIsFirstAssignment && firstTimeFields\.length !== 1 \? ""/);
  assert.match(page, /firstFieldSortKey: displayedFirstField \|\| "\\uffff"/);
  assert.match(page, /\["Referee Coach", firstGame \? formatTime\(firstGame\.starts_at\) : null, displayedFirstField \|\| null\]/);
});

test("v0.27.8 makes the coach access list collapsible by default", async () => {
  const [page, styles, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /<details className="panel coach-access-list-section"><summary>/);
  assert.doesNotMatch(page, /<details className="panel coach-access-list-section" open>/);
  assert.match(page, /Coach Access Summary/);
  assert.match(page, /coachAccessGroups\.length} assigned coach/);
  assert.match(styles, /Version 0\.27\.8 collapsible coach access summary/);
  assert.match(styles, /\.coach-access-list-section\[open\]>summary b:after\{content:"−"\}/);
});

test("v0.27.9 places coach access before the full game schedule", async () => {
  const [page, packageJson] = await Promise.all([read("app/page.tsx"), read("package.json")]);
  const accessSummary = page.indexOf('<details className="panel coach-access-list-section">');
  const fullSchedule = page.indexOf('<details className="panel coach-schedule-manager">');
  assert.ok(accessSummary >= 0);
  assert.ok(fullSchedule > accessSummary);
});

test("v0.27.10 collapses each coach and the full game schedule", async () => {
  const [page, styles, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /return <details className="panel coach-access-card"/);
  assert.match(page, /<summary><span className="official-name-cell"/);
  assert.match(page, /<details className="panel coach-schedule-manager">/);
  assert.doesNotMatch(page, /<details className="panel coach-schedule-manager" open>/);
  assert.match(page, /className="coach-schedule-manager-body"/);
  assert.match(styles, /Version 0\.27\.10 nested coach and schedule disclosure controls/);
  assert.match(styles, /\.coach-access-card\[open\]>summary>b:after,\.coach-schedule-manager\[open\]>summary>b:after\{content:"−"\}/);
});

test("v0.27.11 contains and aligns schedule assignment editing", async () => {
  const [page, styles, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /className="assignment-position-field">Position<select/);
  assert.match(page, /className="assignment-official-field">Official<select/);
  assert.match(page, /className="assignment-display-title">Display title \(optional\)/);
  assert.match(page, /className="text-button assignment-remove-button"/);
  assert.match(styles, /Version 0\.27\.11 contained assignment editor crew rows/);
  assert.match(styles, /max-width:calc\(100vw - 24px\);overflow-x:hidden/);
  assert.match(styles, /\.assignment-display-title\{grid-column:2\/4\}/);
  assert.match(styles, /@media\(max-width:390px\)\{\.assignment-editor-row\{grid-template-columns:1fr\}/);
});

test("v0.27.12 aligns schedule crew positions across games", async () => {
  const [styles, packageJson] = await Promise.all([read("app/globals.css"), read("package.json")]);
  assert.match(styles, /Version 0\.27\.12 keeps crew positions aligned between schedule games/);
  assert.match(styles, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(min-width:701px\) and \(max-width:900px\).*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("v0.27.13 scans QR codes without requiring BarcodeDetector", async () => {
  const [page, packageJson] = await Promise.all([read("app/page.tsx"), read("package.json")]);
  assert.match(page, /import jsQR from "jsqr"/);
  assert.match(page, /const detector = Detector \? new Detector/);
  assert.match(page, /rawValue = jsQR\(frame\.data, frame\.width, frame\.height/);
  assert.doesNotMatch(page, /!\("BarcodeDetector" in window\)/);
});

test("v0.27.14 collapses staff QR controls and keeps referee check-in scanner-only", async () => {
  const [page, styles, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /<details className="panel qr-panel qr-panel-disclosure print-qr">/);
  assert.doesNotMatch(page, /<details className="panel qr-panel qr-panel-disclosure print-qr" open/);
  assert.match(page, /isStaff \? <CheckInView[\s\S]*?<RefereeCheckIn/);
  assert.match(page, /\{!isCheckedIn && <QrScanner onFound=\{scanned\} \/>\}/);
  assert.doesNotMatch(page.match(/function RefereeCheckIn[\s\S]*?function CheckInView/)?.[0] || "", /QRCodeSVG/);
  assert.match(styles, /Version 0\.27\.14 collapsible staff-only check-in QR card/);
});

test("v0.28.0 records throttled visible activity without audit noise", async () => {
  const [page, client, migration, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260820000807_last_active_tracking.sql"),
    read("package.json"),
  ]);
  assert.match(page, /recordCurrentActivity\(session\)/);
  assert.match(page, /window\.setInterval\(recordVisibleActivity, 5 \* 60 \* 1000\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", recordVisibleActivity\)/);
  assert.match(page, /async function openView[\s\S]*recordCurrentActivity\(session\)/);
  assert.match(client, /export async function recordCurrentActivity/);
  assert.match(migration, /create or replace function public\.record_current_activity\(\)/);
  assert.match(migration, /last_login_at < now\(\) - interval '30 seconds'/);
  assert.match(migration, /revoke all on function public\.record_current_activity\(\) from public/);
  assert.match(migration, /grant execute on function public\.record_current_activity\(\) to authenticated/);
});

test("v0.28.1 keeps schedule crew columns aligned without range-query support", async () => {
  const [styles, packageJson] = await Promise.all([read("app/globals.css"), read("package.json")]);
  assert.match(styles, /Version 0\.28\.1 provides aligned fallback columns/);
  assert.match(styles, /\.schedule-crew-list>span\{box-sizing:border-box;flex:0 0 calc\(\(100% - 21px\)\/4\)\}/);
  assert.match(styles, /@media\(max-width:900px\)\{\.schedule-crew-list>span\{flex-basis:calc\(\(100% - 7px\)\/2\)\}\}/);
  assert.match(styles, /@media\(max-width:700px\)\{\.schedule-crew-list>span\{flex-basis:100%\}\}/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.31.9 edits board assignments through the permission-gated game detail line", async () => {
  const [page, styles, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /onEditAssignments\?: \(game: GameRecord\) => void/);
  assert.match(page, /className="board-game-details-link" onClick=\{\(\) => onEditAssignments\(game\)\}/);
  assert.match(page, /onEditAssignments=\{canEditAssignments \? setEditingGame : undefined\}/);
  assert.match(page, /function AssignmentEditorDialog/);
  assert.match(page, /await replaceGameAssignments\(session, game\.id/);
  assert.match(page, /<small>\{game\.division \|\| "Tournament match"\}<\/small>/);
  assert.match(styles, /Version 0\.31\.9 assignment-board edit trigger/);
  assert.match(styles, /\.board-game-details-link:hover/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.32.0 makes ratings durable, position-aware, and swappable within a game", async () => {
  const [page, client, migration, styles, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260821142431_durable_ratings_and_same_game_swap.sql"),
    read("app/globals.css"),
    read("package.json"),
  ]);
  assert.match(migration, /foreign key \(game_id\) references public\.games\(id\) on delete restrict/);
  assert.match(migration, /foreign key \(official_id\) references public\.officials\(id\) on delete restrict/);
  assert.match(migration, /create trigger require_manual_assessment_delete/);
  assert.match(migration, /current_setting\('law18ref\.manual_rating_delete', true\)/);
  assert.match(migration, /perform set_config\('law18ref\.manual_rating_delete', 'on', true\)/);
  assert.match(migration, /create trigger sync_assessment_rated_position_from_assignment/);
  assert.match(migration, /create or replace function public\.swap_same_game_ratings/);
  assert.match(migration, /first_rating\.coach_id <> second_rating\.coach_id/);
  assert.match(migration, /'rating\.swapped'/);
  assert.match(client, /export async function swapSameGameRatings/);
  assert.match(page, /className="secondary swap-ratings-button"/);
  assert.match(page, /await swapSameGameRatings\(session, firstSwapRatingId, secondSwapRatingId\)/);
  assert.match(page, /assessment\.rated_position_title/);
  assert.match(styles, /Version 0\.32\.0 durable rating ownership and same-game swaps/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.31.10 preserves imported order for matching crew positions", async () => {
  const [page, client, migration, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260821140654_preserve_game_crew_import_order.sql"),
    read("package.json"),
  ]);
  assert.match(client, /crew_order\?: number/);
  assert.match(client, /const nextCrewOrder = new Map<string, number>\(\)/);
  assert.match(client, /crew_order: crewOrder/);
  assert.match(client, /order=crew_order\.asc/);
  assert.match(page, /a\.assignment\.crew_order \?\? a\.sourceIndex/);
  assert.match(migration, /add column if not exists crew_order integer/);
  assert.match(migration, /with ordinality as item\(value, ordinality\)/);
  assert.match(migration, /item\.ordinality - 1, true/);
  assert.match(migration, /order by crew_order, id/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.32.1 skips assignment writes when an updated import crew is unchanged", async () => {
  const [client, packageJson] = await Promise.all([read("app/supabase-client.ts"), read("package.json")]);
  assert.match(client, /const crewSignature = \(crew:/);
  assert.match(client, /const changedGameIds = new Set\(importedGameIds\.filter/);
  assert.match(client, /crewSignature\(existingCrew\) !== crewSignature\(incomingCrew\)/);
  assert.match(client, /assignmentsToWrite = assignmentPayload\.filter\(\(assignment\) => changedGameIds\.has\(assignment\.game_id\)\)/);
  assert.match(client, /if \(assignmentsToWrite\.length\)/);
  assert.doesNotMatch(client, /await Promise\.all\(importedGameIds\.map\(\(gameId\) => rest/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.34.0 makes coach history private and expands draft filtering and exports", async () => {
  const [page, client, migration, styles, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260822001716_coach_private_rating_history.sql"),
    read("app/globals.css"),
    read("package.json"),
  ]);
  assert.match(migration, /assessments\.coach_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /from public\.coach_assignments coaching/);
  assert.match(migration, /access\.role in \('event_admin','assignor'\)/);
  assert.match(client, /export async function submitDraftRating/);
  assert.match(page, /Submit Draft/);
  assert.match(page, /Status<select value=\{historyStatus\}/);
  assert.match(page, /Individual Official Ratings/);
  assert.match(page, /Full Game Submissions/);
  assert.match(page, /Duplicate Submission/);
  assert.match(page, /Summarize By/);
  assert.match(styles, /\.rating-export-dialog/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.35.4 omits Skills Eval-only columns from Basic Eval-only exports", async () => {
  const [page, packageJson] = await Promise.all([read("app/page.tsx"), read("package.json")]);
  assert.match(page, /const includesSkillsEvals = exportedAssessments\.some/);
  assert.match(page, /if \(includesSkillsEvals\) headings\.push\("Positioning and Movement"/);
  assert.match(page, /else headings\.push\("Notes"\)/);
  assert.match(page, /if \(includesSkillsEvals\) headings\.push\(`Official \$\{index\} Positive Areas`/);
  assert.match(page, /else headings\.push\(`Official \$\{index\} Notes`\)/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.35.4 keeps duplicate game-rating submissions adjacent in deterministic export order", async () => {
  const [page, packageJson] = await Promise.all([read("app/page.tsx"), read("package.json")]);
  assert.match(page, /const compareExportGames = \(left: AssessmentRecord, right: AssessmentRecord\)/);
  assert.match(page, /leftEvent\?\.name[\s\S]*leftGame\?\.starts_at[\s\S]*leftGame\?\.venue_name[\s\S]*leftGame\?\.field_name/);
  assert.match(page, /\|\| left\.game_id\.localeCompare\(right\.game_id\)/);
  assert.match(page, /const exportedAssessments = \[\.\.\.sortedAssessments\]\.sort/);
  assert.match(page, /values\(\)\]\.sort\(\(a, b\) => compareExportGames\(a\[0\], b\[0\]\)/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.35.4 names rating exports from compact active filters instead of the UTC export date", async () => {
  const [page, packageJson] = await Promise.all([read("app/page.tsx"), read("package.json")]);
  assert.match(page, /const abbreviatedOfficialName =/);
  assert.match(page, /filenameSegments\.push\(`dt-\$\{historyDateRange\.from/);
  assert.match(page, /filenameSegments\.push\(`evt-\$\{compactValues/);
  assert.match(page, /filenameSegments\.push\(`ref-\$\{compactValues\(historyFilters\.referees, abbreviatedOfficialName\)\}`\)/);
  assert.match(page, /link\.download = `\$\{filenameSegments\.join\("_"\)\.slice\(0, 180\)\}\.csv`/);
  assert.doesNotMatch(page, /law18ref-ratings-\$\{ratingExportMode\}-\$\{new Date\(\)\.toISOString/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 confirms atomic crew-rating writes before closing", async () => {
  const [page, client, packageJson] = await Promise.all([read("app/page.tsx"), read("app/supabase-client.ts"), read("package.json")]);
  assert.match(client, /if \(!saved\?\.id\) throw new Error\("The rating was not confirmed by the database/);
  assert.match(page, /const savingCrewRef = useRef\(false\)/);
  assert.match(page, /if \(!organizationId \|\| !gameId \|\| !gameAssignments\.length \|\| savingCrewRef\.current\) return/);
  assert.match(page, /const savedRatings = await saveAssessmentsBatch/);
  assert.match(page, /ratingsConfirmed = true;\s+await onSaved\(savedRatings\);\s+setMessage/);
  assert.match(page, /if \(modal\) onClose\?\.\(\)/);
  assert.match(page, /The ratings were saved, but the latest data could not be reloaded/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.35.4 freezes assignment-grid field and time headers on both scroll axes", async () => {
  const [page, css, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /<th scope="col">Time<\/th>/);
  assert.match(page, /<th scope="col" key=\{field\}>\{field\}<\/th>/);
  assert.match(page, /<th scope="row">\{time\}<\/th>/);
  assert.match(css, /\.board-wrap\{position:relative;width:min\(1680px,calc\(100vw - 24px\)\);max-width:none;max-height:min\(84dvh,900px\);margin-left:50%;overflow:auto;overscroll-behavior:auto/);
  assert.match(css, /\.assignment-board tbody>tr>th\{position:sticky;left:0;z-index:1/);
  assert.match(css, /\.assignment-board thead th:first-child\{left:0;z-index:3/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.35.4 highlights unconfirmed assignment changes in every board view", async () => {
  const [page, css, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /className=\{`board-game\$\{game\.schedule_changed_at \? " board-game-updated" : ""\}`\}/);
  assert.match(page, /game\.schedule_changed_at && <span className="board-game-updated-label">Updated<\/span>/);
  assert.match(page, /game\.schedule_changed_at \? " assignment-updated" : ""/);
  assert.match(page, /game\.schedule_changed_at \? " · Updated" : ""/);
  assert.match(css, /\.board-game-updated\{/);
  assert.match(css, /\.first-assignment-row\.assignment-updated\{/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.43.0 automatically activates new deployments without caching application pages", async () => {
  const [page, worker, versionFile, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("public/sw.js"),
    read("public/version.json"),
    read("package.json"),
  ]);
  assert.match(page, /register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
  assert.match(page, /fetch\(`\/version\.json\?check=\$\{Date\.now\(\)\}`/);
  assert.match(page, /window\.addEventListener\("focus", checkForLatestVersion\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", becameVisible\)/);
  assert.match(page, /window\.setInterval\(checkForLatestVersion, 5 \* 60 \* 1000\)/);
  assert.match(page, /navigator\.serviceWorker\.addEventListener\("controllerchange", controllerChanged\)/);
  assert.match(worker, /law18referee-v0\.44\.2/);
  assert.match(worker, /pathname === "\/version\.json"/);
  assert.match(worker, /new Request\(event\.request, \{ cache: "no-store" \}\)/);
  assert.match(worker, /event\.request\.mode === "navigate"/);
  assert.doesNotMatch(worker, /const SHELL = \["\/",/);
  assert.equal(JSON.parse(versionFile).version, "0.44.2");
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.43.0 publishes build-generated uncached release metadata", async () => {
  const [generator, packageJson, versionFile, workerSource] = await Promise.all([
    read("build/generate-version.mjs"),
    read("package.json"),
    read("public/version.json"),
    read("worker/index.ts"),
  ]);
  const metadata = JSON.parse(versionFile);
  assert.equal(metadata.app, "law18ref");
  assert.equal(metadata.name, "Law18Referee Management");
  assert.equal(metadata.version, "0.44.2");
  assert.match(metadata.updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(JSON.parse(packageJson).scripts.build, /^node build\/generate-version\.mjs/);
  assert.match(generator, /updated_at: new Date\(\)\.toISOString\(\)/);
  assert.match(generator, /CF_PAGES_COMMIT_SHA \|\| process\.env\.GITHUB_SHA \|\| process\.env\.SOURCE_VERSION/);
  assert.match(workerSource, /pathname === "\/version\.json"/);
  assert.match(workerSource, /Cache-Control", "no-store, no-cache, must-revalidate"/);
});

test("v0.36.0 removes coach access in bulk while preserving unselected full-schedule games", async () => {
  const [page, css, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
    read("package.json"),
  ]);
  assert.match(page, /async function removeAllCoachAccess/);
  assert.match(page, /async function removeCoachFromSelectedGames/);
  assert.match(page, /remainingGameIds = scheduleGames\.map/);
  assert.match(page, />Remove All Access</);
  assert.match(page, /Remove from \$\{selectedGameIds\.length/);
  assert.match(css, /\.coach-bulk-actions\{/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.36.0 improves operational filters, directory ratings, modals, and mobile navigation", async () => {
  const [page, styles, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);
  assert.match(page, /label="First Assignment Time"/);
  assert.match(page, /firstAssignmentTimeFilters/);
  assert.match(page, /label="Status"/);
  assert.match(page, /statusFilters\.includes\(item\.assigned_externally \? "external"/);
  assert.match(page, /Search name, email, phone, or badge/);
  assert.match(page, /officialRatingSummaryLabel/);
  assert.match(page, /View Ratings \(\$\{officialRatings\.length\}\)/);
  assert.match(page, />Collapse All</);
  assert.match(page, />Collapse All Games</);
  assert.match(page, /className="account-tray-scroll"/);
  assert.match(styles, /\.account-tray-scroll\{[^}]*overflow-y:auto/);
  assert.match(styles, /\.rating-modal \.assessment-actions\{bottom:0/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.38.1 separates referee names and uses last-name-first selectors", async () => {
  const [page, client, migration, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260823032150_official_first_and_last_names.sql"),
    read("package.json"),
  ]);
  assert.match(migration, /alter table public\.profiles[\s\S]*add column if not exists first_name text/);
  assert.match(migration, /alter table public\.officials[\s\S]*add column if not exists last_name text/);
  assert.match(migration, /create trigger officials_sync_person_name_parts/);
  assert.match(client, /"Law18Ref Official ID", "First Name", "Last Name", "Full Name"/);
  assert.match(client, /order=last_name\.asc\.nullslast,first_name\.asc\.nullslast,full_name\.asc/);
  assert.match(page, /function officialSelectorLabel/);
  assert.match(page, /`\$\{lastName\}, \$\{firstName\}`/);
  assert.match(page, /<label>First name<input autoComplete="given-name"/);
  assert.match(page, /<label>Last name<input autoComplete="family-name"/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.38.1 atomically swaps staffed assignments between permitted event games", async () => {
  const [page, client, styles, migration, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/20260823103237_swap_game_assignments.sql"),
    read("package.json"),
  ]);
  assert.match(page, />Swap Assignments</);
  assert.match(page, /firstSwapAssignmentId/);
  assert.match(page, /secondSwapAssignmentId/);
  assert.match(page, /Existing ratings are not changed/);
  assert.match(client, /export async function swapGameAssignments/);
  assert.match(client, /rpc\/swap_game_assignments/);
  assert.match(migration, /first_game\.event_id <> second_game\.event_id/);
  assert.match(migration, /public\.can_manage_game\(first_game\.id, first_game\.event_id\)/);
  assert.match(migration, /public\.can_manage_game\(second_game\.id, second_game\.event_id\)/);
  assert.match(migration, /schedule_change_summary = 'Assignments swapped between games'/);
  assert.match(migration, /'assignment\.swapped'/);
  assert.match(migration, /'ratings_changed', false/);
  assert.match(migration, /revoke all on function public\.swap_game_assignments\(uuid, uuid\) from public, anon/);
  assert.match(styles, /\.assignment-swap-grid/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.38.2 limits assignment swap choices to the currently filtered schedule", async () => {
  const [page, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("package.json"),
  ]);
  assert.match(page, /const orderedSwapGames = \[\.\.\.visibleGames\]\.sort/);
  assert.doesNotMatch(page, /const orderedSwapGames = \[\.\.\.baseVisibleGames\]\.sort/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.38.3 atomically swaps entire matching staffed crews in imported order", async () => {
  const [page, client, styles, migration, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("app/globals.css"),
    read("supabase/migrations/20260823110727_swap_full_game_crews.sql"),
    read("package.json"),
  ]);
  assert.match(page, /Entire staffed crew/);
  assert.match(page, /Swap Full Crews/);
  assert.match(page, /assignmentSwapMode === "crew"/);
  assert.match(client, /export async function swapGameCrews/);
  assert.match(client, /rpc\/swap_game_crews/);
  assert.match(migration, /order by assignment\.crew_order, assignment\.id/);
  assert.match(migration, /cardinality\(first_assignment_ids\) <> cardinality\(second_assignment_ids\)/);
  assert.match(migration, /update public\.assignments[\s\S]*set official_id = null/);
  assert.match(migration, /'assignment\.crews_swapped'/);
  assert.match(migration, /'ratings_changed', false/);
  assert.match(migration, /revoke all on function public\.swap_game_crews\(uuid, uuid\) from public, anon/);
  assert.match(styles, /\.assignment-swap-mode/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.39.4 edits game information and swaps game details without moving schedule slots", async () => {
  const [page, client, styles, migration, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"), read("app/globals.css"),
    read("supabase/migrations/20260823120334_game_information_management.sql"), read("package.json"),
  ]);
  assert.match(page, />Edit Game Info</);
  assert.match(page, />Game matchup and details</);
  assert.match(page, /dateTimeLocalValue/);
  assert.match(client, /export async function updateGameDetails/);
  assert.match(client, /export async function swapGameDetails/);
  assert.match(migration, /create or replace function public\.update_game_details/);
  assert.match(migration, /create or replace function public\.swap_game_details/);
  assert.match(migration, /schedule_slots_changed', false/);
  assert.match(migration, /crews_changed', false/);
  assert.doesNotMatch(migration, /external_id =/);
  assert.match(styles, /\.game-info-editor-grid/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.39.4 can atomically move full crews with swapped game details", async () => {
  const [page, client, migration, packageJson] = await Promise.all([
    read("app/page.tsx"),
    read("app/supabase-client.ts"),
    read("supabase/migrations/20260823122146_swap_game_details_with_crew_option.sql"),
    read("package.json"),
  ]);
  assert.match(page, />Move crews with games</);
  assert.match(page, /moveCrewsWithGameDetails/);
  assert.match(client, /rpc\/swap_game_details_with_options/);
  assert.match(client, /move_crews_with_game: moveCrewsWithGame/);
  assert.match(migration, /create or replace function public\.swap_game_details_with_options/);
  assert.match(migration, /detail_result := public\.swap_game_details/);
  assert.match(migration, /crew_result := public\.swap_game_crews/);
  assert.match(migration, /revoke all on function public\.swap_game_details_with_options\(uuid, uuid, boolean\) from public, anon/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.39.4 opens a vertical game editor from assignment-board matchups", async () => {
  const [page, styles, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/globals.css"), read("package.json"),
  ]);
  assert.match(page, /className="board-game-matchup-link" onClick=\{\(\) => onEditGameInfo\(game\)\}/);
  assert.match(page, /function BoardGameInfoDialog/);
  assert.match(page, /onEditGameInfo=\{canEditAssignments \? setEditingGameInfo : undefined\}/);
  assert.match(styles, /\.game-info-editor-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(styles, /\.board-game-matchup-link\{/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.39.4 shows referees where their next crew is coming from", async () => {
  const [page, client, styles, migration, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"), read("app/globals.css"),
    read("supabase/migrations/20260823131846_referee_crew_prior_location.sql"), read("package.json"),
  ]);
  assert.match(page, /function CrewArrivalNote/);
  assert.match(page, />Where your crew is coming from</);
  assert.match(page, /"First game"/);
  assert.match(page, /<CrewArrivalNote crew=\{assignment\.crew_arrivals\} \/>/);
  assert.match(client, /crew_arrivals: Array/);
  assert.match(migration, /'crew_arrivals'/);
  assert.match(migration, /earlier_game\.starts_at < game\.starts_at/);
  assert.match(migration, /crew_assignment\.official_id <> selected_official\.id/);
  assert.match(migration, /revoke all on function public\.find_external_check_in\(text, date, jsonb\) from public/);
  assert.match(styles, /\.crew-arrival-note\{/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.39.4 confirms schedule changes from Assignment Board game tiles", async () => {
  const [page, styles, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/globals.css"), read("package.json"),
  ]);
  assert.match(page, /async function confirmBoardChange/);
  assert.match(page, /await confirmGameScheduleChange\(session, gameId\)/);
  assert.match(page, /className="board-confirm-change"/);
  assert.match(page, /canConfirmChanges=\{canConfigureEvent\}/);
  assert.match(page, /game\.schedule_changed_at && onConfirmChange/);
  assert.match(styles, /\.board-confirm-change\{/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 reduces event and crew-rating database round trips", async () => {
  const [page, client, migration, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"),
    read("supabase/migrations/20260823235435_reduce_event_and_rating_round_trips.sql"), read("package.json"),
  ]);
  assert.match(client, /rpc\/load_event_workspace/);
  assert.match(client, /async function loadEventDataLegacy/);
  assert.match(client, /rpc\/save_ratings_batch/);
  assert.match(page, /await import\("\.\/schedule-export"\)/);
  assert.match(page, /await import\("\.\/post-event-export"\)/);
  assert.match(page, /const savedRatings = await saveAssessmentsBatch/);
  assert.match(page, /onSaved\(savedRatings\)/);
  assert.match(page, /const applySavedRatings = useCallback/);
  assert.match(page, /refreshRatingHistory\(\)\.catch\(\(\) => undefined\);\s+\}, \[refreshRatingHistory\]\)/);
  assert.match(migration, /create or replace function public\.load_event_workspace/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /create or replace function public\.save_ratings_batch/);
  assert.match(migration, /jsonb_array_length\(items\) > 20/);
  assert.match(migration, /revoke all on function public\.load_event_workspace\(uuid\) from public, anon/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 consolidates staffing views into Schedule and repairs the mobile tray", async () => {
  const page = await readFile("app/page.tsx", "utf8");
  const css = await readFile("app/globals.css", "utf8");
  const packageJson = await readFile("package.json", "utf8");

  assert.match(page, /View Schedule As/);
  assert.match(page, /Time and Field Grid/);
  assert.match(page, /embedded initialView=\{activeScheduleView\}/);
  assert.match(page, /View Reports/);
  assert.doesNotMatch(page, /\["board", "Assignment Board"\]/);
  assert.match(css, /\.topbar \.account-tray-navigation\{position:static!important;grid-column:auto!important;grid-row:auto!important/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 combines rating status and authorized report access and safely reopens saved submissions", async () => {
  const [page, css, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);

  assert.match(page, /function GameReportsButton/);
  assert.match(page, /ratedByViewer && ratedByAnother \? "rated-by-both"/);
  assert.match(page, /onClick=\{onClick\}>View Reports<\/button>/);
  assert.match(page, /onViewReports=\{setReportsGameId\}/);
  assert.doesNotMatch(page, /View Submitted Reports/);
  assert.match(css, /\.game-rating-marker\.rated-by-viewer\{background:#16865e\}/);
  assert.match(css, /\.game-rating-marker\.rated-by-other\{background:#397bb2\}/);
  assert.match(css, /\.game-rating-marker\.rated-by-both\{background:linear-gradient\(45deg/);
  assert.match(page, /const originalSubmission = ratingRecords\.filter/);
  assert.match(page, /id: `rating-\$\{assessment\.id\}`/);
  assert.doesNotMatch(page, /This rating set changed while it was open/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 stacks submitted report cards at equal width in crew order", async () => {
  const [page, css, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);

  assert.match(page, /function SubmittedReportsDialog\(\{ game, reports, assignments, officials, onClose \}/);
  assert.match(page, /const crewOrder = new Map\(sortGameCrew\(assignments\)/);
  assert.match(page, /crewPositionPriority\(left\.assignment\) - crewPositionPriority\(right\.assignment\)/);
  assert.match(page, /orderedReports\.map\(\(report\)/);
  assert.match(css, /\.submitted-reports-dialog>\.submitted-reports-list\{display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:flex-start!important/);
  assert.match(css, /\.submitted-reports-dialog>\.submitted-reports-list>article\{display:grid;box-sizing:border-box;flex:0 0 auto;width:100%!important;max-width:none!important/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 shows only the referee's own shared evaluation in My Assignments", async () => {
  const [page, client, migration, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"),
    read("supabase/migrations/20260824005300_referee_assignment_shared_ratings.sql"), read("package.json"),
  ]);

  assert.match(page, /View My Eval/);
  assert.match(page, /loadMyAssignmentSharedRatings/);
  assert.match(page, /sharedRatings\.filter\(\(entry\) => entry\.assignment_id === item\.id\)/);
  assert.doesNotMatch(page.match(/function MyAssignmentRatingsDialog[\s\S]*?\n\}/)?.[0] || "", /coach_notes/);
  assert.match(client, /rpc\/my_assignment_shared_ratings/);
  assert.match(migration, /official\.linked_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /assessment\.visibility = 'public'/);
  assert.match(migration, /assessment\.status = 'shared'/);
  assert.match(migration, /not event\.ratings_admin_only/);
  assert.match(migration, /to_jsonb\(assessment\) - 'coach_notes'/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /revoke all on function public\.my_assignment_shared_ratings\(\) from public, anon/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 limits assignment-board schedule views to event staff", async () => {
  const [page, packageJson] = await Promise.all([read("app/page.tsx"), read("package.json")]);

  assert.match(page, /const activeScheduleView = staffingViewsEnabled \? scheduleView : "list"/);
  assert.match(page, /const scheduleViewChoice = staffingViewsEnabled \?/);
  assert.match(page, /staffingViewsEnabled=\{isStaff\}/);
  assert.match(page, /view === "board" && !isStaff && profile && <UnifiedAssignmentsView/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 hardens dependencies, responses, authentication, and elevated database functions", async () => {
  const [worker, authClient, authPanel, turnstile, packageJson, workspace, migration] = await Promise.all([
    read("worker/index.ts"), read("app/auth-client.ts"), read("app/auth-panel.tsx"), read("app/turnstile.tsx"),
    read("package.json"), read("pnpm-workspace.yaml"), read("supabase/migrations/20260825223405_security_hardening_v0408.sql"),
  ]);

  assert.match(worker, /Content-Security-Policy/);
  assert.match(worker, /Strict-Transport-Security/);
  assert.match(worker, /X-Frame-Options/);
  assert.match(worker, /Permissions-Policy/);
  assert.match(worker, /secureResponse\(await handler\.fetch/);
  assert.match(authClient, /gotrue_meta_security: \{ captcha_token: captchaToken \}/);
  assert.match(authPanel, /TurnstileChallenge/);
  assert.match(turnstile, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.doesNotMatch(packageJson, /"xlsx"/);
  assert.match(packageJson, /"exceljs": "4\.4\.0"/);
  assert.match(packageJson, /"next": "16\.2\.11"/);
  assert.match(workspace, /"sharp@<0\.35\.0": 0\.35\.0/);
  assert.match(migration, /revoke execute on function %s from public, anon/);
  assert.match(migration, /alter function %s set search_path = public, pg_temp/);
  assert.match(migration, /grant execute on function public\.find_external_check_in/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.42.0 supports Google sign-in without losing invitation context", async () => {
  const [authClient, authPanel, css] = await Promise.all([
    read("app/auth-client.ts"), read("app/auth-panel.tsx"), read("app/globals.css"),
  ]);

  assert.match(authClient, /signInWithGoogle\(\)/);
  assert.match(authClient, /authorize\.searchParams\.set\("provider", "google"\)/);
  assert.match(authClient, /const redirectTo = new URL\(window\.location\.href\)/);
  assert.match(authPanel, /Continue with Google/);
  assert.match(authPanel, /mode !== "recovery"/);
  assert.match(authPanel, /Unable to start Google sign-in/);
  assert.match(authPanel, /setBusy\(false\)/);
  assert.match(css, /\.google-auth\{/);
});

test("v0.43.0 adds durable searchable tags to editable games", async () => {
  const [page, client, css, migration, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"), read("app/globals.css"),
    read("supabase/migrations/20260916174803_game_tags.sql"), read("package.json"),
  ]);

  assert.match(client, /tags: string\[\]/);
  assert.match(client, /"operational" \| "assigned_externally" \| "tags"/);
  assert.match(page, /function normalizeGameTags/);
  assert.match(page, /function GameTags/);
  assert.match(page, /Game tags<input/);
  assert.match(page, /\(item\.tags \|\| \[\]\)\.join\(" "\)/);
  assert.match(css, /\.game-tags\{/);
  assert.match(migration, /add column if not exists tags text\[\] not null default/);
  assert.match(migration, /tags = normalized_tags/);
  assert.match(migration, /tags = second_game\.tags/);
  assert.match(migration, /revoke all on function public\.update_game_details\(uuid, jsonb\) from public, anon/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.43.1 marks games assigned externally without changing their crews", async () => {
  const [page, client, css, migration, packageJson] = await Promise.all([
    read("app/page.tsx"), read("app/supabase-client.ts"), read("app/globals.css"),
    read("supabase/migrations/20260917145428_assigned_externally_game_status.sql"), read("package.json"),
  ]);

  assert.match(client, /assigned_externally: boolean/);
  assert.match(client, /"operational" \| "assigned_externally" \| "tags"/);
  assert.match(page, /<strong>Assigned externally<\/strong>/);
  assert.match(page, /AssignmentSourceBadge assignedExternally=\{game\.assigned_externally\}/);
  assert.match(page, /assigned outside Law18Ref\. This does not change or notify the listed crew/);
  assert.match(css, /\.assigned-externally-badge\{/);
  assert.match(migration, /add column if not exists assigned_externally boolean not null default false/);
  assert.match(migration, /assigned_externally = coalesce/);
  assert.match(migration, /assigned_externally = second_game\.assigned_externally/);
  assert.match(migration, /revoke all on function public\.update_game_details\(uuid, jsonb\) from public, anon/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.44.0 keeps Edit Game Information fields in a vertical scrollable form", async () => {
  const [css, packageJson] = await Promise.all([read("app/globals.css"), read("package.json")]);

  assert.match(css, /\.confirmation-dialog>\.game-info-editor-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.game-info-editor-grid>label\{display:grid;min-width:0;gap:6px;margin:0/);
  assert.match(css, /\.game-info-editor-dialog\{width:min\(680px,calc\(100vw - 24px\)\);max-height:calc\(100dvh - 32px\);overflow-x:hidden;overflow-y:auto/);
  assert.match(css, /\.confirmation-dialog>\.game-info-editor-actions\{display:flex;justify-content:flex-end/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});

test("v0.44.0 combines selected event schedules with full-width filters and quick external status", async () => {
  const [page, css, packageJson] = await Promise.all([read("app/page.tsx"), read("app/globals.css"), read("package.json")]);

  assert.match(page, /function mergeEventWorkspaces/);
  assert.match(page, /selectedEventIds=\{scheduleEventIds\.length \? scheduleEventIds : \[event\.id\]\}/);
  assert.match(page, /AssignmentFilterMenu label="Events \/ Competitions"/);
  assert.match(page, /AssignmentFilterMenu label="Venues"/);
  assert.match(page, /AssignmentFilterMenu label="Status"/);
  assert.match(page, />Ext Asgn<\/button>/);
  assert.match(page, /className="schedule-venue-name">Venue:/);
  assert.match(page, /className="board-game-venue"/);
  assert.match(css, /\.schedule-filter-card-grid\{display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(css, /\.external-assignment-toggle\.active/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});
