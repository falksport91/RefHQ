import { auth, type Law18Session } from "./auth-client.ts";
import { normalizePhoneNumber } from "./phone.ts";

const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Profile = {
  id: string;
  organization_id: string | null;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  primary_email?: string | null;
  secondary_email?: string | null;
  date_of_birth?: string | null;
  preferred_name?: string | null;
  is_site_owner?: boolean;
  phone?: string | null;
  personal_contact_locked?: boolean;
  personal_schedule_colors?: Record<string, string>;
  personal_schedule_color_modes?: Record<string, Array<"mark" | "card" | "label">>;
  rating_average_preferences?: {
    event_scope?: "current_event" | "organization";
    display_mode?: "overall" | "position" | "both";
    match_position?: boolean;
    from?: string;
    through?: string;
  };
  role: "admin" | "assignor" | "referee" | "coach";
};

export type MembershipRole = "site_owner" | "organization_director" | "organization_admin" | "event_admin" | "assignor" | "site_coordinator" | "referee_coach" | "referee";

export type OrganizationMembership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: MembershipRole;
  status: "pending" | "active" | "suspended" | "archived";
};

export type EventMembership = {
  id: string;
  event_id: string;
  user_id: string;
  role: MembershipRole;
  full_schedule_access: boolean;
  coaching_tools_enabled: boolean;
  ratings_history_scope: "none" | "specific" | "all";
  ratings_event_ids: string[];
  assigned_game_ids: string[];
  assigned_dates: string[];
  assigned_sites: string[];
  assignment_editing_override: boolean | null;
};

export type ProvisionalEventAccess = {
  id: string;
  official_id: string;
  event_id: string;
  roles: Exclude<MembershipRole, "site_owner" | "organization_director" | "organization_admin">[];
  full_schedule_access: boolean;
  coaching_tools_enabled: boolean;
  ratings_history_scope: "none" | "specific" | "all";
  ratings_event_ids: string[];
  assigned_game_ids: string[];
  assigned_dates: string[];
  assigned_sites: string[];
  assignment_editing_override: boolean | null;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  active?: boolean;
  deactivated_at?: string | null;
  deactivated_by?: string | null;
  position_title_aliases: Record<string, string>;
  public_rating_approval_role?: "none" | "organization_admin" | "event_admin";
  feature_entitlements: EventFeatureSettings;
};

export type CrossGroupOfficialAddResult = {
  added: number;
  already_present: number;
  conflicts: number;
  conflict_names: string[];
};

export type EventFeatureKey = "assignment_board" | "check_in" | "ratings" | "coaching" | "event_documents";
export type EventFeatureSettings = Record<EventFeatureKey, boolean>;

export type EventRecord = {
  id: string;
  organization_id: string;
  name: string;
  venue_name: string;
  starts_on: string;
  ends_on: string;
  timezone: string;
  check_in_slug: string;
  event_type: "tournament" | "league";
  parent_league_id: string | null;
  check_in_enabled: boolean;
  guest_check_in_enabled: boolean;
  external_check_in_fields: ExternalCheckInField[];
  external_check_in_other_label: string;
  check_in_confirmation_message: string;
  external_check_in_first_failure_message: string;
  external_check_in_second_failure_message: string;
  external_check_in_arrival_message: string;
  external_check_in_allow_account_sign_in: boolean;
  external_check_in_confirmation_required: boolean;
  check_in_links: Array<{ title: string; url: string }>;
  feature_settings: EventFeatureSettings;
  rating_type: "skills_eval" | "basic_eval";
  ratings_admin_only: boolean;
  public_rating_approval_role?: "inherit" | "none" | "organization_admin" | "event_admin";
  position_title_aliases: Record<string, string>;
  auto_archive_at?: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  site_supervisor_assignment_editing_enabled: boolean;
};

export type EventDocumentRecord = {
  id: string;
  event_id: string;
  document_type: "rules_of_competition" | "other";
  title: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_by: string;
  created_at: string;
};

export type GameRecord = {
  id: string;
  event_id: string;
  external_id: string;
  starts_at: string;
  field_name: string;
  home_team: string;
  away_team: string;
  division: string;
  venue_name: string | null;
  age_group: string | null;
  gender: string | null;
  game_type: string | null;
  operational: boolean;
  tags: string[];
  schedule_changed_at?: string | null;
  schedule_changed_by?: string | null;
  schedule_change_summary?: string | null;
};

export type OfficialEventDayContext = {
  official: Pick<OfficialRecord, "id" | "full_name" | "email" | "secondary_email" | "phone" | "date_of_birth">;
  games: Array<{
    game: GameRecord;
    selected_position: AssignmentRecord["position"];
    selected_position_title: string | null;
    within_management_scope: boolean;
    crew: Array<{ assignment: AssignmentRecord; official_name: string | null }>;
  }>;
};

export type OfficialRecord = {
  id: string;
  organization_id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  secondary_email?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  personal_contact_locked?: boolean;
  badge_level?: string | null;
  ussf_id?: string | null;
  external_check_in_other?: string | null;
  source?: string;
  source_official_id?: string | null;
  source_display_name?: string | null;
  linked_user_id?: string | null;
  last_login_at?: string | null;
  identity_status?: string;
  merged_into_official_id?: string | null;
  pending_org_role?: MembershipRole;
  pending_org_roles?: MembershipRole[];
  archived_at?: string | null;
};

export type OrganizationJoinLink = {
  id: string;
  organization_id: string;
  token: string;
  label: string;
  default_role: MembershipRole;
  active: boolean;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  use_count: number;
};

export type AuditRecord = {
  id: number;
  event_id: string | null;
  actor_id: string | null;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type UserNotification = {
  id: string;
  organization_id: string | null;
  event_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  details: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type AssignmentRecord = {
  id: string;
  game_id: string;
  official_id: string;
  position:
    | "referee"
    | "assistant_referee"
    | "fourth_official"
    | "mentor"
    | "referee_coach"
    | "site_coordinator"
    | "site_supervisor"
    | "standby"
    | "other";
  position_title: string | null;
  source_position_title: string | null;
  crew_order?: number;
};

export type CheckInRecord = {
  id: string;
  event_id: string;
  official_id: string;
  checked_in_at: string;
  status: "checked_in" | "late" | "missing" | "excused";
  method: string;
  event_date: string;
};

export type AttendanceExpectationOverride = {
  id: string;
  event_id: string;
  event_date: string;
  official_id: string;
  expected: false;
  reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ExternalCheckInField = "last_name" | "first_name" | "email" | "phone" | "ussf_id" | "date_of_birth" | "other";

export type ExternalCheckInConfig = {
  event_name: string;
  required_fields: ExternalCheckInField[];
  other_label: string;
  first_failure_message: string;
  second_failure_message: string;
  arrival_message: string;
  allow_account_sign_in: boolean;
  confirmation_required: boolean;
};

export type ExternalCheckInLookup = {
  token: string;
  event_name: string;
  event_date: string;
  official_name: string;
  already_checked_in: boolean;
  checked_in: boolean;
  confirmation_required: boolean;
  confirmation_message: string;
  check_in_links: Array<{ title: string; url: string }>;
  assignments: Array<{
    game_id: string;
    starts_at: string;
    field_name: string;
    venue_name: string | null;
    home_team: string;
    away_team: string;
    age_group: string | null;
    gender: string | null;
    position: AssignmentRecord["position"];
    position_title: string | null;
    crew_arrivals: Array<{
      official_id: string;
      official_name: string;
      position: AssignmentRecord["position"];
      position_title: string | null;
      prior_starts_at: string | null;
      prior_field_name: string | null;
      prior_position: AssignmentRecord["position"] | null;
      prior_position_title: string | null;
      first_game: boolean;
    }>;
  }>;
};

export type CoachAssignmentRecord = {
  id: string;
  event_id: string;
  game_id: string | null;
  coach_id: string;
  coach_official_id?: string | null;
  official_id: string | null;
  scope_date: string | null;
  venue_name: string | null;
  field_name: string | null;
  full_schedule: boolean;
};

export type AssessmentRecord = {
  id: string;
  game_id: string;
  official_id: string;
  coach_id: string;
  visibility: "public" | "private";
  status: "draft" | "submitted" | "shared";
  evaluation_type: "skills_eval" | "basic_eval";
  include_in_averages?: boolean;
  overall_rating: number | null;
  positioning: number | null;
  decision_making: number | null;
  communication: number | null;
  match_control: number | null;
  strengths: string | null;
  development_focus: string | null;
  additional_comments: string | null;
  coach_notes: string | null;
  submitted_at: string | null;
  created_at?: string;
  archived_at?: string | null;
  archived_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  shared_at?: string | null;
  referee_seen_at?: string | null;
  deleted_at?: string | null;
  retained_for_referee?: boolean;
  rated_position?: AssignmentRecord["position"] | null;
  rated_position_title?: string | null;
  edited_at?: string | null;
  edited_by?: string | null;
};

export type RatingHistory = {
  assessments: AssessmentRecord[];
  games: GameRecord[];
  assignments: AssignmentRecord[];
  officials: OfficialRecord[];
  events: EventRecord[];
  submitters: { id: string; full_name: string }[];
};

export type AppearanceCampaign = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  starts_at: string;
  ends_at: string;
  active: boolean;
};

export type AppearanceTheme = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  created_at: string;
  updated_at: string;
};

export type CalendarFeedConnection = {
  id: string;
  provider: "assignr" | "arbiter" | "usofficials" | "refquest" | "other";
  display_name: string;
  active: boolean;
  sync_status: "pending" | "syncing" | "connected" | "error" | "paused";
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type UnifiedAssignment = {
  id: string;
  source_id: string;
  source_type: string;
  source_name: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  position_title: string | null;
  status: string;
  source_url: string | null;
  event_id?: string | null;
  event_name?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
};

export type AssignmentSharedRating = {
  assignment_id: string;
  rating: AssessmentRecord;
};

function configuration() {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  return { baseUrl, anonKey };
}

async function rest<T>(
  session: Law18Session,
  path: string,
  init: RequestInit = {},
  prefer?: string,
): Promise<T> {
  const config = configuration();
  let activeSession = await auth.ensureValidSession(session);
  const perform = (accessToken: string) => fetch(`${config.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
        ...init.headers,
      },
    });
  let response = await perform(activeSession.access_token);
  if (response.status === 401) {
    activeSession = await auth.ensureValidSession(activeSession, true);
    response = await perform(activeSession.access_token);
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.hint || "Supabase request failed.");
  }
  return payload as T;
}

async function publicRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = configuration();
  const response = await fetch(`${config.baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || payload?.hint || "Supabase request failed.");
  return payload as T;
}

const enc = encodeURIComponent;

export async function loadProfile(session: Law18Session) {
  const rows = await rest<Profile[]>(session, `profiles?id=eq.${enc(session.user.id)}&select=*`);
  return rows[0] ?? null;
}

export async function loadOrganization(session: Law18Session, organizationId: string) {
  const rows = await rest<OrganizationRecord[]>(
    session,
    `organizations?id=eq.${enc(organizationId)}&select=*`,
  );
  return rows[0] ?? null;
}

export async function loadOrganizations(session: Law18Session) {
  return rest<OrganizationRecord[]>(session, "organizations?select=*&order=name.asc");
}

export async function loadGroupsAvailableForOfficialAddition(session: Law18Session) {
  return rest<OrganizationRecord[]>(session, "rpc/groups_available_for_official_addition", {
    method: "POST",
    body: "{}",
  });
}

export async function addOfficialsToGroup(session: Law18Session, sourceOrganizationId: string, targetOrganizationId: string, officialIds: string[]) {
  return rest<CrossGroupOfficialAddResult>(session, "rpc/add_officials_to_group", {
    method: "POST",
    body: JSON.stringify({
      source_organization: sourceOrganizationId,
      target_organization: targetOrganizationId,
      source_official_ids: officialIds,
    }),
  });
}

export function positionAliasKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function updatePositionTitleAliases(
  session: Law18Session,
  scope: "organization" | "event",
  id: string,
  aliases: Record<string, string>,
) {
  const table = scope === "organization" ? "organizations" : "events";
  const rows = await rest<(OrganizationRecord | EventRecord)[]>(
    session,
    `${table}?id=eq.${enc(id)}`,
    { method: "PATCH", body: JSON.stringify({ position_title_aliases: aliases }) },
    "return=representation",
  );
  return rows[0];
}

export async function createOrganization(session: Law18Session, name: string) {
  return rest<OrganizationRecord>(session, "rpc/create_organization", {
    method: "POST",
    body: JSON.stringify({ organization_name: name }),
  });
}

export async function reactivateOrganization(session: Law18Session, organizationId: string) {
  return rest<OrganizationRecord>(session, "rpc/reactivate_organization", {
    method: "POST",
    body: JSON.stringify({ target_organization_id: organizationId }),
  });
}

export async function updateOrganizationName(session: Law18Session, organizationId: string, name: string) {
  const rows = await rest<OrganizationRecord[]>(
    session,
    `organizations?id=eq.${enc(organizationId)}`,
    { method: "PATCH", body: JSON.stringify({ name: name.trim() }) },
    "return=representation",
  );
  return rows[0];
}

export async function updateOrganizationSettings(
  session: Law18Session,
  organizationId: string,
  values: { name: string; logo_url: string | null; public_rating_approval_role?: OrganizationRecord["public_rating_approval_role"]; feature_entitlements?: EventFeatureSettings },
) {
  const rows = await rest<OrganizationRecord[]>(
    session,
    `organizations?id=eq.${enc(organizationId)}`,
    { method: "PATCH", body: JSON.stringify({ name: values.name.trim(), logo_url: values.logo_url, ...(values.public_rating_approval_role ? { public_rating_approval_role: values.public_rating_approval_role } : {}), ...(values.feature_entitlements ? { feature_entitlements: values.feature_entitlements } : {}) }) },
    "return=representation",
  );
  return rows[0];
}

export async function beginOrganizationAction(
  session: Law18Session,
  organizationId: string,
  action: "deactivate" | "delete",
) {
  return rest<string>(session, "rpc/begin_organization_action", {
    method: "POST",
    body: JSON.stringify({ target_organization_id: organizationId, action_name: action }),
  });
}

export async function completeOrganizationAction(session: Law18Session, challengeId: string) {
  return rest<string>(session, "rpc/complete_organization_action", {
    method: "POST",
    body: JSON.stringify({ challenge_id: challengeId }),
  });
}

export async function loadMemberships(session: Law18Session) {
  const [organizations, events] = await Promise.all([
    rest<OrganizationMembership[]>(session, "organization_memberships?select=*&status=eq.active"),
    rest<EventMembership[]>(session, "event_memberships?select=*"),
  ]);
  return { organizations, events };
}

export async function recordCurrentLogin(session: Law18Session) {
  await rest(session, "rpc/record_current_login", {
    method: "POST",
    body: "{}",
  }, "return=minimal");
}

export async function recordCurrentActivity(session: Law18Session) {
  await rest(session, "rpc/record_current_activity", {
    method: "POST",
    body: "{}",
  }, "return=minimal");
}

export async function loadOrganizationActivity(
  session: Law18Session,
  organizationId: string,
  limit = 250,
) {
  return rest<AuditRecord[]>(session, "rpc/organization_activity", {
    method: "POST",
    body: JSON.stringify({ target_organization: organizationId, result_limit: limit }),
  });
}

export async function loadUserNotifications(session: Law18Session, limit = 25) {
  return rest<UserNotification[]>(session, `user_notifications?select=*&order=created_at.desc&limit=${limit}`);
}

export async function markUserNotificationsRead(session: Law18Session) {
  await rest(session, "user_notifications?read_at=is.null", {
    method: "PATCH",
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  }, "return=minimal");
}

export async function loadOrganizationJoinLinks(
  session: Law18Session,
  organizationId: string,
) {
  return rest<OrganizationJoinLink[]>(
    session,
    `organization_join_links?organization_id=eq.${enc(organizationId)}&select=*&order=created_at.desc`,
  );
}

export async function createOrganizationJoinLink(
  session: Law18Session,
  organizationId: string,
  label: string,
  role: MembershipRole = "referee",
  expiresAt: string | null = null,
) {
  const rows = await rest<OrganizationJoinLink[]>(session, "rpc/create_organization_join_link", {
    method: "POST",
    body: JSON.stringify({
      target_organization: organizationId,
      link_label: label,
      link_role: role,
      link_expires_at: expiresAt,
    }),
  });
  return rows[0];
}

export async function setOrganizationJoinLinkActive(
  session: Law18Session,
  linkId: string,
  active: boolean,
) {
  await rest(session, "rpc/set_organization_join_link_active", {
    method: "POST",
    body: JSON.stringify({ join_link_id: linkId, enabled: active }),
  }, "return=minimal");
}

export async function claimOrganizationJoinLink(session: Law18Session, token: string) {
  const rows = await rest<{ organization_id: string; organization_name: string }[]>(
    session,
    "rpc/claim_organization_join_link",
    { method: "POST", body: JSON.stringify({ join_token: token }) },
  );
  return rows[0];
}

export async function removeOrganizationMember(
  session: Law18Session,
  organizationId: string,
  userId: string,
) {
  await rest(session, "rpc/remove_organization_member", {
    method: "POST",
    body: JSON.stringify({ target_organization: organizationId, target_user: userId }),
  }, "return=minimal");
}

export async function loadAppearanceCampaigns(session: Law18Session) {
  return rest<AppearanceCampaign[]>(session, "site_appearance_campaigns?select=*&order=starts_at.desc");
}

export async function uploadAppearanceLogo(session: Law18Session, file: File) {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const objectPath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${baseUrl}/storage/v1/object/appearance-logos/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || result.error || "Unable to upload the logo.");
  }
  return `${baseUrl}/storage/v1/object/public/appearance-logos/${objectPath.split("/").map(enc).join("/")}`;
}

export async function uploadOrganizationLogo(session: Law18Session, organizationId: string, file: File) {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const objectPath = `${organizationId}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`${baseUrl}/storage/v1/object/organization-logos/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || result.error || "Unable to upload the group logo.");
  }
  return `${baseUrl}/storage/v1/object/public/organization-logos/${objectPath.split("/").map(enc).join("/")}`;
}

export async function createAppearanceCampaign(
  session: Law18Session,
  values: Omit<AppearanceCampaign, "id">,
) {
  const rows = await rest<AppearanceCampaign[]>(session, "site_appearance_campaigns", {
    method: "POST",
    body: JSON.stringify({ ...values, created_by: session.user.id }),
  }, "return=representation");
  return rows[0];
}

export async function restoreDefaultAppearance(session: Law18Session) {
  await rest(session, "site_appearance_campaigns?active=eq.true", {
    method: "PATCH",
    body: JSON.stringify({ active: false }),
  }, "return=minimal");
}

export async function deleteAppearanceCampaign(session: Law18Session, campaignId: string) {
  await rest(session, `site_appearance_campaigns?id=eq.${enc(campaignId)}`, {
    method: "DELETE",
  }, "return=minimal");
}

export async function loadAppearanceThemes(session: Law18Session) {
  return rest<AppearanceTheme[]>(session, "site_appearance_themes?select=*&order=name.asc");
}

export async function saveAppearanceTheme(
  session: Law18Session,
  values: Pick<AppearanceTheme, "name" | "logo_url" | "primary_color" | "accent_color">,
) {
  const rows = await rest<AppearanceTheme[]>(session, "site_appearance_themes", {
    method: "POST",
    body: JSON.stringify({ ...values, created_by: session.user.id }),
  }, "return=representation");
  return rows[0];
}

export async function deleteAppearanceTheme(session: Law18Session, themeId: string) {
  await rest(session, `site_appearance_themes?id=eq.${enc(themeId)}`, {
    method: "DELETE",
  }, "return=minimal");
}

export async function updateOwnProfile(
  session: Law18Session,
  changes: Pick<Profile, "full_name" | "first_name" | "last_name" | "phone" | "secondary_email" | "date_of_birth" | "preferred_name" | "personal_contact_locked">,
) {
  const rows = await rest<Profile[]>(
    session,
    `profiles?id=eq.${enc(session.user.id)}`,
    { method: "PATCH", body: JSON.stringify({ ...changes, phone: normalizePhoneNumber(changes.phone) || null }) },
    "return=representation",
  );
  return rows[0];
}

export async function updateDisplayPreferences(
  session: Law18Session,
  changes: Pick<Profile, "personal_schedule_colors" | "personal_schedule_color_modes" | "rating_average_preferences">,
) {
  const rows = await rest<Profile[]>(session, `profiles?id=eq.${enc(session.user.id)}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  }, "return=representation");
  return rows[0];
}

async function calendarFeedRequest<T>(session: Law18Session, path = "", init: RequestInit = {}): Promise<T> {
  let activeSession = await auth.ensureValidSession(session);
  const perform = (token: string) => fetch(`/api/calendar-feeds${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  let response = await perform(activeSession.access_token);
  if (response.status === 401) {
    activeSession = await auth.ensureValidSession(activeSession, true);
    response = await perform(activeSession.access_token);
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || "Connected Schedules request failed.");
  return payload as T;
}

export function loadCalendarFeedConnections(session: Law18Session) {
  return calendarFeedRequest<CalendarFeedConnection[]>(session);
}

export function addCalendarFeed(
  session: Law18Session,
  values: { provider: CalendarFeedConnection["provider"]; display_name: string; feed_url: string },
) {
  return calendarFeedRequest<CalendarFeedConnection>(session, "", { method: "POST", body: JSON.stringify(values) });
}

export function syncCalendarFeed(session: Law18Session, feedId: string) {
  return calendarFeedRequest<{ synchronized: number; last_synced_at: string }>(session, `/${enc(feedId)}/sync`, { method: "POST", body: "{}" });
}

export function setCalendarFeedActive(session: Law18Session, feedId: string, active: boolean) {
  return calendarFeedRequest<{ active: boolean; sync_status: CalendarFeedConnection["sync_status"] }>(session, `/${enc(feedId)}`, { method: "PATCH", body: JSON.stringify({ active }) });
}

export async function removeCalendarFeed(session: Law18Session, feedId: string) {
  await calendarFeedRequest<null>(session, `/${enc(feedId)}`, { method: "DELETE" });
}

export async function loadUnifiedAssignments(session: Law18Session) {
  const [law18ref, external, context] = await Promise.all([
    rest<UnifiedAssignment[]>(session, "rpc/my_law18_assignments", { method: "POST", body: "{}" }),
    rest<UnifiedAssignment[]>(session, "rpc/my_external_assignments", { method: "POST", body: "{}" }),
    rest<{ event_id: string; event_name: string; organization_id: string; organization_name: string }[]>(session, "rpc/my_law18_assignment_context", { method: "POST", body: "{}" }),
  ]);
  const byEvent = new Map(context.map((item) => [item.event_id, item]));
  const enrichedLaw18ref = law18ref.map((item) => ({ ...item, ...byEvent.get(item.source_id) }));
  return [...enrichedLaw18ref, ...external].sort((left, right) => left.starts_at.localeCompare(right.starts_at));
}

export function loadMyAssignmentSharedRatings(session: Law18Session) {
  return rest<AssignmentSharedRating[]>(session, "rpc/my_assignment_shared_ratings", { method: "POST", body: "{}" });
}

export async function leaveCurrentOrganization(session: Law18Session, organizationId: string) {
  await rest<null>(
    session,
    "rpc/leave_group_membership",
    { method: "POST", body: JSON.stringify({ target_organization: organizationId }) },
  );
}

export async function linkCurrentReferee(session: Law18Session) {
  const config = configuration();
  const response = await fetch(`${config.baseUrl}/rest/v1/rpc/link_current_referee`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "Unable to link this referee account.");
  }
}

export async function loadEvents(session: Law18Session) {
  await rest(session, "rpc/materialize_due_event_archives", {
    method: "POST",
    body: "{}",
  });
  return rest<EventRecord[]>(session, "events?select=*&order=starts_on.desc");
}

export async function configureEventAutoArchive(
  session: Law18Session,
  eventId: string,
  daysAfterEnd: number | null,
) {
  return rest<string | null>(session, "rpc/configure_event_auto_archive", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId, days_after_end: daysAfterEnd }),
  });
}

export async function archiveEvent(session: Law18Session, eventId: string) {
  await rest(session, "rpc/archive_event", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId }),
  }, "return=minimal");
}

export async function loadArchivedEvents(session: Law18Session, organizationId: string) {
  return rest<EventRecord[]>(session, "rpc/organization_event_archive", {
    method: "POST",
    body: JSON.stringify({ target_organization: organizationId }),
  });
}

export async function restoreEvent(session: Law18Session, eventId: string) {
  await rest(session, "rpc/restore_event", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId }),
  }, "return=minimal");
}

export async function createEvent(
  session: Law18Session,
  profile: Profile,
  organizationId: string,
  values: {
    name: string;
    venue_name: string;
    starts_on: string;
    ends_on: string;
    timezone: string;
    event_type: "tournament" | "league";
    parent_league_id: string | null;
    check_in_enabled: boolean;
  },
) {
  if (!organizationId) throw new Error("Select a group before creating an event.");
  if (!values.name.trim()) throw new Error("Enter an event name.");
  if (!values.venue_name.trim()) throw new Error("Enter a default venue.");
  if (!values.starts_on || !values.ends_on) throw new Error("Enter the event dates.");
  if (values.ends_on < values.starts_on) throw new Error("The end date cannot be before the start date.");
  const slugBase = values.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
  const rows = await rest<EventRecord[]>(
    session,
    "events",
    {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        name: values.name.trim(),
        venue_name: values.venue_name.trim(),
        starts_on: values.starts_on,
        ends_on: values.ends_on,
        timezone: values.timezone,
        event_type: values.event_type,
        parent_league_id: values.event_type === "tournament" ? values.parent_league_id : null,
        check_in_enabled: values.check_in_enabled,
        check_in_slug: `${slugBase}-${Date.now().toString(36)}`,
        created_by: profile.id,
      }),
    },
    "return=representation",
  );
  if (!rows[0]) throw new Error("The event could not be created.");
  return rows[0];
}

export async function updateEventSettings(session: Law18Session, eventId: string, values: { name: string; venue_name: string; starts_on: string; ends_on: string; timezone: string; event_type: "tournament" | "league"; parent_league_id: string | null; feature_settings: EventFeatureSettings; guest_check_in_enabled: boolean; external_check_in_fields: ExternalCheckInField[]; external_check_in_other_label: string; check_in_confirmation_message: string; external_check_in_first_failure_message: string; external_check_in_second_failure_message: string; external_check_in_arrival_message: string; external_check_in_allow_account_sign_in: boolean; external_check_in_confirmation_required: boolean; check_in_links: Array<{ title: string; url: string }>; site_supervisor_assignment_editing_enabled: boolean }) {
  const rows = await rest<EventRecord[]>(session, `events?id=eq.${enc(eventId)}`, { method: "PATCH", body: JSON.stringify({ ...values, parent_league_id: values.event_type === "tournament" ? values.parent_league_id : null, check_in_enabled: values.feature_settings.check_in, guest_check_in_enabled: values.feature_settings.check_in && values.guest_check_in_enabled }) }, "return=representation");
  if (!rows[0]) throw new Error("The event settings could not be saved.");
  return rows[0];
}

export async function loadExternalCheckInConfig(eventSlug: string, eventDate: string) {
  return publicRest<ExternalCheckInConfig>("rpc/get_external_check_in_config", {
    method: "POST",
    body: JSON.stringify({ event_slug: eventSlug, event_day: eventDate }),
  });
}

export async function findExternalCheckIn(eventSlug: string, eventDate: string, identity: Partial<Record<ExternalCheckInField, string>>) {
  return publicRest<ExternalCheckInLookup>("rpc/find_external_check_in", {
    method: "POST",
    body: JSON.stringify({ event_slug: eventSlug, event_day: eventDate, entered_identity: identity }),
  });
}

export async function confirmExternalCheckIn(token: string) {
  return publicRest<{ checked_in: boolean; already_checked_in: boolean; checked_in_at: string }>("rpc/confirm_guest_check_in", {
    method: "POST",
    body: JSON.stringify({ lookup_token: token }),
  });
}

export async function loadEventDocuments(session: Law18Session, eventId: string) {
  return rest<EventDocumentRecord[]>(session, `event_documents?event_id=eq.${enc(eventId)}&select=*&order=created_at.desc`);
}

export async function loadMyRulesDocuments(session: Law18Session) {
  return rest<EventDocumentRecord[]>(session, "event_documents?document_type=eq.rules_of_competition&select=*&order=created_at.desc");
}

async function removeEventDocumentObject(session: Law18Session, storagePath: string) {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  const response = await fetch(`${baseUrl}/storage/v1/object/event-documents/${storagePath.split("/").map(enc).join("/")}`, { method: "DELETE", headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } });
  if (!response.ok && response.status !== 404) throw new Error("Unable to remove the previous event document.");
}

export async function uploadEventDocument(session: Law18Session, eventId: string, file: File, documentType: EventDocumentRecord["document_type"], title: string) {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Event documents must be PDF files.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Event documents cannot exceed 25 MB.");
  if (documentType === "rules_of_competition") {
    const previous = (await loadEventDocuments(session, eventId)).find((item) => item.document_type === documentType);
    if (previous) {
      await rest(session, `event_documents?id=eq.${enc(previous.id)}`, { method: "DELETE" }, "return=minimal");
      await removeEventDocumentObject(session, previous.storage_path);
    }
  }
  const objectPath = `${eventId}/${crypto.randomUUID()}.pdf`;
  const response = await fetch(`${baseUrl}/storage/v1/object/event-documents/${objectPath.split("/").map(enc).join("/")}`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/pdf", "x-upsert": "false" }, body: file });
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.message || result.error || "Unable to upload the event document."); }
  const rows = await rest<EventDocumentRecord[]>(session, "event_documents", { method: "POST", body: JSON.stringify({ event_id: eventId, document_type: documentType, title: title.trim() || file.name.replace(/\.pdf$/i, ""), file_name: file.name, storage_path: objectPath, mime_type: "application/pdf", size_bytes: file.size, created_by: session.user.id }) }, "return=representation");
  return rows[0];
}

export async function openEventDocument(session: Law18Session, document: EventDocumentRecord) {
  if (!baseUrl || !anonKey) throw new Error("Supabase is not configured.");
  const response = await fetch(`${baseUrl}/storage/v1/object/authenticated/event-documents/${document.storage_path.split("/").map(enc).join("/")}`, { headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } });
  if (!response.ok) throw new Error("Unable to open this event document.");
  const objectUrl = URL.createObjectURL(await response.blob());
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

type EventWorkspace = {
  games: GameRecord[];
  assignments: AssignmentRecord[];
  officials: OfficialRecord[];
  checkIns: CheckInRecord[];
  attendanceOverrides: AttendanceExpectationOverride[];
  assessments: AssessmentRecord[];
  coachAssignments: CoachAssignmentRecord[];
  documents: EventDocumentRecord[];
  provisionalAccess: ProvisionalEventAccess[];
};

async function loadEventDataLegacy(session: Law18Session, eventId: string): Promise<EventWorkspace> {
  const [games, coachAssignments, eventMembers, eventRows, documents, provisionalAccess] = await Promise.all([
    rest<GameRecord[]>(session, `games?event_id=eq.${enc(eventId)}&select=*&order=starts_at.asc`),
    rest<CoachAssignmentRecord[]>(session, `coach_assignments?event_id=eq.${enc(eventId)}&select=*`),
    rest<{ user_id: string }[]>(session, `event_memberships?event_id=eq.${enc(eventId)}&select=user_id`),
    rest<{ organization_id: string }[]>(session, `events?id=eq.${enc(eventId)}&select=organization_id`),
    loadEventDocuments(session, eventId),
    rest<ProvisionalEventAccess[]>(session, `provisional_event_access?event_id=eq.${enc(eventId)}&select=*`),
  ]);
  const eventOrganizationId = eventRows[0]?.organization_id;
  const gameIds = games.map((game) => game.id).join(",");
  const assignments = gameIds
    ? await rest<AssignmentRecord[]>(session, `assignments?game_id=in.(${gameIds})&select=*&order=crew_order.asc`)
    : [];
  const officialIds = [...new Set([
    ...assignments.map((assignment) => assignment.official_id),
    ...coachAssignments.map((assignment) => assignment.coach_official_id),
  ].filter((value): value is string => Boolean(value)))];
  const eventUserIds = [...new Set([
    ...eventMembers.map((membership) => membership.user_id),
    ...coachAssignments.map((assignment) => assignment.coach_id),
  ].filter(Boolean))];
  const [assignedOfficials, linkedEventOfficials] = await Promise.all([
    officialIds.length
    ? await rest<OfficialRecord[]>(session, `officials?id=in.(${officialIds.join(",")})&select=*`)
      : [],
    eventUserIds.length && eventOrganizationId
      ? await rest<OfficialRecord[]>(session, `officials?organization_id=eq.${enc(eventOrganizationId)}&linked_user_id=in.(${eventUserIds.join(",")})&select=*`)
      : [],
  ]);
  const officials = [...new Map([...assignedOfficials, ...linkedEventOfficials].map((official) => [official.id, official])).values()];
  const [checkIns, attendanceOverrides] = await Promise.all([
    rest<CheckInRecord[]>(session, `check_ins?event_id=eq.${enc(eventId)}&select=*`),
    loadEventAttendanceOverrides(session, eventId),
  ]);
  const assessments = gameIds
    ? await rest<AssessmentRecord[]>(session, `assessments?game_id=in.(${gameIds})&select=*`)
    : [];
  return { games, assignments, officials, checkIns, attendanceOverrides, assessments, coachAssignments, documents, provisionalAccess };
}

export async function loadEventData(session: Law18Session, eventId: string): Promise<EventWorkspace> {
  try {
    const workspace = await rest<EventWorkspace>(session, "rpc/load_event_workspace", {
      method: "POST",
      body: JSON.stringify({ target_event: eventId }),
    });
    if (workspace && Array.isArray(workspace.games) && Array.isArray(workspace.assignments)) return workspace;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("load_event_workspace") && !message.includes("schema cache") && !message.includes("could not find the function")) throw error;
  }
  return loadEventDataLegacy(session, eventId);
}

export async function createCoachAssignment(
  session: Law18Session,
  eventId: string,
  coach: Pick<OfficialRecord, "id" | "linked_user_id">,
  gameId: string | null,
) {
  if (gameId) {
    const games = await rest<Pick<GameRecord, "id" | "operational" | "field_name" | "venue_name">[]>(
      session,
      `games?id=eq.${enc(gameId)}&event_id=eq.${enc(eventId)}&select=id,operational,field_name,venue_name`,
    );
    const game = games[0];
    const hqLocation = `${game?.field_name || ""} ${game?.venue_name || ""}`.toLowerCase().includes("hq");
    if (!game || game.operational || hqLocation) {
      throw new Error("Referee coaches can only be assigned through Coaching to ratings-enabled games.");
    }
  }
  const rows = await rest<CoachAssignmentRecord[]>(session, "coach_assignments", {
    method: "POST",
    body: JSON.stringify({
      event_id: eventId,
      game_id: gameId,
      coach_id: coach.linked_user_id || null,
      coach_official_id: coach.linked_user_id ? null : coach.id,
      full_schedule: !gameId,
    }),
  }, "return=representation");
  return rows[0];
}

export async function deleteCoachAssignment(session: Law18Session, assignmentId: string) {
  await rest(session, `coach_assignments?id=eq.${enc(assignmentId)}`, { method: "DELETE" }, "return=minimal");
}

export async function loadEventCheckIns(session: Law18Session, eventId: string) {
  return rest<CheckInRecord[]>(
    session,
    `check_ins?event_id=eq.${enc(eventId)}&select=*&order=checked_in_at.desc`,
  );
}

export async function loadEventAttendanceOverrides(session: Law18Session, eventId: string) {
  return rest<AttendanceExpectationOverride[]>(
    session,
    `attendance_expectation_overrides?event_id=eq.${enc(eventId)}&select=*&order=created_at.desc`,
  );
}

export async function setAttendanceExpected(
  session: Law18Session,
  eventId: string,
  officialId: string,
  eventDate: string,
  expected: boolean,
) {
  if (expected) {
    await rest(
      session,
      `attendance_expectation_overrides?event_id=eq.${enc(eventId)}&official_id=eq.${enc(officialId)}&event_date=eq.${enc(eventDate)}`,
      { method: "DELETE" },
      "return=minimal",
    );
    return;
  }
  await rest(
    session,
    "attendance_expectation_overrides?on_conflict=event_id,event_date,official_id",
    {
      method: "POST",
      body: JSON.stringify({ event_id: eventId, official_id: officialId, event_date: eventDate, expected: false, created_by: session.user.id }),
    },
    "resolution=merge-duplicates,return=minimal",
  );
}

export async function loadAuthorizedRatingHistory(session: Law18Session, organizationId: string): Promise<RatingHistory> {
  return rest<RatingHistory>(session, "rpc/authorized_rating_history", {
    method: "POST",
    body: JSON.stringify({ target_organization: organizationId }),
  });
}

export async function setRatingArchived(session: Law18Session, assessmentId: string, archived: boolean) {
  await rest(session, "rpc/set_rating_archived", {
    method: "POST",
    body: JSON.stringify({ target_assessment: assessmentId, should_archive: archived }),
  });
}

export async function setRatingAverageInclusion(session: Law18Session, assessmentId: string, included: boolean) {
  await rest(session, "rpc/set_rating_average_inclusion", {
    method: "POST",
    body: JSON.stringify({ target_assessment: assessmentId, should_include: included }),
  });
}

export async function deleteRating(session: Law18Session, assessmentId: string, retainForReferee = false) {
  await rest(session, "rpc/delete_rating", {
    method: "POST",
    body: JSON.stringify({ target_assessment: assessmentId, keep_for_referee: retainForReferee }),
  });
}

export async function swapSameGameRatings(session: Law18Session, firstAssessmentId: string, secondAssessmentId: string) {
  await rest(session, "rpc/swap_same_game_ratings", {
    method: "POST",
    body: JSON.stringify({ first_assessment: firstAssessmentId, second_assessment: secondAssessmentId }),
  });
}

export async function bulkManageRecords(
  session: Law18Session,
  recordType: "officials" | "ratings" | "events",
  action: "archive" | "restore" | "delete",
  recordIds: string[],
) {
  return rest<{ processed: number; skipped: number }>(session, "rpc/bulk_manage_records", {
    method: "POST",
    body: JSON.stringify({ record_type: recordType, lifecycle_action: action, record_ids: recordIds }),
  });
}

export async function logRatingExport(session: Law18Session, ratingCount: number, gameCount: number) {
  await rest(session, "rpc/log_rating_export", {
    method: "POST",
    body: JSON.stringify({ rating_count: ratingCount, game_count: gameCount }),
  });
}

export async function logOfficialsExport(session: Law18Session, organizationId: string, officialCount: number) {
  await rest(session, "audit_log", {
    method: "POST",
    body: JSON.stringify({
      organization_id: organizationId,
      actor_id: session.user.id,
      action: "officials.exported",
      entity_type: "officials",
      details: { official_count: officialCount, format: "csv" },
    }),
  }, "return=minimal");
}

export async function logScheduleExport(session: Law18Session, event: EventRecord, gameCount: number, format: "xlsx" | "pdf", scope: "all" | "filtered") {
  await rest(session, "audit_log", {
    method: "POST",
    body: JSON.stringify({
      organization_id: event.organization_id,
      event_id: event.id,
      actor_id: session.user.id,
      action: "schedule.exported",
      entity_type: "games",
      entity_id: event.id,
      details: { game_count: gameCount, format, scope },
    }),
  }, "return=minimal");
}

export async function updateEventRatingSettings(
  session: Law18Session,
  eventId: string,
  ratingType: EventRecord["rating_type"],
  ratingsAdminOnly: boolean,
  publicRatingApprovalRole: EventRecord["public_rating_approval_role"],
) {
  const updated = await rest<EventRecord>(session, "rpc/update_event_rating_settings", {
    method: "POST",
    body: JSON.stringify({
      target_event: eventId,
      next_rating_type: ratingType,
      next_ratings_admin_only: ratingsAdminOnly,
      next_public_rating_approval_role: publicRatingApprovalRole,
    }),
  });
  if (!updated?.id) throw new Error("The event rating settings were not saved.");
  return updated;
}

export async function approvePublicRating(session: Law18Session, assessmentId: string) {
  return rest<AssessmentRecord>(session, "rpc/approve_public_rating", {
    method: "POST",
    body: JSON.stringify({ target_assessment: assessmentId }),
  });
}

export async function submitDraftRating(session: Law18Session, assessmentId: string) {
  const rows = await rest<AssessmentRecord[]>(session, `assessments?id=eq.${enc(assessmentId)}&status=eq.draft`, {
    method: "PATCH",
    body: JSON.stringify({ status: "submitted", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
  }, "return=representation");
  if (!rows[0]) throw new Error("This draft is no longer available or you do not have permission to submit it.");
  return rows[0];
}

export async function markEventRatingsSeen(session: Law18Session, eventId: string) {
  return rest(session, "rpc/mark_event_ratings_seen", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId }),
  });
}

export async function checkIn(
  session: Law18Session,
  eventId: string,
  officialId: string,
  method: "qr" | "app" | "assignor" = "app",
  eventDate = new Date().toISOString().slice(0, 10),
) {
  const rows = await rest<CheckInRecord[]>(
    session,
    "check_ins?on_conflict=event_id,event_date,official_id",
    {
      method: "POST",
      body: JSON.stringify({
        event_id: eventId,
        event_date: eventDate,
        official_id: officialId,
        status: "checked_in",
        method,
        recorded_by: session.user.id,
        checked_in_at: new Date().toISOString(),
      }),
    },
    "resolution=merge-duplicates,return=representation",
  );
  return rows[0];
}

export async function undoCheckIn(
  session: Law18Session,
  eventId: string,
  officialId: string,
  eventDate: string,
) {
  await rest(
    session,
    `check_ins?event_id=eq.${enc(eventId)}&official_id=eq.${enc(officialId)}&event_date=eq.${enc(eventDate)}`,
    { method: "DELETE" },
    "return=minimal",
  );
}

export type ImportRow = {
  external_id: string;
  date: string;
  start_time: string;
  venue: string;
  field: string;
  home_team: string;
  away_team: string;
  division: string;
  age_group: string;
  gender: string;
  game_type: string;
  official_name: string;
  official_email: string | null;
  official_phone: string | null;
  position: string;
};

export type GotSportSheetImport = {
  sheet_name: string;
  event_name: string;
  rows: ImportRow[];
};

export type OfficialImportRow = {
  law18ref_official_id: string | null;
  full_name: string;
  first_name: string;
  last_name: string;
  primary_email: string | null;
  secondary_email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  badge_level: string | null;
  ussf_id: string | null;
  external_check_in_other: string | null;
  source_official_id: string | null;
};

export type OfficialImportResult = {
  created: number;
  updated: number;
  missingEmail: number;
  conflicts: { name: string; email: string; reason: string }[];
};

export type ScheduleImportConflict = {
  name: string;
  field: "primary_email";
  value: string;
  conflictingOfficial: string;
  reason: string;
};

export type TournamentImportResult = {
  event: EventRecord;
  conflicts: ScheduleImportConflict[];
};

function csvRecords(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      record.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      record.push(value.trim());
      if (record.some(Boolean)) records.push(record);
      record = [];
      value = "";
    } else {
      value += character;
    }
  }
  record.push(value.trim());
  if (record.some(Boolean)) records.push(record);
  return records;
}

function headerMap(headers: string[]) {
  return new Map(headers.map((header, index) => [header.trim().toLowerCase(), index]));
}

function cell(row: string[], headers: Map<string, number>, name: string) {
  const index = headers.get(name.toLowerCase());
  return index === undefined ? "" : (row[index] || "").trim();
}

const assignrOfficialIdHeaders = ["assignr database id", "assignor database id", "assignr id"];

function cellFromAliases(row: string[], headers: Map<string, number>, names: string[]) {
  for (const name of names) {
    const value = cell(row, headers, name);
    if (value) return value;
  }
  return "";
}

function toIsoTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i);
  if (!match) throw new Error(`Unrecognized start time "${value}".`);
  let hours = Number(match[1]);
  const minutes = match[2];
  const seconds = match[3] || "00";
  const period = match[4]?.toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${minutes}:${seconds}`;
}

export function zonedLocalDateTimeToIso(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    throw new Error(`Invalid local date/time "${date} ${time}".`);
  }
  const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(wallTimeAsUtc))
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]));
  const representedWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(wallTimeAsUtc - (representedWallTime - wallTimeAsUtc)).toISOString();
}

function displayName(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : value.trim();
}

export function splitOfficialName(value: string) {
  const parts = displayName(value).split(/\s+/).filter(Boolean);
  const suffixes = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);
  const lastNameStart = parts.length > 2 && suffixes.has(parts.at(-1)!.toLowerCase()) ? parts.length - 2 : Math.max(1, parts.length - 1);
  return {
    first_name: parts.slice(0, lastNameStart).join(" ") || parts[0] || "",
    last_name: parts.slice(lastNameStart).join(" "),
  };
}

export function normalizeOfficialName(value: string) {
  return displayName(value).toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isOperationalGame(row: Pick<ImportRow, "field" | "home_team" | "away_team" | "game_type">) {
  const values = [row.field, row.home_team, row.away_team, row.game_type].map((value) => (value || "").toLowerCase());
  const operationalTitles = [
    "standby", "ref coordinator", "ref coord", "ref coach", "referee coach",
    "site coordinator", "site coord", "site supervisor",
  ];
  return values.some((value) => value.includes("hq"))
    || values.some((value) => operationalTitles.some((title) => value.trim() === title));
}

export function parseAssignrCsv(text: string): ImportRow[] {
  const records = csvRecords(text);
  if (records.length < 2) throw new Error("The CSV does not contain schedule rows.");
  const headers = headerMap(records[0]);

  // Actual Assignr games export: one game per row and Position/Official pairs.
  if (headers.has("game id") && headers.has("official 1")) {
    const required = ["game id", "date", "start time", "venue", "sub-venue", "home team", "away team"];
    const missing = required.filter((name) => !headers.has(name));
    if (missing.length) throw new Error(`This Assignr export is missing: ${missing.join(", ")}.`);
    const rows: ImportRow[] = [];
    records.slice(1).forEach((record, rowIndex) => {
      const gameId = cell(record, headers, "game id");
      const externalId = cell(record, headers, "assignr database id") || gameId;
      const date = cell(record, headers, "date");
      const startTime = cell(record, headers, "start time");
      if (!gameId && !date && !startTime) return; // Assignr may include a totals/footer row.
      if (!externalId || !date || !startTime) throw new Error(`Assignr row ${rowIndex + 2} is missing its game ID, date, or start time.`);
      const rowCountBeforeGame = rows.length;
      for (let slot = 1; slot <= 12; slot += 1) {
        const name = cell(record, headers, `official ${slot}`);
        const position = cell(record, headers, `position ${slot}`);
        if (!name) continue;
        rows.push({
          external_id: externalId,
          date,
          start_time: toIsoTime(startTime),
          venue: cell(record, headers, "venue"),
          field: cell(record, headers, "sub-venue") || cell(record, headers, "venue"),
          home_team: cell(record, headers, "home team") || "TBD",
          away_team: cell(record, headers, "away team") || "TBD",
          division: [cell(record, headers, "age group"), cell(record, headers, "league")].filter(Boolean).join(" · "),
          age_group: cell(record, headers, "age group"),
          gender: cell(record, headers, "gender"),
          game_type: cell(record, headers, "game type"),
          official_name: displayName(name),
          official_email: null,
          official_phone: null,
          position: position || "Official",
        });
      }
      // Keep an entirely unstaffed game in the import. This empty official is
      // a game-only marker and is never written as an assignment.
      if (rows.length === rowCountBeforeGame) {
        rows.push({
          external_id: externalId,
          date,
          start_time: toIsoTime(startTime),
          venue: cell(record, headers, "venue"),
          field: cell(record, headers, "sub-venue") || cell(record, headers, "venue"),
          home_team: cell(record, headers, "home team") || "TBD",
          away_team: cell(record, headers, "away team") || "TBD",
          division: [cell(record, headers, "age group"), cell(record, headers, "league")].filter(Boolean).join(" · "),
          age_group: cell(record, headers, "age group"),
          gender: cell(record, headers, "gender"),
          game_type: cell(record, headers, "game type"),
          official_name: "",
          official_email: null,
          official_phone: null,
          position: "",
        });
      }
    });
    if (!rows.length) throw new Error("No games were found in this Assignr schedule.");
    return rows;
  }

  // Assignr assignments export: one crew position per row, with the game
  // details repeated. importTournament groups these by the game identifier.
  if (headers.has("game id") && headers.has("position") && headers.has("official")) {
    const required = ["game id", "date", "start time", "venue", "sub-venue", "home team", "away team", "position", "official"];
    const missing = required.filter((name) => !headers.has(name));
    if (missing.length) throw new Error(`This Assignr assignments export is missing: ${missing.join(", ")}.`);
    const rows: ImportRow[] = [];
    records.slice(1).forEach((record, rowIndex) => {
      const gameId = cell(record, headers, "game id");
      const externalId = cell(record, headers, "assignr database id") || gameId;
      const date = cell(record, headers, "date");
      const startTime = cell(record, headers, "start time");
      if (!gameId && !date && !startTime) return;
      if (!externalId || !date || !startTime) throw new Error(`Assignr row ${rowIndex + 2} is missing its game ID, date, or start time.`);
      const name = cell(record, headers, "official");
      rows.push({
        external_id: externalId,
        date,
        start_time: toIsoTime(startTime),
        venue: cell(record, headers, "venue"),
        field: cell(record, headers, "sub-venue") || cell(record, headers, "venue"),
        home_team: cell(record, headers, "home team") || "TBD",
        away_team: cell(record, headers, "away team") || "TBD",
        division: [cell(record, headers, "age group"), cell(record, headers, "league")].filter(Boolean).join(" · "),
        age_group: cell(record, headers, "age group"),
        gender: cell(record, headers, "gender"),
        game_type: cell(record, headers, "game type"),
        official_name: name ? displayName(name) : "",
        official_email: cell(record, headers, "email address").trim().toLowerCase() || null,
        official_phone: normalizePhoneNumber(cell(record, headers, "mobile phone")) || null,
        position: cell(record, headers, "position"),
      });
    });
    if (!rows.length) throw new Error("No games were found in this Assignr assignments export.");
    return rows;
  }

  // Backward-compatible Law18Ref pilot template.
  const required = ["external_id", "date", "start_time", "venue", "field", "home_team", "away_team", "official_name", "position"];
  const missing = required.filter((column) => !headers.has(column));
  if (missing.length) throw new Error(`Unrecognized schedule template. Missing columns: ${missing.join(", ")}`);
  return records.slice(1).map((record, rowIndex) => {
    const row = Object.fromEntries([...headers].map(([header, index]) => [header, record[index] ?? ""])) as unknown as ImportRow;
    if (!row.external_id || !row.date || !row.start_time || !row.official_name) {
      throw new Error(`Row ${rowIndex + 2} is missing a game ID, date, time, or official.`);
    }
    row.start_time = toIsoTime(row.start_time);
    row.official_email = row.official_email?.trim().toLowerCase() || null;
    row.official_phone = normalizePhoneNumber(row.official_phone) || null;
    return row;
  });
}

function spreadsheetText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof value === "object") {
    const candidate = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> };
    if (candidate.text !== undefined) return String(candidate.text).trim();
    if (candidate.result !== undefined) return spreadsheetText(candidate.result);
    if (candidate.richText) return candidate.richText.map((part) => String(part.text || "")).join("").trim();
  }
  return String(value).trim();
}

function spreadsheetDate(value: unknown) {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  const text = spreadsheetText(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  throw new Error(`Unrecognized GotSport date "${text}".`);
}

function gotSportExternalId(eventName: string, matchNumber: string) {
  const competition = eventName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
  return `gotsport:${competition}:${matchNumber.trim()}`;
}

/** Parse one worksheet from GotSport's Assignor Matches workbook. */
export function parseGotSportWorksheet(sheetName: string, records: unknown[][]): GotSportSheetImport {
  if (records.length < 2) throw new Error(`${sheetName} does not contain schedule rows.`);
  const headers = new Map(records[0].map((header, index) => [spreadsheetText(header).toLowerCase(), index]));
  const required = ["event", "match number", "division", "date", "start time", "venue", "home team", "away team"];
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length) throw new Error(`${sheetName} is not a recognized GotSport schedule. Missing: ${missing.join(", ")}.`);
  const value = (record: unknown[], header: string) => {
    const index = headers.get(header);
    return index === undefined ? "" : spreadsheetText(record[index]);
  };
  const firstEventName = records.slice(1).map((record) => value(record, "event")).find(Boolean) || sheetName;
  const rows: ImportRow[] = [];
  records.slice(1).forEach((record, index) => {
    const matchNumber = value(record, "match number");
    const rawDate = record[headers.get("date")!];
    const startTime = value(record, "start time");
    if (!matchNumber && !spreadsheetText(rawDate) && !startTime) return;
    if (!matchNumber || !spreadsheetText(rawDate) || !startTime) {
      throw new Error(`${sheetName} row ${index + 2} is missing its match number, date, or start time.`);
    }
    const eventName = value(record, "event") || firstEventName;
    const venueField = value(record, "venue");
    const separator = venueField.indexOf(":");
    const venue = (separator >= 0 ? venueField.slice(0, separator) : venueField).trim();
    const field = (separator >= 0 ? venueField.slice(separator + 1) : venueField).trim() || venue;
    const division = value(record, "division");
    const ageGroup = division.match(/\b(?:U\d{1,2}|\d{1,2}U)\b/i)?.[0]?.toUpperCase() || "";
    const gender = division.match(/\b(girls?|boys?|coed|women|men)\b/i)?.[0] || "";
    const base = {
      external_id: gotSportExternalId(eventName, matchNumber),
      date: spreadsheetDate(rawDate),
      start_time: toIsoTime(startTime),
      venue,
      field,
      home_team: value(record, "home team") || "TBD",
      away_team: value(record, "away team") || "TBD",
      division,
      age_group: ageGroup,
      gender: gender ? `${gender[0].toUpperCase()}${gender.slice(1).toLowerCase()}` : "",
      game_type: "",
      official_email: null,
      official_phone: null,
    };
    const crew = [
      ["referee", "Referee"],
      ["asst referee 1", "AR1"],
      ["asst referee 2", "AR2"],
      ["4th official", "4th Official"],
    ] as const;
    let assigned = false;
    crew.forEach(([header, position]) => {
      const official = value(record, header);
      if (!official) return;
      assigned = true;
      rows.push({ ...base, official_name: displayName(official), position });
    });
    if (!assigned) rows.push({ ...base, official_name: "", position: "" });
  });
  if (!rows.length) throw new Error(`No games were found in ${sheetName}.`);
  return { sheet_name: sheetName, event_name: firstEventName, rows };
}

export function parseAssignrOfficialsCsv(text: string): OfficialImportRow[] {
  const records = csvRecords(text);
  if (records.length < 2) throw new Error("The CSV does not contain officials.");
  const headers = headerMap(records[0]);
  if (headers.has("law18ref official id")) {
    const required = ["law18ref official id", "full name"];
    const missing = required.filter((name) => !headers.has(name));
    if (missing.length) throw new Error(`This Law18Ref officials file is missing: ${missing.join(", ")}.`);
    return records.slice(1).map((record, rowIndex) => {
      const officialId = cell(record, headers, "law18ref official id");
      const fullName = cell(record, headers, "full name");
      if (!officialId || !fullName) throw new Error(`Law18Ref officials row ${rowIndex + 2} is missing its Official ID or full name.`);
      const parsedName = splitOfficialName(fullName);
      return {
        law18ref_official_id: officialId,
        full_name: fullName,
        first_name: cell(record, headers, "first name") || parsedName.first_name,
        last_name: cell(record, headers, "last name") || parsedName.last_name,
        primary_email: cell(record, headers, "primary email").toLowerCase() || null,
        secondary_email: cell(record, headers, "secondary email").toLowerCase() || null,
        phone: normalizePhoneNumber(cell(record, headers, "phone")) || null,
        date_of_birth: cell(record, headers, "date of birth") || null,
        badge_level: cell(record, headers, "badge or level") || null,
        ussf_id: cell(record, headers, "ussf id") || null,
        external_check_in_other: cell(record, headers, "external check-in identifier") || null,
        source_official_id: cell(record, headers, "assignr database id") || null,
      };
    });
  }
  const required = ["last name", "first name", "primary email"];
  const missing = required.filter((name) => !headers.has(name));
  if (!assignrOfficialIdHeaders.some((name) => headers.has(name))) missing.push("assignr database id");
  if (missing.length) throw new Error(`This is not an Assignr officials export. Missing: ${missing.join(", ")}.`);
  return records.slice(1)
    .filter((record) => cell(record, headers, "is an official?").toUpperCase() !== "NO")
    .map((record) => {
      const first = cell(record, headers, "first name");
      const last = cell(record, headers, "last name");
      return {
        law18ref_official_id: null,
        full_name: `${first} ${last}`.trim(),
        first_name: first,
        last_name: last,
        primary_email: cell(record, headers, "primary email").toLowerCase() || null,
        secondary_email: cell(record, headers, "secondary email").toLowerCase() || null,
        phone: normalizePhoneNumber(cell(record, headers, "mobile phone") || cell(record, headers, "home phone")) || null,
        date_of_birth: null,
        badge_level: cell(record, headers, "grade/badge level") || cell(record, headers, "ussf referee certification") || null,
        ussf_id: cell(record, headers, "ussf id") || cell(record, headers, "ussf id #") || null,
        external_check_in_other: cell(record, headers, "external check-in identifier") || null,
        source_official_id: cellFromAliases(record, headers, assignrOfficialIdHeaders) || null,
      };
    })
    .filter((row) => row.full_name);
}

function csvExportCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createOfficialsExportCsv(officials: OfficialRecord[]) {
  const headers = [
    "Law18Ref Official ID", "First Name", "Last Name", "Full Name", "Primary Email", "Secondary Email", "Phone",
    "Date of Birth", "Badge or Level", "USSF ID", "External Check-In Identifier",
    "Assignr Database ID", "Account Status", "Group Roles",
  ];
  const rows = officials.map((official) => [
    official.id,
    official.first_name || splitOfficialName(official.full_name).first_name,
    official.last_name || splitOfficialName(official.full_name).last_name,
    official.full_name,
    official.email || "",
    official.secondary_email || "",
    official.phone || "",
    official.date_of_birth || "",
    official.badge_level || "",
    official.ussf_id || "",
    official.external_check_in_other || "",
    official.source_official_id || "",
    official.linked_user_id ? "Linked account" : "Provisional account",
    (official.pending_org_roles?.length ? official.pending_org_roles : [official.pending_org_role || "referee"]).join(" | "),
  ]);
  return [headers, ...rows].map((row) => row.map(csvExportCell).join(",")).join("\r\n");
}

export function normalizePosition(position: string): AssignmentRecord["position"] {
  const rawValue = position.toLowerCase();
  const value = position.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  if (value === "ar" || value.startsWith("asst") || value.includes("assistant")) return "assistant_referee";
  if (rawValue.includes("4th") || value.includes("fourth")) return "fourth_official";
  if (
    value.includes("referee_coach")
    || value.includes("ref_coach")
    || value.includes("ref_coord")
    || value.includes("referee_coord")
  ) return "referee_coach";
  if (value.includes("site_supervisor")) return "site_supervisor";
  if (value.includes("site_coord")) return "site_coordinator";
  if (value.includes("standby")) return "standby";
  if (value.includes("mentor")) return "mentor";
  if (value === "ref" || value.includes("referee")) return "referee";
  return "other";
}

export async function loadOrganizationOfficials(session: Law18Session, organizationId: string, includeMerged = false) {
  return rest<OfficialRecord[]>(
    session,
    `officials?organization_id=eq.${enc(organizationId)}${includeMerged ? "" : "&merged_into_official_id=is.null&identity_status=neq.removed&archived_at=is.null"}&select=*&order=last_name.asc.nullslast,first_name.asc.nullslast,full_name.asc`,
  );
}

export async function mergeOrganizationAccounts(
  session: Law18Session,
  organizationId: string,
  primaryOfficialId: string,
  secondaryOfficialId: string,
  fieldSources: Record<"full_name" | "secondary_email" | "date_of_birth" | "phone" | "badge_level", "primary" | "secondary">,
) {
  return rest<{
    primary_official_id: string;
    primary_user_id: string | null;
    primary_email: string | null;
    primary_is_linked: boolean;
  }>(session, "rpc/merge_group_official_records_with_profile", {
    method: "POST",
    body: JSON.stringify({
      organization_uuid: organizationId,
      primary_official_uuid: primaryOfficialId,
      secondary_official_uuid: secondaryOfficialId,
      field_sources: fieldSources,
    }),
  });
}

export async function importOfficials(
  session: Law18Session,
  profile: Profile,
  organizationId: string,
  fileName: string,
  rows: OfficialImportRow[],
): Promise<OfficialImportResult> {
  if (!organizationId) throw new Error("Select a group before importing officials.");
  const existing = await loadOrganizationOfficials(session, organizationId, true);
  const byId = new Map(existing.map((item) => [item.id, item]));
  const resolvedOfficial = (official?: OfficialRecord) =>
    official?.merged_into_official_id ? byId.get(official.merged_into_official_id) || official : official;
  const bySource = new Map(existing.filter((item) => item.source_official_id).map((item) => [item.source_official_id!, item]));
  const byEmail = new Map(existing.filter((item) => item.email).map((item) => [item.email!.trim().toLowerCase(), item]));
  const provisionalByName = new Map<string, OfficialRecord[]>();
  existing.filter((item) => item.identity_status === "provisional").forEach((item) => {
    const key = normalizeOfficialName(item.source_display_name || item.full_name);
    provisionalByName.set(key, [...(provisionalByName.get(key) || []), item]);
  });
  const emailsInFile = new Set<string>();
  const conflicts: OfficialImportResult["conflicts"] = [];
  const createPayload: Record<string, unknown>[] = [];
  const updates: { id: string; changes: Record<string, unknown> }[] = [];

  for (const row of rows) {
    let email = row.primary_email?.trim().toLowerCase() || null;
    if (email && emailsInFile.has(email)) {
      conflicts.push({ name: row.full_name, email, reason: "Duplicate primary email in this import" });
      email = null;
    }
    if (email) emailsInFile.add(email);
    const directIdMatch = row.law18ref_official_id ? byId.get(row.law18ref_official_id) : undefined;
    if (row.law18ref_official_id && !directIdMatch) {
      conflicts.push({ name: row.full_name, email: email || "", reason: "Law18Ref Official ID was not found in this group" });
      continue;
    }
    const directSourceMatch = row.source_official_id ? bySource.get(row.source_official_id) : undefined;
    const nameCandidates = provisionalByName.get(normalizeOfficialName(row.full_name)) || [];
    const sourceMatch = directIdMatch || directSourceMatch || (nameCandidates.length === 1 ? nameCandidates[0] : undefined);
    const emailMatch = email ? byEmail.get(email) : undefined;
    if (emailMatch && sourceMatch && emailMatch.id !== sourceMatch.id) {
      conflicts.push({ name: row.full_name, email: email!, reason: "Email belongs to a different existing official" });
      email = null;
    } else if (emailMatch && !sourceMatch) {
      conflicts.push({ name: row.full_name, email: email!, reason: "Email already exists; administrator review required" });
      email = null;
    }
    if (!directSourceMatch && !sourceMatch && nameCandidates.length > 1) {
      conflicts.push({ name: row.full_name, email: email || "", reason: "Multiple provisional officials have this name; manual identity review required" });
    }
    const match = resolvedOfficial(sourceMatch);
    const personalDetailsLocked = Boolean(match?.linked_user_id && match.personal_contact_locked);
    const changes = {
      full_name: match?.linked_user_id ? match.full_name : row.full_name,
      first_name: match?.linked_user_id ? match.first_name : row.first_name,
      last_name: match?.linked_user_id ? match.last_name : row.last_name,
      source_display_name: row.full_name,
      email: match?.linked_user_id ? match.email : email,
      secondary_email: personalDetailsLocked ? match?.secondary_email : row.secondary_email,
      phone: personalDetailsLocked ? match?.phone : normalizePhoneNumber(row.phone) || null,
      date_of_birth: personalDetailsLocked ? match?.date_of_birth : row.date_of_birth,
      badge_level: row.badge_level,
      ussf_id: row.ussf_id,
      external_check_in_other: row.external_check_in_other,
      source: row.law18ref_official_id ? (match?.source || "law18ref") : "assignr",
      source_official_id: row.source_official_id,
      updated_at: new Date().toISOString(),
    };
    if (match) updates.push({ id: match.id, changes });
    else createPayload.push({
      organization_id: organizationId,
      identity_status: "provisional",
      ...changes,
    });
  }

  for (let index = 0; index < createPayload.length; index += 250) {
    await rest(session, "officials", {
      method: "POST",
      body: JSON.stringify(createPayload.slice(index, index + 250)),
    }, "return=minimal");
  }
  for (const update of updates) {
    await rest(session, `officials?id=eq.${enc(update.id)}`, {
      method: "PATCH",
      body: JSON.stringify(update.changes),
    }, "return=minimal");
  }
  await rest(session, "import_jobs", {
    method: "POST",
    body: JSON.stringify({
      organization_id: organizationId,
      uploaded_by: profile.id,
      source: "assignr_officials_csv",
      file_name: fileName,
      row_count: rows.length,
      status: conflicts.length ? "completed_with_warnings" : "completed",
      errors: conflicts,
    }),
  }, "return=minimal");
  return {
    created: createPayload.length,
    updated: updates.length,
    missingEmail: rows.filter((row) => !row.primary_email).length,
    conflicts,
  };
}

export async function saveAssessment(
  session: Law18Session,
  organizationId: string,
  values: Omit<AssessmentRecord, "id" | "coach_id" | "submitted_at">,
  targetAssessmentId?: string | null,
) {
  const rows = await rest<AssessmentRecord[]>(
    session,
    "rpc/save_rating",
    {
      method: "POST",
      body: JSON.stringify({
        payload: { ...values, organization_id: organizationId },
        target_assessment: targetAssessmentId || null,
      }),
    },
    "return=representation",
  );
  const saved = rows[0];
  if (!saved?.id) throw new Error("The rating was not confirmed by the database. Please try saving again.");
  return saved;
}

export async function saveAssessmentsBatch(
  session: Law18Session,
  organizationId: string,
  ratings: Array<{
    values: Omit<AssessmentRecord, "id" | "coach_id" | "submitted_at">;
    targetAssessmentId?: string | null;
  }>,
) {
  const items = ratings.map(({ values, targetAssessmentId }) => ({
    payload: { ...values, organization_id: organizationId },
    target_assessment: targetAssessmentId || null,
  }));
  try {
    const saved = await rest<AssessmentRecord[]>(session, "rpc/save_ratings_batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    }, "return=representation");
    if (saved.length !== ratings.length || saved.some((rating) => !rating?.id)) throw new Error("Not every crew rating was confirmed by the database.");
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("save_ratings_batch") && !message.includes("schema cache") && !message.includes("could not find the function")) throw error;
    return Promise.all(ratings.map(({ values, targetAssessmentId }) => saveAssessment(session, organizationId, values, targetAssessmentId)));
  }
}

export async function importTournament(
  session: Law18Session,
  profile: Profile,
  organizationId: string,
  details: {
    name: string;
    venue: string;
    startsOn: string;
    endsOn: string;
    fileName: string;
    eventId?: string;
  },
  rows: ImportRow[],
): Promise<TournamentImportResult> {
  if (!organizationId) throw new Error("Select a group before importing a schedule.");
  let event: EventRecord;
  if (details.eventId) {
    const existingEvents = await rest<EventRecord[]>(
      session,
      `events?id=eq.${enc(details.eventId)}&organization_id=eq.${enc(organizationId)}&select=*`,
    );
    const existingEvent = existingEvents[0];
    if (!existingEvent) throw new Error("The selected event is no longer available.");
    const updatedEvents = await rest<EventRecord[]>(
      session,
      `events?id=eq.${enc(existingEvent.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          starts_on: details.startsOn < existingEvent.starts_on ? details.startsOn : existingEvent.starts_on,
          ends_on: details.endsOn > existingEvent.ends_on ? details.endsOn : existingEvent.ends_on,
        }),
      },
      "return=representation",
    );
    event = updatedEvents[0] ?? existingEvent;
  } else {
    const slug = `${details.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    const events = await rest<EventRecord[]>(
      session,
      "events",
      {
        method: "POST",
        body: JSON.stringify({
          organization_id: organizationId,
          name: details.name,
          venue_name: details.venue,
          starts_on: details.startsOn,
          ends_on: details.endsOn,
          check_in_slug: slug,
          created_by: profile.id,
        }),
      },
      "return=representation",
    );
    event = events[0];
  }

  const assignmentRows = rows.filter((row) => row.official_name.trim());
  const existingOfficials = await loadOrganizationOfficials(session, organizationId, true);
  const existingOfficialsById = new Map(existingOfficials.map((official) => [official.id, official]));
  const resolveExistingOfficial = (official: OfficialRecord) => official.merged_into_official_id
    ? existingOfficialsById.get(official.merged_into_official_id) || official
    : official;
  const byName = new Map<string, OfficialRecord[]>();
  existingOfficials.forEach((official) => {
    const key = normalizeOfficialName(official.source_display_name || official.full_name);
    const resolved = resolveExistingOfficial(official);
    const matches = byName.get(key) || [];
    if (!matches.some((item) => item.id === resolved.id)) byName.set(key, [...matches, resolved]);
  });
  const byEmail = new Map(existingOfficials.filter((official) => official.email).map((official) => [
    official.email!.trim().toLowerCase(),
    resolveExistingOfficial(official),
  ]));
  const contactsByName = new Map<string, { fullName: string; email: string | null; phone: string | null }>();
  assignmentRows.forEach((row) => {
    const key = normalizeOfficialName(row.official_name);
    const current = contactsByName.get(key);
    contactsByName.set(key, {
      fullName: row.official_name,
      email: current?.email || row.official_email?.trim().toLowerCase() || null,
      phone: current?.phone || normalizePhoneNumber(row.official_phone) || null,
    });
  });
  const newOfficials: Record<string, unknown>[] = [];
  const contactUpdates: Array<{ id: string; changes: Record<string, unknown> }> = [];
  const conflicts: ScheduleImportConflict[] = [];
  const conflictKeys = new Set<string>();
  const recordEmailConflict = (contact: { fullName: string; email: string | null }, ownerId: string) => {
    if (!contact.email) return;
    const owner = existingOfficialsById.get(ownerId);
    const importedOwner = contactsByName.get(ownerId);
    const conflictKey = `${normalizeOfficialName(contact.fullName)}|${contact.email}|${ownerId}`;
    if (conflictKeys.has(conflictKey)) return;
    conflictKeys.add(conflictKey);
    conflicts.push({
      name: contact.fullName,
      field: "primary_email",
      value: contact.email,
      conflictingOfficial: owner?.full_name || importedOwner?.fullName || "another official",
      reason: "Primary email already belongs to a different official; email update skipped",
    });
  };
  const claimedEmails = new Map([...byEmail].map(([email, official]) => [email, official.id]));
  contactsByName.forEach((contact, key) => {
    const nameMatches = byName.get(key) || [];
    const emailMatch = contact.email ? byEmail.get(contact.email) : undefined;
    // A primary email can legitimately be shared (for example, by siblings).
    // Prefer an unambiguous imported display-name match so contact details and
    // assignments are never moved onto the other person's record.
    const matched = (nameMatches.length === 1 ? nameMatches[0] : undefined) || emailMatch;
    if (!matched) {
      const emailAvailable = contact.email && !claimedEmails.has(contact.email);
      if (contact.email && !emailAvailable) recordEmailConflict(contact, claimedEmails.get(contact.email)!);
      newOfficials.push({
        organization_id: organizationId,
        full_name: contact.fullName,
        email: emailAvailable ? contact.email : null,
        phone: contact.phone,
        source: "assignr_assignments",
        source_official_id: key,
        source_display_name: contact.fullName,
        identity_status: "provisional",
      });
      if (emailAvailable) claimedEmails.set(contact.email!, key);
      return;
    }
    if (matched.personal_contact_locked) {
      if (contact.email && claimedEmails.has(contact.email) && claimedEmails.get(contact.email) !== matched.id) {
        recordEmailConflict(contact, claimedEmails.get(contact.email)!);
      }
      return;
    }
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (contact.email && (!claimedEmails.has(contact.email) || claimedEmails.get(contact.email) === matched.id)) {
      changes.email = contact.email;
      claimedEmails.set(contact.email, matched.id);
    } else if (contact.email) {
      recordEmailConflict(contact, claimedEmails.get(contact.email)!);
    }
    if (contact.phone) changes.phone = contact.phone;
    if (!matched.linked_user_id) changes.source_display_name = contact.fullName;
    if (Object.keys(changes).length > 1) contactUpdates.push({ id: matched.id, changes });
  });
  if (newOfficials.length) {
    await rest(session, "officials", {
      method: "POST",
      body: JSON.stringify(newOfficials),
    }, "return=minimal");
  }
  for (const update of contactUpdates) {
    await rest(session, `officials?id=eq.${enc(update.id)}`, {
      method: "PATCH",
      body: JSON.stringify(update.changes),
    }, "return=minimal");
  }
  const officials = await loadOrganizationOfficials(session, organizationId, true);
  const officialsById = new Map(officials.map((official) => [official.id, official]));
  const resolveMergedOfficial = (official: OfficialRecord) =>
    official.merged_into_official_id
      ? officialsById.get(official.merged_into_official_id) || official
      : official;
  const officialByEmail = new Map(officials.filter((official) => official.email)
    .map((official) => [official.email!.trim().toLowerCase(), resolveMergedOfficial(official)]));
  const officialByName = new Map<string, OfficialRecord[]>();
  officials.forEach((official) => {
    const key = normalizeOfficialName(official.source_display_name || official.full_name);
    const resolved = resolveMergedOfficial(official);
    const current = officialByName.get(key) || [];
    if (!current.some((item) => item.id === resolved.id)) officialByName.set(key, [...current, resolved]);
  });

  const uniqueGames = [...new Map(rows.map((row) => [
    row.external_id,
    {
      event_id: event.id,
      external_id: row.external_id,
      starts_at: zonedLocalDateTimeToIso(row.date, row.start_time, event.timezone || "America/New_York"),
      field_name: row.field,
      venue_name: row.venue,
      home_team: row.home_team,
      away_team: row.away_team,
      division: row.division,
      age_group: row.age_group || null,
      gender: row.gender || null,
      game_type: row.game_type || null,
      operational: isOperationalGame(row),
    },
  ])).values()];
  const games = await rest<GameRecord[]>(
    session,
    "games?on_conflict=event_id,external_id",
    { method: "POST", body: JSON.stringify(uniqueGames) },
    "resolution=merge-duplicates,return=representation",
  );
  const gameByExternalId = new Map(games.map((game) => [game.external_id, game]));
  const organizationRows = await rest<Pick<OrganizationRecord, "position_title_aliases">[]>(
    session,
    `organizations?id=eq.${enc(organizationId)}&select=position_title_aliases`,
  );
  const positionAliases = {
    ...(organizationRows[0]?.position_title_aliases || {}),
    ...(event.position_title_aliases || {}),
  };
  const nextCrewOrder = new Map<string, number>();
  const assignmentPayload = assignmentRows.map((row) => {
    const gameId = gameByExternalId.get(row.external_id)?.id;
    const nameMatches = officialByName.get(normalizeOfficialName(row.official_name)) || [];
    const emailMatch = row.official_email ? officialByEmail.get(row.official_email)?.id : undefined;
    const officialId = (nameMatches.length === 1 ? nameMatches[0].id : undefined) || emailMatch;
    if (!gameId || !officialId) throw new Error(`Unable to match assignment for game ${row.external_id}.`);
    const crewOrder = nextCrewOrder.get(row.external_id) || 0;
    nextCrewOrder.set(row.external_id, crewOrder + 1);
    return {
      game_id: gameId,
      official_id: officialId,
      position: normalizePosition(row.position),
      position_title: positionAliases[positionAliasKey(row.position)] || row.position.trim() || "Official",
      source_position_title: row.position.trim() || "Official",
      crew_order: crewOrder,
      accepted: true,
    };
  });
  let assignmentsToWrite = assignmentPayload;
  if (details.eventId) {
    const importedGameIds = [...new Set(rows.map((row) => gameByExternalId.get(row.external_id)?.id).filter((id): id is string => Boolean(id)))];
    const existingAssignments = importedGameIds.length ? await rest<AssignmentRecord[]>(
      session,
      `assignments?game_id=in.(${importedGameIds.join(",")})&select=*&order=crew_order.asc,id.asc`,
    ) : [];
    const crewSignature = (crew: Array<Pick<AssignmentRecord, "official_id" | "position" | "position_title" | "source_position_title" | "crew_order">>) => JSON.stringify(crew.map((assignment, index) => ({
      official_id: assignment.official_id,
      position: assignment.position,
      position_title: assignment.position_title || "",
      source_position_title: assignment.source_position_title || "",
      crew_order: assignment.crew_order ?? index,
    })));
    const changedGameIds = new Set(importedGameIds.filter((gameId) => {
      const existingCrew = existingAssignments.filter((assignment) => assignment.game_id === gameId);
      const incomingCrew = assignmentPayload.filter((assignment) => assignment.game_id === gameId);
      // A schedule-only export updates the game without implicitly removing a
      // crew imported earlier from a staffed export. Crew removal remains an
      // explicit assignment edit rather than a side effect of blank columns.
      if (!incomingCrew.length) return false;
      return crewSignature(existingCrew) !== crewSignature(incomingCrew);
    }));
    await Promise.all([...changedGameIds].map((gameId) => rest(
      session,
      `assignments?game_id=eq.${enc(gameId)}`,
      { method: "DELETE" },
      "return=minimal",
    )));
    assignmentsToWrite = assignmentPayload.filter((assignment) => changedGameIds.has(assignment.game_id));
  }
  if (assignmentsToWrite.length) {
    await rest(
      session,
      "assignments?on_conflict=game_id,official_id,position",
      { method: "POST", body: JSON.stringify(assignmentsToWrite) },
      "resolution=merge-duplicates,return=minimal",
    );
  }
  await rest(
    session,
    "import_jobs",
    {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        event_id: event.id,
        uploaded_by: profile.id,
        source: "assignr_assignments_csv",
        file_name: details.fileName,
        row_count: rows.length,
        status: conflicts.length ? "completed_with_warnings" : "completed",
        errors: conflicts,
      }),
    },
    "return=minimal",
  );
  return { event, conflicts };
}

export async function createOfficial(
  session: Law18Session,
  organizationId: string,
  values: { first_name: string; last_name: string; email?: string | null; secondary_email?: string | null; date_of_birth?: string | null; phone?: string | null; badge_level?: string | null; ussf_id?: string | null; external_check_in_other?: string | null; pending_org_roles?: MembershipRole[] },
) {
  const fullName = `${values.first_name.trim()} ${values.last_name.trim()}`.trim();
  const rows = await rest<OfficialRecord[]>(session, "officials", {
    method: "POST",
    body: JSON.stringify({
      organization_id: organizationId,
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      full_name: fullName,
      email: values.email?.trim().toLowerCase() || null,
      secondary_email: values.secondary_email?.trim().toLowerCase() || null,
      date_of_birth: values.date_of_birth || null,
      phone: normalizePhoneNumber(values.phone) || null,
      badge_level: values.badge_level?.trim() || null,
      ussf_id: values.ussf_id?.trim() || null,
      external_check_in_other: values.external_check_in_other?.trim() || null,
      pending_org_role: values.pending_org_roles?.[0] || "referee",
      pending_org_roles: values.pending_org_roles?.length ? values.pending_org_roles : ["referee"],
      source: "manual",
      source_display_name: fullName,
      identity_status: "provisional",
    }),
  }, "return=representation");
  return rows[0];
}

export async function updateOfficial(
  session: Law18Session,
  official: OfficialRecord,
  values: { first_name: string; last_name: string; email?: string | null; secondary_email?: string | null; date_of_birth?: string | null; phone?: string | null; badge_level?: string | null; ussf_id?: string | null; external_check_in_other?: string | null; pending_org_roles?: MembershipRole[] },
  syncMembershipRoles = false,
) {
  const email = values.email?.trim().toLowerCase() || null;
  const existing = email
    ? await rest<Pick<OfficialRecord, "id">[]>(
      session,
      `officials?organization_id=eq.${enc(official.organization_id)}&email=ilike.${enc(email)}&id=neq.${enc(official.id)}&select=id`,
    )
    : [];
  if (existing.length) throw new Error("That primary email is already used by another official in this group.");

  const intendedRoles = values.pending_org_roles?.length ? values.pending_org_roles : ["referee" as MembershipRole];
  const changes = official.linked_user_id && official.personal_contact_locked
    ? {
      badge_level: values.badge_level?.trim() || null,
      ussf_id: values.ussf_id?.trim() || null,
      external_check_in_other: values.external_check_in_other?.trim() || null,
      pending_org_role: intendedRoles[0],
      pending_org_roles: intendedRoles,
      updated_at: new Date().toISOString(),
    }
    : {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      full_name: `${values.first_name.trim()} ${values.last_name.trim()}`.trim(),
      email,
      secondary_email: values.secondary_email?.trim().toLowerCase() || null,
      date_of_birth: values.date_of_birth || null,
      phone: normalizePhoneNumber(values.phone) || null,
      badge_level: values.badge_level?.trim() || null,
      ussf_id: values.ussf_id?.trim() || null,
      external_check_in_other: values.external_check_in_other?.trim() || null,
      pending_org_role: intendedRoles[0],
      pending_org_roles: intendedRoles,
      updated_at: new Date().toISOString(),
    };

  try {
    const rows = await rest<OfficialRecord[]>(session, `officials?id=eq.${enc(official.id)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }, "return=representation");
    if (official.linked_user_id && syncMembershipRoles) {
      const managedRoles = ["organization_director", "organization_admin", "assignor", "referee_coach", "referee"];
      const existingMemberships = await rest<{ role: MembershipRole }[]>(
        session,
        `organization_memberships?organization_id=eq.${enc(official.organization_id)}&user_id=eq.${enc(official.linked_user_id)}&select=role`,
      );
      const existingRoles = new Set(existingMemberships.map((membership) => membership.role));
      const removedRoles = managedRoles.filter((role) => !intendedRoles.includes(role as MembershipRole));
      if (removedRoles.length) {
        await rest(session,
          `organization_memberships?organization_id=eq.${enc(official.organization_id)}&user_id=eq.${enc(official.linked_user_id)}&role=in.(${removedRoles.join(",")})`,
          { method: "DELETE" },
          "return=minimal",
        );
      }
      const addedRoles = intendedRoles.filter((role) => !existingRoles.has(role));
      if (addedRoles.length) await rest(session, "organization_memberships?on_conflict=organization_id,user_id,role", {
        method: "POST",
        body: JSON.stringify(addedRoles.map((role) => ({
          organization_id: official.organization_id,
          user_id: official.linked_user_id,
          role,
          status: "active",
        }))),
      }, "resolution=merge-duplicates,return=minimal");
    }
    return rows[0];
  } catch (reason) {
    if (reason instanceof Error && /unique|duplicate/i.test(reason.message)) {
      throw new Error("That primary email is already used by another official in this group.");
    }
    throw reason;
  }
}

export async function createGame(
  session: Law18Session,
  eventId: string,
  values: { starts_at: string; field_name: string; home_team: string; away_team: string; division?: string },
) {
  const rows = await rest<GameRecord[]>(session, "games", {
    method: "POST",
    body: JSON.stringify({
      event_id: eventId,
      external_id: `manual-${Date.now().toString(36)}`,
      starts_at: values.starts_at,
      field_name: values.field_name.trim(),
      home_team: values.home_team.trim(),
      away_team: values.away_team.trim(),
      division: values.division?.trim() || "",
    }),
  }, "return=representation");
  return rows[0];
}

export async function updateGameDetails(
  session: Law18Session,
  gameId: string,
  values: Pick<GameRecord, "starts_at" | "field_name" | "venue_name" | "home_team" | "away_team" | "division" | "age_group" | "gender" | "game_type" | "operational" | "tags">,
) {
  return rest<GameRecord>(session, "rpc/update_game_details", {
    method: "POST",
    body: JSON.stringify({ game_uuid: gameId, requested_game: values }),
  });
}

export async function replaceGameAssignments(
  session: Law18Session,
  gameId: string,
  assignments: Array<Pick<AssignmentRecord, "official_id" | "position" | "position_title" | "source_position_title">>,
) {
  return rest<AssignmentRecord[]>(session, "rpc/replace_game_assignments", {
    method: "POST",
    body: JSON.stringify({ game_uuid: gameId, requested_assignments: assignments }),
  });
}

export async function swapGameAssignments(
  session: Law18Session,
  firstAssignmentId: string,
  secondAssignmentId: string,
) {
  return rest<{ event_id: string; first_game_id: string; second_game_id: string }>(session, "rpc/swap_game_assignments", {
    method: "POST",
    body: JSON.stringify({
      first_assignment_uuid: firstAssignmentId,
      second_assignment_uuid: secondAssignmentId,
    }),
  });
}

export async function swapGameCrews(
  session: Law18Session,
  firstGameId: string,
  secondGameId: string,
) {
  return rest<{ event_id: string; first_game_id: string; second_game_id: string; crew_size: number }>(session, "rpc/swap_game_crews", {
    method: "POST",
    body: JSON.stringify({
      first_game_uuid: firstGameId,
      second_game_uuid: secondGameId,
    }),
  });
}

export async function swapGameDetails(session: Law18Session, firstGameId: string, secondGameId: string, moveCrewsWithGame = false) {
  return rest<{ event_id: string; first_game_id: string; second_game_id: string; crews_moved_with_games: boolean; crew_size: number | null }>(session, "rpc/swap_game_details_with_options", {
    method: "POST",
    body: JSON.stringify({ first_game_uuid: firstGameId, second_game_uuid: secondGameId, move_crews_with_game: moveCrewsWithGame }),
  });
}

export async function confirmGameScheduleChange(session: Law18Session, gameId: string) {
  return rest<GameRecord>(session, "rpc/confirm_game_schedule_change", {
    method: "POST",
    body: JSON.stringify({ game_uuid: gameId }),
  });
}

export async function loadOfficialEventDayContext(session: Law18Session, eventId: string, officialId: string, eventDate: string) {
  return rest<OfficialEventDayContext>(session, "rpc/official_event_day_context", {
    method: "POST",
    body: JSON.stringify({ target_event: eventId, target_official: officialId, target_date: eventDate }),
  });
}

export async function assignEventRole(
  session: Law18Session,
  eventId: string,
  userId: string,
  role: "event_admin" | "assignor" | "site_coordinator" | "referee_coach" | "referee",
  ratingsHistoryScope: "none" | "specific" | "all" = "none",
  ratingsEventIds: string[] = [],
) {
  return rest<EventMembership[]>(session, "event_memberships?on_conflict=event_id,user_id,role", {
    method: "POST",
    body: JSON.stringify({
      event_id: eventId,
      user_id: userId,
      role,
      ratings_history_scope: ratingsHistoryScope,
      ratings_event_ids: ratingsEventIds,
      created_by: session.user.id,
    }),
  }, "resolution=merge-duplicates,return=representation");
}

export async function loadUserEventMemberships(
  session: Law18Session,
  eventId: string,
  userId: string,
) {
  return rest<EventMembership[]>(
    session,
    `event_memberships?event_id=eq.${enc(eventId)}&user_id=eq.${enc(userId)}&select=*`,
  );
}

export async function loadProvisionalEventAccess(session: Law18Session, eventId: string, officialId: string) {
  const rows = await rest<ProvisionalEventAccess[]>(session, `provisional_event_access?event_id=eq.${enc(eventId)}&official_id=eq.${enc(officialId)}&select=*`);
  return rows[0] || null;
}

export async function saveProvisionalEventAccess(
  session: Law18Session,
  eventId: string,
  officialId: string,
  roles: Exclude<MembershipRole, "site_owner" | "organization_director" | "organization_admin">[],
  options: { fullScheduleAccess: boolean; coachingToolsEnabled: boolean; ratingsHistoryScope: "none" | "specific" | "all"; ratingsEventIds: string[]; assignedGameIds: string[]; assignedDates?: string[]; assignedSites?: string[]; assignmentEditingOverride?: boolean | null },
) {
  return rest<ProvisionalEventAccess>(session, "rpc/save_provisional_event_access_v2", {
    method: "POST",
    body: JSON.stringify({
      official_uuid: officialId,
      event_uuid: eventId,
      requested_roles: roles.length ? roles : ["referee"],
      requested_full_schedule: options.fullScheduleAccess,
      requested_coaching_tools: options.coachingToolsEnabled,
      requested_ratings_scope: options.ratingsHistoryScope,
      requested_ratings_events: options.ratingsEventIds,
      requested_game_ids: options.assignedGameIds,
      requested_dates: options.assignedDates || [],
      requested_sites: options.assignedSites || [],
      requested_assignment_editing_override: options.assignmentEditingOverride ?? null,
    }),
  });
}

export async function saveUserEventAccess(
  session: Law18Session,
  eventId: string,
  userId: string,
  roles: Exclude<MembershipRole, "site_owner" | "organization_director" | "organization_admin">[],
  options: {
    fullScheduleAccess: boolean;
    coachingToolsEnabled: boolean;
    ratingsHistoryScope: "none" | "specific" | "all";
    ratingsEventIds: string[];
    assignedGameIds: string[];
    assignedDates?: string[];
    assignedSites?: string[];
    assignmentEditingOverride?: boolean | null;
    preserveEventAdmin?: boolean;
  },
) {
  const managedRoles = options.preserveEventAdmin
    ? roles.filter((role) => role !== "event_admin")
    : roles;
  await rest(
    session,
    `event_memberships?event_id=eq.${enc(eventId)}&user_id=eq.${enc(userId)}${options.preserveEventAdmin ? "&role=neq.event_admin" : ""}`,
    { method: "DELETE" },
    "return=minimal",
  );
  if (!managedRoles.length) return [];
  return rest<EventMembership[]>(
    session,
    "event_memberships",
    {
      method: "POST",
      body: JSON.stringify(managedRoles.map((role) => ({
        event_id: eventId,
        user_id: userId,
        role,
        full_schedule_access: options.fullScheduleAccess,
        coaching_tools_enabled: options.coachingToolsEnabled,
        ratings_history_scope: options.ratingsHistoryScope,
        ratings_event_ids: options.ratingsEventIds,
        assigned_game_ids: options.fullScheduleAccess ? [] : options.assignedGameIds,
        assigned_dates: options.fullScheduleAccess ? [] : options.assignedDates || [],
        assigned_sites: options.fullScheduleAccess ? [] : options.assignedSites || [],
        assignment_editing_override: options.assignmentEditingOverride ?? null,
        created_by: session.user.id,
      }))),
    },
    "return=representation",
  );
}
