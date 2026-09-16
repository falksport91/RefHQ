"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent } from "react";
import jsQR from "jsqr";
import { QRCodeSVG } from "qrcode.react";
import { AuthPanel } from "./auth-panel";
import { Documentation } from "./documentation";
import { auth, isSessionExpiredError, type Law18Session } from "./auth-client";
import {
  archiveEvent,
  addOfficialsToGroup,
  addCalendarFeed,
  approvePublicRating,
  bulkManageRecords,
  checkIn,
  confirmExternalCheckIn,
  confirmGameScheduleChange,
  claimOrganizationJoinLink,
  createCoachAssignment,
  createOfficialsExportCsv,
  createOrganizationJoinLink,
  beginOrganizationAction,
  completeOrganizationAction,
  configureEventAutoArchive,
  createEvent,
  createGame,
  createOfficial,
  createOrganization,
  createAppearanceCampaign,
  deleteAppearanceCampaign,
  deleteAppearanceTheme,
  deleteCoachAssignment,
  deleteRating,
  findExternalCheckIn,
  importTournament,
  importOfficials,
  leaveCurrentOrganization,
  linkCurrentReferee,
  loadEventData,
  loadEventDocuments,
  loadMyRulesDocuments,
  loadMyAssignmentSharedRatings,
  loadEvents,
  loadAppearanceCampaigns,
  loadAppearanceThemes,
  loadArchivedEvents,
  loadAuthorizedRatingHistory,
  loadCalendarFeedConnections,
  loadEventCheckIns,
  loadEventAttendanceOverrides,
  loadOfficialEventDayContext,
  loadExternalCheckInConfig,
  loadOrganization,
  loadOrganizationActivity,
  loadUserNotifications,
  loadOrganizationJoinLinks,
  loadOrganizations,
  loadGroupsAvailableForOfficialAddition,
  loadOrganizationOfficials,
  loadProfile,
  loadProvisionalEventAccess,
  loadUnifiedAssignments,
  loadMemberships,
  loadUserEventMemberships,
  logRatingExport,
  logScheduleExport,
  logOfficialsExport,
  mergeOrganizationAccounts,
  markEventRatingsSeen,
  markUserNotificationsRead,
  parseAssignrCsv,
  parseGotSportWorksheet,
  parseAssignrOfficialsCsv,
  saveAssessmentsBatch,
  submitDraftRating,
  swapSameGameRatings,
  saveProvisionalEventAccess,
  setRatingAverageInclusion,
  setRatingArchived,
  setAttendanceExpected,
  saveUserEventAccess,
  restoreDefaultAppearance,
  restoreEvent,
  saveAppearanceTheme,
  reactivateOrganization,
  replaceGameAssignments,
  recordCurrentActivity,
  removeOrganizationMember,
  removeCalendarFeed,
  setOrganizationJoinLinkActive,
  setCalendarFeedActive,
  splitOfficialName,
  swapGameAssignments,
  swapGameCrews,
  swapGameDetails,
  syncCalendarFeed,
  updateOrganizationSettings,
  updateGameDetails,
  updateOfficial,
  updateEventRatingSettings,
  updateEventSettings,
  updatePositionTitleAliases,
  uploadAppearanceLogo,
  uploadOrganizationLogo,
  uploadEventDocument,
  openEventDocument,
  positionAliasKey,
  updateOwnProfile,
  updateDisplayPreferences,
  undoCheckIn,
  zonedLocalDateTimeToIso,
  type AssignmentRecord,
  type CheckInRecord,
  type AttendanceExpectationOverride,
  type CalendarFeedConnection,
  type CoachAssignmentRecord,
  type EventRecord,
  type EventMembership,
  type EventDocumentRecord,
  type EventFeatureKey,
  type EventFeatureSettings,
  type GameRecord,
  type ExternalCheckInConfig,
  type ExternalCheckInField,
  type ExternalCheckInLookup,
  type ImportRow,
  type GotSportSheetImport,
  type OfficialRecord,
  type OfficialImportRow,
  type OfficialImportResult,
  type OfficialEventDayContext,
  type AssessmentRecord,
  type AssignmentSharedRating,
  type MembershipRole,
  type OrganizationRecord,
  type AuditRecord,
  type Profile,
  type ProvisionalEventAccess,
  type UnifiedAssignment,
  type UserNotification,
} from "./supabase-client";

import type { ScheduleExportRow, SchedulePdfOptions } from "./schedule-export";
import { normalizePhoneNumber, phoneCallHref } from "./phone";
import { TurnstileChallenge, turnstileEnabled } from "./turnstile";

const APP_VERSION = "0.43.0";
const AUTOMATIC_RECOVERY_KEY = "law18ref-automatic-recovery";

async function reloadFreshApplication(reason: string) {
  const previous = Number(sessionStorage.getItem(AUTOMATIC_RECOVERY_KEY) || 0);
  if (Date.now() - previous < 30_000) return false;
  sessionStorage.setItem(AUTOMATIC_RECOVERY_KEY, String(Date.now()));
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("law18referee-")).map((name) => caches.delete(name)));
    }
  } finally {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("recovered", `${APP_VERSION}-${reason}-${Date.now()}`);
    window.location.replace(nextUrl.toString());
  }
  return true;
}

function AutomaticRecovery({ reason }: { reason: string }) {
  const [retryAvailable, setRetryAvailable] = useState(false);
  useEffect(() => {
    void reloadFreshApplication(reason).then((started) => {
      if (!started) setRetryAvailable(true);
    });
  }, [reason]);
  if (retryAvailable) return <main className="auth-page"><section className="auth-card"><h1>Law18Ref Could Not Connect</h1><p>Check your internet connection and try again.</p><button className="primary wide" onClick={() => { sessionStorage.removeItem(AUTOMATIC_RECOVERY_KEY); void reloadFreshApplication(reason); }}>Try Again</button></section></main>;
  return <main className="auth-page"><p className="auth-loading">Loading Dashboard</p></main>;
}

type View = "dashboard" | "board" | "my_assignments" | "checkin" | "schedule" | "officials" | "coaching" | "assessments" | "import" | "event_settings" | "activity" | "appearance" | "account" | "groups" | "documentation";
const refreshableViews: View[] = ["dashboard", "board", "my_assignments", "checkin", "schedule", "officials", "coaching", "assessments", "import", "event_settings", "activity", "appearance", "account", "groups", "documentation"];
type EventData = {
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

const activeFilterMemory = new Map<string, unknown>();

function personLastNameSortKey(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const suffixes = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);
  const lastNameIndex = parts.length > 1 && suffixes.has(parts.at(-1)!.toLowerCase()) ? parts.length - 2 : parts.length - 1;
  return `${parts[lastNameIndex] || ""}\u0000${fullName}`;
}

function comparePeopleByLastName(left: OfficialRecord, right: OfficialRecord) {
  const leftKey = `${left.last_name || splitOfficialName(left.full_name).last_name}\u0000${left.first_name || splitOfficialName(left.full_name).first_name}`;
  const rightKey = `${right.last_name || splitOfficialName(right.full_name).last_name}\u0000${right.first_name || splitOfficialName(right.full_name).first_name}`;
  return leftKey.localeCompare(rightKey, undefined, { numeric: true, sensitivity: "base" });
}

function officialSelectorLabel(official: Pick<OfficialRecord, "full_name" | "first_name" | "last_name">) {
  const parsed = splitOfficialName(official.full_name);
  const firstName = official.first_name?.trim() || parsed.first_name;
  const lastName = official.last_name?.trim() || parsed.last_name;
  return lastName ? `${lastName}, ${firstName}` : firstName;
}

function useActiveFilterState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => (activeFilterMemory.get(key) as T | undefined) ?? initialValue);
  useEffect(() => { activeFilterMemory.set(key, value); }, [key, value]);
  return [value, setValue] as const;
}

function SavedFilterControls<T>({ filterKey, value, onApply }: { filterKey: string; value: T; onApply: (value: T) => void }) {
  const storageKey = `law18ref-filter-presets:${filterKey}`;
  const [presets, setPresets] = useState<{ name: string; value: T }[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const save = () => {
    const name = window.prompt("Name this filter setup:")?.trim();
    if (!name) return;
    const next = [...presets.filter((preset) => preset.name !== name), { name, value }];
    setPresets(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };
  return <div className="saved-filter-controls"><button className="secondary" type="button" onClick={save}>Save Filter</button><select aria-label="Saved filters" defaultValue="" onChange={(event) => { const preset = presets.find((item) => item.name === event.target.value); if (preset) onApply(preset.value); event.target.value = ""; }}><option value="">Load Saved Filter</option>{presets.map((preset) => <option value={preset.name} key={preset.name}>{preset.name}</option>)}</select></div>;
}

function Mark() {
  return <span className="logo-lockup"><img src="/logo-draft-law18referee-management-v4.png" alt="Law18Referee Management" /></span>;
}

const defaultLogoUrl = "/logo-draft-law18referee-management-v4.png";

function displayAppearance(campaign?: { primary_color: string | null; accent_color: string | null; logo_url: string | null }) {
  const primaryVariables = ["--green", "--chrome", "--footer", "--nav-active"];
  const accentVariables = ["--berry", "--nav-underline", "--event-mark"];
  primaryVariables.forEach((variable) => campaign?.primary_color
    ? document.documentElement.style.setProperty(variable, campaign.primary_color)
    : document.documentElement.style.removeProperty(variable));
  accentVariables.forEach((variable) => campaign?.accent_color
    ? document.documentElement.style.setProperty(variable, campaign.accent_color)
    : document.documentElement.style.removeProperty(variable));
  document.querySelectorAll<HTMLImageElement>(".logo-lockup img").forEach((image) => {
    image.src = campaign?.logo_url || defaultLogoUrl;
  });
}

function initials(name: string) {
  return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function PhoneLink({ phone, fallback = "No phone listed", className }: { phone?: string | null; fallback?: string; className?: string }) {
  if (!phone) return <span className={className}>{fallback}</span>;
  return <a className={className ? `${className} phone-link` : "phone-link"} href={phoneCallHref(phone)}>{normalizePhoneNumber(phone)}</a>;
}

const roleNames: Record<MembershipRole, string> = {
  site_owner: "Site Owner",
  organization_director: "Group Director",
  organization_admin: "Group Admin",
  event_admin: "Event Admin",
  assignor: "Assignor",
  site_coordinator: "Site Supervisor",
  referee_coach: "Referee Coach",
  referee: "Referee",
};
const organizationRoleChoices: MembershipRole[] = ["organization_director", "organization_admin", "assignor", "referee_coach", "referee"];

function formatTime(value: string) {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function dateTimeLocalValue(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function checkInMethodLabel(method: string) {
  if (method === "assignor") return "Manual check-in";
  if (method === "guest_qr") return "External check-in";
  if (method === "qr" || method === "app") return "Account check-in";
  return "Check-in recorded";
}

function timeSortValue(value: string) {
  const parts = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function formatDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat([], { weekday: "long", month: "short", day: "numeric" }).format(date);
}

function isRateableGame(game: GameRecord) {
  return !game.operational
    && !`${game.field_name} ${game.venue_name || ""}`.toLowerCase().includes("hq");
}

function positionLabel(position: AssignmentRecord["position"], importedTitle?: string | null) {
  if (importedTitle?.trim()) return importedTitle.trim();
  return {
    referee: "Referee",
    assistant_referee: "Assistant Referee",
    fourth_official: "Fourth Official",
    mentor: "Mentor",
    referee_coach: "Referee Coach",
    site_coordinator: "Site Coordinator",
    site_supervisor: "Site Supervisor",
    standby: "Standby",
    other: "Official",
  }[position];
}

function crewPositionPriority(assignment: AssignmentRecord) {
  const title = `${assignment.position_title || ""} ${assignment.source_position_title || ""}`.trim().toLowerCase();
  const assistantTitle = title.match(/(?:^|\s)(?:ar|assistant referee|asst\.? referee)\s*#?\s*(\d+)?(?=\s|$)/);
  if (assignment.position === "referee" || /^(center |centre )?referee$/.test(title)) return 0;
  if (assignment.position === "assistant_referee" || assistantTitle) {
    const ordinal = assistantTitle?.[1];
    return 100 + (ordinal ? Number(ordinal) : 50);
  }
  if (assignment.position === "fourth_official" || /\b(4th|fourth) official\b/.test(title)) return 300;
  return 400;
}

function sortGameCrew(assignments: AssignmentRecord[]) {
  return assignments.map((assignment, sourceIndex) => ({ assignment, sourceIndex }))
    .sort((a, b) => crewPositionPriority(a.assignment) - crewPositionPriority(b.assignment) || (a.assignment.crew_order ?? a.sourceIndex) - (b.assignment.crew_order ?? b.sourceIndex) || a.sourceIndex - b.sourceIndex)
    .map(({ assignment }) => assignment);
}

function Status({ checked, due = false }: { checked: boolean; due?: boolean }) {
  return <span className={`status ${checked ? "checked-in" : due ? "due-soon" : ""}`}><b />{checked ? "Checked in" : due ? "Due soon" : "Expected"}</span>;
}

function RefreshCheckInsButton({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshAttendance = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };
  return <button className="secondary refresh-checkins-button" type="button" disabled={refreshing} onClick={() => void refreshAttendance()}>{refreshing ? "Refreshing…" : "Refresh Check-Ins"}</button>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="panel empty-state"><span>◎</span><p>{children}</p></div>;
}

function EventDocumentLink({ session, document, compact = false }: { session: Law18Session; document: EventDocumentRecord; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function open() {
    setBusy(true); setMessage("");
    try { await openEventDocument(session, document); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to open this document."); }
    finally { setBusy(false); }
  }
  return <span className={`event-document-link${compact ? " compact" : ""}`}><button className={compact ? "text-button" : "secondary"} disabled={busy} onClick={() => void open()}>{busy ? "Opening…" : document.document_type === "rules_of_competition" ? "ROC — Rules of Competition" : document.title}</button>{message && <small>{message}</small>}</span>;
}

function administrativeRatingAverage(officialId: string, position: AssignmentRecord["position"], eventId: string, currentData: EventData, history: { assessments: AssessmentRecord[]; games: GameRecord[]; assignments: AssignmentRecord[] }, preferences?: Profile["rating_average_preferences"], matchPosition = preferences?.match_position || false) {
  const source = preferences?.event_scope === "organization" ? history : currentData;
  const gameMap = new Map(source.games.map((game) => [game.id, game]));
  const scores = source.assessments.filter((assessment) => {
    if (assessment.official_id !== officialId || assessment.status === "draft" || assessment.include_in_averages === false) return false;
    const game = gameMap.get(assessment.game_id);
    if (!game || (preferences?.event_scope !== "organization" && game.event_id !== eventId)) return false;
    const date = game.starts_at.slice(0, 10);
    if (preferences?.from && date < preferences.from) return false;
    if (preferences?.through && date > preferences.through) return false;
    if (matchPosition) return source.assignments.some((assignment) => assignment.game_id === assessment.game_id && assignment.official_id === officialId && assignment.position === position);
    return true;
  }).map(assessmentScore).filter((score): score is number => score !== null);
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function ratingPositionShortLabel(position: AssignmentRecord["position"]) {
  return ({ referee: "Ref", assistant_referee: "AR", fourth_official: "4th", mentor: "Mentor", referee_coach: "Coach", site_coordinator: "Coordinator", site_supervisor: "Supervisor", standby: "Standby", other: "Position" } as const)[position];
}

function administrativeRatingLabel(officialId: string, position: AssignmentRecord["position"], eventId: string, currentData: EventData, history: { assessments: AssessmentRecord[]; games: GameRecord[]; assignments: AssignmentRecord[] }, preferences?: Profile["rating_average_preferences"]) {
  const mode = preferences?.display_mode || (preferences?.match_position ? "position" : "overall");
  const overall = administrativeRatingAverage(officialId, position, eventId, currentData, history, preferences, false);
  const positionAverage = administrativeRatingAverage(officialId, position, eventId, currentData, history, preferences, true);
  if (mode === "both") {
    if (positionAverage === null && overall === null) return "";
    return ` (${ratingPositionShortLabel(position)} ${positionAverage?.toFixed(1) || "—"}/Ovr ${overall?.toFixed(1) || "—"})`;
  }
  const average = mode === "position" ? positionAverage : overall;
  return average === null ? "" : ` (${average.toFixed(1)})`;
}

function OfficialEventScheduleModal({ session, official, event, data, initialDate, canEdit, siteSupervisorView, onClose, onEdit }: { session: Law18Session; official: OfficialRecord; event: EventRecord; data: EventData; initialDate?: string; canEdit: boolean; siteSupervisorView: boolean; onClose: () => void; onEdit: () => void }) {
  useEffect(() => {
    const scrollPosition = window.scrollY;
    const previous = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollPosition}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = previous.overflow;
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      window.scrollTo(0, scrollPosition);
    };
  }, []);
  const refereeGameIds = new Set(data.assignments.filter((assignment) => assignment.official_id === official.id).map((assignment) => assignment.game_id));
  const coachingAssignments = data.coachAssignments.filter((assignment) => assignment.coach_official_id === official.id || assignment.coach_id === official.linked_user_id);
  const coachingGameIds = new Set(coachingAssignments.filter((assignment) => !assignment.full_schedule && assignment.game_id).map((assignment) => assignment.game_id!));
  const coachesFullEvent = coachingAssignments.some((assignment) => assignment.full_schedule);
  const localGames = data.games.filter((game) => refereeGameIds.has(game.id) || coachingGameIds.has(game.id) || coachesFullEvent)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const availableDates = [...new Set(localGames.map((game) => new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at))))].sort();
  const [selectedDate, setSelectedDate] = useState(initialDate && availableDates.includes(initialDate) ? initialDate : defaultEventDate(availableDates, event.timezone, event.starts_on));
  const scheduleDialogRef = useRef<HTMLElement>(null);
  const [dayContext, setDayContext] = useState<OfficialEventDayContext | null>(null);
  const [contextMessage, setContextMessage] = useState("");
  const [showRatings, setShowRatings] = useState(false);
  useEffect(() => {
    scheduleDialogRef.current?.scrollTo({ top: 0, left: 0 });
  }, [official.id, selectedDate]);
  useEffect(() => {
    if (!siteSupervisorView) return;
    setContextMessage("");
    loadOfficialEventDayContext(session, event.id, official.id, selectedDate).then(setDayContext).catch((reason) => setContextMessage(reason instanceof Error ? reason.message : "Unable to load the full-day schedule."));
  }, [event.id, official.id, selectedDate, session, siteSupervisorView]);
  const contextOfficial = dayContext?.official || official;
  const officialRatings = data.assessments.filter((assessment) => assessment.official_id === official.id && assessment.status !== "draft");
  const ratingGames = new Map(data.games.map((game) => [game.id, game]));
  const contextGames = siteSupervisorView ? (dayContext?.games || []) : localGames.map((game) => ({ game, selected_position: data.assignments.find((item) => item.game_id === game.id && item.official_id === official.id)?.position || "referee" as const, selected_position_title: data.assignments.find((item) => item.game_id === game.id && item.official_id === official.id)?.position_title || null, within_management_scope: true, crew: sortGameCrew(data.assignments.filter((item) => item.game_id === game.id)).map((assignment) => ({ assignment, official_name: data.officials.find((person) => person.id === assignment.official_id)?.full_name || null })) }));
  const completionCutoff = Date.now() - (2 * 60 * 60 * 1000);
  return <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) onClose(); }}><section className="confirmation-dialog official-event-schedule-dialog" ref={scheduleDialogRef} role="dialog" aria-modal="true" aria-labelledby="official-event-schedule-title">
    <header><div><p className="eyebrow">{siteSupervisorView ? "FULL DAY SCHEDULE" : "FULL EVENT SCHEDULE"}</p><h2 id="official-event-schedule-title">{contextOfficial.full_name}</h2><p>{event.name} · {contextGames.length} assignment{contextGames.length === 1 ? "" : "s"}</p></div><div className="official-schedule-header-actions">{canEdit && <button className="secondary" onClick={() => setShowRatings((current) => !current)}>{showRatings ? "Hide Ratings" : `View Ratings (${officialRatings.length})`}</button>}{canEdit && <button className="secondary" onClick={onEdit}>Edit Official</button>}<button className="modal-close-button" aria-label="Close schedule" onClick={onClose}>×</button></div></header>
    <div className="official-contact-summary"><div><strong>Phone</strong><PhoneLink phone={contextOfficial.phone} /></div><div><strong>Primary Email</strong><span>{contextOfficial.email || "Not provided"}</span></div><div><strong>Secondary Email</strong><span>{contextOfficial.secondary_email || "Not provided"}</span></div><div><strong>Date of Birth</strong><span>{contextOfficial.date_of_birth ? formatDate(contextOfficial.date_of_birth) : "Not provided"}</span></div></div>
    {canEdit && showRatings && <section className="official-modal-ratings"><div className="official-modal-ratings-heading"><strong>Event Ratings</strong><small>{officialRatings.length} submitted rating{officialRatings.length === 1 ? "" : "s"}</small></div>{officialRatings.map((assessment) => { const ratedGame = ratingGames.get(assessment.game_id); return <article key={assessment.id}><div><strong>{ratedGame ? `${ratedGame.home_team} vs. ${ratedGame.away_team}` : "Game unavailable"}</strong><small>{ratedGame ? `${formatDate(ratedGame.starts_at)} · ${formatTime(ratedGame.starts_at)} · ${ratedGame.field_name}` : positionLabel(assessment.rated_position || "referee", assessment.rated_position_title)}</small></div><b>{assessmentScore(assessment)?.toFixed(1) || "—"}</b></article>; })}{!officialRatings.length && <p>No submitted ratings are available for this official in this event.</p>}</section>}
    {siteSupervisorView && <label className="official-schedule-date">Event Date<select value={selectedDate} onChange={(change) => setSelectedDate(change.target.value)}>{availableDates.map((date) => <option value={date} key={date}>{formatDate(date)}</option>)}</select></label>}
    {contextMessage && <p className="pilot-message">{contextMessage}</p>}
    <div className="official-event-schedule-list">{contextGames.map(({ game, selected_position, selected_position_title, within_management_scope, crew }) => {
      const selectedPosition = positionLabel(selected_position, selected_position_title);
      const completed = new Date(game.starts_at).getTime() <= completionCutoff;
      return <article className={`official-event-schedule-card ${completed ? "completed" : ""} ${within_management_scope ? "" : "outside-supervisor-scope"}`} key={game.id}>
        <div className="official-event-game-time"><time>{formatDate(game.starts_at)}</time><strong>{formatTime(game.starts_at)}</strong><span>{game.field_name}</span></div>
        <div className="official-event-game-details"><h3>{game.home_team} vs. {game.away_team}</h3><p>{[game.venue_name || event.venue_name, game.age_group, game.gender, game.division].filter(Boolean).join(" · ")}</p><div className="official-event-crew">{crew.map(({ assignment: crewAssignment, official_name }) => <span className={crewAssignment.official_id === official.id ? "selected" : ""} key={crewAssignment.id}><b>{positionLabel(crewAssignment.position, crewAssignment.position_title)}</b><strong>{official_name || "Open"}</strong></span>)}{!crew.length && <small>No referee crew is assigned.</small>}</div>{!within_management_scope && <small className="outside-scope-label">Outside your management scope · Read only</small>}</div>
        <span className="selected-position">{selectedPosition}</span>
      </article>;
    })}{!contextGames.length && <EmptyState>No assignments are available for this date.</EmptyState>}</div>
  </section></div>;
}

function AssignmentEditorDialog({ session, game, assignments, availableOfficials, onClose, onSaved }: { session: Law18Session; game: GameRecord; assignments: AssignmentRecord[]; availableOfficials: OfficialRecord[]; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [drafts, setDrafts] = useState(() => sortGameCrew(assignments).map((assignment) => ({ official_id: assignment.official_id, position: assignment.position, position_title: assignment.position_title || "", source_position_title: assignment.source_position_title || assignment.position_title || "" })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await replaceGameAssignments(session, game.id, drafts.filter((draft) => draft.official_id).map((draft) => ({ ...draft, position_title: draft.position_title.trim() || null, source_position_title: draft.source_position_title.trim() || null })));
      await onSaved();
      onClose();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update this crew.");
    } finally {
      setBusy(false);
    }
  }
  const selectableOfficials = availableOfficials.filter((official) => !official.archived_at && !official.merged_into_official_id).slice().sort(comparePeopleByLastName);
  const positions: AssignmentRecord["position"][] = ["referee", "assistant_referee", "fourth_official", "mentor", "referee_coach", "site_coordinator", "site_supervisor", "standby", "other"];
  return <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) onClose(); }}><section className="confirmation-dialog assignment-editor-dialog" role="dialog" aria-modal="true"><header><div><p className="eyebrow">POSTED SCHEDULE CORRECTION</p><h2>{game.home_team} vs. {game.away_team}</h2><p>{formatDate(game.starts_at)} · {formatTime(game.starts_at)} · {game.field_name}</p></div><button className="modal-close-button" aria-label="Close assignment editor" onClick={onClose}>×</button></header><p className="import-note">Changes update Law18Ref immediately. Officials are not notified and no acceptance is requested.</p><div className="assignment-editor-rows">{drafts.map((draft, index) => <div className="assignment-editor-row" key={index}><span className="assignment-row-number" aria-hidden="true">{index + 1}</span><label className="assignment-position-field">Position<select value={draft.position} onChange={(change) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, position: change.target.value as AssignmentRecord["position"] } : item))}>{positions.map((position) => <option value={position} key={position}>{positionLabel(position)}</option>)}</select></label><label className="assignment-official-field">Official<select value={draft.official_id} onChange={(change) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, official_id: change.target.value } : item))}><option value="">Open position</option>{selectableOfficials.map((official) => <option value={official.id} key={official.id}>{officialSelectorLabel(official)}</option>)}</select></label><button className="text-button assignment-remove-button" type="button" onClick={() => setDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button><label className="assignment-display-title">Display title (optional)<input value={draft.position_title} onChange={(change) => setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, position_title: change.target.value } : item))} placeholder={positionLabel(draft.position)} /></label></div>)}</div><button className="secondary add-assignment-row" type="button" onClick={() => setDrafts((current) => [...current, { official_id: "", position: "other", position_title: "", source_position_title: "" }])}>Add Assignment</button>{message && <p className="pilot-message assignment-editor-message">{message}</p>}<div className="assignment-editor-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Update Posted Schedule"}</button></div></section></div>;
}

function BoardGameInfoDialog({ session, event, game, onClose, onSaved }: { session: Law18Session; event: EventRecord; game: GameRecord; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [draft, setDraft] = useState({ starts_at: dateTimeLocalValue(game.starts_at, event.timezone), venue_name: game.venue_name || "", field_name: game.field_name, home_team: game.home_team, away_team: game.away_team, division: game.division || "", age_group: game.age_group || "", gender: game.gender || "", game_type: game.game_type || "", operational: game.operational });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    if (!draft.starts_at || !draft.field_name.trim() || !draft.home_team.trim() || !draft.away_team.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const [date, time] = draft.starts_at.split("T");
      await updateGameDetails(session, game.id, { ...draft, starts_at: zonedLocalDateTimeToIso(date, time, event.timezone), venue_name: draft.venue_name.trim() || null, field_name: draft.field_name.trim(), home_team: draft.home_team.trim(), away_team: draft.away_team.trim(), division: draft.division.trim(), age_group: draft.age_group.trim() || null, gender: draft.gender.trim() || null, game_type: draft.game_type.trim() || null });
      await onSaved();
      onClose();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update this game.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) onClose(); }}><section className="confirmation-dialog game-info-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="board-game-info-editor-title"><header><div><p className="eyebrow">GAME INFORMATION</p><h2 id="board-game-info-editor-title">Edit Game</h2><p>Source and import identifiers remain unchanged.</p></div><button className="modal-close-button" aria-label="Close game editor" onClick={onClose}>×</button></header><div className="game-info-editor-grid"><label>Date and time<input type="datetime-local" value={draft.starts_at} onChange={(change) => setDraft({ ...draft, starts_at: change.target.value })} /></label><label>Venue or site<input value={draft.venue_name} onChange={(change) => setDraft({ ...draft, venue_name: change.target.value })} /></label><label>Field<input value={draft.field_name} onChange={(change) => setDraft({ ...draft, field_name: change.target.value })} /></label><label>Home team<input value={draft.home_team} onChange={(change) => setDraft({ ...draft, home_team: change.target.value })} /></label><label>Away team<input value={draft.away_team} onChange={(change) => setDraft({ ...draft, away_team: change.target.value })} /></label><label>Division or competition<input value={draft.division} onChange={(change) => setDraft({ ...draft, division: change.target.value })} /></label><label>Age group<input value={draft.age_group} onChange={(change) => setDraft({ ...draft, age_group: change.target.value })} /></label><label>Gender<input value={draft.gender} onChange={(change) => setDraft({ ...draft, gender: change.target.value })} /></label><label>Game type<input value={draft.game_type} onChange={(change) => setDraft({ ...draft, game_type: change.target.value })} /></label><label className="game-operational-toggle"><input type="checkbox" checked={draft.operational} onChange={(change) => setDraft({ ...draft, operational: change.target.checked })} /><span><strong>Operational record</strong><small>Use for HQ, standby, coordinator, or similar non-match schedule records.</small></span></label></div><p className="import-note">No notification or acceptance request is sent. This game will be marked as updated.</p>{message && <p className="pilot-message">{message}</p>}<div className="game-info-editor-actions"><button className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy || !draft.starts_at || !draft.field_name.trim() || !draft.home_team.trim() || !draft.away_team.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save Game Information"}</button></div></section></div>;
}

function GameReportsButton({ ratedByViewer, ratedByAnother, onClick }: { ratedByViewer: boolean; ratedByAnother: boolean; onClick: () => void }) {
  if (!ratedByViewer && !ratedByAnother) return null;
  const colorState = ratedByViewer && ratedByAnother ? "rated-by-both" : ratedByViewer ? "rated-by-viewer" : "rated-by-other";
  return <button type="button" className={`game-rating-marker ${colorState}`} onClick={onClick}>View Reports</button>;
}

function BoardGameTile({ game, data, officials, eventTimezone, ratingLabel, viewerId, canViewOtherRatings, onSelectOfficial, onViewReports, onEditAssignments, onEditGameInfo, onConfirmChange, confirmingChange }: { game: GameRecord; data: EventData; officials: Map<string, OfficialRecord>; eventTimezone: string; ratingLabel?: (officialId: string, position: AssignmentRecord["position"]) => string; viewerId: string; canViewOtherRatings: boolean; onSelectOfficial: (officialId: string, eventDate?: string) => void; onViewReports?: (gameId: string) => void; onEditAssignments?: (game: GameRecord) => void; onEditGameInfo?: (game: GameRecord) => void; onConfirmChange?: (gameId: string) => void; confirmingChange?: boolean }) {
  const crew = sortGameCrew(data.assignments.filter((assignment) => assignment.game_id === game.id));
  const ratedByViewer = data.assessments.some((assessment) => assessment.game_id === game.id && assessment.coach_id === viewerId && assessment.status !== "draft" && !assessment.deleted_at);
  const ratedByAnother = canViewOtherRatings && data.assessments.some((assessment) => assessment.game_id === game.id && assessment.coach_id !== viewerId && assessment.status !== "draft" && !assessment.deleted_at);
  return <article className={`board-game${game.schedule_changed_at ? " board-game-updated" : ""}`}>
    {game.schedule_changed_at && <span className="board-game-updated-label">Updated</span>}
    {onEditGameInfo ? <button type="button" className="board-game-matchup-link" onClick={() => onEditGameInfo(game)}>{game.home_team} <span>vs.</span> {game.away_team}</button> : <strong>{game.home_team} <span>vs.</span> {game.away_team}</strong>}
    {onEditAssignments ? <button type="button" className="board-game-details-link" onClick={() => onEditAssignments(game)}>{game.division || "Tournament match"}</button> : <small>{game.division || "Tournament match"}</small>}
    {game.schedule_changed_at && onConfirmChange && <button type="button" className="board-confirm-change" disabled={confirmingChange} onClick={() => onConfirmChange(game.id)}>{confirmingChange ? "Confirming…" : "Change Confirmed"}</button>}
    {onViewReports && <GameReportsButton ratedByViewer={ratedByViewer} ratedByAnother={ratedByAnother} onClick={() => onViewReports(game.id)} />}
    <div className="crew-chips">{crew.map((assignment) => {
      const official = officials.get(assignment.official_id);
      const gameDate = dateKeyInTimeZone(game.starts_at, eventTimezone);
      const isChecked = data.checkIns.some((item) => item.official_id === assignment.official_id && item.event_date === gameDate && item.status === "checked_in");
      return <span className={isChecked ? "crew-chip arrived" : "crew-chip"} key={assignment.id} title={positionLabel(assignment.position, assignment.position_title)}>
        <b>{official ? initials(official.full_name) : "?"}</b>
        {official ? <button className="official-name-link" onClick={() => onSelectOfficial(official.id, gameDate)}>{official.full_name}{ratingLabel?.(official.id, assignment.position)}</button> : <span>Unassigned</span>}
        <small>{positionLabel(assignment.position, assignment.position_title)}</small>
      </span>;
    })}</div>
  </article>;
}

function AssignmentBoard({ session, data, event, profile, ratingHistory, showRatingAverages, availableOfficials, canEditAssignments, canConfirmChanges, canManageCheckIns, onAssignmentsChanged, onRefreshCheckIns, onSelectOfficial, embedded = false, initialView = "grid" }: { session: Law18Session; data: EventData; event: EventRecord; profile: Profile; ratingHistory: { assessments: AssessmentRecord[]; games: GameRecord[]; assignments: AssignmentRecord[] }; showRatingAverages: boolean; availableOfficials: OfficialRecord[]; canEditAssignments: boolean; canConfirmChanges: boolean; canManageCheckIns: boolean; onAssignmentsChanged: () => Promise<void> | void; onRefreshCheckIns: () => Promise<void>; onSelectOfficial: (officialId: string, eventDate?: string) => void; embedded?: boolean; initialView?: "grid" | "field" | "first_assignment" }) {
  const officials = useMemo(() => new Map(data.officials.map((official) => [official.id, official])), [data.officials]);
  const [boardView, setBoardView] = useState<"grid" | "field" | "first_assignment">(initialView);
  const [collapsedFields, setCollapsedFields] = useState<Set<string>>(new Set());
  const [collapsedFirstTimes, setCollapsedFirstTimes] = useState<Set<string>>(new Set());
  const [editingGame, setEditingGame] = useState<GameRecord | null>(null);
  const [editingGameInfo, setEditingGameInfo] = useState<GameRecord | null>(null);
  const [reportsGameId, setReportsGameId] = useState<string | null>(null);
  const [confirmingGameId, setConfirmingGameId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [venueFilters, setVenueFilters] = useActiveFilterState<string[]>(`assignment-board-venues:${event.id}`, []);
  const availableDates = useMemo(() => [...new Set(data.games.map((game) => dateKeyInTimeZone(game.starts_at, event.timezone)))].sort(), [data.games, event.timezone]);
  const defaultBoardDate = defaultEventDate(availableDates, event.timezone, event.starts_on);
  const [boardDate, setBoardDate] = useState(defaultBoardDate);
  useEffect(() => {
    if (!availableDates.includes(boardDate)) setBoardDate(defaultBoardDate);
  }, [availableDates, boardDate, defaultBoardDate]);
  const availableVenues = useMemo(() => [...new Set(data.games.filter((game) => dateKeyInTimeZone(game.starts_at, event.timezone) === boardDate).map((game) => game.venue_name || "Unspecified venue"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [boardDate, data.games, event.timezone]);
  const visibleGames = useMemo(() => data.games.filter((game) => dateKeyInTimeZone(game.starts_at, event.timezone) === boardDate && (!venueFilters.length || venueFilters.includes(game.venue_name || "Unspecified venue"))), [boardDate, data.games, event.timezone, venueFilters]);
  const ratingLabel = showRatingAverages ? (officialId: string, position: AssignmentRecord["position"]) => administrativeRatingLabel(officialId, position, event.id, data, ratingHistory, profile.rating_average_preferences) : undefined;
  const fields = [...new Set(visibleGames.map((game) => game.field_name))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  const times = [...new Map(visibleGames.map((game) => [formatTime(game.starts_at), timeSortValue(game.starts_at)])).entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([label]) => label);
  const firstAssignments = data.officials.map((official) => {
    const first = data.assignments
      .filter((assignment) => assignment.official_id === official.id)
      .map((assignment) => ({ assignment, game: visibleGames.find((game) => game.id === assignment.game_id) }))
      .filter((item): item is { assignment: AssignmentRecord; game: GameRecord } => Boolean(item.game))
      .sort((a, b) => a.game.starts_at.localeCompare(b.game.starts_at))[0];
    return first ? { official, ...first } : null;
  }).filter((item): item is { official: OfficialRecord; assignment: AssignmentRecord; game: GameRecord } => Boolean(item))
    .sort((a, b) => {
      const timeOrder = a.game.starts_at.localeCompare(b.game.starts_at);
      if (timeOrder) return timeOrder;
      const fieldOrder = a.game.field_name.localeCompare(b.game.field_name, undefined, { numeric: true, sensitivity: "base" });
      if (fieldOrder) return fieldOrder;
      const aLastName = a.official.full_name.trim().split(/\s+/).at(-1) || a.official.full_name;
      const bLastName = b.official.full_name.trim().split(/\s+/).at(-1) || b.official.full_name;
      return aLastName.localeCompare(bLastName, undefined, { sensitivity: "base" })
        || a.official.full_name.localeCompare(b.official.full_name, undefined, { sensitivity: "base" });
    });
  const firstAssignmentGroups = firstAssignments.reduce<Record<string, typeof firstAssignments>>((groups, item) => {
    const label = formatTime(item.game.starts_at);
    return { ...groups, [label]: [...(groups[label] || []), item] };
  }, {});
  async function confirmBoardChange(gameId: string) {
    setConfirmingGameId(gameId);
    setMessage("");
    try {
      await confirmGameScheduleChange(session, gameId);
      await onAssignmentsChanged();
      setMessage("Schedule change confirmed. The updated marker has been cleared.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to confirm this schedule change.");
    } finally {
      setConfirmingGameId(null);
    }
  }
  if (!data.games.length) return <EmptyState>Import a schedule to populate the assignment board.</EmptyState>;
  const boardContent = <>
      {!embedded && <div className="section-title">
        <div><p className="eyebrow">LIVE ASSIGNMENT BOARD</p><h1>Today&apos;s Assignments</h1><p>Checked-in officials are highlighted as arrivals happen.</p></div>
        <div className="assignment-board-heading-actions">{canManageCheckIns && <RefreshCheckInsButton onRefresh={onRefreshCheckIns} />}<div className="legend"><Status checked /><Status checked={false} /></div></div>
      </div>}
      <div className="board-view-tools panel"><label className="board-day-picker"><span>Event Day</span><select value={boardDate} onChange={(change) => { setBoardDate(change.target.value); setCollapsedFields(new Set()); setCollapsedFirstTimes(new Set()); setVenueFilters([]); }}>{availableDates.map((date) => <option value={date} key={date}>{formatDate(date)}</option>)}</select></label><AssignmentFilterMenu label="Venues" options={availableVenues.map((venue) => ({ id: venue, name: venue }))} selected={venueFilters} onChange={setVenueFilters} /><div className="board-view-choice"><span>View</span><div className="segmented"><button className={boardView === "grid" ? "active" : ""} onClick={() => setBoardView("grid")}>Time and Field Grid</button><button className={boardView === "field" ? "active" : ""} onClick={() => setBoardView("field")}>By Field</button><button className={boardView === "first_assignment" ? "active" : ""} onClick={() => setBoardView("first_assignment")}>First Assignment</button></div></div></div>
      {boardView === "grid" && <div className="board-wrap panel">
        <table className="assignment-board">
          <thead><tr><th scope="col">Time</th>{fields.map((field) => <th scope="col" key={field}>{field}</th>)}</tr></thead>
          <tbody>{times.map((time) => (
            <tr key={time}><th scope="row">{time}</th>{fields.map((field) => {
              const game = visibleGames.find((item) => item.field_name === field && formatTime(item.starts_at) === time);
              if (!game) return <td key={field} className="board-empty">—</td>;
              return <td key={field}>
                <BoardGameTile game={game} data={data} officials={officials} eventTimezone={event.timezone} ratingLabel={ratingLabel} viewerId={session.user.id} canViewOtherRatings={showRatingAverages} onSelectOfficial={onSelectOfficial} onViewReports={setReportsGameId} onEditAssignments={canEditAssignments ? setEditingGame : undefined} onEditGameInfo={canEditAssignments ? setEditingGameInfo : undefined} onConfirmChange={canConfirmChanges ? (gameId) => void confirmBoardChange(gameId) : undefined} confirmingChange={confirmingGameId === game.id} />
              </td>;
            })}</tr>
          ))}</tbody>
        </table>
      </div>}
      {boardView === "field" && <div className="field-board-list">{fields.map((field) => {
        const collapsed = collapsedFields.has(field);
        const games = visibleGames.filter((game) => game.field_name === field).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return <article className="panel field-board-group" key={field}><button className="field-board-heading" onClick={() => setCollapsedFields((current) => {
          const next = new Set(current);
          if (next.has(field)) next.delete(field); else next.add(field);
          return next;
        })}><span><strong>{field}</strong><small>{games.length} game{games.length === 1 ? "" : "s"}</small></span><b>{collapsed ? "+" : "−"}</b></button>{!collapsed && <div className="field-board-games">{games.map((game) => <div className="field-board-game" key={game.id}><time><strong>{formatTime(game.starts_at)}</strong><small>{formatDate(game.starts_at)}</small></time><BoardGameTile game={game} data={data} officials={officials} eventTimezone={event.timezone} ratingLabel={ratingLabel} viewerId={session.user.id} canViewOtherRatings={showRatingAverages} onSelectOfficial={onSelectOfficial} onViewReports={setReportsGameId} onEditAssignments={canEditAssignments ? setEditingGame : undefined} onEditGameInfo={canEditAssignments ? setEditingGameInfo : undefined} onConfirmChange={canConfirmChanges ? (gameId) => void confirmBoardChange(gameId) : undefined} confirmingChange={confirmingGameId === game.id} /></div>)}</div>}</article>;
      })}</div>}
      {boardView === "first_assignment" && <div className="first-assignment-groups">{Object.entries(firstAssignmentGroups).map(([time, assignments]) => { const collapsed = collapsedFirstTimes.has(time); return <article className="panel first-assignment-time-group" key={time}><button className="field-board-heading" onClick={() => setCollapsedFirstTimes((current) => { const next = new Set(current); if (next.has(time)) next.delete(time); else next.add(time); return next; })}><span><strong>{time}</strong><small>{assignments.length} official{assignments.length === 1 ? "" : "s"}</small></span><b>{collapsed ? "+" : "−"}</b></button>{!collapsed && <div className="first-assignment-board"><div className="first-assignment-row first-assignment-head"><span>Official</span><span>First Assignment</span><span>Field</span><span>Position</span><span>Status</span></div>{assignments.map(({ official, assignment, game }) => { const gameDate = dateKeyInTimeZone(game.starts_at, event.timezone); const checked = data.checkIns.some((item) => item.official_id === official.id && item.event_date === gameDate && item.status === "checked_in"); return <div className={`first-assignment-row${checked ? " arrived" : ""}${game.schedule_changed_at ? " assignment-updated" : ""}`} key={official.id}><span className="official-name-cell"><span className="avatar">{initials(official.full_name)}</span><button className="official-name-link" onClick={() => onSelectOfficial(official.id, gameDate)}>{official.full_name}{ratingLabel?.(official.id, assignment.position)}</button></span><span><strong>{formatTime(game.starts_at)}</strong><small>{formatDate(game.starts_at)}{game.schedule_changed_at ? " · Updated" : ""}</small></span><span>{game.field_name}</span><span>{positionLabel(assignment.position, assignment.position_title)}</span><Status checked={checked} /></div>; })}</div>}</article>; })}</div>}
      {editingGame && <AssignmentEditorDialog key={editingGame.id} session={session} game={editingGame} assignments={data.assignments.filter((assignment) => assignment.game_id === editingGame.id)} availableOfficials={availableOfficials} onClose={() => setEditingGame(null)} onSaved={onAssignmentsChanged} />}
      {editingGameInfo && <BoardGameInfoDialog key={editingGameInfo.id} session={session} event={event} game={editingGameInfo} onClose={() => setEditingGameInfo(null)} onSaved={onAssignmentsChanged} />}
      {reportsGameId && <SubmittedReportsDialog game={data.games.find((item) => item.id === reportsGameId)!} reports={data.assessments.filter((assessment) => assessment.game_id === reportsGameId && assessment.status !== "draft" && !assessment.deleted_at)} assignments={data.assignments.filter((assignment) => assignment.game_id === reportsGameId)} officials={officials} onClose={() => setReportsGameId(null)} />}
      {message && <p className="pilot-message board-confirm-message">{message}</p>}
    </>;
  return embedded ? <div className="embedded-assignment-board">{boardContent}</div> : <section className="page-section">{boardContent}</section>;
}

function RefereeDay({
  event,
  data,
  session,
}: {
  event: EventRecord;
  data: EventData;
  session: Law18Session;
}) {
  const email = session.user.email?.toLowerCase();
  const official = data.officials.find((item) => item.email?.toLowerCase() === email || item.linked_user_id === session.user.id);
  const assignments = official ? data.assignments.filter((item) => item.official_id === official.id) : [];
  const games = assignments.map((assignment) => ({
    assignment,
    game: data.games.find((game) => game.id === assignment.game_id),
  })).filter((item): item is { assignment: AssignmentRecord; game: GameRecord } => Boolean(item.game));
  const checkInDate = new URLSearchParams(window.location.search).get("date")
    || games[0]?.game.starts_at.slice(0, 10)
    || new Date().toISOString().slice(0, 10);
  const isChecked = Boolean(official && data.checkIns.some((item) => item.official_id === official.id && item.event_date === checkInDate && item.status === "checked_in"));
  const rulesDocument = eventFeatureEnabled(event, "event_documents") ? data.documents.find((document) => document.document_type === "rules_of_competition") : undefined;

  if (!official || !games.length) return <EmptyState>No imported assignments match {session.user.email}. Ask your assignor to confirm the email in the CSV.</EmptyState>;
  return <section className="referee-home">
    <div className="referee-hero">
      <p className="eyebrow">MY TOURNAMENT DAY</p>
      <h1>Hi, {official.full_name.split(" ")[0]}.</h1>
      <p>{event.name} · {event.venue_name}</p>
      <p className="pilot-message">{isChecked ? "✓ You are checked in for this event day." : "Scan the on-site QR code from the Check-in section when you arrive."}</p>
    </div>
    <section className="mobile-actions">
      <a href="#my-schedule"><span>☷</span><strong>My schedule</strong></a>
      <span><span>⌗</span><strong>On-site QR required</strong></span>
    </section>
    {rulesDocument && <aside className="panel event-rules-banner"><div><p className="eyebrow">EVENT DOCUMENT</p><strong>Rules of Competition</strong><span>{rulesDocument.title}</span></div><EventDocumentLink session={session} document={rulesDocument} /></aside>}
    <section className="panel my-games" id="my-schedule">
      <div className="panel-head"><div><p className="eyebrow">ASSIGNED — NO ACCEPTANCE REQUIRED</p><h2>Today’s games</h2></div></div>
      {games.map(({ assignment, game }) => <article key={assignment.id}>
        <time>{formatTime(game.starts_at)}</time>
        <div><strong>{game.home_team} vs. {game.away_team}</strong><p>{game.field_name} · {positionLabel(assignment.position, assignment.position_title)}</p></div>
        <Status checked={isChecked} />
      </article>)}
    </section>
  </section>;
}

function AssignmentFilterMenu({ label, options, selected, onChange, searchable = false }: { label: string; options: { id: string; name: string }[]; selected: string[]; onChange: (values: string[]) => void; searchable?: boolean }) {
  const [query, setQuery] = useState("");
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  const visibleOptions = searchable ? options.filter((option) => option.name.toLowerCase().includes(query.toLowerCase())) : options;
  const close = (target: HTMLElement) => target.closest("details")?.removeAttribute("open");
  return <details className="assignment-filter-menu"><summary><span>{label}</span><small>{selected.length ? `${selected.length} selected` : "All"}</small></summary><div className="filter-menu-panel"><header><strong>Filter by {label}</strong><button type="button" className="text-button" disabled={!selected.length} onClick={() => onChange([])}>Clear</button></header>{searchable && <input className="filter-menu-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}…`} />}<div className="filter-menu-options">{visibleOptions.map((option) => <label key={option.id}><input type="checkbox" checked={selected.includes(option.id)} onChange={() => toggle(option.id)} /><span>{option.name}</span></label>)}{!visibleOptions.length && <small>No matching options.</small>}</div><footer><button type="button" className="primary" onClick={(event) => close(event.currentTarget)}>Done{selected.length ? ` · ${selected.length} selected` : " · Showing all"}</button></footer></div></details>;
}

function UnifiedAssignmentsView({ session, profile }: { session: Law18Session; profile: Profile }) {
  const [assignments, setAssignments] = useState<UnifiedAssignment[]>([]);
  const [rulesDocuments, setRulesDocuments] = useState<EventDocumentRecord[]>([]);
  const [sharedRatings, setSharedRatings] = useState<AssignmentSharedRating[]>([]);
  const [openRatingAssignmentId, setOpenRatingAssignmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [scheduleType, setScheduleType] = useActiveFilterState("my-assignments:type", "all");
  const [calendarIds, setCalendarIds] = useActiveFilterState<string[]>("my-assignments:calendars", []);
  const [eventIds, setEventIds] = useActiveFilterState<string[]>("my-assignments:events", []);
  const [organizationIds, setOrganizationIds] = useActiveFilterState<string[]>("my-assignments:organizations", []);
  const [dateRange, setDateRange] = useActiveFilterState("my-assignments:dates", { from: today, through: "" });
  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [nextAssignments, documents, ratings] = await Promise.all([loadUnifiedAssignments(session), loadMyRulesDocuments(session), loadMyAssignmentSharedRatings(session)]);
      setAssignments(nextAssignments);
      setRulesDocuments(documents);
      setSharedRatings(ratings);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to load your unified assignments.");
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => { void refresh(); }, [refresh]);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = assignments.filter((item) => new Date(item.starts_at).getTime() >= cutoff);
  const uniqueOptions = (items: { id: string; name: string }[]) => [...new Map(items.map((item) => [item.id, item])).values()].sort((left, right) => left.name.localeCompare(right.name));
  const calendarOptions = uniqueOptions(recent.filter((item) => item.source_type !== "law18ref").map((item) => ({ id: item.source_id, name: item.source_name })));
  const eventOptions = uniqueOptions(recent.filter((item) => item.event_id).map((item) => ({ id: item.event_id!, name: item.event_name || item.source_name })));
  const organizationOptions = uniqueOptions(recent.filter((item) => item.organization_id).map((item) => ({ id: item.organization_id!, name: item.organization_name || "Law18Ref group" })));
  const visible = recent.filter((item) => {
    if (scheduleType === "law18ref" && item.source_type !== "law18ref") return false;
    if (scheduleType === "external" && item.source_type === "law18ref") return false;
    if (calendarIds.length && (item.source_type === "law18ref" || !calendarIds.includes(item.source_id))) return false;
    if (eventIds.length && (!item.event_id || !eventIds.includes(item.event_id))) return false;
    if (organizationIds.length && (!item.organization_id || !organizationIds.includes(item.organization_id))) return false;
    const itemDate = item.starts_at.slice(0, 10);
    if (dateRange.from && itemDate < dateRange.from) return false;
    if (dateRange.through && itemDate > dateRange.through) return false;
    return true;
  });
  const filtersActive = scheduleType !== "all" || calendarIds.length > 0 || eventIds.length > 0 || organizationIds.length > 0 || dateRange.from !== today || Boolean(dateRange.through);
  const filterValue = { scheduleType, calendarIds, eventIds, organizationIds, dateRange };
  const applyFilters = (value: typeof filterValue) => { setScheduleType(value.scheduleType); setCalendarIds(value.calendarIds); setEventIds(value.eventIds); setOrganizationIds(value.organizationIds); setDateRange(value.dateRange); };
  const assignmentColor = (item: UnifiedAssignment) => profile.personal_schedule_colors?.[item.source_type === "law18ref" ? `org:${item.organization_id}` : `feed:${item.source_id}`] || (item.source_type === "law18ref" ? "#285783" : "#c62f68");
  const assignmentColorModes = (item: UnifiedAssignment) => profile.personal_schedule_color_modes?.[item.source_type === "law18ref" ? `org:${item.organization_id}` : `feed:${item.source_id}`] || ["mark"];
  const conflicts = new Set<string>();
  for (let left = 0; left < visible.length; left += 1) {
    const leftStart = new Date(visible[left].starts_at).getTime();
    const leftEnd = visible[left].ends_at ? new Date(visible[left].ends_at!).getTime() : leftStart + 2 * 60 * 60 * 1000;
    for (let right = left + 1; right < visible.length; right += 1) {
      const rightStart = new Date(visible[right].starts_at).getTime();
      if (rightStart >= leftEnd) break;
      const rightEnd = visible[right].ends_at ? new Date(visible[right].ends_at!).getTime() : rightStart + 2 * 60 * 60 * 1000;
      if (leftStart < rightEnd && rightStart < leftEnd) {
        conflicts.add(visible[left].id);
        conflicts.add(visible[right].id);
      }
    }
  }
  const grouped = visible.reduce<Map<string, UnifiedAssignment[]>>((groups, item) => {
    const date = new Date(item.starts_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    groups.set(key, [...(groups.get(key) || []), item]);
    return groups;
  }, new Map());
  return <section className="page-section unified-assignments-page">
    <div className="section-title"><div><p className="eyebrow">PERSONAL SCHEDULE</p><h1>My Assignments</h1><p>Your Law18Ref games and connected external calendar feeds in one view.</p></div><button className="secondary" disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    {message && <p className="pilot-message">{message}</p>}
    <div className="assignment-filter-bar"><label>Schedule Type<select value={scheduleType} onChange={(event) => setScheduleType(event.target.value)}><option value="all">All Assignments</option><option value="law18ref">Law18Ref Only</option><option value="external">External Calendars Only</option></select></label><AssignmentFilterMenu label="Calendar Imports" options={calendarOptions} selected={calendarIds} onChange={setCalendarIds} /><AssignmentFilterMenu label="Law18Ref Events" options={eventOptions} selected={eventIds} onChange={setEventIds} /><AssignmentFilterMenu label="Law18Ref Groups" options={organizationOptions} selected={organizationIds} onChange={setOrganizationIds} /><fieldset className="assignment-date-filter"><legend>Dates</legend><input aria-label="Assignments from" type="date" value={dateRange.from} onChange={(event) => setDateRange({ ...dateRange, from: event.target.value })} /><input aria-label="Assignments through" type="date" min={dateRange.from || undefined} value={dateRange.through} onChange={(event) => setDateRange({ ...dateRange, through: event.target.value })} /></fieldset><SavedFilterControls filterKey="my-assignments" value={filterValue} onApply={applyFilters} /><button className="text-button" disabled={!filtersActive} onClick={() => { setScheduleType("all"); setCalendarIds([]); setEventIds([]); setOrganizationIds([]); setDateRange({ from: today, through: "" }); }}>Clear Filters</button></div>
    {!!grouped.size && <div className="panel unified-assignment-list">{[...grouped.entries()].map(([date, items]) => <section className="unified-assignment-day" key={date}><header><h2>{new Intl.DateTimeFormat([], { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`))}</h2><small>{items.length} assignment{items.length === 1 ? "" : "s"}</small></header>{items.map((item) => { const colorModes = assignmentColorModes(item); const rulesDocument = rulesDocuments.find((document) => document.event_id === item.event_id); const assignmentRatings = sharedRatings.filter((entry) => entry.assignment_id === item.id); return <div className={`unified-assignment-row ${colorModes.includes("mark") ? "calendar-color-mark" : ""} ${colorModes.includes("card") ? "calendar-color-card" : ""} ${colorModes.includes("label") ? "calendar-color-label" : ""} ${conflicts.has(item.id) ? "has-conflict" : ""}`} style={{ "--assignment-color": assignmentColor(item) } as CSSProperties} key={`${item.source_type}-${item.id}`}><time>{formatTime(item.starts_at)}</time><div className="unified-assignment-details"><strong>{item.title || "Assignment"}</strong><span>{[item.venue, item.position_title].filter(Boolean).join(" · ") || "Details available from the source platform"}</span>{rulesDocument && <EventDocumentLink session={session} document={rulesDocument} compact />}</div><div className="unified-assignment-meta"><span className={`source-badge source-${item.source_type}`}>{item.source_name}</span><small>{item.status === "cancelled" ? "Cancelled" : item.source_type === "law18ref" ? "Law18Ref assignment" : "External calendar"}{conflicts.has(item.id) && <b>Schedule conflict</b>}</small></div><div className="unified-assignment-actions">{assignmentRatings.length > 0 && <button className="secondary" onClick={() => setOpenRatingAssignmentId(item.id)}>View My Eval{assignmentRatings.length > 1 ? `s (${assignmentRatings.length})` : ""}</button>}{item.source_url && <a className="unified-source-link" href={item.source_url} target="_blank" rel="noreferrer">Open Source</a>}</div></div>; })}</section>)}</div>}
    {openRatingAssignmentId && <MyAssignmentRatingsDialog assignment={assignments.find((item) => item.id === openRatingAssignmentId)!} ratings={sharedRatings.filter((entry) => entry.assignment_id === openRatingAssignmentId).map((entry) => entry.rating)} onClose={() => setOpenRatingAssignmentId(null)} />}
    {!loading && !visible.length && <EmptyState>{filtersActive ? "No assignments match the selected filters." : "No assignments are available. Add a personal calendar feed in Account Settings or ask your Law18Ref assignor to link your account."}</EmptyState>}
  </section>;
}

function MyAssignmentRatingsDialog({ assignment, ratings, onClose }: { assignment: UnifiedAssignment; ratings: AssessmentRecord[]; onClose: () => void }) {
  const skillLabels = (rating: AssessmentRecord) => skillsForAssignment({ position: rating.rated_position || "other", position_title: rating.rated_position_title } as AssignmentRecord);
  return <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) onClose(); }}><section className="confirmation-dialog my-assignment-ratings-dialog" role="dialog" aria-modal="true" aria-labelledby="my-assignment-rating-title"><header><div><p className="eyebrow">MY SHARED EVAL</p><h2 id="my-assignment-rating-title">{assignment.title || "Assignment Evaluation"}</h2><p>{formatDate(assignment.starts_at)} · {formatTime(assignment.starts_at)} · {assignment.position_title}</p></div><button className="modal-close-button" aria-label="Close evaluation" onClick={onClose}>×</button></header><div className="my-assignment-ratings-list">{ratings.map((rating) => <article key={rating.id}><div className="my-eval-heading"><strong>{rating.evaluation_type === "skills_eval" ? "Skills Eval" : "Basic Eval"}</strong>{rating.overall_rating != null && <b>{rating.overall_rating}/5</b>}</div>{rating.evaluation_type === "skills_eval" && <div className="my-eval-scores">{skillLabels(rating).map((skill) => <span key={skill.key}><small>{skill.label}</small><b>{rating[skill.key] == null ? "N/A" : `${rating[skill.key]}/5`}</b></span>)}</div>}{rating.strengths && <p><strong>Positive Areas of Performance</strong>{rating.strengths}</p>}{rating.development_focus && <p><strong>Areas for Improvement</strong>{rating.development_focus}</p>}{rating.additional_comments && <p><strong>Additional Comments/Suggestions</strong>{rating.additional_comments}</p>}</article>)}</div><button className="primary" onClick={onClose}>Close Evaluation</button></section></div>;
}

function dateKeyInTimeZone(value: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function defaultEventDate(dates: string[], timeZone: string, fallback: string) {
  const sortedDates = [...new Set(dates)].sort();
  const today = dateKeyInTimeZone(new Date(), timeZone);
  return sortedDates.includes(today)
    ? today
    : sortedDates.find((date) => date > today) || sortedDates.at(-1) || fallback;
}

function PersonalDashboard({ session, profile, organizations, onNavigate }: { session: Law18Session; profile: Profile; organizations: OrganizationRecord[]; onNavigate: (view: View) => void }) {
  const [assignments, setAssignments] = useState<UnifiedAssignment[]>([]);
  const [rulesDocuments, setRulesDocuments] = useState<EventDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    Promise.all([loadUnifiedAssignments(session), loadMyRulesDocuments(session)]).then(([nextAssignments, documents]) => { setAssignments(nextAssignments); setRulesDocuments(documents); }).catch((reason) => setMessage(reason instanceof Error ? reason.message : "Unable to load your assignments.")).finally(() => setLoading(false));
  }, [session]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = assignments.filter((item) => item.source_type === "law18ref" && new Date(item.starts_at).getTime() >= today.getTime());
  const eventOptions = [...new Map(upcoming.filter((item) => item.event_id).map((item) => [item.event_id!, { id: item.event_id!, name: item.event_name || item.source_name, organization: item.organization_name || "Law18Ref group", startsAt: item.starts_at }])).values()]
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  return <section className="page-section personal-dashboard">
    <div className="welcome"><div><p className="eyebrow">MY DASHBOARD</p><h1>Welcome, {profile.full_name.split(" ")[0]}.</h1><p>Your groups, events, assignments, and account tools in one place.</p></div></div>
    {message && <p className="pilot-message">{message}</p>}
    <button className="dashboard-schedule-link" onClick={() => onNavigate("board")}><span className="dashboard-schedule-icon">▦</span><span><small>MY SCHEDULE</small><strong>View My Assignments</strong><b>Open Schedule →</b></span></button>
    <div className="metrics personal-dashboard-metrics">
      <article><span className="metric-icon green">♙</span><div><strong>{organizations.length}</strong><p>Groups</p></div></article>
      <article><span className="metric-icon blue">◇</span><div><strong>{eventOptions.length}</strong><p>Upcoming Events</p></div></article>
      <article><span className="metric-icon green">☷</span><div><strong>{upcoming.length}</strong><p>Upcoming Assignments</p></div></article>
      <article><span className="metric-icon blue">◎</span><div><strong className="role-metric">Referee</strong><p>Your Account Role</p></div></article>
    </div>
    <div className="dashboard-grid personal-dashboard-grid">
      <article className="panel dashboard-event"><div className="panel-head"><div><p className="eyebrow">MY GROUPS</p><h2>{organizations.length} Group{organizations.length === 1 ? "" : "s"}</h2></div></div><div className="personal-context-list">{organizations.map((item) => <div key={item.id}>{item.logo_url ? <img src={item.logo_url} alt="" /> : <span className="event-mark">{item.name[0]}</span>}<strong>{item.name}</strong></div>)}{!organizations.length && !loading && <p>No group memberships are linked to this account.</p>}</div></article>
      <article className="panel dashboard-event"><div className="panel-head"><div><p className="eyebrow">MY EVENTS</p><h2>Current and Upcoming</h2></div></div><div className="personal-event-list">{eventOptions.slice(0, 8).map((item) => { const rulesDocument = rulesDocuments.find((document) => document.event_id === item.id); return <div key={item.id}><strong>{item.name}</strong><span>{item.organization} · Next assignment {formatDate(item.startsAt)} at {formatTime(item.startsAt)}</span>{rulesDocument && <EventDocumentLink session={session} document={rulesDocument} compact />}</div>; })}{!eventOptions.length && !loading && <p>No upcoming Law18Ref events are assigned to you.</p>}</div></article>
    </div>
    <div className="dashboard-actions personal-dashboard-actions"><button className="secondary" onClick={() => onNavigate("checkin")}>Check In</button><button className="secondary" onClick={() => onNavigate("account")}>Account Settings</button></div>
  </section>;
}

function PersonalCheckInHub({ session, events }: { session: Law18Session; events: EventRecord[] }) {
  const [eligibleEvents, setEligibleEvents] = useState<EventRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [selectedData, setSelectedData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const loadSelected = useCallback(async (event: EventRecord) => {
    setLoading(true);
    setMessage("");
    try { setSelectedEvent(event); setSelectedData(await loadEventData(session, event.id)); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to open this event check-in."); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => {
    setLoading(true);
    loadUnifiedAssignments(session).then((assignments) => {
      const byId = new Map(events.map((event) => [event.id, event]));
      const matches = [...new Set(assignments.filter((item) => {
        if (item.source_type !== "law18ref") return false;
        const event = byId.get(item.event_id || item.source_id);
        return Boolean(event && eventFeatureEnabled(event, "check_in") && dateKeyInTimeZone(item.starts_at, event.timezone) === dateKeyInTimeZone(new Date(), event.timezone));
      }).map((item) => item.event_id || item.source_id))].map((id) => byId.get(id)).filter((event): event is EventRecord => Boolean(event));
      setEligibleEvents(matches);
      if (matches.length === 1) return loadSelected(matches[0]);
      setLoading(false);
    }).catch((reason) => { setMessage(reason instanceof Error ? reason.message : "Unable to find today's check-ins."); setLoading(false); });
  }, [events, loadSelected, session]);
  if (selectedEvent && selectedData) return <><button className="text-button personal-checkin-back" onClick={() => { setSelectedEvent(null); setSelectedData(null); }}>← Today’s check-ins</button><RefereeCheckIn event={selectedEvent} data={selectedData} session={session} onCheckedIn={() => loadSelected(selectedEvent)} /></>;
  return <section className="page-section personal-checkin-hub"><div className="section-title"><div><p className="eyebrow">TODAY’S CHECK-INS</p><h1>{eligibleEvents.length > 1 ? "Choose an event" : "Check In"}</h1><p>{eligibleEvents.length > 1 ? "You have assignments in more than one event today. Select the event where you are checking in." : "Your eligible event check-ins appear here automatically."}</p></div></div>{message && <p className="pilot-message">{message}</p>}{loading ? <p className="auth-loading">Loading check-ins…</p> : eligibleEvents.length ? <div className="personal-checkin-options">{eligibleEvents.map((event) => <button className="panel" key={event.id} onClick={() => void loadSelected(event)}><span className="event-mark">{event.name[0]}</span><span><strong>{event.name}</strong><small>{formatDate(event.starts_on)} · {event.venue_name}</small></span><b>Open Check-In →</b></button>)}</div> : <EmptyState>You do not have a Law18Ref assignment requiring check-in today.</EmptyState>}</section>;
}

function QrScanner({ onFound }: { onFound: (rawValue: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser cannot access the camera. Open Law18Ref in Safari or Chrome and try again.");
      return;
    }
    try {
      setMessage("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ["qr_code"] }) : null;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const video = videoRef.current;
        let rawValue = "";
        if (detector) {
          const codes = await detector.detect(video).catch(() => []);
          rawValue = codes[0]?.rawValue || "";
        } else if (context && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          rawValue = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" })?.data || "";
        }
        if (rawValue) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          setScanning(false);
          onFound(rawValue);
          return;
        }
        scanTimerRef.current = window.setTimeout(scan, detector ? 350 : 180);
      };
      scanTimerRef.current = window.setTimeout(scan, 600);
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setScanning(false);
      setMessage(reason instanceof DOMException && reason.name === "NotAllowedError" ? "Camera access is blocked. Allow camera access for Law18Ref in your browser settings, then try again." : "The camera could not be opened. Close other apps using the camera and try again.");
    }
  }

  useEffect(() => () => {
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  return <section className="panel scanner-card" id="scan">
    <div><p className="eyebrow">EVENT QR</p><h2>Scan at referee headquarters</h2><p>Use Law18Referee Management or your phone’s Camera app.</p></div>
    <video ref={videoRef} autoPlay muted playsInline className={scanning ? "scanner-video active" : "scanner-video"} />
    <button className="primary scan-qr-button" onClick={start} disabled={scanning}>{scanning ? "Scanning…" : "Scan QR Code"}</button>
    {message && <p className="pilot-message">{message}</p>}
  </section>;
}

function CrewArrivalNote({ crew }: { crew: ExternalCheckInLookup["assignments"][number]["crew_arrivals"] }) {
  if (!crew?.length) return null;
  return <aside className="crew-arrival-note"><strong>Where your crew is coming from</strong>{crew.map((partner) => <div key={partner.official_id}><b>{partner.official_name}</b><span>{partner.first_game || !partner.prior_starts_at ? "First game" : `${positionLabel(partner.prior_position || partner.position, partner.prior_position_title)} · ${formatTime(partner.prior_starts_at)} · ${partner.prior_field_name || "Field not listed"}`}</span></div>)}</aside>;
}

function ExternalCheckInPage({ eventSlug, eventDate, onExit }: { eventSlug: string; eventDate: string; onExit: () => void }) {
  const [config, setConfig] = useState<ExternalCheckInConfig | null>(null);
  const [identity, setIdentity] = useState<Partial<Record<ExternalCheckInField, string>>>({});
  const [match, setMatch] = useState<ExternalCheckInLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [lastFailedIdentity, setLastFailedIdentity] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    loadExternalCheckInConfig(eventSlug, eventDate).then(setConfig).catch((reason) => setMessage(reason instanceof Error ? reason.message : "External check-in is unavailable."));
  }, [eventDate, eventSlug]);

  const fieldDetails: Record<ExternalCheckInField, { label: string; type?: string; autoComplete?: string }> = {
    last_name: { label: "Last name", autoComplete: "family-name" }, first_name: { label: "First name", autoComplete: "given-name" },
    email: { label: "Email", type: "email", autoComplete: "email" }, phone: { label: "Phone", type: "tel", autoComplete: "tel" },
    ussf_id: { label: "USSF ID #" }, date_of_birth: { label: "Date of birth", type: "date", autoComplete: "bday" },
    other: { label: config?.other_label || "Other identifier" },
  };
  const requiredFields = config?.required_fields || [];
  const canSearch = Boolean(config && requiredFields.length && requiredFields.every((field) => identity[field]?.trim()));

  async function findSchedule() {
    setBusy(true); setMessage("");
    const fingerprint = JSON.stringify(requiredFields.map((field) => [field, identity[field]?.trim().toLowerCase()]));
    try {
      const result = await findExternalCheckIn(eventSlug, eventDate, identity);
      setMatch(result); setFailedAttempts(0); setLastFailedIdentity("");
      if (!result.confirmation_required && result.checked_in) {
        setComplete(true);
        setMessage(result.confirmation_message || "You’re checked in. Have a great day!");
      }
    }
    catch {
      const attempt = fingerprint === lastFailedIdentity ? failedAttempts + 1 : 1;
      setLastFailedIdentity(fingerprint); setFailedAttempts(attempt);
      setMessage(attempt >= 2 ? config?.second_failure_message || "Please check in in person with the Site Supervisor." : config?.first_failure_message || "No matching referee was found in today’s schedule. Try again and confirm the information matches your Assignr account.");
    }
    finally { setBusy(false); }
  }
  async function confirmSchedule() {
    if (!match) return;
    setBusy(true); setMessage("");
    try {
      await confirmExternalCheckIn(match.token);
      setComplete(true);
      setMessage(match.confirmation_message || "You’re checked in. Have a great day!");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to complete check-in."); }
    finally { setBusy(false); }
  }

  return <main className="guest-checkin-page"><div className="guest-checkin-shell">
    <header className="guest-checkin-brand"><Mark /><div><strong>Law18Referee Management</strong><span>External Check-In</span></div></header>
    <section className="panel guest-checkin-card">
      {complete ? <div className="guest-checkin-complete"><span aria-hidden="true">✓</span><p className="eyebrow">CHECK-IN COMPLETE</p><h1>You’re checked in</h1><p>{match?.event_name} · {formatDate(eventDate)}</p><p className="pilot-message">{message}</p>{match && <section className="guest-confirmed-schedule" aria-labelledby="confirmed-schedule-heading"><h2 id="confirmed-schedule-heading">Your schedule for today</h2><div className="guest-schedule-list">{match.assignments.map((assignment) => <article className="guest-schedule-card" key={`${assignment.game_id}-${assignment.position}`}><div><time>{formatTime(assignment.starts_at)}</time><strong>{assignment.field_name}</strong></div><div><h2>{assignment.home_team} vs. {assignment.away_team}</h2><p>{[assignment.age_group, assignment.gender, assignment.venue_name].filter(Boolean).join(" · ")}</p><span>{positionLabel(assignment.position, assignment.position_title)}</span><CrewArrivalNote crew={assignment.crew_arrivals} /></div></article>)}</div></section>}{!!match?.check_in_links.length && <div className="check-in-links">{match.check_in_links.map((link) => <a className="secondary" href={link.url} target="_blank" rel="noreferrer" key={`${link.title}-${link.url}`}>{link.title}</a>)}</div>}</div> : !match ? <>
        <p className="eyebrow">ON-SITE CHECK-IN</p><h1>{config?.confirmation_required === false ? "Check in" : "Find your schedule"}</h1><p>{config?.arrival_message || "Enter the requested details exactly as they appear in your Assignr account or the event’s assigning system."}</p>
        {!config && !message ? <p>Loading check-in…</p> : <div className="guest-checkin-form">{requiredFields.map((field) => { const details = fieldDetails[field]; return <label key={field}>{details.label}<input type={details.type || "text"} inputMode={field === "email" ? "email" : field === "phone" ? "tel" : undefined} autoCapitalize={field === "email" ? "none" : undefined} autoComplete={details.autoComplete} value={identity[field] || ""} onChange={(change) => setIdentity((current) => ({ ...current, [field]: change.target.value }))} /></label>; })}<button className="primary" disabled={busy || !canSearch} onClick={() => void findSchedule()}>{busy ? "Checking…" : config?.confirmation_required === false ? "Check In" : "Show My Schedule"}</button></div>}
        {message && <p className="pilot-message error-message">{message}</p>}
      </> : <>
        <p className="eyebrow">CONFIRM YOUR SCHEDULE</p><h1>{match.official_name}</h1><p>{match.event_name} · {formatDate(match.event_date)}</p>
        <div className="guest-schedule-list">{match.assignments.map((assignment) => <article className="guest-schedule-card" key={`${assignment.game_id}-${assignment.position}`}><div><time>{formatTime(assignment.starts_at)}</time><strong>{assignment.field_name}</strong></div><div><h2>{assignment.home_team} vs. {assignment.away_team}</h2><p>{[assignment.age_group, assignment.gender, assignment.venue_name].filter(Boolean).join(" · ")}</p><span>{positionLabel(assignment.position, assignment.position_title)}</span><CrewArrivalNote crew={assignment.crew_arrivals} /></div></article>)}</div>
        {match.already_checked_in ? <p className="pilot-message">✓ You are already checked in for this event day.</p> : <button className="primary guest-confirm-button" disabled={busy} onClick={() => void confirmSchedule()}>{busy ? "Checking In…" : "Confirm Schedule & Check In"}</button>}
        {!!match.check_in_links.length && <div className="check-in-links">{match.check_in_links.map((link) => <a className="secondary" href={link.url} target="_blank" rel="noreferrer" key={`${link.title}-${link.url}`}>{link.title}</a>)}</div>}
        <button className="text-button" onClick={() => { setMatch(null); setMessage(""); }}>Not your schedule? Try again</button>
      </>}
    </section>
    {config?.allow_account_sign_in && <button className="text-button guest-account-link" onClick={onExit}>Use account sign-in instead</button>}
  </div></main>;
}

function RefereeCheckIn({ event, data, session, onCheckedIn }: { event: EventRecord; data: EventData; session: Law18Session; onCheckedIn: () => void }) {
  const email = session.user.email?.toLowerCase();
  const official = data.officials.find((item) => item.email?.toLowerCase() === email || item.linked_user_id === session.user.id);
  const assignmentDates = new Set((official ? data.assignments.filter((item) => item.official_id === official.id) : [])
    .map((assignment) => data.games.find((game) => game.id === assignment.game_id)?.starts_at.slice(0, 10)).filter(Boolean));
  data.coachAssignments.filter((assignment) => assignment.coach_id === session.user.id).forEach((assignment) => {
    if (assignment.full_schedule) data.games.forEach((game) => assignmentDates.add(game.starts_at.slice(0, 10)));
    else {
      const game = data.games.find((item) => item.id === assignment.game_id);
      if (game) assignmentDates.add(game.starts_at.slice(0, 10));
    }
  });
  const [message, setMessage] = useState("");
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const selectedDate = new URLSearchParams(window.location.search).get("date") || today;
  const isCheckedIn = justCheckedIn || Boolean(official && data.checkIns.some((item) =>
    item.official_id === official.id && item.event_date === selectedDate && item.status === "checked_in"));
  async function scanned(rawValue: string) {
    if (!official) return;
    try {
      const scannedUrl = new URL(rawValue);
      const scannedEvent = scannedUrl.searchParams.get("event");
      const scannedDate = scannedUrl.searchParams.get("date");
      if (scannedUrl.origin !== window.location.origin || scannedEvent !== event.check_in_slug || !scannedDate || scannedDate < today || !assignmentDates.has(scannedDate)) {
        throw new Error("This QR code does not match one of your assigned event days.");
      }
      await checkIn(session, event.id, official.id, "qr", scannedDate);
      setJustCheckedIn(true);
      setMessage(event.check_in_confirmation_message || "You’re checked in. Have a great day!");
      onCheckedIn();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "That QR code could not be verified.");
    }
  }
  return <section className="page-section referee-checkin"><div className="section-title"><div><p className="eyebrow">OFFICIAL CHECK-IN</p><h1>{isCheckedIn ? "Check-in complete" : "Scan the on-site code"}</h1><p>{isCheckedIn ? `You are checked in for ${formatDate(selectedDate)}.` : "The check-in QR is displayed or printed by event staff at the venue."}</p></div></div>{!isCheckedIn && <QrScanner onFound={scanned} />}{message && <p className="pilot-message">{message}</p>}{isCheckedIn && !message && <p className="pilot-message">✓ {event.check_in_confirmation_message || "You’re checked in. Have a great day!"}</p>}{isCheckedIn && !!event.check_in_links?.length && <div className="check-in-links">{event.check_in_links.map((link) => <a className="secondary" href={link.url} target="_blank" rel="noreferrer" key={`${link.title}-${link.url}`}>{link.title}</a>)}</div>}</section>;
}

function CheckInView({ event, data, session, canManageCheckIns, onRefresh, onSelectOfficial }: { event: EventRecord; data: EventData; session: Law18Session; canManageCheckIns: boolean; onRefresh: () => Promise<void>; onSelectOfficial: (officialId: string, eventDate?: string) => void }) {
  const eventDates = [...new Set(data.games.map((game) => game.starts_at.slice(0, 10)))].sort();
  const defaultCheckInDate = defaultEventDate(eventDates, event.timezone, event.starts_on);
  const [eventDate, setEventDate] = useState(defaultCheckInDate);
  const [rosterView, setRosterView] = useState<"detailed" | "grid">("detailed");
  const [statusFilters, setStatusFilters] = useActiveFilterState<string[]>(`checkin-status:${event.id}`, []);
  const [siteFilters, setSiteFilters] = useActiveFilterState<string[]>(`checkin-sites:${event.id}`, []);
  const [firstAssignmentTimeFilters, setFirstAssignmentTimeFilters] = useActiveFilterState<string[]>(`checkin-first-times:${event.id}`, []);
  const [nameFilter, setNameFilter] = useActiveFilterState<string>(`checkin-name:${event.id}`, "");
  const [rosterSort, setRosterSort] = useState<"first_assignment" | "last_name" | "field">("first_assignment");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [newArrivals, setNewArrivals] = useState<Set<string>>(new Set());
  const [manualCheckInOfficialId, setManualCheckInOfficialId] = useState<string | null>(null);
  const [expectationOfficialId, setExpectationOfficialId] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const previousCheckedRef = useRef<{ date: string; ids: Set<string> } | null>(null);
  const checkInUrlForDate = (date: string) => `${window.location.origin}/?event=${event.check_in_slug}&date=${date}${event.guest_check_in_enabled ? "&external=1" : ""}`;
  const url = checkInUrlForDate(eventDate);
  const notExpected = new Set(data.attendanceOverrides.filter((item) => item.event_date === eventDate && !item.expected).map((item) => item.official_id));
  const checked = new Set(data.checkIns.filter((item) => item.event_date === eventDate && !notExpected.has(item.official_id)).map((item) => item.official_id));
  const checkInsByOfficial = new Map(data.checkIns.filter((item) => item.event_date === eventDate).map((item) => [item.official_id, item]));
  const assignedToday = new Set(data.assignments.filter((assignment) => data.games.some((game) => game.id === assignment.game_id && game.starts_at.startsWith(eventDate))).map((assignment) => assignment.official_id));
  const coachingOfficialIds = new Set<string>();
  data.coachAssignments.forEach((assignment) => {
    const appliesToday = assignment.full_schedule
      ? data.games.some((game) => game.starts_at.startsWith(eventDate))
      : data.games.some((game) => game.id === assignment.game_id && game.starts_at.startsWith(eventDate));
    const coachOfficial = data.officials.find((official) => official.id === assignment.coach_official_id || official.linked_user_id === assignment.coach_id);
    if (appliesToday && coachOfficial) {
      assignedToday.add(coachOfficial.id);
      coachingOfficialIds.add(coachOfficial.id);
    }
  });
  const currentOfficial = data.officials.find((item) => item.linked_user_id === session.user.id || item.email?.toLowerCase() === session.user.email?.toLowerCase());
  const canSelfCheckIn = Boolean(currentOfficial && assignedToday.has(currentOfficial.id) && !notExpected.has(currentOfficial.id) && !checked.has(currentOfficial.id));
  const roster = data.officials.filter((official) => assignedToday.has(official.id));
  const gamesById = new Map(data.games.map((game) => [game.id, game]));
  const rosterDetails = roster.map((official) => {
    const refereeGames = data.assignments
      .filter((assignment) => assignment.official_id === official.id)
      .map((assignment) => gamesById.get(assignment.game_id))
      .filter((game): game is GameRecord => Boolean(game?.starts_at.startsWith(eventDate)));
    const coachingGames = data.coachAssignments
      .filter((assignment) => assignment.coach_official_id === official.id || assignment.coach_id === official.linked_user_id)
      .flatMap((assignment) => assignment.full_schedule
        ? data.games.filter((game) => game.starts_at.startsWith(eventDate))
        : data.games.filter((game) => game.id === assignment.game_id && game.starts_at.startsWith(eventDate)));
    const games = [...new Map([...refereeGames, ...coachingGames].map((game) => [game.id, game])).values()]
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const firstGame = games[0];
    const firstAssignment = firstGame ? data.assignments.find((assignment) => assignment.game_id === firstGame.id && assignment.official_id === official.id) : undefined;
    const coachIsFirstAssignment = coachingOfficialIds.has(official.id) && !firstAssignment;
    const firstTimeFields = firstGame ? [...new Set(games.filter((game) => game.starts_at === firstGame.starts_at).map((game) => game.field_name).filter(Boolean))] : [];
    const displayedFirstField = coachIsFirstAssignment && firstTimeFields.length !== 1 ? "" : firstTimeFields[0] || firstGame?.field_name || "";
    return {
      official,
      games,
      firstGame,
      firstAssignment,
      firstSite: firstGame?.venue_name || firstGame?.field_name || "Unspecified site",
      firstField: firstGame?.field_name || "Unspecified field",
      displayedFirstField,
      firstFieldSortKey: displayedFirstField || "\uffff",
      lastName: official.full_name.trim().split(/\s+/).at(-1) || official.full_name,
      isChecked: checked.has(official.id),
      isExpected: !notExpected.has(official.id),
      checkInRecord: checkInsByOfficial.get(official.id),
      isCoachExpected: coachingOfficialIds.has(official.id),
    };
  });
  const sites = [...new Set(rosterDetails.flatMap((item) => item.games.map((game) => game.venue_name || game.field_name || "Unspecified site")))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const firstAssignmentTimes = [...new Set(rosterDetails.map((item) => item.firstGame ? formatTime(item.firstGame.starts_at) : "No assignment time"))]
    .sort((a, b) => timeSortValue(rosterDetails.find((item) => (item.firstGame ? formatTime(item.firstGame.starts_at) : "No assignment time") === a)?.firstGame?.starts_at || "") - timeSortValue(rosterDetails.find((item) => (item.firstGame ? formatTime(item.firstGame.starts_at) : "No assignment time") === b)?.firstGame?.starts_at || ""));
  const visibleRoster = rosterDetails
    .filter((item) => !nameFilter.trim() || item.official.full_name.toLocaleLowerCase().includes(nameFilter.trim().toLocaleLowerCase()))
    .filter((item) => !statusFilters.length || statusFilters.includes(!item.isExpected ? "not_expected" : item.isChecked ? "checked_in" : "expected"))
    .filter((item) => !siteFilters.length || item.games.some((game) => siteFilters.includes(game.venue_name || game.field_name || "Unspecified site")))
    .filter((item) => !firstAssignmentTimeFilters.length || firstAssignmentTimeFilters.includes(item.firstGame ? formatTime(item.firstGame.starts_at) : "No assignment time"))
    .sort((a, b) => {
      if (rosterSort === "last_name") return a.lastName.localeCompare(b.lastName) || a.official.full_name.localeCompare(b.official.full_name);
      if (rosterSort === "field") return a.firstField.localeCompare(b.firstField, undefined, { numeric: true }) || (a.firstGame?.starts_at || "").localeCompare(b.firstGame?.starts_at || "");
      return (a.firstGame?.starts_at || "9999").localeCompare(b.firstGame?.starts_at || "9999")
        || a.firstFieldSortKey.localeCompare(b.firstFieldSortKey, undefined, { numeric: true })
        || a.lastName.localeCompare(b.lastName);
    });
  const visibleExpectedRoster = visibleRoster.filter((item) => item.isExpected);
  const visibleCheckedCount = visibleExpectedRoster.filter((item) => item.isChecked).length;
  const attendanceGridRoster = visibleRoster.slice().sort((a, b) =>
    (a.firstGame?.starts_at || "9999").localeCompare(b.firstGame?.starts_at || "9999")
    || a.firstFieldSortKey.localeCompare(b.firstFieldSortKey, undefined, { numeric: true })
    || a.lastName.localeCompare(b.lastName));
  const refreshAttendance = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
      setLastUpdated(new Date());
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [onRefresh]);
  async function scanForSelf(rawValue: string) {
    if (!currentOfficial) return;
    try {
      const scannedUrl = new URL(rawValue);
      if (scannedUrl.origin !== window.location.origin || scannedUrl.searchParams.get("event") !== event.check_in_slug || scannedUrl.searchParams.get("date") !== eventDate) {
        throw new Error("This QR code does not match the selected event day.");
      }
      await checkIn(session, event.id, currentOfficial.id, "qr", eventDate);
      await refreshAttendance();
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "That QR code could not be verified.");
    }
  }
  async function toggleManualCheckIn(official: OfficialRecord, isChecked: boolean) {
    setManualCheckInOfficialId(official.id);
    try {
      if (isChecked) await undoCheckIn(session, event.id, official.id, eventDate);
      else await checkIn(session, event.id, official.id, "assignor", eventDate);
      await refreshAttendance();
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "Unable to update this check-in.");
    } finally {
      setManualCheckInOfficialId(null);
    }
  }
  async function toggleAttendanceExpectation(official: OfficialRecord, isExpected: boolean) {
    setExpectationOfficialId(official.id);
    try {
      await setAttendanceExpected(session, event.id, official.id, eventDate, !isExpected);
      await refreshAttendance();
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "Unable to update this official's attendance expectation.");
    } finally {
      setExpectationOfficialId(null);
    }
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshAttendance().catch(() => undefined);
    }, 15000);
    const becameVisible = () => {
      if (document.visibilityState === "visible") refreshAttendance().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", becameVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", becameVisible);
    };
  }, [refreshAttendance]);
  useEffect(() => {
    const previous = previousCheckedRef.current;
    if (previous?.date === eventDate) {
      const arrivals = new Set([...checked].filter((id) => !previous.ids.has(id)));
      if (arrivals.size) {
        setNewArrivals(arrivals);
        const timer = window.setTimeout(() => setNewArrivals(new Set()), 5000);
        previousCheckedRef.current = { date: eventDate, ids: checked };
        return () => window.clearTimeout(timer);
      }
    }
    previousCheckedRef.current = { date: eventDate, ids: checked };
  }, [data.checkIns, eventDate]);
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">TOURNAMENT CHECK-IN</p><h1>Arrival station</h1><p>Attendance refreshes every 15 seconds while this page is visible. Last updated {lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}.</p></div><div className="checkin-refresh-tools"><label className="day-picker">Event day<select value={eventDate} onChange={(event) => { setEventDate(event.target.value); setSiteFilters([]); }}>{eventDates.map((date) => <option value={date} key={date}>{formatDate(date)}</option>)}</select></label><button className="secondary" disabled={refreshing} onClick={() => refreshAttendance()}>{refreshing ? "Refreshing…" : "Refresh Now"}</button></div></div>
    <div className={`checkin-grid ${rosterView === "grid" ? "attendance-grid-active" : ""}`}>
      <details className="panel qr-panel qr-panel-disclosure print-qr"><summary><span><span className="eyebrow">ON-SITE CHECK-IN</span><strong>Check-In QR Code</strong><small>{formatDate(eventDate)}</small></span><b>Show QR Code</b></summary><div className="qr-panel-content"><div className="qr"><QRCodeSVG value={url} size={210} /></div><h2>{event.name}</h2><strong>{formatDate(eventDate)}</strong><small>{event.guest_check_in_enabled ? "External Check-In · Account not required" : "Law18Ref account sign-in required"}</small><p>{url}</p><button className="secondary print-button" onClick={() => window.print()}>Print All Daily QR Codes</button></div></details>
      <article className="panel roster-panel"><div className="panel-head"><div><p className="eyebrow">LIVE ROSTER</p><h2>{visibleCheckedCount}/{visibleExpectedRoster.length} checked in</h2><p>{visibleRoster.length} of {roster.length} officials shown · {visibleRoster.filter((item) => !item.isExpected).length} not expected in this view</p></div></div>
        <div className="checkin-view-tabs" role="tablist" aria-label="Check-in roster view"><button role="tab" aria-selected={rosterView === "detailed"} className={rosterView === "detailed" ? "active" : ""} onClick={() => setRosterView("detailed")}>Detailed Roster</button><button role="tab" aria-selected={rosterView === "grid"} className={rosterView === "grid" ? "active" : ""} onClick={() => setRosterView("grid")}>Attendance Grid</button></div>
        <div className="roster-controls"><label className="checkin-name-filter">Name<input type="search" placeholder="Type a first or last name…" value={nameFilter} onChange={(event) => setNameFilter(event.target.value)} /></label><AssignmentFilterMenu label="Status" options={[{ id: "checked_in", name: "Checked in" }, { id: "expected", name: "Not yet checked in" }, { id: "not_expected", name: "Not expected" }]} selected={statusFilters} onChange={setStatusFilters} /><AssignmentFilterMenu label="First Assignment Time" options={firstAssignmentTimes.map((time) => ({ id: time, name: time }))} selected={firstAssignmentTimeFilters} onChange={setFirstAssignmentTimeFilters} />{rosterView === "detailed" && <label>Sort by<select value={rosterSort} onChange={(event) => setRosterSort(event.target.value as typeof rosterSort)}><option value="first_assignment">First assignment time, then field</option><option value="last_name">Last name</option><option value="field">Field</option></select></label>}<AssignmentFilterMenu label="Site" options={sites.map((site) => ({ id: site, name: site }))} selected={siteFilters} onChange={setSiteFilters} /><SavedFilterControls filterKey={`checkin:${event.id}`} value={{ nameFilter, statusFilters, siteFilters, firstAssignmentTimeFilters, rosterSort }} onApply={(saved) => { setNameFilter(saved.nameFilter || ""); setStatusFilters(saved.statusFilters || []); setSiteFilters(saved.siteFilters || []); setFirstAssignmentTimeFilters(saved.firstAssignmentTimeFilters || []); setRosterSort(saved.rosterSort || "first_assignment"); }} /></div>
        {rosterView === "detailed" && visibleRoster.map(({ official, firstGame, firstAssignment, firstSite, displayedFirstField, isChecked, isExpected, checkInRecord, isCoachExpected }) => <div className={`official-row ${!isExpected ? "not-expected" : ""} ${newArrivals.has(official.id) ? "new-arrival" : ""}`} key={official.id}><span className="avatar">{initials(official.full_name)}</span><div className="official-name"><span className="checkin-official-name-line"><button className="checkin-official-button" onClick={() => onSelectOfficial(official.id, eventDate)}>{official.full_name}</button>{canManageCheckIns && <button className={`expectation-toggle ${!isExpected ? "restore" : ""}`} title={isExpected ? "Mark not expected" : "Restore as expected"} aria-label={`${isExpected ? "Mark" : "Restore"} ${official.full_name} ${isExpected ? "not expected" : "as expected"}`} disabled={expectationOfficialId === official.id} onClick={() => toggleAttendanceExpectation(official, isExpected)}>{expectationOfficialId === official.id ? "…" : isExpected ? "⊘" : "↺"}</button>}</span><PhoneLink className="checkin-phone-link" phone={official.phone} /><span>{isCoachExpected && !firstAssignment ? ["Referee Coach", firstGame ? formatTime(firstGame.starts_at) : null, displayedFirstField || null].filter(Boolean).join(" · ") : firstGame ? [formatTime(firstGame.starts_at), firstSite, firstGame.field_name, firstGame.age_group, firstGame.gender, firstAssignment ? positionLabel(firstAssignment.position, firstAssignment.position_title) : null].filter(Boolean).join(" · ") : "No assignment details"}</span></div><div className="checkin-status-actions"><div className="checkin-record-summary">{!isExpected ? <span className="status not-expected"><b />Not Expected</span> : <Status checked={isChecked} />}{isExpected && checkInRecord && <small>{formatTime(checkInRecord.checked_in_at)} · {checkInMethodLabel(checkInRecord.method)}</small>}</div>{canManageCheckIns && isExpected && <button className={isChecked ? "text-button undo-checkin-button" : "secondary manual-checkin-button"} disabled={manualCheckInOfficialId === official.id} onClick={() => toggleManualCheckIn(official, isChecked)}>{manualCheckInOfficialId === official.id ? "Updating…" : isChecked ? "Undo Check-In" : "Check In"}</button>}</div></div>)}
        {rosterView === "grid" && <div className="attendance-official-grid">{attendanceGridRoster.map(({ official, firstGame, displayedFirstField, isChecked, isExpected }) => <button className={`attendance-official-card ${!isExpected ? "not-expected" : isChecked ? "checked-in" : "expected"} ${newArrivals.has(official.id) ? "new-arrival" : ""}`} onClick={() => onSelectOfficial(official.id, eventDate)} key={official.id}><span className="avatar">{initials(official.full_name)}</span><strong title={official.full_name}>{official.full_name}</strong><small>{firstGame ? [formatTime(firstGame.starts_at), displayedFirstField || null].filter(Boolean).join(" · ") : "No game details"}</small><span className="attendance-card-status">{!isExpected ? "Not Expected" : isChecked ? "✓ Checked in" : "Expected"}</span></button>)}</div>}
        {!roster.length && <EmptyState>No officials are assigned on this date.</EmptyState>}
        {roster.length > 0 && !visibleRoster.length && <EmptyState>No officials match these filters.</EmptyState>}
      </article>
    </div>
    {canSelfCheckIn && <QrScanner onFound={scanForSelf} />}
    {currentOfficial && assignedToday.has(currentOfficial.id) && checked.has(currentOfficial.id) && <><p className="pilot-message staff-self-checkin">✓ {event.check_in_confirmation_message || "You are checked in for this event day."}</p>{!!event.check_in_links?.length && <div className="check-in-links">{event.check_in_links.map((link) => <a className="secondary" href={link.url} target="_blank" rel="noreferrer" key={`${link.title}-${link.url}`}>{link.title}</a>)}</div>}</>}
    <div className="checkin-print-document" aria-hidden="true">{eventDates.map((date) => <section className="checkin-print-page" key={date}><QRCodeSVG value={checkInUrlForDate(date)} size={430} /><div className="checkin-print-caption"><h1>Scan QR code for Referee Check-In</h1><h2>{event.name}</h2><p>{formatDate(date)}</p></div></section>)}</div>
  </section>;
}

type ScheduleSortField = "date" | "field" | "time" | "site" | "age_group" | "gender" | "competition" | "home_team" | "away_team";
const scheduleSortLabels: Record<ScheduleSortField, string> = { date: "Date", field: "Field", time: "Time", site: "Site", age_group: "Age Group", gender: "Gender", competition: "Competition", home_team: "Home Team", away_team: "Away Team" };

function ScheduleView({ session, event, data, availableOfficials, canEdit, canEditAssignments, canConfirmChanges, canManageCheckIns, showScheduleChangeMarkers, canRateCrew, coachView, siteSupervisorView, staffingViewsEnabled, onRateCrew, onCreated, onRefreshCheckIns, profile, ratingHistory, showRatingAverages, onSelectOfficial }: { session: Law18Session; event: EventRecord; data: EventData; availableOfficials: OfficialRecord[]; canEdit: boolean; canEditAssignments: boolean; canConfirmChanges: boolean; canManageCheckIns: boolean; showScheduleChangeMarkers: boolean; canRateCrew: boolean; coachView: boolean; siteSupervisorView: boolean; staffingViewsEnabled: boolean; onRateCrew: (gameId: string) => void; onCreated: () => void; onRefreshCheckIns: () => Promise<void>; profile: Profile; ratingHistory: { assessments: AssessmentRecord[]; games: GameRecord[]; assignments: AssignmentRecord[] }; showRatingAverages: boolean; onSelectOfficial: (officialId: string, eventDate?: string) => void }) {
  const officials = new Map(data.officials.map((official) => [official.id, official]));
  const myCoachingAssignments = data.coachAssignments.filter((assignment) => assignment.coach_id === session.user.id);
  const hasFullEventRatingAccess = myCoachingAssignments.some((assignment) => assignment.full_schedule);
  const assignedCoachingGameIds = new Set(myCoachingAssignments.map((assignment) => assignment.game_id).filter((gameId): gameId is string => Boolean(gameId)));
  const scheduleEventDates = [...new Set(data.games.map((game) => dateKeyInTimeZone(game.starts_at, event.timezone)))].sort();
  const defaultScheduleDate = defaultEventDate(scheduleEventDates, event.timezone, event.starts_on);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduleView, setScheduleView] = useActiveFilterState<"list" | "grid" | "field" | "first_assignment">(`schedule-view:${event.id}`, "list");
  const activeScheduleView = staffingViewsEnabled ? scheduleView : "list";
  const [reportsGameId, setReportsGameId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useActiveFilterState<ScheduleSortField[]>(`schedule-sort-order:${event.id}`, coachView ? ["field", "time", "date"] : ["date", "field", "time"]);
  const [dateFilters, setDateFilters] = useActiveFilterState<string[]>(`schedule-date:${event.id}`, [defaultScheduleDate]);
  const [fieldFilters, setFieldFilters] = useActiveFilterState<string[]>(`schedule-field:${event.id}`, []);
  const [siteFilters, setSiteFilters] = useActiveFilterState<string[]>(`schedule-site:${event.id}`, []);
  const [officialFilters, setOfficialFilters] = useActiveFilterState<string[]>(`schedule-official:${event.id}`, []);
  const [timeFilters, setTimeFilters] = useActiveFilterState<string[]>(`schedule-time:${event.id}`, []);
  const [ageFilters, setAgeFilters] = useActiveFilterState<string[]>(`schedule-age:${event.id}`, []);
  const [genderFilters, setGenderFilters] = useActiveFilterState<string[]>(`schedule-gender:${event.id}`, []);
  const [competitionFilters, setCompetitionFilters] = useActiveFilterState<string[]>(`schedule-competition:${event.id}`, []);
  const [changeFilters, setChangeFilters] = useActiveFilterState<string[]>(`schedule-changes:${event.id}`, []);
  const [scheduleSearch, setScheduleSearch] = useActiveFilterState(`schedule-search:${event.id}`, "");
  const [supervisorGroupMode, setSupervisorGroupMode] = useActiveFilterState<"field" | "time">(`supervisor-schedule-group:${event.id}`, "field");
  const [collapsedScheduleGroups, setCollapsedScheduleGroups] = useState<Set<string>>(new Set());
  const coachGroupsInitialized = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [exportScope, setExportScope] = useState<"all" | "filtered">("filtered");
  const [pdfOptions, setPdfOptions] = useState<SchedulePdfOptions>({ density: "compact", paperSize: "letter", nameFormat: "abbreviated", includeSeparators: false, includeSite: true, includeAgeGender: true, includeCompetition: true, includeGameType: false });
  const [exportBusy, setExportBusy] = useState(false);
  const [postEventExportBusy, setPostEventExportBusy] = useState(false);
  const [editingAssignmentsFor, setEditingAssignmentsFor] = useState<GameRecord | null>(null);
  const [editingGameInfo, setEditingGameInfo] = useState<GameRecord | null>(null);
  const [gameInfoDraft, setGameInfoDraft] = useState({ starts_at: "", venue_name: "", field_name: "", home_team: "", away_team: "", division: "", age_group: "", gender: "", game_type: "", operational: false });
  const [assignmentDrafts, setAssignmentDrafts] = useState<Array<{ official_id: string; position: AssignmentRecord["position"]; position_title: string; source_position_title: string }>>([]);
  const [swappingAssignments, setSwappingAssignments] = useState(false);
  const [assignmentSwapMode, setAssignmentSwapMode] = useState<"assignment" | "crew" | "details">("assignment");
  const [moveCrewsWithGameDetails, setMoveCrewsWithGameDetails] = useState(false);
  const [firstSwapGameId, setFirstSwapGameId] = useState("");
  const [secondSwapGameId, setSecondSwapGameId] = useState("");
  const [firstSwapAssignmentId, setFirstSwapAssignmentId] = useState("");
  const [secondSwapAssignmentId, setSecondSwapAssignmentId] = useState("");
  const [game, setGame] = useState({ starts_at: "", field_name: "", home_team: "", away_team: "", division: "" });
  const rulesDocument = eventFeatureEnabled(event, "event_documents") ? data.documents.find((document) => document.document_type === "rules_of_competition") : undefined;
  const ratingLabel = showRatingAverages ? (officialId: string, position: AssignmentRecord["position"]) => administrativeRatingLabel(officialId, position, event.id, data, ratingHistory, profile.rating_average_preferences) : undefined;
  async function addGame() {
    setBusy(true);
    setMessage("");
    try {
      const [date, time] = game.starts_at.split("T");
      await createGame(session, event.id, { ...game, starts_at: zonedLocalDateTimeToIso(date, `${time}:00`, event.timezone) });
      setGame({ starts_at: "", field_name: "", home_team: "", away_team: "", division: "" });
      setAdding(false);
      setMessage("Game added to this event.");
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to add the game.");
    } finally {
      setBusy(false);
    }
  }
  const eventDateKey = (item: GameRecord) => new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.starts_at));
  const sortValue = (item: GameRecord, field: ScheduleSortField) => {
    if (field === "date") return eventDateKey(item);
    if (field === "time") return String(timeSortValue(item.starts_at)).padStart(4, "0");
    if (field === "site") return item.venue_name || "Unspecified site";
    if (field === "field") return item.field_name || "Unspecified field";
    if (field === "age_group") return item.age_group || "Unspecified age group";
    if (field === "gender") return item.gender || "Unspecified gender";
    if (field === "competition") return item.division || "Unspecified competition";
    if (field === "home_team") return item.home_team || "Unspecified home team";
    return item.away_team || "Unspecified away team";
  };
  const displaySortValue = (item: GameRecord, field: ScheduleSortField) => field === "date" ? formatDate(item.starts_at) : field === "time" ? formatTime(item.starts_at) : sortValue(item, field);
  const compareGames = (a: GameRecord, b: GameRecord) => sortOrder.reduce((result, field) => result || sortValue(a, field).localeCompare(sortValue(b, field), undefined, { numeric: true }), 0) || a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id);
  const baseVisibleGames = coachView
    ? data.games.filter((game) => isRateableGame(game) && (hasFullEventRatingAccess || assignedCoachingGameIds.has(game.id)))
    : data.games;
  const filterOptions = {
    dates: [...new Set(baseVisibleGames.map(eventDateKey))].sort(),
    fields: [...new Set(baseVisibleGames.map((item) => item.field_name || "Unspecified field"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    sites: [...new Set(baseVisibleGames.map((item) => item.venue_name || "Unspecified site"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    times: [...new Set(baseVisibleGames.map((item) => formatTime(item.starts_at)))].sort((a, b) => timeSortValue(baseVisibleGames.find((item) => formatTime(item.starts_at) === a)?.starts_at || "") - timeSortValue(baseVisibleGames.find((item) => formatTime(item.starts_at) === b)?.starts_at || "")),
    ages: [...new Set(baseVisibleGames.map((item) => item.age_group || "Unspecified age group"))].sort(),
    genders: [...new Set(baseVisibleGames.map((item) => item.gender || "Unspecified gender"))].sort(),
    competitions: [...new Set(baseVisibleGames.map((item) => item.division || "Unspecified competition"))].sort(),
  };
  const officialGameIds = new Map<string, Set<string>>();
  data.assignments.forEach((assignment) => officialGameIds.set(assignment.official_id, new Set([...(officialGameIds.get(assignment.official_id) || []), assignment.game_id])));
  const visibleOfficialOptions = data.officials.filter((official) => [...(officialGameIds.get(official.id) || [])].some((gameId) => baseVisibleGames.some((game) => game.id === gameId))).sort(comparePeopleByLastName);
  const filteredGames = baseVisibleGames.filter((item) =>
    (!dateFilters.length || dateFilters.includes(eventDateKey(item)))
    && (!fieldFilters.length || fieldFilters.includes(item.field_name || "Unspecified field"))
    && (!siteFilters.length || siteFilters.includes(item.venue_name || "Unspecified site"))
    && (!timeFilters.length || timeFilters.includes(formatTime(item.starts_at)))
    && (!ageFilters.length || ageFilters.includes(item.age_group || "Unspecified age group"))
    && (!genderFilters.length || genderFilters.includes(item.gender || "Unspecified gender"))
    && (!competitionFilters.length || competitionFilters.includes(item.division || "Unspecified competition"))
    && (!changeFilters.length || changeFilters.includes(item.schedule_changed_at ? "changed" : "unchanged"))
    && (!officialFilters.length || data.assignments.some((assignment) => assignment.game_id === item.id && officialFilters.includes(assignment.official_id)))
    && `${item.home_team} ${item.away_team} ${item.field_name} ${item.venue_name || ""} ${item.division || ""} ${item.age_group || ""} ${item.gender || ""}`.toLowerCase().includes(scheduleSearch.trim().toLowerCase()));
  const visibleGames = [...filteredGames].sort(compareGames);
  const orderedSwapGames = [...visibleGames].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.field_name.localeCompare(b.field_name, undefined, { numeric: true }) || a.id.localeCompare(b.id));
  const swapOfficialMap = new Map([...availableOfficials, ...data.officials].map((official) => [official.id, official]));
  const firstSwapAssignments = sortGameCrew(data.assignments.filter((assignment) => assignment.game_id === firstSwapGameId && assignment.official_id));
  const secondSwapAssignments = sortGameCrew(data.assignments.filter((assignment) => assignment.game_id === secondSwapGameId && assignment.official_id));
  const swapGameLabel = (item: GameRecord) => `${formatDate(item.starts_at)} · ${formatTime(item.starts_at)} · ${item.field_name} · ${item.home_team} vs. ${item.away_team}`;
  const swapAssignmentLabel = (assignment: AssignmentRecord) => {
    const official = swapOfficialMap.get(assignment.official_id);
    return `${official ? officialSelectorLabel(official) : "Unknown official"} — ${positionLabel(assignment.position, assignment.position_title)}`;
  };
  const additionalFilterCount = fieldFilters.length + siteFilters.length + officialFilters.length + timeFilters.length + ageFilters.length + genderFilters.length + competitionFilters.length + changeFilters.length + (scheduleSearch.trim() ? 1 : 0);
  const totalFilterCount = dateFilters.length + additionalFilterCount;
  const clearScheduleFilters = () => {
    setDateFilters([]); setFieldFilters([]); setSiteFilters([]); setOfficialFilters([]); setTimeFilters([]);
    setAgeFilters([]); setGenderFilters([]); setCompetitionFilters([]); setChangeFilters([]); setScheduleSearch("");
  };
  const canRateGame = (game: GameRecord) => canRateCrew
    && isRateableGame(game)
    && (!coachView || hasFullEventRatingAccess || assignedCoachingGameIds.has(game.id));
  const scheduleGroupField: ScheduleSortField = siteSupervisorView ? supervisorGroupMode : sortOrder[0];
  const groupedGames = visibleGames.reduce<Record<string, { label: string; games: GameRecord[] }>>((groups, item) => {
    const value = displaySortValue(item, scheduleGroupField);
    const key = siteSupervisorView ? `${eventDateKey(item)}::${value}` : value;
    const label = siteSupervisorView ? `${formatDate(item.starts_at)} · ${value}` : value;
    return { ...groups, [key]: { label, games: [...(groups[key]?.games || []), item] } };
  }, {});
  useEffect(() => {
    if (!coachView || coachGroupsInitialized.current) return;
    setCollapsedScheduleGroups(new Set(Object.keys(groupedGames)));
    coachGroupsInitialized.current = true;
  }, [coachView, groupedGames]);
  function updateSortLevel(index: number, field: ScheduleSortField) {
    setSortOrder((current) => { const next = [...current]; const existing = next.indexOf(field); if (existing >= 0) next[existing] = next[index]; next[index] = field; return next; });
  }
  function makeExportRows(games: GameRecord[]): ScheduleExportRow[] {
    const ordered = [...games].sort(compareGames);
    return ordered.map((item, index) => {
      const crew = sortGameCrew(data.assignments.filter((assignment) => assignment.game_id === item.id)).map((assignment) => ({ position: positionLabel(assignment.position, assignment.position_title), name: officials.get(assignment.official_id)?.full_name || "Open" }));
      const previous = ordered[index - 1];
      return { id: item.id, date: formatDate(item.starts_at), time: formatTime(item.starts_at), field: item.field_name || "", site: item.venue_name || "", homeTeam: item.home_team, awayTeam: item.away_team, ageGroup: item.age_group || "", gender: item.gender || "", competition: item.division || "", gameType: item.game_type || "", crew, breakBefore: Boolean(previous && (sortValue(previous, sortOrder[0]) !== sortValue(item, sortOrder[0]) || sortValue(previous, sortOrder[1]) !== sortValue(item, sortOrder[1]))) };
    });
  }
  async function exportSchedule() {
    const games = exportScope === "filtered" ? visibleGames : baseVisibleGames;
    if (!games.length) return;
    setExportBusy(true);
    try {
      const rows = makeExportRows(games);
      const { exportScheduleExcel, exportSchedulePdf } = await import("./schedule-export");
      if (exportFormat === "xlsx") await exportScheduleExcel(event, rows);
      else await exportSchedulePdf(event, rows, pdfOptions);
      await logScheduleExport(session, event, rows.length, exportFormat, exportScope).catch(() => undefined);
      setExporting(false);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to export the schedule.");
    } finally {
      setExportBusy(false);
    }
  }
  async function downloadPostEventSummary() {
    setPostEventExportBusy(true);
    setMessage("");
    try {
      const { exportPostEventSummary } = await import("./post-event-export");
      await exportPostEventSummary(event, data);
      await logScheduleExport(session, event, data.games.length, "xlsx", "all").catch(() => undefined);
      setMessage("Post-event summary downloaded.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to create the post-event summary.");
    } finally {
      setPostEventExportBusy(false);
    }
  }
  function openGameInfoEditor(targetGame: GameRecord) {
    setEditingGameInfo(targetGame);
    setGameInfoDraft({
      starts_at: dateTimeLocalValue(targetGame.starts_at, event.timezone),
      venue_name: targetGame.venue_name || "",
      field_name: targetGame.field_name,
      home_team: targetGame.home_team,
      away_team: targetGame.away_team,
      division: targetGame.division || "",
      age_group: targetGame.age_group || "",
      gender: targetGame.gender || "",
      game_type: targetGame.game_type || "",
      operational: targetGame.operational,
    });
  }
  async function saveGameInfo() {
    if (!editingGameInfo || !gameInfoDraft.starts_at || !gameInfoDraft.field_name.trim() || !gameInfoDraft.home_team.trim() || !gameInfoDraft.away_team.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const [date, time] = gameInfoDraft.starts_at.split("T");
      await updateGameDetails(session, editingGameInfo.id, {
        ...gameInfoDraft,
        starts_at: zonedLocalDateTimeToIso(date, time, event.timezone),
        venue_name: gameInfoDraft.venue_name.trim() || null,
        field_name: gameInfoDraft.field_name.trim(),
        home_team: gameInfoDraft.home_team.trim(),
        away_team: gameInfoDraft.away_team.trim(),
        division: gameInfoDraft.division.trim(),
        age_group: gameInfoDraft.age_group.trim() || null,
        gender: gameInfoDraft.gender.trim() || null,
        game_type: gameInfoDraft.game_type.trim() || null,
      });
      setEditingGameInfo(null);
      await onCreated();
      setMessage("Game information updated. No notification was sent. The game remains marked as updated until an Event Admin confirms the change.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update this game.");
    } finally {
      setBusy(false);
    }
  }
  function openAssignmentEditor(targetGame: GameRecord) {
    setEditingAssignmentsFor(targetGame);
    setAssignmentDrafts(sortGameCrew(data.assignments.filter((assignment) => assignment.game_id === targetGame.id)).map((assignment) => ({ official_id: assignment.official_id, position: assignment.position, position_title: assignment.position_title || "", source_position_title: assignment.source_position_title || assignment.position_title || "" })));
  }
  async function saveAssignmentChanges() {
    if (!editingAssignmentsFor) return;
    setBusy(true);
    setMessage("");
    try {
      await replaceGameAssignments(session, editingAssignmentsFor.id, assignmentDrafts.filter((draft) => draft.official_id).map((draft) => ({ ...draft, position_title: draft.position_title.trim() || null, source_position_title: draft.source_position_title.trim() || null })));
      setEditingAssignmentsFor(null);
      await onCreated();
      setMessage("Assignments updated. No notification was sent. This game remains marked as updated until an Event Admin confirms the change.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update this crew.");
    } finally {
      setBusy(false);
    }
  }
  function closeAssignmentSwap() {
    setSwappingAssignments(false);
    setAssignmentSwapMode("assignment");
    setMoveCrewsWithGameDetails(false);
    setFirstSwapGameId("");
    setSecondSwapGameId("");
    setFirstSwapAssignmentId("");
    setSecondSwapAssignmentId("");
  }
  async function saveAssignmentSwap() {
    if (!firstSwapGameId || !secondSwapGameId) return;
    if (assignmentSwapMode === "assignment" && (!firstSwapAssignmentId || !secondSwapAssignmentId)) return;
    setBusy(true);
    setMessage("");
    try {
      if (assignmentSwapMode === "crew") await swapGameCrews(session, firstSwapGameId, secondSwapGameId);
      else if (assignmentSwapMode === "details") await swapGameDetails(session, firstSwapGameId, secondSwapGameId, moveCrewsWithGameDetails);
      else await swapGameAssignments(session, firstSwapAssignmentId, secondSwapAssignmentId);
      closeAssignmentSwap();
      await onCreated();
      setMessage(`${assignmentSwapMode === "crew" ? "Full crews" : assignmentSwapMode === "details" ? moveCrewsWithGameDetails ? "Game details and crews" : "Game details" : "Assignments"} swapped. No notification was sent. Both games remain marked as updated until an Event Admin confirms the changes.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to swap these assignments.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmScheduleChange(gameId: string) {
    setBusy(true);
    setMessage("");
    try { await confirmGameScheduleChange(session, gameId); await onCreated(); setMessage("The schedule change was confirmed and its updated marker was cleared."); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to confirm this schedule change."); }
    finally { setBusy(false); }
  }
  const scheduleViewChoice = staffingViewsEnabled ? <div className="schedule-view-choice panel" aria-label="Schedule view"><span>View Schedule As</span><div className="segmented"><button className={activeScheduleView === "list" ? "active" : ""} onClick={() => setScheduleView("list")}>List</button><button className={activeScheduleView === "grid" ? "active" : ""} onClick={() => setScheduleView("grid")}>Time and Field Grid</button><button className={activeScheduleView === "field" ? "active" : ""} onClick={() => setScheduleView("field")}>By Field</button><button className={activeScheduleView === "first_assignment" ? "active" : ""} onClick={() => setScheduleView("first_assignment")}>First Assignment</button></div></div> : null;
  if (activeScheduleView !== "list") return <section className="page-section"><div className="section-title schedule-section-title"><div><p className="eyebrow">EVENT SCHEDULE</p><h1>Games and crews</h1><p>Staffing views are now part of the event schedule.</p></div>{canManageCheckIns && <RefreshCheckInsButton onRefresh={onRefreshCheckIns} />}</div>{scheduleViewChoice}<AssignmentBoard key={activeScheduleView} embedded initialView={activeScheduleView} session={session} data={data} event={event} profile={profile} ratingHistory={ratingHistory} showRatingAverages={showRatingAverages} availableOfficials={availableOfficials} canEditAssignments={canEditAssignments} canConfirmChanges={canConfirmChanges} canManageCheckIns={canManageCheckIns} onAssignmentsChanged={onCreated} onRefreshCheckIns={onRefreshCheckIns} onSelectOfficial={onSelectOfficial} /></section>;
  return <section className="page-section"><div className="section-title schedule-section-title"><div><p className="eyebrow">EVENT SCHEDULE</p><h1>Games and crews</h1><p>{visibleGames.length} of {baseVisibleGames.length} games shown</p>{totalFilterCount > 0 && <button className="text-button schedule-clear-filters" type="button" onClick={clearScheduleFilters}>Clear All Filters · {totalFilterCount} active</button>}</div><div className="schedule-heading-actions">{canManageCheckIns && <RefreshCheckInsButton onRefresh={onRefreshCheckIns} />}<div className="schedule-heading-date"><AssignmentFilterMenu label="Date" options={filterOptions.dates.map((date) => ({ id: date, name: formatDate(date) }))} selected={dateFilters} onChange={setDateFilters} /></div></div></div>
    {scheduleViewChoice}
    {rulesDocument && <aside className="panel event-rules-banner"><div><p className="eyebrow">EVENT DOCUMENT</p><strong>Rules of Competition</strong><span>{rulesDocument.title}</span></div><EventDocumentLink session={session} document={rulesDocument} /></aside>}
    <div className="schedule-primary-actions"><button className="secondary" onClick={() => setExporting(true)}>Export Schedule</button>{canEditAssignments && <button className="secondary" type="button" onClick={() => setSwappingAssignments(true)}>Swap Assignments</button>}{canEdit && <button className="secondary" disabled={postEventExportBusy} onClick={() => void downloadPostEventSummary()}>{postEventExportBusy ? "Preparing Summary…" : "Post-Event Summary"}</button>}{Object.keys(groupedGames).length > 1 && <button className="secondary" type="button" onClick={() => setCollapsedScheduleGroups(new Set(Object.keys(groupedGames)))}>Collapse All</button>}{canEdit && <button className="secondary" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "Add Game Manually"}</button>}</div>
    <details className="panel schedule-control-card schedule-sort-card"><summary><span><strong>Sort Schedule</strong><small>{sortOrder.map((field) => scheduleSortLabels[field]).join(" / ")}</small></span><b>+</b></summary><div className="schedule-toolbar"><div className="schedule-sort-controls">{siteSupervisorView && <label>Group Schedule By<select value={supervisorGroupMode} onChange={(change) => { setSupervisorGroupMode(change.target.value as typeof supervisorGroupMode); setCollapsedScheduleGroups(new Set()); }}><option value="field">Field</option><option value="time">Time</option></select></label>}<label>Sort preset<select value={sortOrder.join("-")} onChange={(change) => setSortOrder(change.target.value === "date-time-field" ? ["date", "time", "field"] : ["date", "field", "time"])}><option value="date-field-time">Date / Field / Time</option><option value="date-time-field">Date / Time / Field</option>{![["date", "field", "time"], ["date", "time", "field"]].some((preset) => preset.join("-") === sortOrder.join("-")) && <option value={sortOrder.join("-")}>Custom</option>}</select></label>{sortOrder.map((field, index) => <label key={index}>Sort {index + 1}<select value={field} onChange={(change) => updateSortLevel(index, change.target.value as ScheduleSortField)}>{(Object.keys(scheduleSortLabels) as ScheduleSortField[]).map((option) => <option value={option} key={option}>{scheduleSortLabels[option]}</option>)}</select></label>)}</div></div></details>
    <details className="panel schedule-control-card schedule-filters-card"><summary><span><strong>More Filters</strong><small>{additionalFilterCount ? `${additionalFilterCount} active` : "Field, site, official, time, competition, and changes"}</small></span><b>+</b></summary><div className="schedule-filter-bar"><AssignmentFilterMenu label="Field" options={filterOptions.fields.map((field) => ({ id: field, name: field }))} selected={fieldFilters} onChange={setFieldFilters} /><AssignmentFilterMenu label="Site" options={filterOptions.sites.map((site) => ({ id: site, name: site }))} selected={siteFilters} onChange={setSiteFilters} /><AssignmentFilterMenu label="Official" options={visibleOfficialOptions.slice().sort(comparePeopleByLastName).map((official) => ({ id: official.id, name: officialSelectorLabel(official) }))} selected={officialFilters} onChange={setOfficialFilters} searchable /><AssignmentFilterMenu label="Time" options={filterOptions.times.map((time) => ({ id: time, name: time }))} selected={timeFilters} onChange={setTimeFilters} /><AssignmentFilterMenu label="Age Group" options={filterOptions.ages.map((age) => ({ id: age, name: age }))} selected={ageFilters} onChange={setAgeFilters} /><AssignmentFilterMenu label="Gender" options={filterOptions.genders.map((gender) => ({ id: gender, name: gender }))} selected={genderFilters} onChange={setGenderFilters} /><AssignmentFilterMenu label="Competition" options={filterOptions.competitions.map((competition) => ({ id: competition, name: competition }))} selected={competitionFilters} onChange={setCompetitionFilters} /><AssignmentFilterMenu label="Assignment Changes" options={[{ id: "changed", name: "Changed — awaiting confirmation" }, { id: "unchanged", name: "No pending changes" }]} selected={changeFilters} onChange={setChangeFilters} /><label className="schedule-search-filter">Teams or game details<input type="search" value={scheduleSearch} onChange={(change) => setScheduleSearch(change.target.value)} placeholder="Search schedule…" /></label><SavedFilterControls filterKey={`schedule:${event.id}`} value={{ dateFilters, fieldFilters, siteFilters, officialFilters, timeFilters, ageFilters, genderFilters, competitionFilters, changeFilters, scheduleSearch, sortOrder }} onApply={(saved) => { setDateFilters(saved.dateFilters || []); setFieldFilters(saved.fieldFilters || []); setSiteFilters(saved.siteFilters || []); setOfficialFilters(saved.officialFilters || []); setTimeFilters(saved.timeFilters || []); setAgeFilters(saved.ageFilters || []); setGenderFilters(saved.genderFilters || []); setCompetitionFilters(saved.competitionFilters || []); setChangeFilters(saved.changeFilters || []); setScheduleSearch(saved.scheduleSearch || ""); setSortOrder(saved.sortOrder || ["date", "field", "time"]); }} /></div></details>
    {exporting && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) setExporting(false); }}><section className="confirmation-dialog schedule-export-dialog" role="dialog" aria-modal="true" aria-label="Export schedule"><p className="eyebrow">SCHEDULE EXPORT</p><h2>Export {event.name}</h2><label>File format<select value={exportFormat} onChange={(change) => setExportFormat(change.target.value as typeof exportFormat)}><option value="xlsx">Excel workbook (.xlsx)</option><option value="pdf">PDF document (.pdf)</option></select></label><label>Games to include<select value={exportScope} onChange={(change) => setExportScope(change.target.value as typeof exportScope)}><option value="filtered">Only {visibleGames.length} filtered game{visibleGames.length === 1 ? "" : "s"}</option><option value="all">All {baseVisibleGames.length} game{baseVisibleGames.length === 1 ? "" : "s"} in {coachView ? "my coaching scope" : "the event"}</option></select></label>{exportFormat === "pdf" && <fieldset className="schedule-pdf-options"><legend>PDF Layout</legend><div className="schedule-pdf-selects"><label>Density<select value={pdfOptions.density} onChange={(change) => setPdfOptions((current) => ({ ...current, density: change.target.value as SchedulePdfOptions["density"] }))}><option value="standard">Standard</option><option value="compact">Compact</option><option value="ultra">Ultra Compact</option></select></label><label>Paper<select value={pdfOptions.paperSize} onChange={(change) => setPdfOptions((current) => ({ ...current, paperSize: change.target.value as SchedulePdfOptions["paperSize"] }))}><option value="letter">Letter</option><option value="legal">Legal</option></select></label><label>Official names<select value={pdfOptions.nameFormat} onChange={(change) => setPdfOptions((current) => ({ ...current, nameFormat: change.target.value as SchedulePdfOptions["nameFormat"] }))}><option value="abbreviated">First Initial + Last Name</option><option value="full">Full Name</option></select></label></div><div className="schedule-pdf-checks">{([['includeSite', 'Site'], ['includeAgeGender', 'Age and Gender'], ['includeCompetition', 'Competition'], ['includeGameType', 'Game Type'], ['includeSeparators', 'Group Separator Rows']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={pdfOptions[key]} onChange={(change) => setPdfOptions((current) => ({ ...current, [key]: change.target.checked }))} />{label}</label>)}</div><p>Each crew position receives its own column. Unused position columns are omitted automatically.</p></fieldset>}<p className="import-note">Games use the selected three-level sort order.{exportFormat === "pdf" && !pdfOptions.includeSeparators ? " Compact PDFs do not add blank group rows." : ` A blank separator row appears whenever ${scheduleSortLabels[sortOrder[1]].toLowerCase()} changes within ${scheduleSortLabels[sortOrder[0]].toLowerCase()}.`}</p><div><button className="secondary" disabled={exportBusy} onClick={() => setExporting(false)}>Cancel</button><button className="primary" disabled={exportBusy || !(exportScope === "filtered" ? visibleGames.length : baseVisibleGames.length)} onClick={() => void exportSchedule()}>{exportBusy ? "Preparing…" : `Download ${exportFormat.toUpperCase()}`}</button></div></section></div>}
    {swappingAssignments && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) closeAssignmentSwap(); }}>
      <section className="confirmation-dialog assignment-swap-dialog" role="dialog" aria-modal="true" aria-labelledby="assignment-swap-title">
        <header><div><p className="eyebrow">SCHEDULE CORRECTION</p><h2 id="assignment-swap-title">Swap Assignments</h2><p>Choose two games from the currently filtered schedule, then exchange one assignment or the entire staffed crew.</p></div><button className="modal-close-button" aria-label="Close assignment swap" onClick={closeAssignmentSwap}>×</button></header>
        <fieldset className="assignment-swap-mode"><legend>Swap</legend><label><input type="radio" name="assignment-swap-mode" checked={assignmentSwapMode === "assignment"} onChange={() => setAssignmentSwapMode("assignment")} />One assignment</label><label><input type="radio" name="assignment-swap-mode" checked={assignmentSwapMode === "crew"} onChange={() => { setAssignmentSwapMode("crew"); setFirstSwapAssignmentId(""); setSecondSwapAssignmentId(""); }} />Entire staffed crew</label><label><input type="radio" name="assignment-swap-mode" checked={assignmentSwapMode === "details"} onChange={() => { setAssignmentSwapMode("details"); setFirstSwapAssignmentId(""); setSecondSwapAssignmentId(""); }} />Game matchup and details</label></fieldset>
        <div className="assignment-swap-grid">
          <fieldset><legend>First Game</legend><label>Game<select value={firstSwapGameId} onChange={(change) => { setFirstSwapGameId(change.target.value); setFirstSwapAssignmentId(""); if (change.target.value === secondSwapGameId) { setSecondSwapGameId(""); setSecondSwapAssignmentId(""); } }}><option value="">Choose a game</option>{orderedSwapGames.map((item) => <option value={item.id} key={item.id}>{swapGameLabel(item)}</option>)}</select></label>{assignmentSwapMode === "assignment" && <label>Official and position<select value={firstSwapAssignmentId} disabled={!firstSwapGameId} onChange={(change) => setFirstSwapAssignmentId(change.target.value)}><option value="">Choose an assignment</option>{firstSwapAssignments.map((assignment) => <option value={assignment.id} key={assignment.id}>{swapAssignmentLabel(assignment)}</option>)}</select></label>}</fieldset>
          <fieldset><legend>Second Game</legend><label>Game<select value={secondSwapGameId} onChange={(change) => { setSecondSwapGameId(change.target.value); setSecondSwapAssignmentId(""); }}><option value="">Choose a different game</option>{orderedSwapGames.filter((item) => item.id !== firstSwapGameId).map((item) => <option value={item.id} key={item.id}>{swapGameLabel(item)}</option>)}</select></label>{assignmentSwapMode === "assignment" && <label>Official and position<select value={secondSwapAssignmentId} disabled={!secondSwapGameId} onChange={(change) => setSecondSwapAssignmentId(change.target.value)}><option value="">Choose an assignment</option>{secondSwapAssignments.map((assignment) => <option value={assignment.id} key={assignment.id}>{swapAssignmentLabel(assignment)}</option>)}</select></label>}</fieldset>
        </div>
        {assignmentSwapMode === "details" && <label className="game-operational-toggle"><input type="checkbox" checked={moveCrewsWithGameDetails} onChange={(change) => setMoveCrewsWithGameDetails(change.target.checked)} /><span><strong>Move crews with games</strong><small>Use when the matchups switch fields or times and each staffed crew should stay with its matchup.</small></span></label>}
        <p className="import-note">{assignmentSwapMode === "crew" ? "Full crews must have the same number of staffed assignments. Officials exchange slots in imported crew order; each game's position structure stays in place. " : assignmentSwapMode === "details" ? moveCrewsWithGameDetails ? "Teams and competition details exchange schedule slots, and the full staffed crews move with their games. Both games must have the same number of staffed assignments. Time, venue, field, and source identifiers stay in place. " : "Teams, division, age group, gender, game type, and operational status exchange schedule slots. Time, venue, field, crew, and source identifiers stay in place. " : "The selected officials exchange game slots; each position stays with its original game. "}No notification or acceptance request is sent. Existing ratings are not changed. Both games will be marked as updated.</p>
        <div className="assignment-swap-actions"><button className="secondary" disabled={busy} onClick={closeAssignmentSwap}>Cancel</button><button className="primary" disabled={busy || !firstSwapGameId || !secondSwapGameId || (assignmentSwapMode === "assignment" && (!firstSwapAssignmentId || !secondSwapAssignmentId))} onClick={() => void saveAssignmentSwap()}>{busy ? "Swapping…" : assignmentSwapMode === "crew" ? "Swap Full Crews" : assignmentSwapMode === "details" ? "Swap Game Details" : "Swap Assignments"}</button></div>
      </section>
    </div>}
    {editingGameInfo && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) setEditingGameInfo(null); }}><section className="confirmation-dialog game-info-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="game-info-editor-title"><header><div><p className="eyebrow">GAME INFORMATION</p><h2 id="game-info-editor-title">Edit Game</h2><p>Source and import identifiers remain unchanged.</p></div><button className="modal-close-button" aria-label="Close game editor" onClick={() => setEditingGameInfo(null)}>×</button></header><div className="game-info-editor-grid"><label>Date and time<input type="datetime-local" value={gameInfoDraft.starts_at} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, starts_at: change.target.value })} /></label><label>Venue or site<input value={gameInfoDraft.venue_name} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, venue_name: change.target.value })} /></label><label>Field<input value={gameInfoDraft.field_name} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, field_name: change.target.value })} /></label><label>Home team<input value={gameInfoDraft.home_team} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, home_team: change.target.value })} /></label><label>Away team<input value={gameInfoDraft.away_team} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, away_team: change.target.value })} /></label><label>Division or competition<input value={gameInfoDraft.division} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, division: change.target.value })} /></label><label>Age group<input value={gameInfoDraft.age_group} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, age_group: change.target.value })} /></label><label>Gender<input value={gameInfoDraft.gender} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, gender: change.target.value })} /></label><label>Game type<input value={gameInfoDraft.game_type} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, game_type: change.target.value })} /></label><label className="game-operational-toggle"><input type="checkbox" checked={gameInfoDraft.operational} onChange={(change) => setGameInfoDraft({ ...gameInfoDraft, operational: change.target.checked })} /><span><strong>Operational record</strong><small>Use for HQ, standby, coordinator, or similar non-match schedule records.</small></span></label></div><p className="import-note">No notification or acceptance request is sent. This game will be marked as updated.</p><div className="game-info-editor-actions"><button className="secondary" disabled={busy} onClick={() => setEditingGameInfo(null)}>Cancel</button><button className="primary" disabled={busy || !gameInfoDraft.starts_at || !gameInfoDraft.field_name.trim() || !gameInfoDraft.home_team.trim() || !gameInfoDraft.away_team.trim()} onClick={() => void saveGameInfo()}>{busy ? "Saving…" : "Save Game Information"}</button></div></section></div>}
    {editingAssignmentsFor && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) setEditingAssignmentsFor(null); }}><section className="confirmation-dialog assignment-editor-dialog" role="dialog" aria-modal="true"><header><div><p className="eyebrow">POSTED SCHEDULE CORRECTION</p><h2>{editingAssignmentsFor.home_team} vs. {editingAssignmentsFor.away_team}</h2><p>{formatDate(editingAssignmentsFor.starts_at)} · {formatTime(editingAssignmentsFor.starts_at)} · {editingAssignmentsFor.field_name}</p></div><button className="modal-close-button" aria-label="Close assignment editor" onClick={() => setEditingAssignmentsFor(null)}>×</button></header><p className="import-note">Changes update Law18Ref immediately. Officials are not notified and no acceptance is requested.</p><div className="assignment-editor-rows">{assignmentDrafts.map((draft, index) => <div className="assignment-editor-row" key={index}><span className="assignment-row-number" aria-hidden="true">{index + 1}</span><label className="assignment-position-field">Position<select value={draft.position} onChange={(change) => setAssignmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, position: change.target.value as AssignmentRecord["position"] } : item))}>{(["referee", "assistant_referee", "fourth_official", "mentor", "referee_coach", "site_coordinator", "site_supervisor", "standby", "other"] as AssignmentRecord["position"][]).map((position) => <option value={position} key={position}>{positionLabel(position)}</option>)}</select></label><label className="assignment-official-field">Official<select value={draft.official_id} onChange={(change) => setAssignmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, official_id: change.target.value } : item))}><option value="">Open position</option>{availableOfficials.filter((official) => !official.archived_at && !official.merged_into_official_id).slice().sort(comparePeopleByLastName).map((official) => <option value={official.id} key={official.id}>{officialSelectorLabel(official)}</option>)}</select></label><button className="text-button assignment-remove-button" type="button" onClick={() => setAssignmentDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button><label className="assignment-display-title">Display title (optional)<input value={draft.position_title} onChange={(change) => setAssignmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, position_title: change.target.value } : item))} placeholder={positionLabel(draft.position)} /></label></div>)}</div><button className="secondary add-assignment-row" type="button" onClick={() => setAssignmentDrafts((current) => [...current, { official_id: "", position: "other", position_title: "", source_position_title: "" }])}>Add Assignment</button><div className="assignment-editor-actions"><button className="secondary" disabled={busy} onClick={() => setEditingAssignmentsFor(null)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void saveAssignmentChanges()}>{busy ? "Saving…" : "Update Posted Schedule"}</button></div></section></div>}
    {adding && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) setAdding(false); }}><article className="panel manual-entry-form manual-entry-modal" role="dialog" aria-modal="true" aria-label="Add game manually"><header><h2>Add a game to {event.name}</h2><button className="modal-close-button" aria-label="Close" onClick={() => setAdding(false)}>×</button></header><div className="manual-form-grid"><label>Date and time<input type="datetime-local" value={game.starts_at} onChange={(e) => setGame({ ...game, starts_at: e.target.value })} /></label><label>Field<input value={game.field_name} onChange={(e) => setGame({ ...game, field_name: e.target.value })} /></label><label>Home team<input value={game.home_team} onChange={(e) => setGame({ ...game, home_team: e.target.value })} /></label><label>Away team<input value={game.away_team} onChange={(e) => setGame({ ...game, away_team: e.target.value })} /></label><label>Division or competition<input value={game.division} onChange={(e) => setGame({ ...game, division: e.target.value })} /></label></div><button className="primary" disabled={busy || !game.starts_at || !game.field_name.trim() || !game.home_team.trim() || !game.away_team.trim()} onClick={addGame}>{busy ? "Adding…" : "Add game"}</button></article></div>}
    {message && <p className="pilot-message">{message}</p>}
    <div className="schedule-groups">{Object.entries(groupedGames).map(([key, group]) => { const collapsed = collapsedScheduleGroups.has(key); return <article className="panel schedule-group" key={key}><button className="schedule-group-toggle" type="button" aria-expanded={!collapsed} onClick={() => setCollapsedScheduleGroups((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })}><span>{group.label}</span><small>{group.games.length} game{group.games.length === 1 ? "" : "s"}</small><b>{collapsed ? "+" : "−"}</b></button>{!collapsed && <div className="schedule-list">{group.games.map((game) => {
      const crew = sortGameCrew(data.assignments.filter((assignment) => assignment.game_id === game.id));
      const ratedByViewer = data.assessments.some((assessment) => assessment.game_id === game.id && assessment.coach_id === profile.id && assessment.status !== "draft" && !assessment.deleted_at);
      const ratedByAnother = showRatingAverages && data.assessments.some((assessment) => assessment.game_id === game.id && assessment.coach_id !== profile.id && assessment.status !== "draft" && !assessment.deleted_at);
      const submittedReports = data.assessments.filter((assessment) => assessment.game_id === game.id && assessment.status !== "draft" && !assessment.deleted_at);
      return <article className={`schedule-card coach-schedule-card ${showScheduleChangeMarkers && game.schedule_changed_at ? "schedule-updated" : ""}`} key={game.id}><div className="timebox"><time>{formatDate(game.starts_at)}</time><strong>{formatTime(game.starts_at)}</strong><span>{game.field_name}</span>{showScheduleChangeMarkers && game.schedule_changed_at && <small>Updated</small>}</div><div className="schedule-game-details"><h2>{game.home_team} vs. {game.away_team}</h2><p>{[game.age_group, game.gender, game.division].filter(Boolean).join(" · ")}</p>{submittedReports.length > 0 && <GameReportsButton ratedByViewer={ratedByViewer} ratedByAnother={ratedByAnother} onClick={() => setReportsGameId(game.id)} />}<div className="schedule-crew-list">{crew.map((assignment) => { const checked = data.checkIns.some((item) => item.official_id === assignment.official_id && item.event_date === game.starts_at.slice(0, 10) && item.status === "checked_in"); const official = officials.get(assignment.official_id); return <span className={checked ? "schedule-crew-checked" : ""} key={assignment.id}><b>{positionLabel(assignment.position, assignment.position_title)}</b>{official ? <button className="official-name-link" onClick={() => onSelectOfficial(official.id, game.starts_at.slice(0, 10))}>{official.full_name}{ratingLabel?.(official.id, assignment.position)}</button> : <strong>Open</strong>}</span>; })}{!crew.length && <small>No crew assignments are visible for this game.</small>}</div></div><div className="schedule-game-actions">{canEditAssignments && <button className="secondary" onClick={() => openGameInfoEditor(game)}>Edit Game Info</button>}{canEditAssignments && <button className="secondary" onClick={() => openAssignmentEditor(game)}>Edit Assignments</button>}{showScheduleChangeMarkers && game.schedule_changed_at && canConfirmChanges && <button className="primary" disabled={busy} onClick={() => void confirmScheduleChange(game.id)}>Change Confirmed</button>}{canRateGame(game) && !ratedByViewer && <button className="primary rate-crew-button" onClick={() => onRateCrew(game.id)}>Rate Crew</button>}</div></article>;
    })}</div>}</article>; })}</div>
    {reportsGameId && <SubmittedReportsDialog game={data.games.find((item) => item.id === reportsGameId)!} reports={data.assessments.filter((assessment) => assessment.game_id === reportsGameId && assessment.status !== "draft" && !assessment.deleted_at)} assignments={data.assignments.filter((assignment) => assignment.game_id === reportsGameId)} officials={officials} onClose={() => setReportsGameId(null)} />}
  </section>;
}

function SubmittedReportsDialog({ game, reports, assignments, officials, onClose }: { game: GameRecord; reports: AssessmentRecord[]; assignments: AssignmentRecord[]; officials: Map<string, OfficialRecord>; onClose: () => void }) {
  const crewOrder = new Map(sortGameCrew(assignments).map((assignment, index) => [assignment.official_id, index]));
  const orderedReports = reports.map((report, sourceIndex) => {
    const assignment: AssignmentRecord = assignments.find((item) => item.official_id === report.official_id) || { id: report.id, game_id: report.game_id, official_id: report.official_id, position: report.rated_position || "other", position_title: report.rated_position_title || null, source_position_title: report.rated_position_title || null };
    return { report, sourceIndex, assignment };
  }).sort((left, right) => crewPositionPriority(left.assignment) - crewPositionPriority(right.assignment) || (crewOrder.get(left.report.official_id) ?? left.sourceIndex) - (crewOrder.get(right.report.official_id) ?? right.sourceIndex) || left.sourceIndex - right.sourceIndex).map(({ report }) => report);
  return <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) onClose(); }}><section className="confirmation-dialog submitted-reports-dialog" role="dialog" aria-modal="true" aria-labelledby="submitted-reports-title"><header><div><p className="eyebrow">SUBMITTED REPORTS</p><h2 id="submitted-reports-title">{game.home_team} vs. {game.away_team}</h2><p>{formatDate(game.starts_at)} · {formatTime(game.starts_at)} · {game.field_name}</p></div><button className="modal-close-button" aria-label="Close submitted reports" onClick={onClose}>×</button></header><div className="submitted-reports-list">{orderedReports.map((report) => <article key={report.id}><div><strong>{officials.get(report.official_id)?.full_name || "Official"}</strong><span>{positionLabel(report.rated_position || "other", report.rated_position_title)}</span></div><b>{report.overall_rating == null ? "N/A" : `${report.overall_rating}/5`}</b>{report.strengths && <p><strong>Positive Performance:</strong> {report.strengths}</p>}{report.development_focus && <p><strong>Areas for Improvement:</strong> {report.development_focus}</p>}{report.additional_comments && <p><strong>Comments:</strong> {report.additional_comments}</p>}{report.coach_notes && <p><strong>Notes:</strong> {report.coach_notes}</p>}</article>)}</div><button className="primary" onClick={onClose}>Close Reports</button></section></div>;
}

const eventFeatureLabels: Record<EventFeatureKey, { title: string; description: string }> = {
  assignment_board: { title: "Schedule Staffing Views", description: "Time-and-field, by-field, and first-assignment views inside Schedule." },
  check_in: { title: "Check-In", description: "QR, attendance dashboard, and manual check-in." },
  ratings: { title: "Ratings", description: "Crew evaluations, history, and rating averages." },
  coaching: { title: "Coaching", description: "Referee-coach assignments and coaching schedule." },
  event_documents: { title: "Event Documents", description: "Rules of Competition and other private PDFs." },
};
const defaultEventFeatures: EventFeatureSettings = { assignment_board: true, check_in: true, ratings: true, coaching: true, event_documents: true };
function eventFeatureEnabled(event: EventRecord | undefined, feature: EventFeatureKey) {
  if (!event) return false;
  if (feature === "check_in" && event.check_in_enabled === false) return false;
  return event.feature_settings?.[feature] ?? true;
}

function EventSettingsPanel({ session, organization, event, events, onChanged }: { session: Law18Session; organization: OrganizationRecord; event: EventRecord; events: EventRecord[]; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(event.name);
  const [venueName, setVenueName] = useState(event.venue_name);
  const [startsOn, setStartsOn] = useState(event.starts_on);
  const [endsOn, setEndsOn] = useState(event.ends_on);
  const [timezone, setTimezone] = useState(event.timezone);
  const [eventType, setEventType] = useState<EventRecord["event_type"]>(event.event_type || "tournament");
  const [parentLeagueId, setParentLeagueId] = useState(event.parent_league_id || "");
  const [features, setFeatures] = useState<EventFeatureSettings>({ ...defaultEventFeatures, ...(event.feature_settings || {}), check_in: event.check_in_enabled !== false });
  const [guestCheckInEnabled, setGuestCheckInEnabled] = useState(Boolean(event.guest_check_in_enabled));
  const [externalCheckInFields, setExternalCheckInFields] = useState<ExternalCheckInField[]>(event.external_check_in_fields?.length ? event.external_check_in_fields : ["last_name", "email"]);
  const [externalOtherLabel, setExternalOtherLabel] = useState(event.external_check_in_other_label || "Other identifier");
  const [checkInConfirmationMessage, setCheckInConfirmationMessage] = useState(event.check_in_confirmation_message || "You’re checked in. Have a great day!");
  const [firstFailureMessage, setFirstFailureMessage] = useState(event.external_check_in_first_failure_message || "No matching referee was found in today’s schedule. Try again and confirm the information matches your Assignr account.");
  const [secondFailureMessage, setSecondFailureMessage] = useState(event.external_check_in_second_failure_message || "Please check in in person with the Site Supervisor.");
  const [arrivalMessage, setArrivalMessage] = useState(event.external_check_in_arrival_message || "Enter the requested details exactly as they appear in your Assignr account or the event’s assigning system.");
  const [allowAccountSignIn, setAllowAccountSignIn] = useState(event.external_check_in_allow_account_sign_in !== false);
  const [requireExternalCheckInConfirmation, setRequireExternalCheckInConfirmation] = useState(event.external_check_in_confirmation_required !== false);
  const [siteSupervisorAssignmentEditingEnabled, setSiteSupervisorAssignmentEditingEnabled] = useState(Boolean(event.site_supervisor_assignment_editing_enabled));
  const [checkInLinks, setCheckInLinks] = useState<Array<{ title: string; url: string }>>(event.check_in_links || []);
  const [documents, setDocuments] = useState<EventDocumentRecord[]>([]);
  const [documentType, setDocumentType] = useState<EventDocumentRecord["document_type"]>("rules_of_competition");
  const [title, setTitle] = useState("Rules of Competition");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refreshDocuments = useCallback(() => loadEventDocuments(session, event.id).then(setDocuments), [event.id, session]);
  useEffect(() => { void refreshDocuments(); }, [refreshDocuments]);
  useEffect(() => { setName(event.name); setVenueName(event.venue_name); setStartsOn(event.starts_on); setEndsOn(event.ends_on); setTimezone(event.timezone); setEventType(event.event_type || "tournament"); setParentLeagueId(event.parent_league_id || ""); setFeatures({ ...defaultEventFeatures, ...(event.feature_settings || {}), check_in: event.check_in_enabled !== false }); setGuestCheckInEnabled(Boolean(event.guest_check_in_enabled)); setExternalCheckInFields(event.external_check_in_fields?.length ? event.external_check_in_fields : ["last_name", "email"]); setExternalOtherLabel(event.external_check_in_other_label || "Other identifier"); setCheckInConfirmationMessage(event.check_in_confirmation_message || "You’re checked in. Have a great day!"); setFirstFailureMessage(event.external_check_in_first_failure_message || "No matching referee was found in today’s schedule. Try again and confirm the information matches your Assignr account."); setSecondFailureMessage(event.external_check_in_second_failure_message || "Please check in in person with the Site Supervisor."); setArrivalMessage(event.external_check_in_arrival_message || "Enter the requested details exactly as they appear in your Assignr account or the event’s assigning system."); setAllowAccountSignIn(event.external_check_in_allow_account_sign_in !== false); setRequireExternalCheckInConfirmation(event.external_check_in_confirmation_required !== false); setSiteSupervisorAssignmentEditingEnabled(Boolean(event.site_supervisor_assignment_editing_enabled)); setCheckInLinks(event.check_in_links || []); }, [event]);
  const entitled = (feature: EventFeatureKey) => organization.feature_entitlements?.[feature] ?? true;
  async function saveSettings() {
    setBusy(true); setMessage("");
    try {
      const effectiveFeatures = Object.fromEntries((Object.keys(defaultEventFeatures) as EventFeatureKey[]).map((feature) => [feature, entitled(feature) && features[feature]])) as EventFeatureSettings;
      const validLinks = checkInLinks.filter((link) => link.title.trim() && link.url.trim()).map((link) => { const url = new URL(link.url); if (!/^https?:$/.test(url.protocol)) throw new Error("Check-in document links must use HTTP or HTTPS."); return { title: link.title.trim(), url: url.toString() }; });
      await updateEventSettings(session, event.id, { name: name.trim(), venue_name: venueName.trim(), starts_on: startsOn, ends_on: endsOn, timezone, event_type: eventType, parent_league_id: eventType === "tournament" ? parentLeagueId || null : null, feature_settings: effectiveFeatures, guest_check_in_enabled: effectiveFeatures.check_in && guestCheckInEnabled, external_check_in_fields: externalCheckInFields, external_check_in_other_label: externalOtherLabel.trim() || "Other identifier", check_in_confirmation_message: checkInConfirmationMessage.trim(), external_check_in_first_failure_message: firstFailureMessage.trim(), external_check_in_second_failure_message: secondFailureMessage.trim(), external_check_in_arrival_message: arrivalMessage.trim(), external_check_in_allow_account_sign_in: allowAccountSignIn, external_check_in_confirmation_required: requireExternalCheckInConfirmation, check_in_links: validLinks, site_supervisor_assignment_editing_enabled: siteSupervisorAssignmentEditingEnabled });
      await onChanged(); setMessage("Event settings saved and applied to authorized users.");
    }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save event settings."); }
    finally { setBusy(false); }
  }
  async function upload() {
    if (!file) return;
    setBusy(true); setMessage("");
    try { await uploadEventDocument(session, event.id, file, documentType, title); setFile(null); await refreshDocuments(); await onChanged(); setMessage(documentType === "rules_of_competition" ? "Rules of Competition uploaded and linked throughout the event." : "Event document uploaded."); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to upload this event document."); }
    finally { setBusy(false); }
  }
  const leagues = events.filter((item) => item.event_type === "league" && item.id !== event.id);
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">EVENT SETTINGS</p><h1>{event.name}</h1><p>Configure this event within the features enabled for {organization.name}.</p></div></div><article className="panel event-documents-settings"><div><p className="eyebrow">GENERAL</p><h2>Event details</h2></div><div className="event-general-fields"><label>Event name<input value={name} onChange={(change) => setName(change.target.value)} /></label><label>Default venue<input value={venueName} onChange={(change) => setVenueName(change.target.value)} /></label><label>Starts<input type="date" value={startsOn} onChange={(change) => setStartsOn(change.target.value)} /></label><label>Ends<input type="date" min={startsOn} value={endsOn} onChange={(change) => setEndsOn(change.target.value)} /></label><label>Time zone<select value={timezone} onChange={(change) => setTimezone(change.target.value)}><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Phoenix">Arizona Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="America/Anchorage">Alaska Time</option><option value="Pacific/Honolulu">Hawaii Time</option></select></label><label>Event type<select value={eventType} onChange={(change) => { const type = change.target.value as EventRecord["event_type"]; setEventType(type); if (type === "league") { setParentLeagueId(""); setFeatures((current) => ({ ...current, check_in: false })); } }}><option value="tournament">Tournament</option><option value="league">League</option></select></label>{eventType === "tournament" && <label>Parent league<select value={parentLeagueId} onChange={(change) => setParentLeagueId(change.target.value)}><option value="">Standalone tournament</option>{leagues.map((league) => <option value={league.id} key={league.id}>{league.name}</option>)}</select></label>}</div><hr /><div><p className="eyebrow">EVENT FEATURES</p><h2>Enabled modules</h2><p>An event cannot enable a module that the Site Owner or organization has disabled.</p></div><div className="event-feature-grid">{(Object.keys(eventFeatureLabels) as EventFeatureKey[]).map((feature) => { const available = entitled(feature); const details = eventFeatureLabels[feature]; return <label className={`${features[feature] && available ? "selected" : ""}${available ? "" : " unavailable"}`} key={feature}><input type="checkbox" checked={available && features[feature]} disabled={!available} onChange={(change) => setFeatures((current) => ({ ...current, [feature]: change.target.checked }))} /><span><strong>{details.title}</strong><small>{available ? details.description : "Not enabled for this organization"}</small></span></label>; })}</div>
<section className="supervisor-operations-settings"><label className="guest-checkin-setting"><input type="checkbox" checked={siteSupervisorAssignmentEditingEnabled} onChange={(change) => setSiteSupervisorAssignmentEditingEnabled(change.target.checked)} /><span><strong>Allow Site Supervisors to Edit Assignments by Default</strong><small>Disabled by default. Individual Site Supervisor event access can inherit, enable, or disable this setting.</small></span></label></section>
{entitled("check_in") && features.check_in && guestCheckInEnabled && <fieldset className="external-checkin-completion-mode"><legend>External Check-In: After Identity Match</legend><label><input type="radio" name="external-checkin-completion" checked={requireExternalCheckInConfirmation} onChange={() => setRequireExternalCheckInConfirmation(true)} /><span><strong>Review and Confirm</strong><small>Show the official’s schedule and require Confirm Schedule & Check In.</small></span></label><label><input type="radio" name="external-checkin-completion" checked={!requireExternalCheckInConfirmation} onChange={() => setRequireExternalCheckInConfirmation(false)} /><span><strong>Check In Immediately</strong><small>Record check-in as soon as the required information matches, then show confirmation and the day’s schedule.</small></span></label></fieldset>}
{entitled("check_in") && features.check_in && <section className="external-checkin-settings"><label className="guest-checkin-setting"><input type="checkbox" checked={guestCheckInEnabled} onChange={(change) => setGuestCheckInEnabled(change.target.checked)} /><span><strong>Enable External Check-In</strong><small>Officials scan the daily QR, match themselves to today’s imported schedule, review their assignments, and check in without an account.</small></span></label><label className="guest-checkin-setting"><input type="checkbox" checked={allowAccountSignIn} onChange={(change) => setAllowAccountSignIn(change.target.checked)} /><span><strong>Show Account Sign-In Option</strong><small>Disable this for events or groups using only External Check-In.</small></span></label><div className="checkin-message-settings"><label>Arrival message<textarea value={arrivalMessage} onChange={(change) => setArrivalMessage(change.target.value)} /></label><label>Check-in confirmation message<textarea value={checkInConfirmationMessage} onChange={(change) => setCheckInConfirmationMessage(change.target.value)} /></label><label>First failed external check-in message<textarea value={firstFailureMessage} onChange={(change) => setFirstFailureMessage(change.target.value)} /></label><label>Second failed external check-in message<textarea value={secondFailureMessage} onChange={(change) => setSecondFailureMessage(change.target.value)} /></label></div>{guestCheckInEnabled && <><fieldset className="external-identity-fields"><legend>Required External Check-In Information</legend>{(["last_name", "first_name", "email", "phone", "ussf_id", "date_of_birth", "other"] as ExternalCheckInField[]).map((field) => <label key={field}><input type="checkbox" checked={externalCheckInFields.includes(field)} onChange={(change) => setExternalCheckInFields((current) => change.target.checked ? [...current, field] : current.filter((item) => item !== field))} />{{ last_name: "Last name", first_name: "First name", email: "Email", phone: "Phone", ussf_id: "USSF ID #", date_of_birth: "Date of birth", other: "Other" }[field]}</label>)}</fieldset>{externalCheckInFields.includes("other") && <label>Other field label<input value={externalOtherLabel} onChange={(change) => setExternalOtherLabel(change.target.value)} /></label>}</>}<div className="check-in-link-settings"><div><strong>Check-in documents and links</strong><button className="secondary" type="button" onClick={() => setCheckInLinks((current) => [...current, { title: "", url: "" }])}>Add Link</button></div>{checkInLinks.map((link, index) => <div key={index}><input aria-label={`Check-in link ${index + 1} title`} placeholder="Rules of Competition" value={link.title} onChange={(change) => setCheckInLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: change.target.value } : item))} /><input aria-label={`Check-in link ${index + 1} URL`} type="url" placeholder="https://…" value={link.url} onChange={(change) => setCheckInLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: change.target.value } : item))} /><button className="text-button" type="button" onClick={() => setCheckInLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>)}</div></section>}<button className="primary event-settings-save" disabled={busy || !name.trim() || !venueName.trim() || !startsOn || !endsOn || endsOn < startsOn || (guestCheckInEnabled && !externalCheckInFields.length)} onClick={() => void saveSettings()}>{busy ? "Saving…" : "Save Event Settings"}</button>
{entitled("event_documents") && features.event_documents && <><hr /><div><h2>Event documents</h2><p>PDFs are stored privately and available only to authorized event participants and staff.</p></div><div className="event-document-upload"><label>Document type<select value={documentType} onChange={(change) => { const type = change.target.value as EventDocumentRecord["document_type"]; setDocumentType(type); if (type === "rules_of_competition") setTitle("Rules of Competition"); }}><option value="rules_of_competition">Rules of Competition</option><option value="other">Other event document</option></select></label><label>Display title<input value={title} onChange={(change) => setTitle(change.target.value)} /></label><label className="secondary file-button">Choose PDF<input type="file" accept="application/pdf,.pdf" onChange={(change) => setFile(change.target.files?.[0] || null)} /></label><button className="primary" disabled={busy || !file} onClick={() => void upload()}>{busy ? "Saving…" : "Upload Document"}</button></div>{file && <p className="selected-document-file">Selected: {file.name}</p>}<div className="event-document-list">{documents.map((document) => <div key={document.id}><span><strong>{document.document_type === "rules_of_competition" ? "ROC · " : ""}{document.title}</strong><small>{document.file_name}</small></span><EventDocumentLink session={session} document={document} compact /></div>)}</div></>}{message && <p className="pilot-message">{message}</p>}</article></section>;
}

function EventLifecyclePanel({
  session,
  event,
  onChanged,
}: {
  session: Law18Session;
  event: EventRecord;
  onChanged: () => Promise<void>;
}) {
  const initialDelay = () => {
    if (!event.auto_archive_at) return "never";
    const archiveDate = new Date(event.auto_archive_at);
    const archiveDay = Date.UTC(archiveDate.getUTCFullYear(), archiveDate.getUTCMonth(), archiveDate.getUTCDate());
    const [year, month, day] = event.ends_on.split("-").map(Number);
    return String(Math.max(0, Math.round((archiveDay - Date.UTC(year, month - 1, day)) / 86400000) - 1));
  };
  const [delay, setDelay] = useState(initialDelay);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function saveSchedule() {
    setBusy(true);
    setMessage("");
    try {
      await configureEventAutoArchive(session, event.id, delay === "never" ? null : Number(delay));
      setMessage(delay === "never" ? "Automatic archiving is disabled." : `This event will archive ${delay === "0" ? "after its final day" : `${delay} day${delay === "1" ? "" : "s"} after it ends`}.`);
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save the event archive setting.");
    } finally {
      setBusy(false);
    }
  }
  async function archiveNow() {
    setBusy(true);
    setMessage("");
    try {
      await archiveEvent(session, event.id);
      setConfirmingArchive(false);
      await onChanged();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to archive this event.");
    } finally {
      setBusy(false);
    }
  }
  return <article className="panel event-lifecycle-panel">
    <div><p className="eyebrow">EVENT LIFECYCLE</p><h2>Archive {event.name}</h2><p>Archiving removes the event from active views while preserving schedules, check-ins, ratings, and audit history.</p></div>
    <label>Automatic archive<select value={delay} onChange={(event) => setDelay(event.target.value)}><option value="never">Never</option><option value="0">After the final event day</option><option value="1">1 day after completion</option><option value="3">3 days after completion</option><option value="7">7 days after completion</option><option value="14">14 days after completion</option><option value="30">30 days after completion</option></select></label>
    <div className="event-lifecycle-actions"><button className="secondary" disabled={busy} onClick={saveSchedule}>{busy ? "Saving…" : "Save Archive Schedule"}</button><button className="danger-button" disabled={busy} onClick={() => setConfirmingArchive(true)}>Archive Now</button></div>
    {event.auto_archive_at && <small>Currently scheduled for {new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.auto_archive_at))}.</small>}
    {message && <p className="pilot-message">{message}</p>}
    {confirmingArchive && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog" role="dialog" aria-modal="true"><p className="eyebrow">ARCHIVE EVENT</p><h2>Archive {event.name} now?</h2><p>The event will leave active dashboards and selectors. Organization administrators can restore it later from Activity.</p><div><button className="secondary" disabled={busy} onClick={() => setConfirmingArchive(false)}>Cancel</button><button className="danger-button" disabled={busy} onClick={archiveNow}>{busy ? "Archiving…" : "Archive Event"}</button></div></section></div>}
  </article>;
}

function ImportView({
  session,
  profile,
  organizationId,
  organization,
  events,
  activeEvent,
  canCreateEvent,
  canManageLifecycle,
  canConfigureAliases,
  onEventsChanged,
  onImported,
}: {
  session: Law18Session;
  profile: Profile;
  organizationId: string;
  organization: OrganizationRecord;
  events: EventRecord[];
  activeEvent?: EventRecord;
  canCreateEvent: boolean;
  canManageLifecycle: boolean;
  canConfigureAliases: boolean;
  onEventsChanged: () => Promise<void>;
  onImported: (event: EventRecord) => void;
}) {
  const [mode, setMode] = useState<"schedule" | "officials">("schedule");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [officialRows, setOfficialRows] = useState<OfficialImportRow[]>([]);
  const [officialResult, setOfficialResult] = useState<OfficialImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [gotSportSheets, setGotSportSheets] = useState<GotSportSheetImport[]>([]);
  const [gotSportSheetName, setGotSportSheetName] = useState("");
  const [sourceEventName, setSourceEventName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const dragDepth = useRef(0);
  const [destinationEventId, setDestinationEventId] = useState("");
  const [details, setDetails] = useState({ name: "", venue: "", startsOn: "", endsOn: "" });
  const [aliasScope, setAliasScope] = useState<"organization" | "event">("organization");
  const [aliasText, setAliasText] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [eventDetails, setEventDetails] = useState({
    name: "",
    venue_name: "",
    starts_on: "",
    ends_on: "",
    timezone: "America/New_York",
    event_type: "tournament" as "tournament" | "league",
    parent_league_id: "" as string | null,
    check_in_enabled: true,
  });
  const destinationEvent = events.find((event) => event.id === destinationEventId);

  function applyScheduleRows(parsed: ImportRow[], nextFileName: string, suggestedEventName = "") {
    setRows(parsed);
    setOfficialRows([]);
    setFileName(nextFileName);
    setSourceEventName(suggestedEventName);
    const dates = parsed.map((row) => row.date).sort();
    setDetails(destinationEvent
      ? {
          name: destinationEvent.name,
          venue: destinationEvent.venue_name,
          startsOn: destinationEvent.starts_on < dates[0] ? destinationEvent.starts_on : dates[0],
          endsOn: destinationEvent.ends_on > dates[dates.length - 1] ? destinationEvent.ends_on : dates[dates.length - 1],
        }
      : {
          name: suggestedEventName || nextFileName.replace(/\.(csv|xlsx)$/i, "").replace(/[-_]+/g, " "),
          venue: parsed[0].venue,
          startsOn: dates[0],
          endsOn: dates[dates.length - 1],
        });
    const gameCount = new Set(parsed.map((row) => row.external_id)).size;
    const staffedCount = parsed.filter((row) => row.official_name.trim()).length;
    setMessage(destinationEvent
      ? `${gameCount} games with ${staffedCount} staffed positions are ready to add to ${destinationEvent.name}.`
      : `${gameCount} games with ${staffedCount} staffed positions are ready to create a new event.`);
  }

  function chooseGotSportSheet(sheetName: string) {
    const sheet = gotSportSheets.find((item) => item.sheet_name === sheetName);
    if (!sheet) return;
    setGotSportSheetName(sheetName);
    applyScheduleRows(sheet.rows, `${fileName.split("#")[0]}#${sheet.sheet_name}`, sheet.event_name);
  }

  useEffect(() => {
    const aliases = aliasScope === "event"
      ? destinationEvent?.position_title_aliases || {}
      : organization.position_title_aliases || {};
    setAliasText(Object.entries(aliases).map(([source, display]) => `${source} = ${display}`).join("\n"));
  }, [aliasScope, destinationEvent, organization]);

  async function saveAliases() {
    const targetId = aliasScope === "event" ? destinationEvent?.id : organization.id;
    if (!targetId) return;
    const aliases = Object.fromEntries(aliasText.split(/\r?\n/)
      .map((line) => line.split("="))
      .filter((parts) => parts.length >= 2 && parts[0].trim() && parts.slice(1).join("=").trim())
      .map((parts) => [positionAliasKey(parts[0]), parts.slice(1).join("=").trim()]));
    setBusy(true);
    try {
      await updatePositionTitleAliases(session, aliasScope, targetId, aliases);
      setMessage(`${aliasScope === "event" ? "Event" : "Group"} position titles saved for future imports.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save position titles.");
    } finally {
      setBusy(false);
    }
  }

  function chooseDestination(eventId: string) {
    setDestinationEventId(eventId);
    const selectedEvent = events.find((event) => event.id === eventId);
    if (selectedEvent) {
      setDetails({
        name: selectedEvent.name,
        venue: selectedEvent.venue_name,
        startsOn: selectedEvent.starts_on,
        endsOn: selectedEvent.ends_on,
      });
      const assignedRowCount = rows.filter((row) => row.official_name.trim()).length;
      setMessage(rows.length
        ? `${games} games with ${assignedRowCount} staffed positions will be added to ${selectedEvent.name}.`
        : `The next CSV will be added to ${selectedEvent.name}.`);
    } else if (rows.length) {
      const dates = rows.map((row) => row.date).sort();
      setDetails({
        name: sourceEventName || fileName.replace(/\.(csv|xlsx)(#.*)?$/i, "").replace(/[-_]+/g, " "),
        venue: rows[0].venue,
        startsOn: dates[0],
        endsOn: dates[dates.length - 1],
      });
      setMessage(`${new Set(rows.map((row) => row.external_id)).size} games are ready to create a new event.`);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    const isWorkbook = file.name.toLowerCase().endsWith(".xlsx");
    if (!isCsv && !(mode === "schedule" && isWorkbook)) {
      setMessage(mode === "schedule" ? "Please choose an Assignr CSV or GotSport XLSX file." : "Please choose an Assignr users CSV file.");
      return;
    }
    try {
      if (isWorkbook) {
        const ExcelJS = (await import("exceljs")).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const parsedSheets = workbook.worksheets.flatMap((worksheet) => {
          const records: unknown[][] = [];
          worksheet.eachRow({ includeEmpty: false }, (row) => records.push((row.values as unknown[]).slice(1)));
          try {
            return [parseGotSportWorksheet(worksheet.name, records)];
          } catch (error) {
            if (error instanceof Error && error.message.includes("is not a recognized GotSport schedule")) return [];
            throw error;
          }
        });
        if (!parsedSheets.length) throw new Error("No GotSport schedule worksheets were found.");
        setGotSportSheets(parsedSheets);
        setGotSportSheetName(parsedSheets[0].sheet_name);
        setOfficialResult(null);
        applyScheduleRows(parsedSheets[0].rows, `${file.name}#${parsedSheets[0].sheet_name}`, parsedSheets[0].event_name);
        return;
      }
      const contents = await file.text();
      if (mode === "officials") {
        const parsedOfficials = parseAssignrOfficialsCsv(contents);
        setOfficialRows(parsedOfficials);
        setRows([]);
        setFileName(file.name);
        setGotSportSheets([]);
        setGotSportSheetName("");
        setSourceEventName("");
        setOfficialResult(null);
        setMessage(`${parsedOfficials.length} officials are ready for review. No invitation emails will be sent.`);
        return;
      }
      const parsed = parseAssignrCsv(contents);
      setGotSportSheets([]);
      setGotSportSheetName("");
      applyScheduleRows(parsed, file.name);
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "Unable to read that import file.");
    }
  }

  function dropFile(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDraggingFile(false);
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) {
      setMessage("Drop one schedule or officials file at a time.");
      return;
    }
    readFile(files[0]);
  }

  function enterDropZone(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDraggingFile(true);
  }

  function leaveDropZone(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDraggingFile(false);
  }

  function switchImportMode(nextMode: "schedule" | "officials") {
    setMode(nextMode);
    setRows([]);
    setOfficialRows([]);
    setOfficialResult(null);
    setFileName("");
    setGotSportSheets([]);
    setGotSportSheetName("");
    setSourceEventName("");
    setMessage("");
    setDraggingFile(false);
    dragDepth.current = 0;
  }

  async function confirmOfficialImport() {
    if (!officialRows.length) return;
    setBusy(true);
    setMessage("Importing officials…");
    try {
      const result = await importOfficials(session, profile, organizationId, fileName, officialRows);
      setOfficialResult(result);
      setMessage(`${result.created} officials added and ${result.updated} updated. ${result.conflicts.length} need review.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Officials import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!rows.length || !details.name || !details.venue) return;
    setBusy(true);
    setMessage("Importing tournament…");
    try {
      const result = await importTournament(
        session,
        profile,
        organizationId,
        { ...details, fileName, eventId: destinationEventId || undefined },
        rows,
      );
      const successMessage = destinationEventId
        ? `Schedule added to ${result.event.name} successfully.`
        : "Tournament created successfully.";
      setMessage(result.conflicts.length
        ? `${successMessage} ${result.conflicts.length} conflicting contact field${result.conflicts.length === 1 ? " was" : "s were"} skipped; assignments and other valid updates were completed. ${result.conflicts.map((conflict) => `${conflict.name}: ${conflict.value} belongs to ${conflict.conflictingOfficial}`).join(" · ")}`
        : successMessage);
      onImported(result.event);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEventCreation() {
    setBusy(true);
    setMessage("");
    try {
      const event = await createEvent(session, profile, organizationId, eventDetails);
      setMessage(`${event.name} was created. You can now import a schedule or add games manually.`);
      setCreatingEvent(false);
      setEventDetails({ name: "", venue_name: "", starts_on: "", ends_on: "", timezone: "America/New_York", event_type: "tournament", parent_league_id: "", check_in_enabled: true });
      onImported(event);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create the event.");
    } finally {
      setBusy(false);
    }
  }

  const games = new Set(rows.map((row) => row.external_id)).size;
  const referees = new Set(rows.filter((row) => row.official_name.trim()).map((row) => row.official_name.trim().toLowerCase())).size;
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">EVENTS & SCHEDULE IMPORTS</p><h1>Import center</h1><p>Create an empty event, import the official directory separately, or add one or more schedule days.</p></div>{canCreateEvent && <button className="primary" onClick={() => setCreatingEvent((value) => !value)}>{creatingEvent ? "Cancel" : "Create New Event"}</button>}</div>
    {creatingEvent && <article className="panel manual-entry-form empty-event-form">
      <div><p className="eyebrow">NEW EVENT</p><h2>Create an event without a schedule</h2><p>Schedules and individual games can be added after the event is created.</p></div>
      <div className="manual-form-grid">
        <label>Event name<input value={eventDetails.name} maxLength={160} onChange={(event) => setEventDetails({ ...eventDetails, name: event.target.value })} /></label>
        <label>Event type<select value={eventDetails.event_type} onChange={(event) => { const eventType = event.target.value as "tournament" | "league"; setEventDetails({ ...eventDetails, event_type: eventType, parent_league_id: eventType === "league" ? null : eventDetails.parent_league_id, check_in_enabled: eventType === "tournament" }); }}><option value="tournament">Tournament</option><option value="league">League</option></select></label>
        {eventDetails.event_type === "tournament" && <label>Part of league (optional)<select value={eventDetails.parent_league_id || ""} onChange={(event) => setEventDetails({ ...eventDetails, parent_league_id: event.target.value || null })}><option value="">Standalone tournament</option>{events.filter((item) => item.event_type === "league").map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
        <label>Default venue<input value={eventDetails.venue_name} maxLength={160} onChange={(event) => setEventDetails({ ...eventDetails, venue_name: event.target.value })} /></label>
        <label>Starts<input type="date" value={eventDetails.starts_on} onChange={(event) => setEventDetails({ ...eventDetails, starts_on: event.target.value, ends_on: eventDetails.ends_on || event.target.value })} /></label>
        <label>Ends<input type="date" min={eventDetails.starts_on} value={eventDetails.ends_on} onChange={(event) => setEventDetails({ ...eventDetails, ends_on: event.target.value })} /></label>
        <label>Time zone<select value={eventDetails.timezone} onChange={(event) => setEventDetails({ ...eventDetails, timezone: event.target.value })}><option value="America/New_York">Eastern Time</option><option value="America/Chicago">Central Time</option><option value="America/Denver">Mountain Time</option><option value="America/Phoenix">Arizona Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="America/Anchorage">Alaska Time</option><option value="Pacific/Honolulu">Hawaii Time</option></select></label>
        <label className="preference-check"><input type="checkbox" checked={eventDetails.check_in_enabled} onChange={(event) => setEventDetails({ ...eventDetails, check_in_enabled: event.target.checked })} />Enable check-in for this {eventDetails.event_type}</label>
      </div>
      <button className="primary" disabled={busy || !eventDetails.name.trim() || !eventDetails.venue_name.trim() || !eventDetails.starts_on || !eventDetails.ends_on || eventDetails.ends_on < eventDetails.starts_on} onClick={confirmEventCreation}>{busy ? "Creating…" : "Create Event"}</button>
    </article>}
    <div className="segmented import-tabs">
      <button className={mode === "schedule" ? "active" : ""} onClick={() => switchImportMode("schedule")}>Schedule export</button>
      <button className={mode === "officials" ? "active" : ""} onClick={() => switchImportMode("officials")}>Officials export</button>
    </div>
    <div className="import-grid">
      <article className={`panel import-card ${draggingFile ? "dragging" : ""}`} onDragEnter={enterDropZone} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={leaveDropZone} onDrop={dropFile}>
        <span className="upload-icon">{draggingFile ? "↓" : "↑"}</span><h2>{draggingFile ? "Drop file to upload" : fileName || `Drag an ${mode === "schedule" ? "Assignr CSV or GotSport XLSX" : "Assignr users CSV"} here`}</h2>
        <p>{mode === "schedule" ? "Uses Assignr Games or Assignments CSV exports, or a GotSport Assignor Matches XLSX workbook. GotSport worksheets are reviewed and imported one competition at a time." : "Uses Assignr’s Users export. Imported officials remain provisional until they create and verify their account."}</p>
        <span className="drop-or">or</span><label className="primary file-button">Browse Files<input type="file" accept={mode === "schedule" ? ".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : ".csv,text/csv"} onChange={(event) => readFile(event.target.files?.[0])} /></label>
        {mode === "schedule" && <a className="text-button sample-link" href="/assignr-schedule.csv" download>Download sample CSV</a>}
      </article>
      <article className="panel import-review">
        <p className="eyebrow">IMPORT REVIEW</p>
        {mode === "officials" ? <>
          <h2>{officialRows.length ? `${officialRows.length} officials` : "Select a users export"}</h2>
          <p className="import-note">This import never creates login accounts and never sends email. Existing Assignr IDs are updated; duplicate primary emails are removed from the imported record and reported for review.</p>
          {message && <p className="pilot-message">{message}</p>}
          <button className="primary wide" disabled={busy || !officialRows.length} onClick={confirmOfficialImport}>{busy ? "Importing…" : "Import officials"}</button>
        </> : <>
        <h2>{rows.length ? `${games} games · ${referees} assigned officials` : "Select a games export"}</h2>
        {gotSportSheets.length > 0 && <label>GotSport competition<select value={gotSportSheetName} onChange={(event) => chooseGotSportSheet(event.target.value)}>{gotSportSheets.map((sheet) => <option value={sheet.sheet_name} key={sheet.sheet_name}>{sheet.event_name} · {new Set(sheet.rows.map((row) => row.external_id)).size} games</option>)}</select></label>}
        <label>Import destination<select value={destinationEventId} onChange={(event) => chooseDestination(event.target.value)}><option value="">Create a new event</option>{events.map((event) => <option value={event.id} key={event.id}>Add to {event.name}</option>)}</select></label>
        <label>Event name<input value={details.name} disabled={Boolean(destinationEvent)} onChange={(event) => setDetails({ ...details, name: event.target.value })} /></label>
        <label>Default venue<input value={details.venue} disabled={Boolean(destinationEvent)} onChange={(event) => setDetails({ ...details, venue: event.target.value })} /></label>
        <div className="date-fields"><label>Starts<input type="date" value={details.startsOn} onChange={(event) => setDetails({ ...details, startsOn: event.target.value })} /></label><label>Ends<input type="date" value={details.endsOn} onChange={(event) => setDetails({ ...details, endsOn: event.target.value })} /></label></div>
        {destinationEvent && <p className="import-note">Games with new source IDs will be added. Matching game IDs and their imported referee crews will be updated. Existing check-ins and other event days stay in place. Existing ratings also stay in place.</p>}
        {gotSportSheets.length > 1 && <p className="import-note">This workbook contains {gotSportSheets.length} competitions. Import the selected worksheet, then select and import each additional competition into its intended event.</p>}
        {rows.some((row) => row.official_email || row.official_phone) && <p className="import-note">Nonblank email addresses and phone numbers in this assignments export will also update matching officials in the Officials directory.</p>}
        {message && <p className="pilot-message">{message}</p>}
        <button className="primary wide" disabled={busy || !rows.length} onClick={confirmImport}>{busy ? "Importing…" : destinationEvent ? "Add schedule to event" : "Create event"}</button>
        </>}
      </article>
    </div>
    {mode === "schedule" && rows.length > 0 && <div className="panel preview-table"><table><thead><tr><th>Game</th><th>Date/time</th><th>Field</th><th>Official</th><th>Position</th></tr></thead><tbody>{rows.slice(0, 12).map((row, index) => <tr key={`${row.external_id}-${row.official_name}-${index}`}><td>{row.home_team} vs. {row.away_team}</td><td>{row.date} {row.start_time}</td><td>{row.field}</td><td>{row.official_name || "Open position"}<small>{row.official_name ? row.official_email || "Matched from officials directory" : "No official assigned"}</small></td><td>{row.position || "Open"}</td></tr>)}</tbody></table>{rows.length > 12 && <p>Showing 12 of {rows.length} imported crew rows.</p>}</div>}
    {mode === "schedule" && canConfigureAliases && <article className="panel position-alias-settings"><div><p className="eyebrow">POSITION TITLES</p><h2>Import display names</h2><p>One replacement per line, such as <code>Asst. Referee = AR</code>. Event settings override organization settings.</p></div><label>Applies to<select value={aliasScope} onChange={(event) => setAliasScope(event.target.value as "organization" | "event")}><option value="organization">{organization.name}</option><option value="event" disabled={!destinationEvent}>Selected event</option></select></label><label>Aliases<textarea value={aliasText} onChange={(event) => setAliasText(event.target.value)} placeholder={"Asst. Referee = AR\nRef Coord = Referee Coach"} /></label><button className="secondary" disabled={busy || (aliasScope === "event" && !destinationEvent)} onClick={saveAliases}>Save position titles</button></article>}
    {mode === "officials" && officialRows.length > 0 && <div className="panel preview-table"><table><thead><tr><th>Official</th><th>Primary email</th><th>Secondary email</th><th>Assignr ID</th><th>Badge</th></tr></thead><tbody>{officialRows.slice(0, 12).map((row, index) => <tr key={`${row.source_official_id}-${index}`}><td>{row.full_name}</td><td>{row.primary_email || "Missing"}</td><td>{row.secondary_email || "—"}</td><td>{row.source_official_id || "—"}</td><td>{row.badge_level || "—"}</td></tr>)}</tbody></table>{officialRows.length > 12 && <p>Showing 12 of {officialRows.length} officials.</p>}{officialResult?.conflicts.length ? <div className="import-conflicts"><strong>Needs review</strong>{officialResult.conflicts.slice(0, 10).map((conflict) => <p key={`${conflict.name}-${conflict.email}`}>{conflict.name}: {conflict.reason}</p>)}</div> : null}</div>}
  </section>;
}

function OfficialsDirectory({
  session,
  profile,
  organizationRoles,
  eventRoles,
  canManageOrganizationRoles,
  canManageOfficials,
  organizationId,
  officials,
  data,
  event,
  events,
  openOfficialId,
  onOpenOfficialHandled,
  onCreated,
}: {
  session: Law18Session;
  profile: Profile;
  organizationRoles: MembershipRole[];
  eventRoles: MembershipRole[];
  canManageOrganizationRoles: boolean;
  canManageOfficials: boolean;
  organizationId: string;
  officials: OfficialRecord[];
  data: EventData;
  event?: EventRecord;
  events: EventRecord[];
  openOfficialId?: string | null;
  onOpenOfficialHandled: () => void;
  onCreated: () => void;
}) {
  const [query, setQuery] = useActiveFilterState(`officials-query:${organizationId}`, "");
  const [directoryRatingHistory, setDirectoryRatingHistory] = useState<{ assessments: AssessmentRecord[]; assignments: AssignmentRecord[] }>({ assessments: [], assignments: [] });
  const eventOfficialIds = new Set(data.officials.map((official) => official.id));
  const [scope, setScope] = useActiveFilterState<"organization" | "event">(`officials-scope:${organizationId}`, "organization");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sortBy, setSortBy] = useActiveFilterState<"name" | "email" | "phone" | "badge" | "identity" | "role" | "event" | "rating" | "last_active">(`officials-sort:${organizationId}`, "name");
  const [sortDirection, setSortDirection] = useActiveFilterState<"asc" | "desc">(`officials-order:${organizationId}`, "asc");
  const [groupRoleFilters, setGroupRoleFilters] = useActiveFilterState<MembershipRole[]>(`officials-group-roles:${organizationId}`, []);
  const [managing, setManaging] = useState<OfficialRecord | null>(null);
  const [editing, setEditing] = useState<OfficialRecord | null>(null);
  const [removing, setRemoving] = useState<OfficialRecord | null>(null);
  const [selectedOfficialIds, setSelectedOfficialIds] = useState<string[]>([]);
  const [addingToGroup, setAddingToGroup] = useState(false);
  const [destinationGroups, setDestinationGroups] = useState<OrganizationRecord[]>([]);
  const [destinationGroupId, setDestinationGroupId] = useState("");
  const [showArchivedOfficials, setShowArchivedOfficials] = useState(false);
  const [archivedOfficials, setArchivedOfficials] = useState<OfficialRecord[]>([]);
  const eventRoleChoices: Exclude<MembershipRole, "site_owner" | "organization_director" | "organization_admin">[] = ["event_admin", "assignor", "site_coordinator", "referee_coach", "referee"];
  const [eventRoleSelections, setEventRoleSelections] = useState<Exclude<MembershipRole, "site_owner" | "organization_director" | "organization_admin">[]>(["referee"]);
  const [fullScheduleAccess, setFullScheduleAccess] = useState(true);
  const [assignedGameIds, setAssignedGameIds] = useState<string[]>([]);
  const [assignedDates, setAssignedDates] = useState<string[]>([]);
  const [assignedSites, setAssignedSites] = useState<string[]>([]);
  const [assignmentEditingOverride, setAssignmentEditingOverride] = useState<"inherit" | "enabled" | "disabled">("inherit");
  const [coachingToolsEnabled, setCoachingToolsEnabled] = useState(false);
  const [merging, setMerging] = useState(false);
  const [primaryMergeId, setPrimaryMergeId] = useState("");
  const [secondaryMergeId, setSecondaryMergeId] = useState("");
  const [mergeConfirmation, setMergeConfirmation] = useState("");
  const [mergeFieldSources, setMergeFieldSources] = useState<Record<"full_name" | "secondary_email" | "date_of_birth" | "phone" | "badge_level", "primary" | "secondary">>({
    full_name: "primary", secondary_email: "primary", date_of_birth: "primary", phone: "primary", badge_level: "primary",
  });
  const [ratingScope, setRatingScope] = useState<"none" | "specific" | "all">("none");
  const [ratingEventIds, setRatingEventIds] = useState<string[]>([]);
  const [protectedEventAdmin, setProtectedEventAdmin] = useState(false);
  const [official, setOfficial] = useState({ first_name: "", last_name: "", email: "", secondary_email: "", date_of_birth: "", phone: "", badge_level: "", ussf_id: "", external_check_in_other: "", pending_org_roles: ["referee"] as MembershipRole[] });
  const [editValues, setEditValues] = useState({ first_name: "", last_name: "", email: "", secondary_email: "", date_of_birth: "", phone: "", badge_level: "", ussf_id: "", external_check_in_other: "", pending_org_roles: ["referee"] as MembershipRole[] });
  useEffect(() => {
    if (!adding) return;
    setEventRoleSelections(["referee"]);
    setFullScheduleAccess(true);
    setAssignedGameIds([]);
    setAssignedDates([]);
    setAssignedSites([]);
    setAssignmentEditingOverride("inherit");
    setCoachingToolsEnabled(false);
    setRatingScope("none");
    setRatingEventIds([]);
  }, [adding]);
  useEffect(() => {
    loadAuthorizedRatingHistory(session, organizationId).then((result) => setDirectoryRatingHistory({ assessments: result.assessments, assignments: result.assignments })).catch(() => setDirectoryRatingHistory({ assessments: [], assignments: [] }));
  }, [organizationId, session]);
  const refreshArchivedOfficials = useCallback(() => loadOrganizationOfficials(session, organizationId, true)
    .then((records) => setArchivedOfficials(records.filter((item) => Boolean(item.archived_at)))), [organizationId, session]);
  useEffect(() => { refreshArchivedOfficials().catch(() => undefined); }, [refreshArchivedOfficials]);
  const officialRatingSummary = (officialId: string) => {
    const ratings = directoryRatingHistory.assessments
      .filter((assessment) => assessment.official_id === officialId && assessment.status !== "draft" && assessment.include_in_averages !== false)
      .map((assessment) => ({ assessment, score: assessmentScore(assessment), position: assessment.rated_position || directoryRatingHistory.assignments.find((assignment) => assignment.game_id === assessment.game_id && assignment.official_id === officialId)?.position }))
      .filter((item): item is typeof item & { score: number } => item.score !== null);
    const average = (items: typeof ratings) => items.length ? items.reduce((sum, item) => sum + item.score, 0) / items.length : null;
    return { overall: average(ratings), referee: average(ratings.filter((item) => item.position === "referee")), assistantReferee: average(ratings.filter((item) => item.position === "assistant_referee")), count: ratings.length };
  };
  const officialAverage = (officialId: string) => officialRatingSummary(officialId).overall;
  const officialRatingSummaryLabel = (officialId: string) => {
    const summary = officialRatingSummary(officialId);
    return `Ovr ${summary.overall?.toFixed(1) || "—"} / Ref ${summary.referee?.toFixed(1) || "—"} / AR ${summary.assistantReferee?.toFixed(1) || "—"} (${summary.count})`;
  };
  const ownerAlreadyListed = officials.some((item) => item.linked_user_id === profile.id || item.email?.toLowerCase() === (profile.primary_email || profile.email).toLowerCase());
  const selfOwnerRecord: OfficialRecord | null = profile.is_site_owner && !ownerAlreadyListed ? {
    id: `site-owner-${profile.id}`,
    organization_id: organizationId,
    full_name: profile.full_name,
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.primary_email || profile.email,
    secondary_email: profile.secondary_email,
    date_of_birth: profile.date_of_birth,
    phone: profile.phone,
    personal_contact_locked: profile.personal_contact_locked,
    linked_user_id: profile.id,
    identity_status: "linked",
    source: "site_owner_profile",
    pending_org_roles: [...new Set(["site_owner" as MembershipRole, ...organizationRoles])],
  } : null;
  const baseDirectoryOfficials = showArchivedOfficials ? [...officials, ...archivedOfficials] : officials;
  const directoryOfficials = selfOwnerRecord ? [...baseDirectoryOfficials, selfOwnerRecord] : baseDirectoryOfficials;
  const compareDirectoryValues = (left: string | number | null | undefined, right: string | number | null | undefined, direction: "asc" | "desc" = "asc") => {
    const leftMissing = left === null || left === undefined || left === "";
    const rightMissing = right === null || right === undefined || right === "";
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (leftMissing && rightMissing) return 0;
    const comparison = typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
    return direction === "desc" ? -comparison : comparison;
  };
  const filtered = directoryOfficials.filter((official) => {
    if (scope === "event" && !eventOfficialIds.has(official.id)) return false;
    const officialRoles = official.pending_org_roles?.length
      ? official.pending_org_roles
      : [official.pending_org_role || "referee"];
    if (groupRoleFilters.length && !groupRoleFilters.some((role) => officialRoles.includes(role))) return false;
    const haystack = `${official.full_name} ${official.first_name || ""} ${official.last_name || ""} ${official.email || ""} ${official.phone || ""} ${normalizePhoneNumber(official.phone) || ""} ${official.badge_level || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  }).sort((a, b) => {
    const values = {
      name: [officialSelectorLabel(a), officialSelectorLabel(b)],
      email: [a.email, b.email],
      phone: [a.phone, b.phone],
      badge: [a.badge_level, b.badge_level],
      identity: [a.linked_user_id ? "linked" : "provisional", b.linked_user_id ? "linked" : "provisional"],
      role: [a.pending_org_roles?.length ? a.pending_org_roles.join(",") : a.pending_org_role, b.pending_org_roles?.length ? b.pending_org_roles.join(",") : b.pending_org_role],
      event: [eventOfficialIds.has(a.id) ? "assigned" : "unassigned", eventOfficialIds.has(b.id) ? "assigned" : "unassigned"],
      rating: [officialAverage(a.id), officialAverage(b.id)],
      last_active: [a.last_login_at, b.last_login_at],
    }[sortBy];
    return compareDirectoryValues(values[0], values[1], sortDirection) || compareDirectoryValues(personLastNameSortKey(a.full_name), personLastNameSortKey(b.full_name), sortBy === "name" ? sortDirection : "asc");
  });
  const sortDirectionLabels = sortBy === "rating"
    ? { asc: "Low–High", desc: "High–Low" }
    : sortBy === "last_active"
      ? { asc: "Oldest–Newest", desc: "Newest–Oldest" }
      : { asc: "A–Z", desc: "Z–A" };
  async function addOfficial() {
    setBusy(true);
    setMessage("");
    try {
      const created = await createOfficial(session, organizationId, official);
      if (event && created) await saveProvisionalEventAccess(session, event.id, created.id, eventRoleSelections, {
        fullScheduleAccess,
        assignedGameIds,
        assignedDates,
        assignedSites,
        assignmentEditingOverride: assignmentEditingOverride === "inherit" ? null : assignmentEditingOverride === "enabled",
        coachingToolsEnabled,
        ratingsHistoryScope: ratingScope,
        ratingsEventIds: ratingEventIds,
      });
      setOfficial({ first_name: "", last_name: "", email: "", secondary_email: "", date_of_birth: "", phone: "", badge_level: "", ussf_id: "", external_check_in_other: "", pending_org_roles: ["referee"] });
      setAdding(false);
      setMessage(`Official added to this group${event ? ` with staged access for ${event.name}` : ""}. No login account or email was created.`);
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to add the official.");
    } finally {
      setBusy(false);
    }
  }
  async function copyJoinLink() {
    setBusy(true);
    setMessage("");
    try {
      const existingLinks = await loadOrganizationJoinLinks(session, organizationId);
      let joinLink = existingLinks.find((link) => link.active) || existingLinks[0];
      if (!joinLink) {
        joinLink = await createOrganizationJoinLink(session, organizationId, "Officials join link");
      } else if (!joinLink.active) {
        await setOrganizationJoinLinkActive(session, joinLink.id, true);
      }
      if (!joinLink) throw new Error("The officials join link could not be created.");
      const url = `${window.location.origin}/?join=${encodeURIComponent(joinLink.token)}`;
      try {
        await navigator.clipboard.writeText(url);
        setMessage("Officials join link copied.");
      } catch {
        window.prompt("Copy this officials join link:", url);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to copy the officials join link.");
    } finally {
      setBusy(false);
    }
  }
  async function exportOfficials() {
    const exportableOfficials = officials.filter((item) => !item.merged_into_official_id && !item.archived_at && item.identity_status !== "removed");
    setBusy(true);
    setMessage("");
    try {
      await logOfficialsExport(session, organizationId, exportableOfficials.length);
      const csv = createOfficialsExportCsv(exportableOfficials);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `law18ref-officials-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`${exportableOfficials.length} officials exported. Keep the Law18Ref Official ID column unchanged when importing the file back.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to export officials.");
    } finally {
      setBusy(false);
    }
  }
  async function importOfficialDetails(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const rows = parseAssignrOfficialsCsv(await file.text());
      if (!rows.some((row) => row.law18ref_official_id)) {
        throw new Error("Use an officials file exported from Law18Ref to update existing records here.");
      }
      const result = await importOfficials(session, profile, organizationId, file.name, rows);
      const warning = result.conflicts.length ? ` ${result.conflicts.length} rows need review.` : "";
      setMessage(`${result.updated} officials updated.${warning}`);
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to import official details.");
    } finally {
      setBusy(false);
    }
  }
  async function saveEventRole() {
    if (!managing?.linked_user_id || !event) return;
    setBusy(true);
    try {
      await saveUserEventAccess(session, event.id, managing.linked_user_id, eventRoleSelections, {
        fullScheduleAccess,
        assignedGameIds,
        assignedDates,
        assignedSites,
        assignmentEditingOverride: assignmentEditingOverride === "inherit" ? null : assignmentEditingOverride === "enabled",
        coachingToolsEnabled,
        ratingsHistoryScope: ratingScope,
        ratingsEventIds: ratingEventIds,
        preserveEventAdmin: protectedEventAdmin && !canRemoveProtectedEventAdmin,
      });
      setMessage(`${managing.full_name}'s access for ${event.name} was updated.`);
      setManaging(null);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to assign the event role.");
    } finally {
      setBusy(false);
    }
  }
  async function loadEventAccess(target: OfficialRecord, openFocusedDialog = false) {
    if (!event) return;
    setBusy(true);
    setMessage("");
    try {
      const memberships = target.linked_user_id ? await loadUserEventMemberships(session, event.id, target.linked_user_id) : [];
      const staged = target.linked_user_id ? null : await loadProvisionalEventAccess(session, event.id, target.id);
      const roles = staged?.roles || memberships.map((membership) => membership.role)
        .filter((role): role is Exclude<MembershipRole, "site_owner" | "organization_director" | "organization_admin"> => !["site_owner", "organization_director", "organization_admin"].includes(role));
      const first = staged || memberships[0];
      setEventRoleSelections(roles.length ? roles : ["referee"]);
      setFullScheduleAccess(first?.full_schedule_access ?? true);
      setAssignedGameIds(first?.assigned_game_ids || []);
      setAssignedDates(first?.assigned_dates || []);
      setAssignedSites(first?.assigned_sites || []);
      setAssignmentEditingOverride(first?.assignment_editing_override === null || first?.assignment_editing_override === undefined ? "inherit" : first.assignment_editing_override ? "enabled" : "disabled");
      setCoachingToolsEnabled(first?.coaching_tools_enabled || false);
      setRatingScope(first?.ratings_history_scope || "none");
      setRatingEventIds(first?.ratings_event_ids || []);
      setProtectedEventAdmin(roles.includes("event_admin"));
      if (openFocusedDialog) setManaging(target);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to load event access.");
    } finally {
      setBusy(false);
    }
  }
  async function beginManageRole(target: OfficialRecord) {
    await loadEventAccess(target, true);
  }
  function beginEdit(target: OfficialRecord) {
    setEditing(target);
    setEventRoleSelections(["referee"]);
    setFullScheduleAccess(true);
    setAssignedGameIds([]);
    setAssignedDates([]);
    setAssignedSites([]);
    setAssignmentEditingOverride("inherit");
    setCoachingToolsEnabled(false);
    setRatingScope("none");
    setRatingEventIds([]);
    setProtectedEventAdmin(false);
    setEditValues({
      first_name: target.first_name || splitOfficialName(target.full_name).first_name,
      last_name: target.last_name || splitOfficialName(target.full_name).last_name,
      email: target.email || "",
      secondary_email: target.secondary_email || "",
      date_of_birth: target.date_of_birth || "",
      phone: target.phone || "",
      badge_level: target.badge_level || "",
      ussf_id: target.ussf_id || "",
      external_check_in_other: target.external_check_in_other || "",
      pending_org_roles: target.pending_org_roles?.length ? target.pending_org_roles : [target.pending_org_role || "referee"],
    });
    setMessage("");
    if (event && !(target.linked_user_id === profile.id && profile.is_site_owner)) void loadEventAccess(target);
  }
  useEffect(() => {
    if (!openOfficialId) return;
    const target = officials.find((official) => official.id === openOfficialId);
    if (!target) return;
    beginEdit(target);
    onOpenOfficialHandled();
  }, [openOfficialId, officials, onOpenOfficialHandled]);
  function toggleRole(current: MembershipRole[], role: MembershipRole) {
    if (current.includes(role)) {
      const remaining = current.filter((item) => item !== role);
      return remaining.length ? remaining : ["referee" as MembershipRole];
    }
    return [...current, role];
  }
  async function saveOfficial() {
    if (!editing || !editValues.first_name.trim() || !editValues.last_name.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await updateOfficial(session, editing, editValues, canManageOrganizationRoles);
      if (editing.linked_user_id && event && !editingIsSiteOwner) {
        await saveUserEventAccess(session, event.id, editing.linked_user_id, eventRoleSelections, {
          fullScheduleAccess,
          assignedGameIds,
          assignedDates,
          assignedSites,
          assignmentEditingOverride: assignmentEditingOverride === "inherit" ? null : assignmentEditingOverride === "enabled",
          coachingToolsEnabled,
          ratingsHistoryScope: ratingScope,
          ratingsEventIds: ratingEventIds,
          preserveEventAdmin: protectedEventAdmin && !canRemoveProtectedEventAdmin,
        });
      } else if (!editing.linked_user_id && event) {
        await saveProvisionalEventAccess(session, event.id, editing.id, eventRoleSelections, {
          fullScheduleAccess,
          assignedGameIds,
          assignedDates,
          assignedSites,
          assignmentEditingOverride: assignmentEditingOverride === "inherit" ? null : assignmentEditingOverride === "enabled",
          coachingToolsEnabled,
          ratingsHistoryScope: ratingScope,
          ratingsEventIds: ratingEventIds,
        });
      }
      setMessage(`${editing.full_name}'s official record was updated.`);
      setEditing(null);
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update the official.");
    } finally {
      setBusy(false);
    }
  }
  async function mergeAccounts() {
    const primary = officials.find((item) => item.id === primaryMergeId);
    const secondary = officials.find((item) => item.id === secondaryMergeId);
    if (!primary || !secondary || mergeConfirmation !== "MERGE") return;
    setBusy(true);
    setMessage("");
    try {
      const result = await mergeOrganizationAccounts(session, organizationId, primary.id, secondary.id, mergeFieldSources);
      setMessage(result.primary_is_linked
        ? `Records merged. ${result.primary_email || "The linked account"} remains the login and assignments from both records were preserved.`
        : "Provisional records merged. Assignments and staged permissions from both records were preserved.");
      setMerging(false);
      setPrimaryMergeId("");
      setSecondaryMergeId("");
      setMergeConfirmation("");
      setMergeFieldSources({ full_name: "primary", secondary_email: "primary", date_of_birth: "primary", phone: "primary", badge_level: "primary" });
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to merge the accounts.");
    } finally {
      setBusy(false);
    }
  }
  async function removeMember() {
    if (!removing?.linked_user_id) return;
    setBusy(true);
    setMessage("");
    try {
      await removeOrganizationMember(session, organizationId, removing.linked_user_id);
      setMessage(`${removing.full_name} was removed from this group. Their account and historical records were preserved.`);
      setRemoving(null);
      setEditing(null);
      onCreated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to remove this group member.");
    } finally {
      setBusy(false);
    }
  }
  async function openAddToGroup() {
    if (!selectedOfficialIds.length) return;
    setBusy(true);
    setMessage("");
    try {
      const groups = (await loadGroupsAvailableForOfficialAddition(session))
        .filter((group) => group.id !== organizationId && group.active !== false);
      if (!groups.length) {
        setMessage("You do not have another active group where you can add officials.");
        return;
      }
      setDestinationGroups(groups);
      setDestinationGroupId(groups[0].id);
      setAddingToGroup(true);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to load destination groups.");
    } finally {
      setBusy(false);
    }
  }
  async function addSelectedToGroup() {
    if (!destinationGroupId || !selectedOfficialIds.length) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await addOfficialsToGroup(session, organizationId, destinationGroupId, selectedOfficialIds);
      const destination = destinationGroups.find((group) => group.id === destinationGroupId)?.name || "the selected group";
      const details = [
        `${result.added} added`,
        result.already_present ? `${result.already_present} already present` : "",
        result.conflicts ? `${result.conflicts} skipped because of identity conflicts${result.conflict_names.length ? ` (${result.conflict_names.join(", ")})` : ""}` : "",
      ].filter(Boolean).join("; ");
      setMessage(`${details} in ${destination}. No invitations or emails were sent.`);
      setSelectedOfficialIds([]);
      setAddingToGroup(false);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to add the selected officials to the group.");
    } finally {
      setBusy(false);
    }
  }
  async function bulkOfficials(action: "archive" | "restore" | "delete") {
    if (!selectedOfficialIds.length) return;
    const protectedIds = new Set(directoryOfficials
      .filter((item) => item.linked_user_id && (
        (item.linked_user_id === profile.id && profile.is_site_owner)
        || (item.pending_org_roles || [item.pending_org_role || "referee"]).some((role) => role === "organization_director" || role === "organization_admin")
      ))
      .map((item) => item.id));
    const applicableIds = action === "delete"
      ? selectedOfficialIds.filter((id) => !protectedIds.has(id))
      : selectedOfficialIds;
    if (!applicableIds.length) {
      setMessage("Site Owner, Group Director, and Group Admin accounts cannot be mass deleted. Open a protected account's profile to manage its access.");
      return;
    }
    const prompt = action === "delete"
      ? `Permanently delete ${applicableIds.length} eligible selected provisional officials? Administrator accounts, linked officials, and records with history will be skipped.`
      : `${action === "archive" ? "Archive" : "Restore"} ${selectedOfficialIds.length} selected officials? Their historical records will be preserved.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await bulkManageRecords(session, "officials", action, applicableIds);
      setSelectedOfficialIds([]);
      setMessage(`${result.processed} officials ${action === "delete" ? "deleted" : `${action}d`}.${result.skipped ? ` ${result.skipped} protected records were skipped.` : ""}`);
      onCreated();
      await refreshArchivedOfficials();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update the selected officials.");
    } finally {
      setBusy(false);
    }
  }
  const mergeCandidates = officials
    .filter((item) => !item.merged_into_official_id && !item.archived_at && item.identity_status !== "removed")
    .sort(comparePeopleByLastName);
  const editingIsSiteOwner = Boolean(editing?.linked_user_id === profile.id && profile.is_site_owner);
  const editingIsOrganizationDirector = Boolean(editing && (editing.pending_org_roles || [editing.pending_org_role || "referee"]).includes("organization_director"));
  const editingIsOrganizationAdmin = Boolean(editing && (editing.pending_org_roles || [editing.pending_org_role || "referee"]).includes("organization_admin"));
  const actorIsOrganizationDirector = organizationRoles.includes("organization_director");
  const actorIsOrganizationAdmin = organizationRoles.includes("organization_admin");
  const canChangeOrganizationRole = (role: MembershipRole) => Boolean(
    profile.is_site_owner
    || (actorIsOrganizationDirector && ["organization_admin", "assignor", "referee_coach", "referee"].includes(role))
    || (actorIsOrganizationAdmin && ["assignor", "referee_coach", "referee"].includes(role))
  );
  const canChangeEventRole = (role: Exclude<MembershipRole, "site_owner" | "organization_director" | "organization_admin">) => Boolean(
    profile.is_site_owner || actorIsOrganizationDirector || actorIsOrganizationAdmin
    || (eventRoles.includes("event_admin") && role !== "event_admin")
    || (eventRoles.includes("assignor") && ["site_coordinator", "referee_coach"].includes(role))
  );
  const canRemoveEditingMember = Boolean(
    editing?.linked_user_id
    && !editingIsSiteOwner
    && (!editingIsOrganizationDirector || profile.is_site_owner)
    && (!editingIsOrganizationAdmin || profile.is_site_owner || actorIsOrganizationDirector)
  );
  const canRemoveProtectedEventAdmin = Boolean(
    profile.is_site_owner
    || actorIsOrganizationDirector
    || actorIsOrganizationAdmin
  );
  const displayedOrganizationRoles: MembershipRole[] = editingIsSiteOwner
    ? ["site_owner", ...organizationRoleChoices]
    : organizationRoleChoices;
  const supervisorScopeDates = event ? [...new Set(data.games.map((game) => new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at))))].sort() : [];
  const supervisorScopeSites = [...new Set(data.games.map((game) => game.venue_name || "Unspecified site"))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  function applySupervisorScopeToGames() {
    if (!event) return;
    const matching = data.games.filter((game) => {
      const date = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at));
      return (!assignedDates.length || assignedDates.includes(date)) && (!assignedSites.length || assignedSites.includes(game.venue_name || "Unspecified site"));
    }).map((game) => game.id);
    setAssignedGameIds(matching);
  }
  const supervisorScopeControls = event && eventRoleSelections.includes("site_coordinator") ? <section className="supervisor-scope-controls">{!fullScheduleAccess && <><div><AssignmentFilterMenu label="Supervisor Dates" options={supervisorScopeDates.map((date) => ({ id: date, name: formatDate(date) }))} selected={assignedDates} onChange={setAssignedDates} /><AssignmentFilterMenu label="Supervisor Sites" options={supervisorScopeSites.map((site) => ({ id: site, name: site }))} selected={assignedSites} onChange={setAssignedSites} /></div><button className="secondary" type="button" disabled={!assignedDates.length && !assignedSites.length} onClick={applySupervisorScopeToGames}>Apply All Matching Games</button><p>{assignedGameIds.length} game{assignedGameIds.length === 1 ? "" : "s"} currently included in this supervisor’s scope.</p></>}<label>Assignment editing<select value={assignmentEditingOverride} onChange={(change) => setAssignmentEditingOverride(change.target.value as typeof assignmentEditingOverride)}><option value="inherit">Use event default ({event.site_supervisor_assignment_editing_enabled ? "Enabled" : "Disabled"})</option><option value="enabled">Enabled for this supervisor</option><option value="disabled">Disabled for this supervisor</option></select></label></section> : null;
  return <section className="page-section">
    <div className="section-title"><div><p className="eyebrow">OFFICIALS</p><h1>Referee Directory</h1><p>Group officials and the active event roster.</p></div></div>
    <div className="official-directory-actions">
      <button className="secondary" onClick={() => setAdding(true)}>Add Official</button>
      {canManageOrganizationRoles && <label className={`secondary button-label${busy ? " disabled" : ""}`}>Import Official Details<input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importOfficialDetails(file); }} /></label>}
      {canManageOrganizationRoles && <button className="secondary" disabled={busy || !officials.length} onClick={() => void exportOfficials()}>Export Officials</button>}
      {canManageOrganizationRoles && <button className="primary" disabled={busy} onClick={copyJoinLink}>{busy ? "Preparing…" : "Copy Join Link"}</button>}
      {canManageOrganizationRoles && <button className="secondary" disabled={mergeCandidates.length < 2} onClick={() => setMerging(true)}>Merge Accounts</button>}
    </div>
    <div className="directory-tools">
      <div className="segmented"><button className={scope === "organization" ? "active" : ""} onClick={() => setScope("organization")}>Group</button><button className={scope === "event" ? "active" : ""} onClick={() => setScope("event")}>Active Event</button></div>
      <input className="search" type="search" placeholder="Search name, email, phone, or badge…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <AssignmentFilterMenu label="Group Role" options={organizationRoleChoices.map((role) => ({ id: role, name: roleNames[role] }))} selected={groupRoleFilters} onChange={(roles) => setGroupRoleFilters(roles as MembershipRole[])} />
      <label className="compact-sort">Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="name">Name</option><option value="email">Email</option><option value="phone">Phone</option><option value="badge">Badge</option><option value="identity">Account Status</option><option value="role">Group Role</option><option value="event">Event Assignment</option><option value="rating">Average Rating</option><option value="last_active">Last Active</option></select></label>
      <label className="compact-sort">Order<select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as typeof sortDirection)}><option value="asc">{sortDirectionLabels.asc}</option><option value="desc">{sortDirectionLabels.desc}</option></select></label>
      {canManageOrganizationRoles && <label className="show-archived-ratings"><input type="checkbox" checked={showArchivedOfficials} onChange={(event) => setShowArchivedOfficials(event.target.checked)} /> Show Archived</label>}
      <SavedFilterControls filterKey="officials-directory" value={{ scope, query, groupRoleFilters, sortBy, sortDirection, showArchivedOfficials }} onApply={(value) => { setScope(value.scope); setQuery(value.query); setGroupRoleFilters(value.groupRoleFilters || []); setSortBy(value.sortBy); setSortDirection(value.sortDirection); setShowArchivedOfficials(value.showArchivedOfficials); }} />
    </div>
    {adding && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) setAdding(false); }}><article className="panel manual-entry-form manual-entry-modal" role="dialog" aria-modal="true" aria-label="Add official"><header><h2>Add an Official</h2><button className="modal-close-button" aria-label="Close" onClick={() => setAdding(false)}>×</button></header><div className="manual-form-grid"><label>First name<input autoComplete="given-name" value={official.first_name} onChange={(e) => setOfficial({ ...official, first_name: e.target.value })} /></label><label>Last name<input autoComplete="family-name" value={official.last_name} onChange={(e) => setOfficial({ ...official, last_name: e.target.value })} /></label><label>Primary email<input type="email" value={official.email} onChange={(e) => setOfficial({ ...official, email: e.target.value })} /></label><label>Secondary email<input type="email" value={official.secondary_email} onChange={(e) => setOfficial({ ...official, secondary_email: e.target.value })} /></label><label>Date of birth<input type="date" value={official.date_of_birth} onChange={(e) => setOfficial({ ...official, date_of_birth: e.target.value })} /></label><label>Phone<input value={official.phone} onChange={(e) => setOfficial({ ...official, phone: e.target.value })} /></label><label>Badge or level<input value={official.badge_level} onChange={(e) => setOfficial({ ...official, badge_level: e.target.value })} /></label><label>USSF ID #<input value={official.ussf_id} onChange={(e) => setOfficial({ ...official, ussf_id: e.target.value })} /></label><label>External check-in identifier<input value={official.external_check_in_other} onChange={(e) => setOfficial({ ...official, external_check_in_other: e.target.value })} /></label><fieldset className="role-checkboxes" disabled={!canManageOrganizationRoles}><legend>Group Roles</legend>{organizationRoleChoices.filter(canChangeOrganizationRole).map((role) => <label key={role}><input type="checkbox" checked={official.pending_org_roles.includes(role)} onChange={() => setOfficial({ ...official, pending_org_roles: toggleRole(official.pending_org_roles, role) })} />{roleNames[role]}</label>)}</fieldset>{event && <fieldset className="role-checkboxes provisional-event-role-picker"><legend>Event permissions for {event.name}</legend>{eventRoleChoices.map((role) => { const locked = !canChangeEventRole(role); return <label key={role}><input type="checkbox" checked={eventRoleSelections.includes(role)} disabled={locked} onChange={() => !locked && setEventRoleSelections((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])} />{roleNames[role]}{locked && <small className="role-lock">Locked</small>}</label>; })}</fieldset>}</div><button className="primary" disabled={busy || !official.first_name.trim() || !official.last_name.trim()} onClick={addOfficial}>{busy ? "Adding…" : "Add Official"}</button></article></div>}
    {message && <p className="pilot-message">{message}</p>}
    {canManageOfficials && <div className="bulk-action-bar panel"><label><input type="checkbox" checked={filtered.length > 0 && filtered.filter((item) => item.source !== "site_owner_profile").every((item) => selectedOfficialIds.includes(item.id))} onChange={(event) => setSelectedOfficialIds(event.target.checked ? filtered.filter((item) => item.source !== "site_owner_profile").map((item) => item.id) : [])} /> Select All Visible</label><strong>{selectedOfficialIds.length} selected</strong><button className="primary" disabled={busy || !selectedOfficialIds.length} onClick={openAddToGroup}>Add to Another Group</button>{canManageOrganizationRoles && <><button className="secondary" disabled={busy || !selectedOfficialIds.length} onClick={() => bulkOfficials("archive")}>Archive</button>{showArchivedOfficials && <button className="secondary" disabled={busy || !selectedOfficialIds.length} onClick={() => bulkOfficials("restore")}>Restore</button>}<button className="danger-button" disabled={busy || !selectedOfficialIds.length} onClick={() => bulkOfficials("delete")}>Delete Eligible</button></>}</div>}
    {addingToGroup && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) setAddingToGroup(false); }}><section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="add-to-group-title"><p className="eyebrow">ADD SELECTED OFFICIALS</p><h2 id="add-to-group-title">Add to Another Group</h2><p>The selected officials will remain in this group and will receive Referee access in the destination group.</p><label>Destination Group<select value={destinationGroupId} onChange={(event) => setDestinationGroupId(event.target.value)}>{destinationGroups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><p className="import-note">Linked accounts keep their existing login. Provisional officials remain provisional. This action does not send invitations or email.</p><div className="confirmation-actions"><button className="secondary" disabled={busy} onClick={() => setAddingToGroup(false)}>Cancel</button><button className="primary" disabled={busy || !destinationGroupId} onClick={addSelectedToGroup}>{busy ? "Adding…" : `Add ${selectedOfficialIds.length} Official${selectedOfficialIds.length === 1 ? "" : "s"}`}</button></div></section></div>}
    <article className="panel directory-list">
      <div className="directory-row directory-head"><span>Official</span><span className="directory-contact">Contact</span><span>Identity</span><span>Group Roles</span><span className="directory-average">Rating Summary</span><span className="directory-login">Last Active</span><span className="directory-event">Event</span></div>
      {filtered.map((official) => {
        const listedRoles = official.pending_org_roles?.length
          ? official.pending_org_roles
          : [official.pending_org_role || "referee"];
        const isSiteOwnerRecord = profile.is_site_owner && official.linked_user_id === profile.id;
        const roles = isSiteOwnerRecord
          ? [...new Set(["site_owner" as MembershipRole, ...listedRoles])]
          : listedRoles;
        return <div className={`directory-row ${official.archived_at ? "archived-rating" : ""}`} key={official.id}>
        <div className="official-name-cell">{canManageOfficials && official.source !== "site_owner_profile" && <input className="bulk-row-check" type="checkbox" aria-label={`Select ${official.full_name}`} checked={selectedOfficialIds.includes(official.id)} onChange={(event) => setSelectedOfficialIds((current) => event.target.checked ? [...current, official.id] : current.filter((id) => id !== official.id))} />}<span className="avatar">{initials(official.full_name)}</span><div><button className="official-name-link directory-official-name" onClick={() => beginEdit(official)}>{official.full_name}</button><small>{official.badge_level || "Badge not supplied"}</small></div></div>
        <div className="directory-contact"><span>{official.email || "Email required"}</span><PhoneLink phone={official.phone} fallback="No phone imported" /></div>
        <span className={`identity-pill ${official.linked_user_id ? "linked" : ""}`}>{official.linked_user_id ? "Account linked" : "Provisional"}</span>
        <span className="directory-roles">{roles.map((role) => <span className="role-badge" key={role}>{roleNames[role]}</span>)}</span>
        <span className="directory-average directory-rating-score">{officialRatingSummaryLabel(official.id)}</span>
        <span className="directory-login">{official.last_login_at ? new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(new Date(official.last_login_at)) : official.linked_user_id ? "Not recorded" : "No account"}</span>
        <span className="directory-event">{eventOfficialIds.has(official.id) ? "Assigned" : "—"}{official.source !== "site_owner_profile" && <button className="text-button manage-role" onClick={() => beginEdit(official)}>Edit</button>}{official.source !== "site_owner_profile" && official.linked_user_id && event && !isSiteOwnerRecord && <button className="text-button manage-role" disabled={busy} onClick={() => beginManageRole(official)}>Event Access</button>}</span>
      </div>;
      })}
      {!filtered.length && <EmptyState>No officials match this view.</EmptyState>}
    </article>
    {editing && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog role-dialog official-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-official-title">
      <header className="official-edit-header"><p className="eyebrow">OFFICIAL RECORD</p><h2 id="edit-official-title">Edit {editing.full_name}</h2></header>
      <div className="official-edit-body">
        {editing.linked_user_id && <p className="linked-account-note">{editing.personal_contact_locked ? "This user has locked their personal contact information. Staff may still update badge, group roles, and event permissions." : "This linked user has left contact editing unlocked for authorized staff. They can lock it at any time in Account Settings."}</p>}
        <section className="official-edit-section"><h3>Personal information</h3><div className="official-fields-grid">
          <label>First name<input autoComplete="given-name" value={editValues.first_name} disabled={Boolean(editing.personal_contact_locked)} onChange={(e) => setEditValues({ ...editValues, first_name: e.target.value })} /></label>
          <label>Last name<input autoComplete="family-name" value={editValues.last_name} disabled={Boolean(editing.personal_contact_locked)} onChange={(e) => setEditValues({ ...editValues, last_name: e.target.value })} /></label>
          <label>Primary email<input type="email" value={editValues.email} disabled={Boolean(editing.personal_contact_locked)} onChange={(e) => setEditValues({ ...editValues, email: e.target.value })} /></label>
          <label>Secondary email<input type="email" value={editValues.secondary_email} disabled={Boolean(editing.personal_contact_locked)} onChange={(e) => setEditValues({ ...editValues, secondary_email: e.target.value })} /></label>
          <label>Date of birth<input type="date" value={editValues.date_of_birth} disabled={Boolean(editing.personal_contact_locked)} onChange={(e) => setEditValues({ ...editValues, date_of_birth: e.target.value })} /></label>
          <label>Phone<input value={editValues.phone} disabled={Boolean(editing.personal_contact_locked)} onChange={(e) => setEditValues({ ...editValues, phone: e.target.value })} /></label>
          <label>Badge or level<input value={editValues.badge_level} onChange={(e) => setEditValues({ ...editValues, badge_level: e.target.value })} /></label>
          <label>USSF ID #<input value={editValues.ussf_id} onChange={(e) => setEditValues({ ...editValues, ussf_id: e.target.value })} /></label>
          <label>External check-in identifier<input value={editValues.external_check_in_other} onChange={(e) => setEditValues({ ...editValues, external_check_in_other: e.target.value })} /></label>
        </div></section>
        <section className="official-edit-section"><h3>Group Roles</h3><fieldset className={`official-role-grid ${editingIsSiteOwner ? "owner-locked" : ""}`} disabled={editingIsSiteOwner || !canManageOrganizationRoles}>{displayedOrganizationRoles.map((role) => {
          const checked = editingIsSiteOwner || editValues.pending_org_roles.includes(role);
          const protectedRole = !canChangeOrganizationRole(role) || (role === "organization_director" && editingIsOrganizationDirector && !profile.is_site_owner) || (role === "organization_admin" && editingIsOrganizationAdmin && !profile.is_site_owner && !actorIsOrganizationDirector);
          return <label className={`${checked ? "selected" : ""} ${editingIsSiteOwner || protectedRole ? "locked" : ""}`} key={role}><input type="checkbox" checked={checked} disabled={protectedRole} onChange={() => !editingIsSiteOwner && !protectedRole && setEditValues({ ...editValues, pending_org_roles: toggleRole(editValues.pending_org_roles, role) })} /><span>{roleNames[role]}</span>{(editingIsSiteOwner || protectedRole) && <small className="role-lock">Locked</small>}</label>;
        })}</fieldset></section>
        {editingIsSiteOwner && <div className="official-edit-note owner-access-note"><strong>Site Owner — Full Access</strong><span>Your Site Owner account automatically inherits every group and event capability. These permissions are locked and cannot be removed here.</span></div>}
        {!editingIsSiteOwner && event && <section className="official-edit-section official-event-permissions"><div className="official-event-permissions-heading"><div><p className="eyebrow">ACTIVE EVENT PERMISSIONS</p><h3>{event.name}</h3></div><span>{editing.linked_user_id ? "These permissions apply only to the current active event." : "These permissions will activate automatically when this provisional official creates their account."}</span></div>
          <fieldset className="official-role-grid"><legend>Event roles</legend>{eventRoleChoices.map((role) => { const locked = !canChangeEventRole(role) || (role === "event_admin" && protectedEventAdmin && !canRemoveProtectedEventAdmin); return <label className={`${eventRoleSelections.includes(role) ? "selected" : ""} ${locked ? "locked" : ""}`} key={role}><input type="checkbox" checked={eventRoleSelections.includes(role)} disabled={locked} onChange={() => !locked && setEventRoleSelections((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])} /><span>{roleNames[role]}</span>{locked && <small className="role-lock">Locked</small>}</label>; })}</fieldset>
          {protectedEventAdmin && !canRemoveProtectedEventAdmin && <p className="import-note">This Event Admin role can only be removed by a Group Admin, Group Director, Site Owner, or the Event Admin themselves.</p>}
          <div className="official-event-options"><label className="visibility-lock"><input type="checkbox" checked={fullScheduleAccess} onChange={(change) => setFullScheduleAccess(change.target.checked)} /><span><strong>Full schedule access</strong><small>When disabled, this person sees only the selected games below.</small></span></label><label className="visibility-lock"><input type="checkbox" checked={coachingToolsEnabled} onChange={(change) => setCoachingToolsEnabled(change.target.checked)} /><span><strong>Enable coaching tools</strong><small>Allows ratings tools when the selected event role supports them.</small></span></label></div>
          {supervisorScopeControls}
          {!fullScheduleAccess && <fieldset className="event-game-scope"><legend>Games available in {event.name}</legend>{data.games.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((eventGame) => <label key={eventGame.id}><input type="checkbox" checked={assignedGameIds.includes(eventGame.id)} onChange={(change) => setAssignedGameIds((current) => change.target.checked ? [...current, eventGame.id] : current.filter((id) => id !== eventGame.id))} /><span><strong>{formatDate(eventGame.starts_at)} · {formatTime(eventGame.starts_at)} · {eventGame.field_name}</strong><small>{eventGame.home_team} vs. {eventGame.away_team}</small></span></label>)}</fieldset>}
          <label className="official-event-history-scope">Previous-event ratings<select value={ratingScope} onChange={(change) => setRatingScope(change.target.value as typeof ratingScope)}><option value="none">No previous events</option><option value="specific">Selected previous events</option><option value="all">All organization events</option></select></label>{ratingScope === "specific" && <fieldset className="event-game-scope"><legend>Allowed previous events</legend>{events.filter((item) => item.id !== event.id).map((item) => <label key={item.id}><input type="checkbox" checked={ratingEventIds.includes(item.id)} onChange={(change) => setRatingEventIds((current) => change.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>{item.name}</strong></span></label>)}</fieldset>}
        </section>}
      </div>
      <div className="official-edit-actions">{canManageOrganizationRoles && canRemoveEditingMember && <button className="danger-button remove-member-button" disabled={busy} onClick={() => setRemoving(editing)}>Remove From Group</button>}<button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={busy || !editValues.first_name.trim() || !editValues.last_name.trim()} onClick={saveOfficial}>{busy ? "Saving…" : "Save Official"}</button></div>
    </section></div>}
    {removing && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog" role="dialog" aria-modal="true"><p className="eyebrow">REMOVE GROUP MEMBER</p><h2>Remove {removing.full_name}?</h2><p>This removes their group and event access. Their Law18Ref account, assignments, ratings, check-ins, and audit history are preserved.</p><div><button className="secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button" disabled={busy} onClick={removeMember}>{busy ? "Removing…" : "Remove Member"}</button></div></section></div>}
    {managing && event && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog role-dialog event-access-dialog" role="dialog" aria-modal="true"><p className="eyebrow">EVENT ACCESS</p><h2>{managing.full_name}</h2><p>Assign one or more roles and schedule access for {event.name}.</p><fieldset className="role-checkboxes"><legend>Event roles</legend>{eventRoleChoices.map((role) => {
      const locked = !canChangeEventRole(role) || (role === "event_admin" && protectedEventAdmin && !canRemoveProtectedEventAdmin);
      return <label key={role}><input type="checkbox" checked={eventRoleSelections.includes(role)} disabled={locked} onChange={() => !locked && setEventRoleSelections((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])} />{roleNames[role]}{locked && <small className="role-lock">Locked</small>}</label>;
    })}</fieldset>{protectedEventAdmin && !canRemoveProtectedEventAdmin && <p className="import-note">Another event administrator cannot remove this access. The administrator can remove themselves, or an organization administrator or site owner can remove it.</p>}<label className="visibility-lock"><input type="checkbox" checked={fullScheduleAccess} onChange={(event) => setFullScheduleAccess(event.target.checked)} /><span><strong>Full schedule access</strong><small>When disabled, this person sees only the selected games below.</small></span></label>{supervisorScopeControls}{!fullScheduleAccess && <fieldset className="event-game-scope"><legend>Assigned games</legend>{data.games.slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((game) => <label key={game.id}><input type="checkbox" checked={assignedGameIds.includes(game.id)} onChange={(event) => setAssignedGameIds((current) => event.target.checked ? [...current, game.id] : current.filter((id) => id !== game.id))} /><span><strong>{formatTime(game.starts_at)} · {game.field_name}</strong><small>{game.home_team} vs. {game.away_team}</small></span></label>)}</fieldset>}<label className="visibility-lock"><input type="checkbox" checked={coachingToolsEnabled} onChange={(event) => setCoachingToolsEnabled(event.target.checked)} /><span><strong>Enable coaching tools</strong><small>Allows an assignor or coordinator to submit ratings when otherwise authorized.</small></span></label><label>Previous-event ratings<select value={ratingScope} onChange={(e) => setRatingScope(e.target.value as typeof ratingScope)}><option value="none">No previous events</option><option value="specific">Selected previous events</option><option value="all">All organization events</option></select></label>{ratingScope === "specific" && <fieldset><legend>Allowed events</legend>{events.filter((item) => item.id !== event.id).map((item) => <label className="event-access-check" key={item.id}><input type="checkbox" checked={ratingEventIds.includes(item.id)} onChange={(e) => setRatingEventIds((current) => e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />{item.name}</label>)}</fieldset>}<div><button className="secondary" onClick={() => setManaging(null)}>Cancel</button><button className="primary" disabled={busy} onClick={saveEventRole}>Save event access</button></div></section></div>}
    {merging && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog merge-dialog" role="dialog" aria-modal="true"><p className="eyebrow">IDENTITY REVIEW</p><h2>Merge Official Records</h2><p>Choose the record that survives, then review which information will be kept. If only one record has a login, choose that linked account as the survivor. Assignments, check-ins, ratings, and group/event permissions will be combined.</p><label>Surviving record<select value={primaryMergeId} onChange={(event) => { setPrimaryMergeId(event.target.value); setSecondaryMergeId(""); setMergeFieldSources({ full_name: "primary", secondary_email: "primary", date_of_birth: "primary", phone: "primary", badge_level: "primary" }); }}><option value="">Choose the record to keep</option>{mergeCandidates.map((official) => <option value={official.id} key={official.id}>{officialSelectorLabel(official)} — {official.email || "Email unavailable"} ({official.linked_user_id ? "Linked" : "Provisional"})</option>)}</select></label><label>Duplicate record<select value={secondaryMergeId} onChange={(event) => setSecondaryMergeId(event.target.value)}><option value="">Choose the duplicate record</option>{mergeCandidates.filter((official) => official.id !== primaryMergeId && (officials.find((item) => item.id === primaryMergeId)?.linked_user_id || !official.linked_user_id)).map((official) => <option value={official.id} key={official.id}>{officialSelectorLabel(official)} — {official.email || "Email unavailable"} ({official.linked_user_id ? "Linked" : "Provisional"})</option>)}</select></label>{(() => {
      const primary = officials.find((item) => item.id === primaryMergeId);
      const secondary = officials.find((item) => item.id === secondaryMergeId);
      if (!primary || !secondary) return null;
      const fields = [
        ["full_name", "Full name", primary.full_name, secondary.full_name],
        ["secondary_email", "Secondary email", primary.secondary_email, secondary.secondary_email],
        ["date_of_birth", "Date of birth", primary.date_of_birth, secondary.date_of_birth],
        ["phone", "Phone", primary.phone, secondary.phone],
        ["badge_level", "Badge or level", primary.badge_level, secondary.badge_level],
      ] as const;
      return <div className="merge-profile-review"><header><span>Information</span><span>Primary Account</span><span>Duplicate Account</span></header><div className="merge-primary-email"><strong>Primary email and login</strong><span>{primary.email || "Not provided"}</span><small>Kept with the primary login</small></div>{primary.personal_contact_locked && <p className="import-note">The primary user locked their personal contact information. Contact fields must remain from that account; badge or level can still be selected.</p>}{fields.map(([key, label, primaryValue, secondaryValue]) => {
        const contactLocked = Boolean(primary.personal_contact_locked) && key !== "badge_level";
        return <fieldset key={key}><legend>{label}</legend><label className={mergeFieldSources[key] === "primary" ? "selected" : ""}><input type="radio" name={`merge-${key}`} checked={mergeFieldSources[key] === "primary"} onChange={() => setMergeFieldSources((current) => ({ ...current, [key]: "primary" }))} />{key === "phone" ? <PhoneLink phone={primaryValue} fallback="Not provided" /> : <span>{primaryValue || "Not provided"}</span>}</label><label className={mergeFieldSources[key] === "secondary" ? "selected" : ""}><input type="radio" name={`merge-${key}`} disabled={contactLocked} checked={mergeFieldSources[key] === "secondary"} onChange={() => setMergeFieldSources((current) => ({ ...current, [key]: "secondary" }))} />{key === "phone" ? <PhoneLink phone={secondaryValue} fallback="Not provided" /> : <span>{secondaryValue || "Not provided"}</span>}</label></fieldset>;
      })}</div>;
    })()}<p className="import-note">The duplicate record remains as a hidden import alias so future Assignr schedules continue matching correctly. If both records have logins, the duplicate login loses access to this group.</p><label>Type MERGE to confirm<input value={mergeConfirmation} onChange={(event) => setMergeConfirmation(event.target.value.toUpperCase())} /></label><div className="merge-dialog-actions"><button className="secondary" disabled={busy} onClick={() => { setMerging(false); setMergeConfirmation(""); }}>Cancel</button><button className="danger-button" disabled={busy || !primaryMergeId || !secondaryMergeId || primaryMergeId === secondaryMergeId || mergeConfirmation !== "MERGE"} onClick={mergeAccounts}>{busy ? "Merging…" : "Merge Records"}</button></div></section></div>}
  </section>;
}

type CrewRatingDraft = {
  overall_rating: number | null;
  positioning: number;
  decision_making: number;
  communication: number;
  match_control: number;
  strengths: string;
  development_focus: string;
  additional_comments: string;
  coach_notes: string;
};

const blankCrewRating = (): CrewRatingDraft => ({
  overall_rating: null,
  positioning: 3,
  decision_making: 3,
  communication: 3,
  match_control: 3,
  strengths: "",
  development_focus: "",
  additional_comments: "",
  coach_notes: "",
});

type SkillRatingKey = "positioning" | "decision_making" | "communication" | "match_control";

function skillsForAssignment(assignment: AssignmentRecord): { key: SkillRatingKey; label: string }[] {
  const title = (assignment.position_title || "").trim().toLowerCase();
  const assistantReferee = assignment.position === "assistant_referee" || /^(ar(?:\s*\d+)?|assistant referee(?:\s*\d+)?|asst\.? referee(?:\s*\d+)?)$/.test(title);
  const fourthOfficial = assignment.position === "fourth_official" || /^(4th|fourth) official$/.test(title);
  if (assistantReferee) return [
    { key: "decision_making", label: "Signaling/Offside" },
    { key: "communication", label: "Teamwork" },
    { key: "positioning", label: "Positioning and Movement" },
  ];
  if (fourthOfficial) return [
    { key: "communication", label: "Teamwork" },
    { key: "match_control", label: "Management of the Technical Area" },
  ];
  return [
    { key: "match_control", label: "Match Control" },
    { key: "communication", label: "Teamwork" },
    { key: "positioning", label: "Positioning and Movement" },
  ];
}

function skillValuesForAssignment(assignment: AssignmentRecord, rating: CrewRatingDraft) {
  const enabled = new Set(skillsForAssignment(assignment).map((item) => item.key));
  return {
    positioning: enabled.has("positioning") ? rating.positioning : null,
    decision_making: enabled.has("decision_making") ? rating.decision_making : null,
    communication: enabled.has("communication") ? rating.communication : null,
    match_control: enabled.has("match_control") ? rating.match_control : null,
  };
}

function assessmentScore(assessment: AssessmentRecord): number | null {
  if (assessment.evaluation_type === "basic_eval") return assessment.overall_rating;
  const skills = [assessment.positioning, assessment.decision_making, assessment.communication, assessment.match_control]
    .filter((score): score is number => score !== null);
  return skills.length ? skills.reduce((sum, score) => sum + score, 0) / skills.length : null;
}

function AssessmentCenter({
  session,
  event,
  events,
  organizationId,
  data,
  canSubmit,
  canConfigure,
  canApprovePublic,
  onSaved,
  onEventUpdated,
  initialGameId,
  initialAssessmentId,
  modal = false,
  onClose,
  hideWorkspace = false,
  onOpenRating,
  onEditRating,
}: {
  session: Law18Session;
  event: EventRecord;
  events: EventRecord[];
  organizationId: string;
  data: EventData;
  canSubmit: boolean;
  canConfigure: boolean;
  canApprovePublic: boolean;
  onSaved: (ratings: AssessmentRecord[]) => Promise<void> | void;
  onEventUpdated: (event: EventRecord) => void;
  initialGameId?: string;
  initialAssessmentId?: string;
  modal?: boolean;
  onClose?: () => void;
  hideWorkspace?: boolean;
  onOpenRating?: () => void;
  onEditRating?: (gameId: string, eventId: string, assessmentId: string) => void;
}) {
  const [gameId, setGameId] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">(event.ratings_admin_only ? "private" : "public");
  const [drafts, setDrafts] = useState<Record<string, CrewRatingDraft>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const savingCrewRef = useRef(false);
  const [configuration, setConfiguration] = useState<{ ratingType: EventRecord["rating_type"]; adminOnly: boolean; approvalRole: NonNullable<EventRecord["public_rating_approval_role"]> }>({ ratingType: event.rating_type, adminOnly: event.ratings_admin_only, approvalRole: event.public_rating_approval_role || "inherit" });
  const [ratingSort, setRatingSort] = useActiveFilterState<"date" | "gender" | "age_group" | "referee" | "position" | "score">("ratings-sort", "date");
  const [historyEventIds, setHistoryEventIds] = useActiveFilterState<string[]>("ratings-events", []);
  const [historyFilters, setHistoryFilters] = useActiveFilterState("ratings-filters", { referees: [] as string[], ageGroups: [] as string[], genders: [] as string[], positions: [] as string[], scores: [] as string[] });
  const [refereeFilterSearch, setRefereeFilterSearch] = useState("");
  const [historyDateRange, setHistoryDateRange] = useActiveFilterState("ratings-date-range", { from: "", through: "" });
  const [historyView, setHistoryView] = useState<"individual" | "game">("individual");
  const [historyStatus, setHistoryStatus] = useActiveFilterState<"all" | "submitted" | "draft">("ratings-status", "all");
  const [showArchivedRatings, setShowArchivedRatings] = useActiveFilterState("ratings-show-archived", false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [ratingExportMode, setRatingExportMode] = useState<"individual" | "game" | "summary">("individual");
  const [summaryCriteria, setSummaryCriteria] = useState<string[]>(["official"]);
  const [selectedRatingIds, setSelectedRatingIds] = useState<string[]>([]);
  const [collapsedRatingGameIds, setCollapsedRatingGameIds] = useState<string[]>([]);
  const [swapRatingsForGame, setSwapRatingsForGame] = useState<AssessmentRecord[] | null>(null);
  const [firstSwapRatingId, setFirstSwapRatingId] = useState("");
  const [secondSwapRatingId, setSecondSwapRatingId] = useState("");
  const filterDropdownsRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState({ assessments: data.assessments, games: data.games, assignments: data.assignments, officials: data.officials, events: [] as EventRecord[], submitters: [] as { id: string; full_name: string }[] });
  const refreshRatingHistory = useCallback(() => loadAuthorizedRatingHistory(session, organizationId).then(setHistory), [organizationId, session]);
  useEffect(() => {
    refreshRatingHistory().catch(() => undefined);
  }, [refreshRatingHistory]);
  useEffect(() => {
    setHistory((current) => {
      const eventAssessmentIds = new Set(data.assessments.map((assessment) => assessment.id));
      return {
        ...current,
        assessments: [...current.assessments.filter((assessment) => !eventAssessmentIds.has(assessment.id)), ...data.assessments],
        games: [...new Map([...current.games, ...data.games].map((game) => [game.id, game])).values()],
        assignments: [...new Map([...current.assignments, ...data.assignments].map((assignment) => [assignment.id, assignment])).values()],
        officials: [...new Map([...current.officials, ...data.officials].map((official) => [official.id, official])).values()],
      };
    });
  }, [data.assessments, data.assignments, data.games, data.officials]);
  useEffect(() => {
    const closeDropdowns = (event: PointerEvent) => {
      filterDropdownsRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((dropdown) => {
        if (!dropdown.contains(event.target as Node)) dropdown.removeAttribute("open");
      });
    };
    document.addEventListener("pointerdown", closeDropdowns);
    return () => document.removeEventListener("pointerdown", closeDropdowns);
  }, []);
  useEffect(() => {
    setConfiguration({ ratingType: event.rating_type, adminOnly: event.ratings_admin_only, approvalRole: event.public_rating_approval_role || "inherit" });
  }, [event.id, event.rating_type, event.ratings_admin_only, event.public_rating_approval_role]);
  const officialMap = new Map(data.officials.map((official) => [official.id, official]));
  const gameMap = new Map(data.games.map((game) => [game.id, game]));
  const historyOfficialMap = new Map(history.officials.map((official) => [official.id, official]));
  const ratingSubmitterMap = new Map((history.submitters || []).map((submitter) => [submitter.id, submitter.full_name]));
  const ratingAttribution = (assessment: AssessmentRecord) => {
    const submittedBy = ratingSubmitterMap.get(assessment.coach_id) || "Unknown user";
    return assessment.edited_by
      ? `Submitted by ${submittedBy}, edited by ${ratingSubmitterMap.get(assessment.edited_by) || "Unknown administrator"}`
      : `Submitted by ${submittedBy}`;
  };
  const historyGameMap = new Map(history.games.map((game) => [game.id, game]));
  const editingAssessment = initialAssessmentId
    ? data.assessments.find((assessment) => assessment.id === initialAssessmentId) || history.assessments.find((assessment) => assessment.id === initialAssessmentId)
    : undefined;
  const ratingAuthorId = editingAssessment?.coach_id || session.user.id;
  const ratingRecords = [...new Map([...history.assessments, ...data.assessments].map((assessment) => [assessment.id, assessment])).values()];
  const assignmentsForRatingGame = (targetGameId: string) => {
    const currentAssignments = [...new Map(data.assignments.filter((assignment) => assignment.game_id === targetGameId).map((assignment) => [assignment.official_id, assignment])).values()];
    if (!initialAssessmentId || !editingAssessment || editingAssessment.game_id !== targetGameId) return sortGameCrew(currentAssignments);
    const originalSubmission = ratingRecords.filter((assessment) => assessment.game_id === targetGameId && assessment.coach_id === editingAssessment.coach_id && !assessment.deleted_at);
    return sortGameCrew(originalSubmission.map((assessment) => currentAssignments.find((assignment) => assignment.official_id === assessment.official_id) || {
      id: `rating-${assessment.id}`,
      game_id: assessment.game_id,
      official_id: assessment.official_id,
      position: assessment.rated_position || "other",
      position_title: assessment.rated_position_title || null,
      source_position_title: assessment.rated_position_title || null,
    }));
  };
  const gameAssignments = assignmentsForRatingGame(gameId);
  const submissionLocked = Boolean(!initialAssessmentId && gameId && data.assessments.some((assessment) =>
    assessment.game_id === gameId && assessment.coach_id === session.user.id && assessment.status !== "draft"
  ));
  const eligibleGames = data.games.filter(isRateableGame).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const historyAssignment = (assessment: AssessmentRecord) => history.assignments.find((item) => item.game_id === assessment.game_id && item.official_id === assessment.official_id);
  const historyPosition = (assessment: AssessmentRecord) => assessment.rated_position_title || (assessment.rated_position ? positionLabel(assessment.rated_position) : null) || historyAssignment(assessment)?.position_title || "Unspecified position";
  const ratingScoreLabel = (assessment: AssessmentRecord) => {
    const score = assessmentScore(assessment);
    return score === null ? "Unscored" : Number(score.toFixed(2)).toString();
  };
  const crewAssignmentOrder = (assessment: AssessmentRecord) => {
    const index = history.assignments.findIndex((assignment) => assignment.game_id === assessment.game_id && assignment.official_id === assessment.official_id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const orderGameRatings = (ratings: AssessmentRecord[]) => ratings.map((assessment, index) => ({ assessment, index })).sort((a, b) => {
    const priorityDifference = crewPositionPriority(historyAssignment(a.assessment) || { id: a.assessment.id, game_id: a.assessment.game_id, official_id: a.assessment.official_id, position: "other", position_title: null, source_position_title: null }) - crewPositionPriority(historyAssignment(b.assessment) || { id: b.assessment.id, game_id: b.assessment.game_id, official_id: b.assessment.official_id, position: "other", position_title: null, source_position_title: null });
    if (priorityDifference) return priorityDifference;
    const assignmentDifference = crewAssignmentOrder(a.assessment) - crewAssignmentOrder(b.assessment);
    return assignmentDifference || a.index - b.index;
  }).map(({ assessment }) => assessment);
  const filterOptions = {
    referees: [...new Set(history.assessments.map((item) => historyOfficialMap.get(item.official_id)).filter((item): item is OfficialRecord => Boolean(item)).map(officialSelectorLabel))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    ageGroups: [...new Set(history.games.map((game) => game.age_group || "Unspecified age group"))].sort(),
    genders: [...new Set(history.games.map((game) => game.gender || "Unspecified gender"))].sort(),
    positions: [...new Set(history.assessments.map(historyPosition))].sort(),
    scores: [...new Set(history.assessments.map(ratingScoreLabel))].sort((a, b) => {
      if (a === "Unscored") return 1;
      if (b === "Unscored") return -1;
      return Number(b) - Number(a);
    }),
  };
  const toggleHistoryFilter = (key: keyof typeof historyFilters, value: string) => setHistoryFilters((current) => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value],
  }));
  const activeHistoryFilterCount = Object.values(historyFilters).reduce((sum, values) => sum + values.length, 0)
    + historyEventIds.length + Number(Boolean(historyDateRange.from)) + Number(Boolean(historyDateRange.through)) + Number(historyStatus !== "all");
  const sortedAssessments = history.assessments.filter((item) => {
    const game = historyGameMap.get(item.game_id);
    const refereeRecord = historyOfficialMap.get(item.official_id);
    const referee = refereeRecord ? officialSelectorLabel(refereeRecord) : "Unknown official";
    const gameDate = game?.starts_at.slice(0, 10) || "";
    return (!canSubmit || showArchivedRatings || !item.archived_at)
      && (historyStatus === "all" || (historyStatus === "draft" ? item.status === "draft" : item.status !== "draft"))
      && (!historyEventIds.length || Boolean(game?.event_id && historyEventIds.includes(game.event_id)))
      && (!historyFilters.referees.length || historyFilters.referees.includes(referee))
      && (!historyFilters.ageGroups.length || historyFilters.ageGroups.includes(game?.age_group || "Unspecified age group"))
      && (!historyFilters.genders.length || historyFilters.genders.includes(game?.gender || "Unspecified gender"))
      && (!historyFilters.positions.length || historyFilters.positions.includes(historyPosition(item)))
      && (!historyFilters.scores.length || historyFilters.scores.includes(ratingScoreLabel(item)))
      && (!historyDateRange.from || gameDate >= historyDateRange.from)
      && (!historyDateRange.through || gameDate <= historyDateRange.through);
  }).sort((a, b) => {
    const aGame = historyGameMap.get(a.game_id);
    const bGame = historyGameMap.get(b.game_id);
    if (ratingSort === "referee") {
      const aOfficial = historyOfficialMap.get(a.official_id);
      const bOfficial = historyOfficialMap.get(b.official_id);
      return (aOfficial ? officialSelectorLabel(aOfficial) : "").localeCompare(bOfficial ? officialSelectorLabel(bOfficial) : "", undefined, { numeric: true, sensitivity: "base" });
    }
    if (ratingSort === "gender") return (aGame?.gender || "").localeCompare(bGame?.gender || "");
    if (ratingSort === "age_group") return (aGame?.age_group || "").localeCompare(bGame?.age_group || "");
    if (ratingSort === "position") {
      const aPosition = historyPosition(a);
      const bPosition = historyPosition(b);
      return aPosition.localeCompare(bPosition);
    }
    if (ratingSort === "score") {
      const aScore = assessmentScore(a);
      const bScore = assessmentScore(b);
      if (aScore === null || bScore === null) return aScore === bScore ? 0 : aScore === null ? 1 : -1;
      return bScore - aScore;
    }
    return (aGame?.starts_at || "").localeCompare(bGame?.starts_at || "");
  });
  const filteredScores = sortedAssessments.filter((assessment) => assessment.include_in_averages !== false).map(assessmentScore).filter((score): score is number => score !== null);
  const filteredAverage = filteredScores.length ? filteredScores.reduce((sum, score) => sum + score, 0) / filteredScores.length : null;
  const groupedAssessments = [...sortedAssessments.reduce((groups, assessment) => {
    const key = assessment.game_id;
    groups.set(key, [...(groups.get(key) || []), assessment]);
    return groups;
  }, new Map<string, AssessmentRecord[]>()).entries()];

  async function changeRatingArchive(assessment: AssessmentRecord, archived: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await setRatingArchived(session, assessment.id, archived);
      await refreshRatingHistory();
      setMessage(archived ? "Rating archived." : "Rating restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the rating.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRatingAverageInclusion(assessment: AssessmentRecord, included: boolean) {
    setBusy(true);
    setMessage("");
    try {
      await setRatingAverageInclusion(session, assessment.id, included);
      await refreshRatingHistory();
      setMessage(included ? "Rating restored to scoring averages and referee visibility." : "Rating retained for staff, excluded from scoring averages, and hidden from the referee.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update this rating’s average setting.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRating(assessment: AssessmentRecord) {
    const canRetain = assessment.visibility === "public" && assessment.status === "shared";
    const retainForReferee = canRetain && window.confirm("Keep this public rating in the referee’s account after removing it from administrative records?\n\nChoose OK to retain the referee’s copy. Choose Cancel to continue to the full-delete choice.");
    if (!retainForReferee && !window.confirm("Fully delete this rating from Law18Ref? The referee will no longer be able to view it. This cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteRating(session, assessment.id, retainForReferee);
      await refreshRatingHistory();
      setMessage(retainForReferee ? "Rating removed from administration and retained for the referee." : "Rating fully deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete the rating.");
    } finally {
      setBusy(false);
    }
  }

  function openRatingSwap(ratings: AssessmentRecord[]) {
    setSwapRatingsForGame(ratings);
    setFirstSwapRatingId("");
    setSecondSwapRatingId("");
  }

  async function swapRatings() {
    if (!firstSwapRatingId || !secondSwapRatingId || firstSwapRatingId === secondSwapRatingId) return;
    setBusy(true);
    setMessage("");
    try {
      await swapSameGameRatings(session, firstSwapRatingId, secondSwapRatingId);
      setSwapRatingsForGame(null);
      await refreshRatingHistory();
      setMessage("The two officials’ ratings were swapped.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to swap these ratings.");
    } finally {
      setBusy(false);
    }
  }

  async function approveRating(assessment: AssessmentRecord) {
    setBusy(true);
    setMessage("");
    try {
      await approvePublicRating(session, assessment.id);
      await refreshRatingHistory();
      setMessage("Public rating approved and shared with the referee.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to approve the rating.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSavedDraft(assessment: AssessmentRecord) {
    setBusy(true);
    setMessage("");
    try {
      await submitDraftRating(session, assessment.id);
      await refreshRatingHistory();
      setMessage("Draft rating submitted.");
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit this draft rating.");
    } finally {
      setBusy(false);
    }
  }

  async function bulkRatings(action: "archive" | "restore" | "delete") {
    if (!selectedRatingIds.length) return;
    let retainPublicForReferees = false;
    if (action === "delete") {
      const hasSharedPublic = history.assessments.some((assessment) => selectedRatingIds.includes(assessment.id) && assessment.visibility === "public" && assessment.status === "shared");
      retainPublicForReferees = hasSharedPublic && window.confirm("Keep shared public ratings in each referee’s account?\n\nChoose OK to retain referee copies. Choose Cancel to continue to the full-delete choice.");
      if (!retainPublicForReferees && !window.confirm(`Fully delete ${selectedRatingIds.length} selected ratings? Referees will lose access and this cannot be undone.`)) return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = action === "delete"
        ? (await Promise.all(selectedRatingIds.map((id) => deleteRating(session, id, retainPublicForReferees))), { processed: selectedRatingIds.length, skipped: 0 })
        : await bulkManageRecords(session, "ratings", action, selectedRatingIds);
      setSelectedRatingIds([]);
      await refreshRatingHistory();
      setMessage(`${result.processed} ratings ${action === "delete" ? (retainPublicForReferees ? "removed; shared referee copies were retained" : "fully deleted") : `${action}d`}.${result.skipped ? ` ${result.skipped} could not be changed.` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the selected ratings.");
    } finally {
      setBusy(false);
    }
  }

  const ratingExportFields = (rating: AssessmentRecord) => {
    const ratedGame = historyGameMap.get(rating.game_id);
    const ratedEvent = history.events.find((item) => item.id === ratedGame?.event_id) || events.find((item) => item.id === ratedGame?.event_id);
    return {
      event: ratedEvent?.name || "",
      date: ratedGame ? formatDate(ratedGame.starts_at) : "",
      time: ratedGame ? formatTime(ratedGame.starts_at) : "",
      field: ratedGame?.field_name || "",
      homeTeam: ratedGame?.home_team || "",
      awayTeam: ratedGame?.away_team || "",
      age: ratedGame?.age_group || "Unspecified age group",
      gender: ratedGame?.gender || "Unspecified gender",
      official: historyOfficialMap.get(rating.official_id)?.full_name || "Unknown official",
      position: historyPosition(rating),
      submitter: ratingSubmitterMap.get(rating.coach_id) || "Unknown user",
      evaluationType: rating.evaluation_type === "basic_eval" ? "Basic Eval" : "Skills Eval",
      status: rating.status === "draft" ? "Draft" : "Submitted",
      score: assessmentScore(rating),
    };
  };

  async function exportRatings() {
    if (!sortedAssessments.length || (ratingExportMode === "summary" && !summaryCriteria.length)) return;
    const escapeCell = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const compareExportGames = (left: AssessmentRecord, right: AssessmentRecord) => {
      const leftGame = historyGameMap.get(left.game_id);
      const rightGame = historyGameMap.get(right.game_id);
      const leftEvent = history.events.find((item) => item.id === leftGame?.event_id) || events.find((item) => item.id === leftGame?.event_id);
      const rightEvent = history.events.find((item) => item.id === rightGame?.event_id) || events.find((item) => item.id === rightGame?.event_id);
      return (leftEvent?.name || "").localeCompare(rightEvent?.name || "", undefined, { numeric: true, sensitivity: "base" })
        || (leftGame?.starts_at || "").localeCompare(rightGame?.starts_at || "")
        || (leftGame?.venue_name || "").localeCompare(rightGame?.venue_name || "", undefined, { numeric: true, sensitivity: "base" })
        || (leftGame?.field_name || "").localeCompare(rightGame?.field_name || "", undefined, { numeric: true, sensitivity: "base" })
        || (leftGame?.home_team || "").localeCompare(rightGame?.home_team || "", undefined, { numeric: true, sensitivity: "base" })
        || (leftGame?.away_team || "").localeCompare(rightGame?.away_team || "", undefined, { numeric: true, sensitivity: "base" })
        || left.game_id.localeCompare(right.game_id);
    };
    const exportedAssessments = [...sortedAssessments].sort((left, right) => compareExportGames(left, right)
      || (left.submitted_at || left.created_at || "").localeCompare(right.submitted_at || right.created_at || "")
      || left.coach_id.localeCompare(right.coach_id)
      || crewPositionPriority(historyAssignment(left) || { id: left.id, game_id: left.game_id, official_id: left.official_id, position: left.rated_position || "other", position_title: left.rated_position_title || null, source_position_title: null }) - crewPositionPriority(historyAssignment(right) || { id: right.id, game_id: right.game_id, official_id: right.official_id, position: right.rated_position || "other", position_title: right.rated_position_title || null, source_position_title: null })
      || (historyOfficialMap.get(left.official_id)?.full_name || "").localeCompare(historyOfficialMap.get(right.official_id)?.full_name || "", undefined, { sensitivity: "base" }));
    const includesSkillsEvals = exportedAssessments.some((rating) => rating.evaluation_type !== "basic_eval");
    let headings: string[] = [];
    let rows: unknown[][] = [];

    if (ratingExportMode === "individual") {
      headings = ["Event", "Date", "Time", "Field", "Home Team", "Away Team", "Age Group", "Gender", "Official", "Position", "Submitted By", "Status", "Eval Type", "Score", "Counted in Averages"];
      if (includesSkillsEvals) headings.push("Positioning and Movement", "Signaling/Offside", "Teamwork", "Match Control or Technical Area Management", "Positive Areas of Performance", "Areas for Improvement", "Additional Comments/Suggestions", "Private Coach/Admin Notes");
      else headings.push("Notes");
      rows = exportedAssessments.map((rating) => {
        const fields = ratingExportFields(rating);
        const cells: unknown[] = [fields.event, fields.date, fields.time, fields.field, fields.homeTeam, fields.awayTeam, fields.age, fields.gender, fields.official, fields.position, fields.submitter, fields.status, fields.evaluationType, fields.score?.toFixed(2) || "", rating.include_in_averages === false ? "No" : "Yes"];
        if (includesSkillsEvals) cells.push(rating.positioning ?? "", rating.decision_making ?? "", rating.communication ?? "", rating.match_control ?? "", rating.strengths || "", rating.development_focus || "", rating.additional_comments || "", rating.coach_notes || "");
        else cells.push(rating.coach_notes || "");
        return cells;
      });
    } else if (ratingExportMode === "game") {
      const submissions = [...exportedAssessments.reduce((groups, rating) => {
        const key = `${rating.game_id}:${rating.coach_id}`;
        groups.set(key, [...(groups.get(key) || []), rating]);
        return groups;
      }, new Map<string, AssessmentRecord[]>()).values()].sort((a, b) => compareExportGames(a[0], b[0])
        || (a[0].submitted_at || a[0].created_at || "").localeCompare(b[0].submitted_at || b[0].created_at || "")
        || a[0].coach_id.localeCompare(b[0].coach_id));
      const maximumCrew = Math.max(...submissions.map((ratings) => ratings.length));
      headings = ["Event", "Date", "Time", "Field", "Home Team", "Away Team", "Age Group", "Gender", "Submitted By", "Status", "Duplicate Submission"];
      for (let index = 1; index <= maximumCrew; index += 1) {
        headings.push(`Official ${index} Name`, `Official ${index} Position`, `Official ${index} Score`, `Official ${index} Counted in Averages`);
        if (includesSkillsEvals) headings.push(`Official ${index} Positive Areas`, `Official ${index} Areas for Improvement`, `Official ${index} Additional Comments`, `Official ${index} Private Notes`);
        else headings.push(`Official ${index} Notes`);
      }
      const gameOccurrence = new Map<string, number>();
      rows = submissions.map((ratings) => {
        const first = ratingExportFields(ratings[0]);
        const occurrence = gameOccurrence.get(ratings[0].game_id) || 0;
        gameOccurrence.set(ratings[0].game_id, occurrence + 1);
        const cells: unknown[] = [first.event, first.date, first.time, first.field, first.homeTeam, first.awayTeam, first.age, first.gender, first.submitter, first.status, occurrence > 0 ? "Yes" : "No"];
        orderGameRatings(ratings).forEach((rating) => {
          const fields = ratingExportFields(rating);
          cells.push(fields.official, fields.position, fields.score?.toFixed(2) || "", rating.include_in_averages === false ? "No" : "Yes");
          if (includesSkillsEvals) cells.push(rating.strengths || "", rating.development_focus || "", rating.additional_comments || "", rating.coach_notes || "");
          else cells.push(rating.coach_notes || "");
        });
        while (cells.length < headings.length) cells.push("");
        return cells;
      });
    } else {
      const criteria = [
        ["official", "Official"], ["position", "Position"], ["event", "Event"], ["date", "Date"],
        ["age", "Age Group"], ["gender", "Gender"], ["field", "Field"], ["submitter", "Submitted By"],
        ["evaluationType", "Evaluation Type"], ["status", "Status"], ["score", "Rating Score"],
      ] as const;
      const selectedCriteria = criteria.filter(([key]) => summaryCriteria.includes(key));
      headings = [...selectedCriteria.map(([, label]) => label), "Rating Count", "Scored Rating Count", "Average Score"];
      const summaryGroups = sortedAssessments.reduce((groups, rating) => {
        const fields = ratingExportFields(rating);
        const values = selectedCriteria.map(([key]) => String(fields[key] ?? ""));
        const key = JSON.stringify(values);
        const current = groups.get(key) || { values, ratings: [] as AssessmentRecord[] };
        current.ratings.push(rating);
        groups.set(key, current);
        return groups;
      }, new Map<string, { values: string[]; ratings: AssessmentRecord[] }>());
      rows = [...summaryGroups.values()].map(({ values, ratings }) => {
        const scores = ratings.filter((rating) => rating.include_in_averages !== false).map(assessmentScore).filter((score): score is number => score !== null);
        return [...values, ratings.length, scores.length, scores.length ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2) : ""];
      });
    }

    const csv = [headings, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const safeFilenameToken = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    const abbreviatedOfficialName = (value: string) => {
      const parts = value.trim().split(/\s+/).filter(Boolean);
      return parts.length > 1 ? `${parts[0][0]}-${parts.at(-1)}` : parts[0] || "official";
    };
    const compactValues = (values: string[], transform: (value: string) => string = (value) => value) => {
      const compact = values.slice(0, 2).map((value) => safeFilenameToken(transform(value))).filter(Boolean);
      return `${compact.join("_")}${values.length > 2 ? `_plus${values.length - 2}` : ""}`;
    };
    const filenameSegments = ["law18ref-ratings", ratingExportMode];
    if (historyDateRange.from || historyDateRange.through) filenameSegments.push(`dt-${historyDateRange.from || "start"}${historyDateRange.through && historyDateRange.through !== historyDateRange.from ? `_to_${historyDateRange.through}` : ""}`);
    if (historyEventIds.length) filenameSegments.push(`evt-${compactValues(historyEventIds.map((id) => history.events.find((item) => item.id === id)?.name || events.find((item) => item.id === id)?.name || "event"))}`);
    if (historyFilters.referees.length) filenameSegments.push(`ref-${compactValues(historyFilters.referees, abbreviatedOfficialName)}`);
    if (historyFilters.ageGroups.length) filenameSegments.push(`age-${compactValues(historyFilters.ageGroups)}`);
    if (historyFilters.genders.length) filenameSegments.push(`gen-${compactValues(historyFilters.genders)}`);
    if (historyFilters.positions.length) filenameSegments.push(`pos-${compactValues(historyFilters.positions)}`);
    if (historyFilters.scores.length) filenameSegments.push(`score-${compactValues(historyFilters.scores)}`);
    if (historyStatus !== "all") filenameSegments.push(historyStatus);
    if (showArchivedRatings) filenameSegments.push("incl-archived");
    if (ratingExportMode === "summary") filenameSegments.push(`by-${compactValues(summaryCriteria)}`);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `${filenameSegments.join("_").slice(0, 180)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setExportDialogOpen(false);
    await logRatingExport(session, sortedAssessments.length, groupedAssessments.length).catch(() => undefined);
  }

  function chooseGame(nextGameId: string) {
    setGameId(nextGameId);
    const nextDrafts: Record<string, CrewRatingDraft> = {};
    assignmentsForRatingGame(nextGameId).forEach((assignment) => {
      const saved = data.assessments.find((assessment) => assessment.game_id === nextGameId && assessment.official_id === assignment.official_id && assessment.coach_id === ratingAuthorId)
        || history.assessments.find((assessment) => assessment.game_id === nextGameId && assessment.official_id === assignment.official_id && assessment.coach_id === ratingAuthorId);
      nextDrafts[assignment.official_id] = saved ? {
        overall_rating: saved.overall_rating ?? null,
        positioning: saved.positioning || 3,
        decision_making: saved.decision_making || 3,
        communication: saved.communication || 3,
        match_control: saved.match_control || 3,
        strengths: saved.strengths || "",
        development_focus: saved.development_focus || "",
        additional_comments: saved.additional_comments || "",
        coach_notes: saved.coach_notes || "",
      } : blankCrewRating();
    });
    setDrafts(nextDrafts);
  }
  useEffect(() => {
    if (initialGameId && data.games.some((game) => game.id === initialGameId)) chooseGame(initialGameId);
  }, [initialGameId, initialAssessmentId, editingAssessment?.id, ratingAuthorId]);

  function updateDraft(officialId: string, changes: Partial<CrewRatingDraft>) {
    setDrafts((current) => ({ ...current, [officialId]: { ...(current[officialId] || blankCrewRating()), ...changes } }));
  }

  async function submitCrew(status: "draft" | "submitted") {
    if (!organizationId || !gameId || !gameAssignments.length || savingCrewRef.current) return;
    savingCrewRef.current = true;
    let ratingsConfirmed = false;
    setBusy(true);
    setMessage("");
    try {
      const ratingPayloads = gameAssignments.map((assignment) => {
        const rating = drafts[assignment.official_id] || blankCrewRating();
        const skillValues = skillValuesForAssignment(assignment, rating);
        const existingRating = (data.assessments.find((assessment) => assessment.game_id === gameId && assessment.official_id === assignment.official_id && assessment.coach_id === ratingAuthorId)
          || history.assessments.find((assessment) => assessment.game_id === gameId && assessment.official_id === assignment.official_id && assessment.coach_id === ratingAuthorId));
        return {
          values: {
            game_id: gameId,
            official_id: assignment.official_id,
            visibility: event.ratings_admin_only ? "private" as const : visibility,
            status,
            evaluation_type: event.rating_type,
            overall_rating: event.rating_type === "basic_eval" ? rating.overall_rating : null,
            positioning: event.rating_type === "skills_eval" ? skillValues.positioning : null,
            decision_making: event.rating_type === "skills_eval" ? skillValues.decision_making : null,
            communication: event.rating_type === "skills_eval" ? skillValues.communication : null,
            match_control: event.rating_type === "skills_eval" ? skillValues.match_control : null,
            strengths: event.rating_type === "skills_eval" ? rating.strengths || null : null,
            development_focus: event.rating_type === "skills_eval" ? rating.development_focus || null : null,
            additional_comments: event.rating_type === "skills_eval" ? rating.additional_comments || null : null,
            coach_notes: rating.coach_notes || null,
          },
          targetAssessmentId: initialAssessmentId ? existingRating?.id : null,
        };
      });
      const savedRatings = await saveAssessmentsBatch(session, organizationId, ratingPayloads);
      if (savedRatings.length !== gameAssignments.length || savedRatings.some((rating) => !rating?.id)) {
        throw new Error("Not every crew rating was confirmed. Please try saving again.");
      }
      ratingsConfirmed = true;
      await onSaved(savedRatings);
      setMessage(initialAssessmentId ? `The existing crew rating was updated for ${gameAssignments.length} officials.` : status === "draft" ? `Draft ratings saved for ${gameAssignments.length} officials.` : `Ratings submitted for ${gameAssignments.length} officials.`);
      if (status === "submitted") {
        if (modal) onClose?.();
        else chooseGame("");
      }
    } catch (error) {
      setMessage(ratingsConfirmed
        ? "The ratings were saved, but the latest data could not be reloaded. Your entries remain on this screen; use Refresh before leaving."
        : error instanceof Error ? error.message : "Unable to save the ratings.");
    } finally {
      savingCrewRef.current = false;
      setBusy(false);
    }
  }

  async function saveConfiguration() {
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateEventRatingSettings(session, event.id, configuration.ratingType, configuration.adminOnly, configuration.approvalRole);
      onEventUpdated(updated);
      setVisibility(configuration.adminOnly ? "private" : visibility);
      setMessage("Event rating settings updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update event rating settings.");
    } finally {
      setBusy(false);
    }
  }

  const canManageRating = (assessment: AssessmentRecord) => canConfigure || (assessment.coach_id === session.user.id && assessment.status === "draft");
  const ratingActions = (assessment: AssessmentRecord, ratedGame?: GameRecord) => canManageRating(assessment) ? <div className="rating-history-actions">
    {assessment.status === "draft" && <button className="primary submit-draft-rating-button" disabled={busy} onClick={() => void submitSavedDraft(assessment)}>Submit Draft</button>}
    {canApprovePublic && assessment.visibility === "public" && assessment.status === "submitted" && <button className="primary" disabled={busy} onClick={() => approveRating(assessment)}>Approve & Share</button>}
    {canConfigure && !assessment.archived_at && ratedGame && onEditRating && <button className="secondary edit-rating-button" disabled={busy} onClick={() => onEditRating(assessment.game_id, ratedGame.event_id, assessment.id)}>Edit</button>}
    {canConfigure && <button className="secondary average-inclusion-button" disabled={busy} onClick={() => changeRatingAverageInclusion(assessment, assessment.include_in_averages === false)}>{assessment.include_in_averages === false ? "Count in Averages" : "Exclude from Averages"}</button>}
    <button className="secondary" disabled={busy} onClick={() => changeRatingArchive(assessment, !assessment.archived_at)}>{assessment.archived_at ? "Restore" : "Archive"}</button>
    <button className="danger-button" disabled={busy} onClick={() => removeRating(assessment)}>Delete</button>
  </div> : null;

  return <section className={`page-section ratings-page${modal ? " rating-modal" : ""}`} role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label={modal ? "Rate crew" : undefined} onClick={modal ? (click) => { if (click.target === click.currentTarget) onClose?.(); } : undefined}>
    <div className="section-title"><div><p className="eyebrow">{canSubmit ? "REFEREE DEVELOPMENT" : "MY FEEDBACK"}</p><h1>{canSubmit ? "Ratings" : "My Evals"}</h1><p>{canSubmit ? "Rate every official assigned to a game in one view." : "Review ratings that have been shared with you."}</p></div>{canSubmit && hideWorkspace && <button className="primary" onClick={onOpenRating}>Rate a Crew</button>}</div>
    {canConfigure && <article className="panel rating-settings"><div><p className="eyebrow">EVENT SETTINGS</p><h2>Rating configuration</h2><p>Changes remain private to this form until you save them.</p></div><label>Evaluation type<select value={configuration.ratingType} disabled={busy} onChange={(e) => setConfiguration((current) => ({ ...current, ratingType: e.target.value as EventRecord["rating_type"] }))}><option value="skills_eval">Skills Eval</option><option value="basic_eval">Basic Eval</option></select></label><label>Public Eval Approval<select value={configuration.approvalRole} disabled={busy || configuration.adminOnly} onChange={(e) => setConfiguration((current) => ({ ...current, approvalRole: e.target.value as NonNullable<EventRecord["public_rating_approval_role"]> }))}><option value="inherit">Use Organization Setting</option><option value="none">No Approval — Share Immediately</option><option value="organization_admin">Organization Admin Approval</option><option value="event_admin">Event Admin Approval</option></select></label><label className="visibility-lock"><input type="checkbox" checked={configuration.adminOnly} disabled={busy} onChange={(e) => setConfiguration((current) => ({ ...current, adminOnly: e.target.checked }))} /><span><strong>Lock visibility to event staff</strong><small>Only administrators, event/game assignors, and referee coaches can view ratings.</small></span></label><button type="button" className="primary rating-config-save" disabled={busy || (configuration.ratingType === event.rating_type && configuration.adminOnly === event.ratings_admin_only && configuration.approvalRole === (event.public_rating_approval_role || "inherit"))} onClick={() => void saveConfiguration()}>{busy ? "Saving…" : "Save Configuration"}</button>{message && <p className="pilot-message rating-config-message">{message}</p>}</article>}
    {canSubmit && !hideWorkspace && <article className="panel crew-rating-workspace">
      <div className="panel-head"><div><p className="eyebrow">{event.rating_type === "skills_eval" ? "SKILLS EVAL" : "BASIC EVAL"}</p><h2>{modal ? "Rate Crew" : "Select a game"}</h2></div>{modal && <button className="modal-close" aria-label="Close rating form" onClick={onClose}>×</button>}</div>
      <div className="assessment-selects"><label>Game<select value={gameId} onChange={(e) => chooseGame(e.target.value)}><option value="">Choose a game</option>{eligibleGames.map((game) => <option value={game.id} key={game.id}>{formatDate(game.starts_at)} · {game.field_name} · {formatTime(game.starts_at)}</option>)}</select></label><label>Visibility<select value={event.ratings_admin_only ? "private" : visibility} disabled={event.ratings_admin_only} onChange={(e) => setVisibility(e.target.value as "public" | "private")}><option value="private">Private — event staff and referee coaches</option><option value="public">Public — visible to each referee</option></select></label>{event.ratings_admin_only && <p className="import-note">Visibility is locked to event staff for this event.</p>}</div>
      {submissionLocked && <p className="import-note rating-submission-locked">You already submitted a rating for this game. An Event Admin or Group Admin must make any correction.</p>}
      {initialAssessmentId && <p className="import-note rating-editing-notice">Editing the existing submission. The original values will be retained in the audit history.</p>}
      <fieldset className="crew-rating-list" disabled={submissionLocked}>{gameAssignments.map((assignment) => {
        const rating = drafts[assignment.official_id] || blankCrewRating();
        return <section className="crew-rating-card" key={assignment.official_id}><div className="crew-rating-heading"><span className="avatar">{initials(officialMap.get(assignment.official_id)?.full_name || "R")}</span><div className="crew-rating-identity"><h3>{officialMap.get(assignment.official_id)?.full_name || "Official"}</h3><p>{positionLabel(assignment.position, assignment.position_title)}</p></div>{event.rating_type === "basic_eval" && <label className="inline-basic-rating"><span>Rating</span><select aria-label={`Rating for ${officialMap.get(assignment.official_id)?.full_name || "official"}`} value={rating.overall_rating ?? ""} onChange={(e) => updateDraft(assignment.official_id, { overall_rating: e.target.value ? Number(e.target.value) : null })}><option value="">N/A</option>{[1,2,3,4,5].map((score) => <option value={score} key={score}>{score}</option>)}</select></label>}</div>
          {event.rating_type === "basic_eval"
            ? <div className="basic-eval-fields"><label className="basic-eval-notes">Notes<textarea rows={2} value={rating.coach_notes} placeholder="Add notes about this official…" onChange={(e) => updateDraft(assignment.official_id, { coach_notes: e.target.value })} /></label></div>
            : <><div className="skill-rating-grid">{skillsForAssignment(assignment).map(({ key, label }) => <label key={key}><span>{label}</span><select value={rating[key]} onChange={(e) => updateDraft(assignment.official_id, { [key]: Number(e.target.value) })}>{[1,2,3,4,5].map((score) => <option key={score}>{score}</option>)}</select></label>)}</div><div className="crew-notes-grid"><label>Positive Areas of Performance<textarea value={rating.strengths} onChange={(e) => updateDraft(assignment.official_id, { strengths: e.target.value })} /></label><label>Areas for Improvement<textarea value={rating.development_focus} onChange={(e) => updateDraft(assignment.official_id, { development_focus: e.target.value })} /></label><label>Additional Comments/Suggestions<textarea value={rating.additional_comments} onChange={(e) => updateDraft(assignment.official_id, { additional_comments: e.target.value })} /></label><label>Private Coach/Admin Notes<textarea value={rating.coach_notes} onChange={(e) => updateDraft(assignment.official_id, { coach_notes: e.target.value })} /></label></div></>}
        </section>;
      })}{gameId && !gameAssignments.length && <EmptyState>No officials are assigned to this game.</EmptyState>}</fieldset>
      {message && !canConfigure && <p className="pilot-message assessment-message">{message}</p>}
      <div className="assessment-actions">{!initialAssessmentId && <button type="button" className="secondary" disabled={busy || !gameAssignments.length || submissionLocked} onClick={() => void submitCrew("draft")}>{busy ? "Saving…" : "Save crew draft"}</button>}<button type="button" className="primary" disabled={busy || !gameAssignments.length || submissionLocked} onClick={() => void submitCrew("submitted")}>{busy ? "Saving…" : initialAssessmentId ? "Save Rating Changes" : "Submit all ratings"}</button></div>
    </article>}
    <article className="panel history ratings-history"><div className="panel-head"><div><p className="eyebrow">HISTORY</p><h2>{sortedAssessments.length} matching rating{sortedAssessments.length === 1 ? "" : "s"}</h2><p className="filtered-rating-average">Average Score <strong>{filteredAverage?.toFixed(2) || "—"}</strong></p></div><div className="rating-history-toolbar"><div className="segmented-control" aria-label="Rating history view"><button className={historyView === "individual" ? "active" : ""} onClick={() => setHistoryView("individual")}>Individual Ratings</button><button className={historyView === "game" ? "active" : ""} onClick={() => setHistoryView("game")}>Full Game Ratings</button></div><button className="secondary" disabled={!sortedAssessments.length} onClick={() => setExportDialogOpen(true)}>Export Spreadsheet</button></div><div className="history-filters"><AssignmentFilterMenu label="Events" options={[...new Set(history.games.map((game) => game.event_id))].map((id) => ({ id, name: history.events.find((item) => item.id === id)?.name || events.find((item) => item.id === id)?.name || `Previous event · ${id.slice(0, 8)}` }))} selected={historyEventIds} onChange={setHistoryEventIds} /><label className="compact-sort">Status<select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value as typeof historyStatus)}><option value="all">All Ratings</option><option value="submitted">Submitted</option><option value="draft">Drafts</option></select></label><label className="compact-sort">Sort by<select value={ratingSort} onChange={(e) => setRatingSort(e.target.value as typeof ratingSort)}><option value="date">Date</option><option value="gender">Gender</option><option value="age_group">Age group</option><option value="referee">Referee</option><option value="position">Position</option><option value="score">Rating Score</option></select></label><label className="show-archived-ratings"><input type="checkbox" checked={showArchivedRatings} onChange={(event) => setShowArchivedRatings(event.target.checked)} /> Show Archived Ratings</label></div></div>
      {historyView === "game" && groupedAssessments.length > 1 && <div className="collapse-all-row"><button className="secondary" type="button" onClick={() => setCollapsedRatingGameIds(groupedAssessments.map(([gameId]) => gameId))}>Collapse All Games</button></div>}
      {canConfigure && <div className="bulk-action-bar"><label><input type="checkbox" checked={sortedAssessments.length > 0 && sortedAssessments.every((item) => selectedRatingIds.includes(item.id))} onChange={(event) => setSelectedRatingIds(event.target.checked ? sortedAssessments.map((item) => item.id) : [])} /> Select All Visible</label><strong>{selectedRatingIds.length} selected</strong><button className="secondary" disabled={busy || !selectedRatingIds.length} onClick={() => bulkRatings("archive")}>Archive</button>{showArchivedRatings && <button className="secondary" disabled={busy || !selectedRatingIds.length} onClick={() => bulkRatings("restore")}>Restore</button>}<button className="danger-button" disabled={busy || !selectedRatingIds.length} onClick={() => bulkRatings("delete")}>Delete</button></div>}
      <details className="ratings-filter-panel"><summary>Filter Ratings{activeHistoryFilterCount ? ` · ${activeHistoryFilterCount} selected` : ""}</summary><div className="ratings-filter-grid" ref={filterDropdownsRef}>{([
        ["referees", "Referees", filterOptions.referees],
        ["ageGroups", "Age Groups", filterOptions.ageGroups],
        ["genders", "Genders", filterOptions.genders],
        ["positions", "Positions", filterOptions.positions],
        ["scores", "Rating Scores", filterOptions.scores],
      ] as const).map(([key, label, options]) => {
        const visibleOptions = key === "referees" && refereeFilterSearch.trim()
          ? options.filter((option) => option.toLowerCase().includes(refereeFilterSearch.trim().toLowerCase()))
          : options;
        const allSelected = options.length > 0 && options.every((option) => historyFilters[key].includes(option));
        return <details className="rating-filter-dropdown" key={key}><summary><span>{label}</span><small>{historyFilters[key].length ? `${historyFilters[key].length} selected` : "All"}</small></summary><div className="rating-filter-options">{key === "referees" && <input className="rating-referee-search" type="search" value={refereeFilterSearch} placeholder="Search referees…" aria-label="Search referees" onChange={(event) => setRefereeFilterSearch(event.target.value)} />}<label className="rating-select-all"><input type="checkbox" checked={allSelected} onChange={() => setHistoryFilters((current) => ({ ...current, [key]: allSelected ? [] : [...options] }))} /><strong>Select All</strong></label>{visibleOptions.map((option) => <label key={option}><input type="checkbox" checked={historyFilters[key].includes(option)} onChange={() => toggleHistoryFilter(key, option)} /><span>{option}</span></label>)}{!visibleOptions.length && <small>No matching referees</small>}</div></details>;
      })}<fieldset className="rating-date-range"><legend>Date Range</legend><label>From<input type="date" value={historyDateRange.from} max={historyDateRange.through || undefined} onChange={(event) => setHistoryDateRange((current) => ({ ...current, from: event.target.value }))} /></label><label>Through<input type="date" value={historyDateRange.through} min={historyDateRange.from || undefined} onChange={(event) => setHistoryDateRange((current) => ({ ...current, through: event.target.value }))} /></label></fieldset></div><div className="rating-filter-actions"><SavedFilterControls filterKey="ratings-history" value={{ historyFilters, historyDateRange, historyEventIds, ratingSort, historyStatus, showArchivedRatings }} onApply={(saved) => { setHistoryFilters(saved.historyFilters); setHistoryDateRange(saved.historyDateRange); setHistoryEventIds(saved.historyEventIds); setRatingSort(saved.ratingSort); setHistoryStatus(saved.historyStatus || "all"); setShowArchivedRatings(saved.showArchivedRatings); }} /><button className="text-button clear-rating-filters" disabled={!activeHistoryFilterCount} onClick={() => { setHistoryFilters({ referees: [], ageGroups: [], genders: [], positions: [], scores: [] }); setHistoryEventIds([]); setHistoryDateRange({ from: "", through: "" }); setHistoryStatus("all"); setRefereeFilterSearch(""); }}>Clear All Filters</button></div></details>
      {message && !canConfigure && <p className="pilot-message assessment-message">{message}</p>}
      {historyView === "individual" && sortedAssessments.map((assessment) => {
      const score = assessmentScore(assessment);
      const ratedGame = historyGameMap.get(assessment.game_id);
      return <article className={`${canConfigure ? "selectable-rating-row " : ""}${assessment.archived_at ? "archived-rating " : ""}${assessment.include_in_averages === false ? "excluded-from-average" : ""}`.trim()} key={assessment.id}>{canConfigure && <input className="bulk-row-check" type="checkbox" aria-label={`Select rating for ${historyOfficialMap.get(assessment.official_id)?.full_name || "official"}`} checked={selectedRatingIds.includes(assessment.id)} onChange={(event) => setSelectedRatingIds((current) => event.target.checked ? [...current, assessment.id] : current.filter((id) => id !== assessment.id))} />}<div><strong>{historyOfficialMap.get(assessment.official_id)?.full_name || "Referee"}</strong><p>{ratedGame?.home_team} vs. {ratedGame?.away_team}</p><small>{assessment.evaluation_type === "basic_eval" ? "Basic Eval" : "Skills Eval"} · {assessment.visibility === "public" ? "Public" : "Admin only"}{assessment.archived_at ? " · Archived" : ""}{assessment.include_in_averages === false ? " · Excluded from averages" : ""}</small><small className="rating-submitter">{ratingAttribution(assessment)}</small></div><span className="score">{score ? Number(score).toFixed(1) : "—"}</span><span className={`identity-pill ${assessment.status !== "draft" ? "linked" : ""}`}>{assessment.status}</span>{ratingActions(assessment, ratedGame)}</article>;
    })}
      {historyView === "game" && groupedAssessments.map(([ratedGameId, ratings]) => {
        const ratedGame = historyGameMap.get(ratedGameId);
        const gameSelected = ratings.every((assessment) => selectedRatingIds.includes(assessment.id));
        const collapsed = collapsedRatingGameIds.includes(ratedGameId);
        const manageableRatings = ratings.filter(canManageRating);
        const swappable = manageableRatings.some((rating, index) => manageableRatings.slice(index + 1).some((candidate) => candidate.coach_id === rating.coach_id && candidate.official_id !== rating.official_id));
        return <article className={`game-rating-history-card ${collapsed ? "collapsed" : ""}`} key={ratedGameId}><header>{canConfigure && <input className="bulk-row-check" type="checkbox" aria-label="Select all ratings for this game" checked={gameSelected} onChange={(change) => setSelectedRatingIds((current) => change.target.checked ? [...new Set([...current, ...ratings.map((item) => item.id)])] : current.filter((id) => !ratings.some((item) => item.id === id)))} />}<div><strong>{ratedGame?.home_team} vs. {ratedGame?.away_team}</strong><p>{ratedGame ? `${formatDate(ratedGame.starts_at)} · ${formatTime(ratedGame.starts_at)} · ${ratedGame.field_name}` : "Game details unavailable"}</p></div><span>{ratings.length} official{ratings.length === 1 ? "" : "s"}</span>{swappable && <button className="secondary swap-ratings-button" type="button" onClick={() => openRatingSwap(manageableRatings)}>Swap Ratings</button>}<button className="game-rating-collapse" aria-label={`${collapsed ? "Expand" : "Collapse"} ratings for this game`} aria-expanded={!collapsed} onClick={() => setCollapsedRatingGameIds((current) => current.includes(ratedGameId) ? current.filter((id) => id !== ratedGameId) : [...current, ratedGameId])}>{collapsed ? "▾" : "▴"}</button></header>{!collapsed && <div className="game-rating-officials">{orderGameRatings(ratings).map((assessment) => <div className={`${assessment.archived_at ? "archived-rating " : ""}${assessment.include_in_averages === false ? "excluded-from-average" : ""}`.trim()} key={assessment.id}><div><strong>{historyOfficialMap.get(assessment.official_id)?.full_name || "Referee"}</strong><small>{historyPosition(assessment)}{assessment.archived_at ? " · Archived" : ""}{assessment.include_in_averages === false ? " · Excluded from averages" : ""}</small><small className="rating-submitter">{ratingAttribution(assessment)}</small></div><span className="score">{assessmentScore(assessment)?.toFixed(1) || "—"}</span>{ratingActions(assessment, ratedGame)}</div>)}</div>}</article>;
      })}
      {exportDialogOpen && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) setExportDialogOpen(false); }}><section className="confirmation-dialog rating-export-dialog" role="dialog" aria-modal="true" aria-labelledby="rating-export-title"><header><div><p className="eyebrow">EXPORT FILTERED RATINGS</p><h2 id="rating-export-title">Choose Export Format</h2><p>The export includes the {sortedAssessments.length} ratings currently matching your filters.</p></div><button className="modal-close-button" aria-label="Close rating export" onClick={() => setExportDialogOpen(false)}>×</button></header><div className="rating-export-mode" role="radiogroup" aria-label="Rating export format">{([
        ["individual", "Individual Official Ratings", "One row for every official rating."],
        ["game", "Full Game Submissions", "One row per game submission. Later submissions for the same match are marked as duplicates."],
        ["summary", "Summary", "Counts and average scores grouped by your selected criteria."],
      ] as const).map(([mode, title, description]) => <label key={mode} className={ratingExportMode === mode ? "selected" : ""}><input type="radio" name="rating-export-mode" value={mode} checked={ratingExportMode === mode} onChange={() => setRatingExportMode(mode)} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div>{ratingExportMode === "summary" && <fieldset className="rating-summary-criteria"><legend>Summarize By</legend><p>Select one or more fields. Each unique combination becomes one summary row.</p><div>{([
        ["official", "Official"], ["position", "Position"], ["event", "Event"], ["date", "Date"], ["age", "Age Group"], ["gender", "Gender"], ["field", "Field"], ["submitter", "Submitted By"], ["evaluationType", "Evaluation Type"], ["status", "Status"], ["score", "Rating Score"],
      ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={summaryCriteria.includes(key)} onChange={(event) => setSummaryCriteria((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} /> {label}</label>)}</div>{!summaryCriteria.length && <small className="field-error">Select at least one summary field.</small>}</fieldset>}<footer><button className="secondary" onClick={() => setExportDialogOpen(false)}>Cancel</button><button className="primary" disabled={ratingExportMode === "summary" && !summaryCriteria.length} onClick={() => void exportRatings()}>Export CSV</button></footer></section></div>}
      {swapRatingsForGame && <div className="confirmation-backdrop" role="presentation" onClick={(click) => { if (click.target === click.currentTarget) setSwapRatingsForGame(null); }}><section className="confirmation-dialog swap-ratings-dialog" role="dialog" aria-modal="true" aria-labelledby="swap-ratings-title"><header><div><p className="eyebrow">CORRECT RATING OWNERS</p><h2 id="swap-ratings-title">Swap Ratings</h2><p>Choose two officials rated by the same coach. Their complete evaluation contents will exchange places.</p></div><button className="modal-close-button" aria-label="Close rating swap" onClick={() => setSwapRatingsForGame(null)}>×</button></header><label>First official<select value={firstSwapRatingId} onChange={(change) => { setFirstSwapRatingId(change.target.value); setSecondSwapRatingId(""); }}><option value="">Choose an official</option>{swapRatingsForGame.slice().sort((left, right) => { const a = historyOfficialMap.get(left.official_id); const b = historyOfficialMap.get(right.official_id); return (a ? officialSelectorLabel(a) : "").localeCompare(b ? officialSelectorLabel(b) : ""); }).map((assessment) => { const ratedOfficial = historyOfficialMap.get(assessment.official_id); return <option value={assessment.id} key={assessment.id}>{ratedOfficial ? officialSelectorLabel(ratedOfficial) : "Unknown official"} · {ratingSubmitterMap.get(assessment.coach_id) || "Unknown coach"}</option>; })}</select></label><label>Second official<select value={secondSwapRatingId} disabled={!firstSwapRatingId} onChange={(change) => setSecondSwapRatingId(change.target.value)}><option value="">Choose an official</option>{swapRatingsForGame.filter((assessment) => { const first = swapRatingsForGame.find((item) => item.id === firstSwapRatingId); return assessment.id !== firstSwapRatingId && assessment.coach_id === first?.coach_id && assessment.official_id !== first?.official_id; }).sort((left, right) => { const a = historyOfficialMap.get(left.official_id); const b = historyOfficialMap.get(right.official_id); return (a ? officialSelectorLabel(a) : "").localeCompare(b ? officialSelectorLabel(b) : ""); }).map((assessment) => { const ratedOfficial = historyOfficialMap.get(assessment.official_id); return <option value={assessment.id} key={assessment.id}>{ratedOfficial ? officialSelectorLabel(ratedOfficial) : "Unknown official"}</option>; })}</select></label><p className="import-note">This changes which official owns each rating. It does not change the game assignments.</p><div><button className="secondary" disabled={busy} onClick={() => setSwapRatingsForGame(null)}>Cancel</button><button className="primary" disabled={busy || !firstSwapRatingId || !secondSwapRatingId} onClick={() => void swapRatings()}>{busy ? "Swapping…" : "Swap Ratings"}</button></div></section></div>}
      {!sortedAssessments.length && <EmptyState>No ratings match these filters.</EmptyState>}</article>
  </section>;
}

function AppearanceSettings({ session }: { session: Law18Session }) {
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof loadAppearanceCampaigns>>>([]);
  const [themes, setThemes] = useState<Awaited<ReturnType<typeof loadAppearanceThemes>>>([]);
  const [form, setForm] = useState({
    name: "",
    logo_url: "",
    primary_color: "#315f8d",
    accent_color: "#b53367",
    starts_at: "",
    ends_at: "",
  });
  const [message, setMessage] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoDragging, setLogoDragging] = useState(false);
  const [logoFileName, setLogoFileName] = useState("");
  useEffect(() => {
    Promise.all([loadAppearanceCampaigns(session), loadAppearanceThemes(session)])
      .then(([nextCampaigns, nextThemes]) => { setCampaigns(nextCampaigns); setThemes(nextThemes); })
      .catch(() => undefined);
  }, [session]);
  async function selectLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Choose a PNG, JPEG, or WebP logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("The logo must be 5 MB or smaller.");
      return;
    }
    setLogoUploading(true);
    setMessage("Uploading temporary logo…");
    try {
      const logoUrl = await uploadAppearanceLogo(session, file);
      setForm((current) => ({ ...current, logo_url: logoUrl }));
      setLogoFileName(file.name);
      setMessage(`${file.name} is ready to preview, save, or schedule.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload the logo.");
    } finally {
      setLogoUploading(false);
    }
  }
  async function schedule() {
    try {
      await createAppearanceCampaign(session, {
        ...form,
        logo_url: form.logo_url || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        active: true,
      });
      const nextCampaigns = await loadAppearanceCampaigns(session);
      setCampaigns(nextCampaigns);
      const now = Date.now();
      displayAppearance(nextCampaigns.find((item) => item.active && new Date(item.starts_at).getTime() <= now && new Date(item.ends_at).getTime() > now));
      setMessage("Appearance campaign scheduled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to schedule this appearance.");
    }
  }
  async function restore() {
    await restoreDefaultAppearance(session);
    setCampaigns(await loadAppearanceCampaigns(session));
    displayAppearance();
    setMessage("The default Law18Ref appearance has been restored.");
  }
  async function unschedule(campaignId: string, campaignName: string) {
    if (!window.confirm(`Unschedule and delete “${campaignName}”? This does not delete a saved reusable theme.`)) return;
    try {
      await deleteAppearanceCampaign(session, campaignId);
      const nextCampaigns = await loadAppearanceCampaigns(session);
      setCampaigns(nextCampaigns);
      const now = Date.now();
      displayAppearance(nextCampaigns.find((item) => item.active && new Date(item.starts_at).getTime() <= now && new Date(item.ends_at).getTime() > now));
      setMessage(`${campaignName} was unscheduled.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to unschedule this appearance.");
    }
  }
  async function saveTheme() {
    try {
      await saveAppearanceTheme(session, {
        name: form.name.trim(),
        logo_url: form.logo_url.trim() || null,
        primary_color: form.primary_color,
        accent_color: form.accent_color,
      });
      setThemes(await loadAppearanceThemes(session));
      setMessage(`${form.name.trim()} was saved to your theme library.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save this theme.");
    }
  }
  function loadTheme(theme: Awaited<ReturnType<typeof loadAppearanceThemes>>[number]) {
    setForm({
      ...form,
      name: theme.name,
      logo_url: theme.logo_url || "",
      primary_color: theme.primary_color,
      accent_color: theme.accent_color,
    });
    setLogoFileName(theme.logo_url ? "Saved custom logo" : "");
    displayAppearance(theme);
    setMessage(`${theme.name} loaded. Choose dates to schedule it, or adjust it and save as another theme.`);
  }
  async function removeTheme(themeId: string, themeName: string) {
    if (!window.confirm(`Delete the saved theme “${themeName}”? Existing scheduled campaigns will not be changed.`)) return;
    try {
      await deleteAppearanceTheme(session, themeId);
      setThemes(await loadAppearanceThemes(session));
      setMessage(`${themeName} was removed from the theme library.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete this theme.");
    }
  }
  return <section className="page-section settings-page">
    <div className="section-title"><div><p className="eyebrow">SITE OWNER</p><h1>Site appearance</h1><p>Save reusable themes or schedule a temporary appearance for every user.</p></div><button className="secondary" onClick={restore}>Restore default view</button></div>
    <article className="panel theme-library">
      <div className="panel-head"><div><p className="eyebrow">SAVED THEMES</p><h2>Theme library</h2><p>Load a saved logo and color scheme into the scheduler whenever you need it.</p></div></div>
      <div className="theme-library-grid">{themes.map((theme) => <div className="theme-card" key={theme.id}><div className="theme-swatches"><span style={{ background: theme.primary_color }} /><span style={{ background: theme.accent_color }} /></div><div><strong>{theme.name}</strong><small>{theme.logo_url ? "Custom logo included" : "Default logo"}</small></div><button className="secondary" onClick={() => loadTheme(theme)}>Load</button><button className="text-button theme-delete" onClick={() => removeTheme(theme.id, theme.name)}>Delete</button></div>)}{!themes.length && <p className="empty-theme-library">No saved themes yet. Configure one below and choose “Save to theme library.”</p>}</div>
    </article>
    <div className="appearance-grid">
      <article className="panel settings-card appearance-form">
        <label>Theme or campaign name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <div className={`appearance-logo-upload ${logoDragging ? "dragging" : ""} ${form.logo_url ? "has-logo" : ""}`} onDragEnter={(event) => { event.preventDefault(); setLogoDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setLogoDragging(false); }} onDrop={(event) => { event.preventDefault(); setLogoDragging(false); void selectLogo(event.dataTransfer.files[0]); }}>
          <span className="upload-icon">↑</span>
          <div><strong>{logoUploading ? "Uploading…" : form.logo_url ? logoFileName || "Custom logo selected" : "Drop a temporary logo here"}</strong><small>PNG, JPEG, or WebP · maximum 5 MB</small></div>
          <label className="secondary file-button">{form.logo_url ? "Replace File" : "Choose File"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={logoUploading} onChange={(event) => { void selectLogo(event.target.files?.[0]); event.target.value = ""; }} /></label>
          {form.logo_url && <><img src={form.logo_url} alt="Temporary logo preview" /><button className="text-button appearance-logo-remove" type="button" onClick={() => { setForm({ ...form, logo_url: "" }); setLogoFileName(""); }}>Use Default Logo</button></>}
        </div>
        <label>Primary color<input type="color" value={form.primary_color} onChange={(event) => setForm({ ...form, primary_color: event.target.value })} /></label>
        <label>Accent color<input type="color" value={form.accent_color} onChange={(event) => setForm({ ...form, accent_color: event.target.value })} /></label>
        <label>Starts<input type="datetime-local" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} /></label>
        <label>Ends<input type="datetime-local" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} /></label>
        {message && <p className="pilot-message">{message}</p>}
        <div className="appearance-form-actions"><button className="secondary" disabled={logoUploading} onClick={() => displayAppearance({ primary_color: form.primary_color, accent_color: form.accent_color, logo_url: form.logo_url || null })}>Preview</button><button className="secondary" disabled={logoUploading || form.name.trim().length < 2} onClick={saveTheme}>Save to theme library</button><button className="primary" disabled={logoUploading || !form.name || !form.starts_at || !form.ends_at} onClick={schedule}>Schedule appearance</button></div>
      </article>
      <article className="panel campaign-list"><div className="panel-head"><div><p className="eyebrow">SCHEDULE</p><h2>Appearance campaigns</h2></div></div>{campaigns.map((campaign) => {
        const now = Date.now();
        const status = !campaign.active || new Date(campaign.ends_at).getTime() <= now ? "Ended" : new Date(campaign.starts_at).getTime() <= now ? "Active" : "Scheduled";
        return <div className="campaign-row" key={campaign.id}><span style={{ background: campaign.primary_color || undefined }} /><div><strong>{campaign.name}</strong><small>{new Date(campaign.starts_at).toLocaleString()} – {new Date(campaign.ends_at).toLocaleString()}</small></div><b>{status}</b><button className="text-button campaign-delete" onClick={() => unschedule(campaign.id, campaign.name)}>Unschedule</button></div>;
      })}{!campaigns.length && <EmptyState>No appearance campaigns are scheduled.</EmptyState>}</article>
    </div>
  </section>;
}

function CoachWorkspace({
  session,
  profile,
  event,
  data,
  organizationOfficials,
  canManage,
  onSaved,
}: {
  session: Law18Session;
  profile: Profile;
  event: EventRecord;
  data: EventData;
  organizationOfficials: OfficialRecord[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const scheduleGames = data.games.filter(isRateableGame).sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.field_name.localeCompare(b.field_name, undefined, { numeric: true }));
  const scheduleDates = [...new Set(scheduleGames.map((game) => dateKeyInTimeZone(game.starts_at, event.timezone)))];
  const defaultCoachingDate = defaultEventDate(scheduleDates, event.timezone, event.starts_on);
  const [coachId, setCoachId] = useState("");
  const [scope, setScope] = useState<"full" | "games">("full");
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [scheduleDatesFilter, setScheduleDatesFilter] = useActiveFilterState<string[]>(`coaching-dates:${event.id}`, [defaultCoachingDate]);
  const [scheduleSitesFilter, setScheduleSitesFilter] = useActiveFilterState<string[]>(`coaching-sites:${event.id}`, []);
  const [scheduleFieldsFilter, setScheduleFieldsFilter] = useActiveFilterState<string[]>(`coaching-fields:${event.id}`, []);
  const [scheduleTimesFilter, setScheduleTimesFilter] = useActiveFilterState<string[]>(`coaching-times:${event.id}`, []);
  const [scheduleQuery, setScheduleQuery] = useActiveFilterState(`coaching-query:${event.id}`, "");
  const [gameCoachSelections, setGameCoachSelections] = useState<Record<string, string>>({});
  const ownerCoachRecord: OfficialRecord | null = profile.is_site_owner && !organizationOfficials.some((official) => official.linked_user_id === profile.id) ? {
    id: `site-owner-${profile.id}`,
    organization_id: event.organization_id,
    full_name: profile.full_name,
    email: profile.primary_email || profile.email,
    linked_user_id: profile.id,
    identity_status: "linked",
    source: "site_owner_profile",
    pending_org_roles: ["site_owner", "referee_coach"],
  } : null;
  const availableCoachOfficials = ownerCoachRecord ? [...organizationOfficials, ownerCoachRecord] : organizationOfficials;
  const coachCandidates = availableCoachOfficials.filter((official) => {
    const roles = official.pending_org_roles?.length ? official.pending_org_roles : [official.pending_org_role || "referee"];
    return (profile.is_site_owner && official.linked_user_id === profile.id)
      || roles.includes("referee_coach")
      || data.provisionalAccess.some((access) => access.official_id === official.id && access.roles.includes("referee_coach"));
  });
  // The existing select markup uses linked_user_id as its option value. Use
  // the stable official ID for both linked and provisional coach choices.
  const linkedOfficials = coachCandidates.map((official) => ({
    ...official,
    linked_user_id: official.id,
    email: official.linked_user_id ? official.email : "No account yet",
  })).sort(comparePeopleByLastName);
  const visibleAssignments = canManage
    ? data.coachAssignments
    : data.coachAssignments.filter((assignment) => assignment.coach_id === session.user.id);
  const officialByUser = new Map(availableCoachOfficials.filter((official) => official.linked_user_id).map((official) => [official.linked_user_id!, official]));
  const officialById = new Map(availableCoachOfficials.map((official) => [official.id, official]));
  const assignmentCoach = (assignment: CoachAssignmentRecord) => assignment.coach_official_id
    ? officialById.get(assignment.coach_official_id)
    : assignment.coach_id ? officialByUser.get(assignment.coach_id) : undefined;
  const gameById = new Map(data.games.map((game) => [game.id, game]));
  const coachAccessGroups = [...visibleAssignments.reduce((groups, assignment) => {
    const coach = assignmentCoach(assignment);
    const coachKey = coach?.id || assignment.coach_official_id || assignment.coach_id || `assignment-${assignment.id}`;
    const existing = groups.get(coachKey);
    if (existing) existing.assignments.push(assignment);
    else groups.set(coachKey, { coach, assignments: [assignment] });
    return groups;
  }, new Map<string, { coach?: OfficialRecord; assignments: CoachAssignmentRecord[] }>()).values()]
    .sort((left, right) => left.coach && right.coach ? comparePeopleByLastName(left.coach, right.coach) : (left.coach?.full_name || "Linked coach account").localeCompare(right.coach?.full_name || "Linked coach account"));
  const scheduleSites = [...new Set(scheduleGames.map((game) => game.venue_name || "Unspecified site"))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const scheduleFields = [...new Set(scheduleGames.map((game) => game.field_name))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const scheduleTimes = [...new Set(scheduleGames.map((game) => formatTime(game.starts_at)))];
  const filteredScheduleGames = scheduleGames.filter((game) =>
    (!scheduleDatesFilter.length || scheduleDatesFilter.includes(dateKeyInTimeZone(game.starts_at, event.timezone)))
    && (!scheduleSitesFilter.length || scheduleSitesFilter.includes(game.venue_name || "Unspecified site"))
    && (!scheduleFieldsFilter.length || scheduleFieldsFilter.includes(game.field_name))
    && (!scheduleTimesFilter.length || scheduleTimesFilter.includes(formatTime(game.starts_at)))
    && `${game.home_team} ${game.away_team} ${game.division || ""} ${game.field_name}`.toLowerCase().includes(scheduleQuery.toLowerCase()));
  const filteredScheduleGameIds = filteredScheduleGames.map((game) => game.id);
  const allFilteredGamesSelected = filteredScheduleGameIds.length > 0
    && filteredScheduleGameIds.every((gameId) => selectedGameIds.includes(gameId));
  function assignmentExists(targetCoachId: string, targetGameId: string | null) {
    const coach = officialById.get(targetCoachId);
    return data.coachAssignments.some((assignment) => (assignment.coach_official_id === targetCoachId || assignment.coach_id === coach?.linked_user_id)
      && (targetGameId ? assignment.game_id === targetGameId : assignment.full_schedule));
  }
  async function assignCoach() {
    const coach = coachCandidates.find((official) => official.id === coachId);
    if (!coach) return;
    setBusy(true);
    try {
      const targets = scope === "full" ? [null] : selectedGameIds;
      const newTargets = targets.filter((target) => !assignmentExists(coachId, target));
      await Promise.all(newTargets.map((target) => createCoachAssignment(session, event.id, coach, target)));
      setMessage(newTargets.length
        ? `${coach.full_name} was assigned to ${scope === "full" ? "the full event schedule" : `${newTargets.length} selected game${newTargets.length === 1 ? "" : "s"}`}.`
        : `${coach.full_name} already has the selected coaching access.`);
      if (scope === "games") setSelectedGameIds([]);
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to assign the coach.");
    } finally {
      setBusy(false);
    }
  }
  async function assignCoachToSelectedGames() {
    const coach = coachCandidates.find((official) => official.id === coachId);
    if (!coach || !selectedGameIds.length) return;
    setBusy(true);
    try {
      const newTargets = selectedGameIds.filter((target) => !assignmentExists(coachId, target));
      await Promise.all(newTargets.map((target) => createCoachAssignment(session, event.id, coach, target)));
      const skipped = selectedGameIds.length - newTargets.length;
      setMessage(newTargets.length
        ? `${coach.full_name} was assigned to ${newTargets.length} selected game${newTargets.length === 1 ? "" : "s"}.${skipped ? ` ${skipped} existing assignment${skipped === 1 ? " was" : "s were"} skipped.` : ""}`
        : `${coach.full_name} is already assigned to all selected games.`);
      setSelectedGameIds([]);
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to assign the coach to the selected games.");
    } finally {
      setBusy(false);
    }
  }
  function toggleFilteredGames() {
    setSelectedGameIds((current) => allFilteredGamesSelected
      ? current.filter((gameId) => !filteredScheduleGameIds.includes(gameId))
      : [...new Set([...current, ...filteredScheduleGameIds])]);
  }
  async function assignScheduleGame(gameId: string) {
    const selectedCoachId = gameCoachSelections[gameId];
    const coach = coachCandidates.find((official) => official.id === selectedCoachId);
    if (!coach) return;
    setBusy(true);
    try {
      if (!assignmentExists(selectedCoachId, gameId)) await createCoachAssignment(session, event.id, coach, gameId);
      setMessage(`${coach.full_name} was assigned to ${gameById.get(gameId)?.home_team || "the selected game"}.`);
      setGameCoachSelections((current) => ({ ...current, [gameId]: "" }));
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to assign the coach.");
    } finally {
      setBusy(false);
    }
  }
  async function removeAssignment(id: string) {
    setBusy(true);
    try {
      await deleteCoachAssignment(session, id);
      setMessage("Coach assignment removed.");
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to remove the coach assignment.");
    } finally {
      setBusy(false);
    }
  }
  async function removeAllCoachAccess(coach: OfficialRecord | undefined, assignments: CoachAssignmentRecord[]) {
    const coachName = coach?.full_name || "this coach";
    if (!window.confirm(`Remove all coaching access for ${coachName} in ${event.name}?`)) return;
    setBusy(true);
    try {
      await Promise.all(assignments.map((assignment) => deleteCoachAssignment(session, assignment.id)));
      setMessage(`All coaching access for ${coachName} was removed.`);
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to remove all coaching access.");
    } finally {
      setBusy(false);
    }
  }
  async function removeCoachFromSelectedGames() {
    const coach = coachCandidates.find((official) => official.id === coachId);
    if (!coach || !selectedGameIds.length) return;
    const coachAssignments = data.coachAssignments.filter((assignment) =>
      assignment.coach_official_id === coach.id || assignment.coach_id === coach.linked_user_id);
    const selectedIds = new Set(selectedGameIds);
    const directAssignments = coachAssignments.filter((assignment) => assignment.game_id && selectedIds.has(assignment.game_id));
    const fullScheduleAssignments = coachAssignments.filter((assignment) => assignment.full_schedule);
    if (!directAssignments.length && !fullScheduleAssignments.length) {
      setMessage(`${coach.full_name} does not have access to the selected games.`);
      return;
    }
    if (!window.confirm(`Remove ${coach.full_name}'s access to ${selectedGameIds.length} selected game${selectedGameIds.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    try {
      // A full-schedule row cannot exclude individual games. Preserve access to
      // every unselected rateable game before removing that broad assignment.
      if (fullScheduleAssignments.length) {
        const remainingGameIds = scheduleGames.map((game) => game.id).filter((gameId) => !selectedIds.has(gameId));
        const existingDirectGameIds = new Set(coachAssignments.map((assignment) => assignment.game_id).filter((gameId): gameId is string => Boolean(gameId)));
        await Promise.all(remainingGameIds
          .filter((gameId) => !existingDirectGameIds.has(gameId))
          .map((gameId) => createCoachAssignment(session, event.id, coach, gameId)));
      }
      const removals = [...new Map([...directAssignments, ...fullScheduleAssignments].map((assignment) => [assignment.id, assignment])).values()];
      await Promise.all(removals.map((assignment) => deleteCoachAssignment(session, assignment.id)));
      setMessage(`${coach.full_name}'s access to ${selectedGameIds.length} selected game${selectedGameIds.length === 1 ? " was" : "s were"} removed.`);
      setSelectedGameIds([]);
      onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to remove the coach from the selected games.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="page-section"><div className="section-title"><div><p className="eyebrow">REFEREE DEVELOPMENT</p><h1>Coaching Assignments</h1><p>Assign coaches to the complete event schedule or selected games.</p></div></div>
    {canManage && <article className="panel coach-assignment-form bulk-coach-form"><label>Referee coach<select value={coachId} onChange={(event) => setCoachId(event.target.value)}><option value="">Select a linked organization member</option>{linkedOfficials.map((official) => <option value={official.linked_user_id!} key={official.id}>{officialSelectorLabel(official)}{official.email === "No account yet" ? " (Provisional)" : ""} — {official.email}</option>)}</select></label><label>Schedule scope<select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="full">Full event schedule</option><option value="games">Multiple selected games</option></select></label>{scope === "games" && <fieldset className="coach-game-picker"><legend>Select games</legend>{scheduleGames.map((game) => <label key={game.id}><input type="checkbox" checked={selectedGameIds.includes(game.id)} onChange={(event) => setSelectedGameIds((current) => event.target.checked ? [...current, game.id] : current.filter((id) => id !== game.id))} /><span><strong>{formatDate(game.starts_at)} · {formatTime(game.starts_at)} · {game.field_name}</strong><small>{game.home_team} vs. {game.away_team}</small></span></label>)}</fieldset>}<button className="primary" disabled={busy || !coachId || (scope === "games" && !selectedGameIds.length)} onClick={assignCoach}>{busy ? "Saving…" : scope === "games" ? `Assign Coach to ${selectedGameIds.length || ""} Game${selectedGameIds.length === 1 ? "" : "s"}` : "Assign Coach"}</button></article>}
    {message && <p className="pilot-message">{message}</p>}
    <details className="panel coach-access-list-section"><summary><span><strong>Coach Access Summary</strong><small>{coachAccessGroups.length} assigned coach{coachAccessGroups.length === 1 ? "" : "es"}</small></span><b aria-hidden="true" /></summary><div className="coach-assignment-list">{coachAccessGroups.map(({ coach, assignments }) => {
      const hasFullSchedule = assignments.some((assignment) => assignment.full_schedule);
      const gameAssignments = assignments
        .filter((assignment) => assignment.game_id)
        .map((assignment) => ({ assignment, game: gameById.get(assignment.game_id!) }))
        .sort((left, right) => (left.game?.starts_at || "").localeCompare(right.game?.starts_at || "") || (left.game?.field_name || "").localeCompare(right.game?.field_name || "", undefined, { numeric: true }));
      return <details className="panel coach-access-card" key={coach?.id || assignments[0].id}>
        <summary><span className="official-name-cell"><span className="avatar">{initials(coach?.full_name || "Coach")}</span><span><strong>{coach?.full_name || "Linked coach account"}</strong><small>{hasFullSchedule ? "Full event schedule access" : `${gameAssignments.length} assigned game${gameAssignments.length === 1 ? "" : "s"}`}</small></span></span>{canManage && <button className="danger-button coach-remove-all" type="button" disabled={busy} onClick={(click) => { click.preventDefault(); click.stopPropagation(); void removeAllCoachAccess(coach, assignments); }}>Remove All Access</button>}<b aria-hidden="true" /></summary>
        <div className="coach-access-summary">
          {hasFullSchedule && <div className="coach-access-row"><div><strong>Full Rateable Schedule</strong><small>Access to every ratings-enabled game in this event</small></div>{canManage && assignments.filter((assignment) => assignment.full_schedule).map((assignment) => <button className="text-button" disabled={busy} onClick={() => removeAssignment(assignment.id)} key={assignment.id}>Remove</button>)}</div>}
          {!hasFullSchedule && gameAssignments.map(({ assignment, game }) => <div className="coach-access-row" key={assignment.id}><div><strong>{game ? `${formatDate(game.starts_at)} · ${formatTime(game.starts_at)} · ${game.field_name}` : "Selected game"}</strong>{game && <small>{game.home_team} vs. {game.away_team}</small>}</div>{canManage && <button className="text-button" disabled={busy} onClick={() => removeAssignment(assignment.id)}>Remove</button>}</div>)}
        </div>
      </details>;
    })}{!coachAccessGroups.length && <EmptyState>{canManage ? "No referee coaches have been assigned yet." : "No coaching schedule is assigned to your account."}</EmptyState>}</div></details>
    {canManage && <details className="panel coach-schedule-manager">
      <summary><span><span className="eyebrow">FULL SCHEDULE</span><strong>Assign Coaches by Game</strong><small>Filter the event schedule, then choose a coach for any game.</small></span><b aria-hidden="true" /></summary><div className="coach-schedule-manager-body">
      <div className="coach-schedule-filters"><AssignmentFilterMenu label="Day" options={scheduleDates.map((date) => ({ id: date, name: formatDate(date) }))} selected={scheduleDatesFilter} onChange={setScheduleDatesFilter} /><AssignmentFilterMenu label="Venue / Site" options={scheduleSites.map((site) => ({ id: site, name: site }))} selected={scheduleSitesFilter} onChange={setScheduleSitesFilter} /><AssignmentFilterMenu label="Field" options={scheduleFields.map((field) => ({ id: field, name: field }))} selected={scheduleFieldsFilter} onChange={setScheduleFieldsFilter} /><AssignmentFilterMenu label="Time" options={scheduleTimes.map((time) => ({ id: time, name: time }))} selected={scheduleTimesFilter} onChange={setScheduleTimesFilter} /><label>Teams, age group, or division<input type="search" value={scheduleQuery} onChange={(event) => setScheduleQuery(event.target.value)} placeholder="Search schedule…" /></label><SavedFilterControls filterKey={`coaching:${event.id}`} value={{ scheduleDatesFilter, scheduleSitesFilter, scheduleFieldsFilter, scheduleTimesFilter, scheduleQuery }} onApply={(saved) => { setScheduleDatesFilter(saved.scheduleDatesFilter || []); setScheduleSitesFilter(saved.scheduleSitesFilter || []); setScheduleFieldsFilter(saved.scheduleFieldsFilter || []); setScheduleTimesFilter(saved.scheduleTimesFilter || []); setScheduleQuery(saved.scheduleQuery || ""); }} /></div>
      <div className="coach-bulk-selection-bar"><label><input type="checkbox" checked={allFilteredGamesSelected} disabled={!filteredScheduleGames.length} onChange={toggleFilteredGames} /><span>{allFilteredGamesSelected ? "Clear Filtered Games" : `Select All Filtered Games (${filteredScheduleGames.length})`}</span></label><strong>{selectedGameIds.length} game{selectedGameIds.length === 1 ? "" : "s"} selected</strong><select aria-label="Coach for selected games" value={coachId} onChange={(event) => setCoachId(event.target.value)}><option value="">Choose coach</option>{linkedOfficials.map((official) => <option value={official.linked_user_id!} key={official.id}>{officialSelectorLabel(official)}{official.email === "No account yet" ? " (Provisional)" : ""}</option>)}</select><div className="coach-bulk-actions"><button className="primary" disabled={busy || !coachId || !selectedGameIds.length} onClick={assignCoachToSelectedGames}>{busy ? "Saving…" : `Assign to ${selectedGameIds.length || "Selected"} Game${selectedGameIds.length === 1 ? "" : "s"}`}</button><button className="danger-button" disabled={busy || !coachId || !selectedGameIds.length} onClick={removeCoachFromSelectedGames}>{busy ? "Saving…" : `Remove from ${selectedGameIds.length || "Selected"} Game${selectedGameIds.length === 1 ? "" : "s"}`}</button></div></div>
      <div className="coach-schedule-list">{filteredScheduleGames.map((game) => {
        const assigned = data.coachAssignments.filter((assignment) => assignment.game_id === game.id).map((assignment) => assignmentCoach(assignment)?.full_name).filter(Boolean);
        return <div className={`coach-schedule-row${selectedGameIds.includes(game.id) ? " selected" : ""}`} key={game.id}><input className="coach-game-checkbox" type="checkbox" aria-label={`Select ${game.home_team} versus ${game.away_team}`} checked={selectedGameIds.includes(game.id)} onChange={(event) => setSelectedGameIds((current) => event.target.checked ? [...new Set([...current, game.id])] : current.filter((id) => id !== game.id))} /><time><strong>{formatTime(game.starts_at)}</strong><small>{formatDate(game.starts_at)}</small></time><div><strong>{game.home_team} vs. {game.away_team}</strong><small>{game.field_name}{game.division ? ` · ${game.division}` : ""}</small><span>{assigned.length ? `Assigned: ${assigned.join(", ")}` : "No coach assigned"}</span></div><select aria-label={`Coach for ${game.home_team} versus ${game.away_team}`} value={gameCoachSelections[game.id] || ""} onChange={(event) => setGameCoachSelections((current) => ({ ...current, [game.id]: event.target.value }))}><option value="">Choose coach</option>{linkedOfficials.map((official) => <option value={official.linked_user_id!} key={official.id}>{officialSelectorLabel(official)}{official.email === "No account yet" ? " (Provisional)" : ""}</option>)}</select><button className="secondary" disabled={busy || !gameCoachSelections[game.id]} onClick={() => assignScheduleGame(game.id)}>Assign</button></div>;
      })}{!filteredScheduleGames.length && <EmptyState>No games match these schedule filters.</EmptyState>}</div></div>
    </details>}
  </section>;
}

function DashboardHome({
  profile,
  event,
  data,
  navigation,
  roleLabel,
  canManageCheckIns,
  onNavigate,
}: {
  profile: Profile;
  event?: EventRecord;
  data: EventData;
  navigation: [View, string][];
  roleLabel: string;
  canManageCheckIns: boolean;
  onNavigate: (view: View) => void;
}) {
  const today = event ? new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) : "";
  const todayGameIds = new Set(data.games.filter((game) =>
    event && new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at)) === today
  ).map((game) => game.id));
  const expectedToday = new Set(data.assignments.filter((assignment) => todayGameIds.has(assignment.game_id)).map((assignment) => assignment.official_id));
  data.coachAssignments.forEach((assignment) => {
    if (!todayGameIds.size || (!assignment.full_schedule && (!assignment.game_id || !todayGameIds.has(assignment.game_id)))) return;
    const coachOfficial = data.officials.find((official) => official.id === assignment.coach_official_id || official.linked_user_id === assignment.coach_id);
    if (coachOfficial) expectedToday.add(coachOfficial.id);
  });
  data.attendanceOverrides.filter((item) => item.event_date === today && !item.expected).forEach((item) => expectedToday.delete(item.official_id));
  const checkedIn = new Set(data.checkIns.filter((item) => item.event_date === today && item.status === "checked_in" && expectedToday.has(item.official_id)).map((item) => item.official_id)).size;
  return <section className="page-section dashboard-home">
    <div className="welcome dashboard-welcome-row">
      <div><p className="eyebrow">DASHBOARD</p><h1>Welcome, {profile.full_name.split(" ")[0]}.</h1><p>Your events, assignments, and tournament-day tools in one place.</p></div>
      <div className="dashboard-compact-access"><button onClick={() => onNavigate("account")}><small>ACCOUNT</small><strong>Settings</strong></button><button onClick={() => onNavigate("groups")}><small>GROUPS</small><strong>Memberships</strong></button><article><small>ROLE</small><strong>{roleLabel}</strong></article></div>
    </div>
    {canManageCheckIns && <button className="dashboard-checkin-card" onClick={() => onNavigate("checkin")}><span className="metric-icon green">✓</span><span><strong>{checkedIn}/{expectedToday.size}</strong><small>Today&apos;s Check-ins</small></span><b>Open Check-In →</b></button>}
    <div className="dashboard-navigation-grid">{navigation.filter(([id]) => id !== "dashboard").map(([id, label]) => <button className="panel" key={id} onClick={() => onNavigate(id)}><strong>{label}</strong><span>Open {label} →</span></button>)}</div>
  </section>;
}

function OrganizationActivity({
  session,
  organization,
  events,
  onEventsChanged,
}: {
  session: Law18Session;
  organization: OrganizationRecord;
  events: EventRecord[];
  onEventsChanged: () => Promise<void>;
}) {
  const [activity, setActivity] = useState<AuditRecord[]>([]);
  const [archivedEvents, setArchivedEvents] = useState<EventRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const refresh = useCallback(async () => {
    const nextArchivedEvents = await loadArchivedEvents(session, organization.id);
    const nextActivity = await loadOrganizationActivity(session, organization.id);
    setActivity(nextActivity);
    setArchivedEvents(nextArchivedEvents);
  }, [organization.id, session]);
  useEffect(() => {
    // Activity is loaded from the remote organization audit stream.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((reason) => setMessage(reason instanceof Error ? reason.message : "Unable to load group activity."));
  }, [refresh]);
  async function restoreArchivedEvent(event: EventRecord) {
    setBusy(true);
    setMessage("");
    try {
      await restoreEvent(session, event.id);
      setMessage(`${event.name} was restored. Automatic archiving was cleared.`);
      await Promise.all([refresh(), onEventsChanged()]);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to restore the event.");
    } finally {
      setBusy(false);
    }
  }
  async function bulkEvents(action: "archive" | "restore" | "delete") {
    const applicableIds = selectedEventIds.filter((id) => action === "archive"
      ? events.some((item) => item.id === id)
      : archivedEvents.some((item) => item.id === id));
    if (!applicableIds.length) return;
    if (!window.confirm(action === "delete"
      ? `Permanently delete ${applicableIds.length} archived events and all connected operational data? This cannot be undone.`
      : `${action === "archive" ? "Archive" : "Restore"} ${applicableIds.length} selected events?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await bulkManageRecords(session, "events", action, applicableIds);
      setSelectedEventIds([]);
      setMessage(`${result.processed} events ${action === "delete" ? "deleted" : `${action}d`}.${result.skipped ? ` ${result.skipped} were skipped.` : ""}`);
      await Promise.all([refresh(), onEventsChanged()]);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to update the selected events.");
    } finally {
      setBusy(false);
    }
  }
  const actionLabel = (action: string) => action.split(".").map((part) =>
    part.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  ).join(" · ");
  return <section className="page-section organization-activity-page">
    <div className="section-title"><div><p className="eyebrow">GROUP ADMINISTRATION</p><h1>Activity</h1><p>Review meaningful group changes and manage archived events.</p></div><button className="secondary" disabled={busy} onClick={() => refresh()}>{busy ? "Refreshing…" : "Refresh"}</button></div>
    {message && <p className="pilot-message">{message}</p>}
    <article className="panel archived-event-list"><div className="panel-head"><div><p className="eyebrow">ARCHIVED EVENTS</p><h2>Bulk event actions</h2><p>Archive active events, restore archived events, or permanently delete events already in the archive.</p></div></div>
      <div className="bulk-action-bar"><strong>{selectedEventIds.length} selected</strong><button className="secondary" disabled={busy || !selectedEventIds.some((id) => events.some((item) => item.id === id))} onClick={() => bulkEvents("archive")}>Archive Selected</button><button className="secondary" disabled={busy || !selectedEventIds.some((id) => archivedEvents.some((item) => item.id === id))} onClick={() => bulkEvents("restore")}>Restore Selected</button><button className="danger-button" disabled={busy || !selectedEventIds.length || selectedEventIds.some((id) => !archivedEvents.some((item) => item.id === id))} onClick={() => bulkEvents("delete")}>Delete Archived</button></div>
      <h3 className="lifecycle-list-title">Active Events</h3>{events.map((event) => <div className="archived-event-row" key={event.id}><div><strong>{event.name}</strong><small>{formatDate(event.starts_on)} through {formatDate(event.ends_on)}</small></div><input className="bulk-row-check" type="checkbox" aria-label={`Select ${event.name}`} checked={selectedEventIds.includes(event.id)} onChange={(change) => setSelectedEventIds((current) => change.target.checked ? [...current, event.id] : current.filter((id) => id !== event.id))} /></div>)}{!events.length && <EmptyState>No active events.</EmptyState>}
      <h3 className="lifecycle-list-title">Archived Events</h3>{archivedEvents.map((event) => <div className="archived-event-row" key={event.id}><div><strong>{event.name}</strong><small>{formatDate(event.starts_on)} through {formatDate(event.ends_on)} · {event.archive_reason === "automatic" ? "Automatically archived" : "Manually archived"}</small></div><div className="archived-event-actions"><input className="bulk-row-check" type="checkbox" aria-label={`Select ${event.name}`} checked={selectedEventIds.includes(event.id)} onChange={(change) => setSelectedEventIds((current) => change.target.checked ? [...current, event.id] : current.filter((id) => id !== event.id))} /><button className="secondary" disabled={busy} onClick={() => restoreArchivedEvent(event)}>Restore Event</button></div></div>)}{!archivedEvents.length && <EmptyState>No events are archived.</EmptyState>}</article>
    <article className="panel activity-log"><div className="panel-head"><div><p className="eyebrow">AUDIT LOG</p><h2>Group Activity</h2><p>Ratings, imports, schedules, assignments, members, events, check-ins, and other meaningful changes appear here.</p></div></div>
      <div className="activity-log-head"><span>Action</span><span>Performed by</span><span>Record</span><span>Date</span></div>
      {activity.map((item) => <div className="activity-log-row" key={item.id}><strong>{actionLabel(item.action)}{typeof item.details.message === "string" && <small>{item.details.message}</small>}</strong><span>{item.actor_name}</span><span>{item.entity_type.replace(/_/g, " ")}</span><time>{new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time></div>)}
      {!activity.length && <EmptyState>No organization activity has been recorded yet.</EmptyState>}
    </article>
  </section>;
}

function ConnectedSchedules({ session, profile, onUpdated }: { session: Law18Session; profile: Profile; onUpdated: (profile: Profile) => void }) {
  const [feeds, setFeeds] = useState<CalendarFeedConnection[]>([]);
  const [scheduleSources, setScheduleSources] = useState<UnifiedAssignment[]>([]);
  const [provider, setProvider] = useState<CalendarFeedConnection["provider"]>("assignr");
  const [displayName, setDisplayName] = useState("Assignr");
  const [feedUrl, setFeedUrl] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const refresh = useCallback(() => Promise.all([loadCalendarFeedConnections(session), loadUnifiedAssignments(session)]).then(([connections, assignments]) => { setFeeds(connections); setScheduleSources(assignments); }), [session]);
  useEffect(() => { refresh().catch((reason) => setMessage(reason instanceof Error ? reason.message : "Unable to load connected schedules.")); }, [refresh]);
  async function connect() {
    setBusyId("new"); setMessage("");
    try {
      await addCalendarFeed(session, { provider, display_name: displayName.trim(), feed_url: feedUrl.trim() });
      setFeedUrl("");
      setMessage("Calendar feed saved securely. Its first synchronization has started.");
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to connect this calendar feed.");
    } finally { setBusyId(""); }
  }
  async function synchronize(feed: CalendarFeedConnection) {
    setBusyId(feed.id); setMessage("");
    try {
      const result = await syncCalendarFeed(session, feed.id);
      setMessage(`${result.synchronized} calendar event${result.synchronized === 1 ? "" : "s"} synchronized from ${feed.display_name}.`);
      await refresh();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Calendar synchronization failed."); }
    finally { setBusyId(""); }
  }
  async function toggle(feed: CalendarFeedConnection) {
    setBusyId(feed.id); setMessage("");
    try { await setCalendarFeedActive(session, feed.id, !feed.active); await refresh(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to update this calendar feed."); }
    finally { setBusyId(""); }
  }
  async function remove(feed: CalendarFeedConnection) {
    if (!window.confirm(`Remove “${feed.display_name}” and its imported external assignments?`)) return;
    setBusyId(feed.id); setMessage("");
    try { await removeCalendarFeed(session, feed.id); setMessage(`${feed.display_name} was disconnected.`); await refresh(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to remove this calendar feed."); }
    finally { setBusyId(""); }
  }
  async function saveColor(key: string, color: string) {
    try {
      const updated = await updateDisplayPreferences(session, { personal_schedule_colors: { ...(profile.personal_schedule_colors || {}), [key]: color }, personal_schedule_color_modes: profile.personal_schedule_color_modes || {}, rating_average_preferences: profile.rating_average_preferences || {} });
      if (updated) onUpdated(updated);
      setMessage("Schedule color saved.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save this schedule color."); }
  }
  async function saveColorModes(key: string, modes: string[]) {
    try {
      const updated = await updateDisplayPreferences(session, { personal_schedule_colors: profile.personal_schedule_colors || {}, personal_schedule_color_modes: { ...(profile.personal_schedule_color_modes || {}), [key]: modes as Array<"mark" | "card" | "label"> }, rating_average_preferences: profile.rating_average_preferences || {} });
      if (updated) onUpdated(updated);
      setMessage("Schedule color display saved.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save this schedule display."); }
  }
  const colorModeOptions = [{ id: "mark", name: "Color mark" }, { id: "card", name: "Highlight entire assignment" }, { id: "label", name: "Color calendar label" }];
  const providerNames: Record<CalendarFeedConnection["provider"], string> = { assignr: "Assignr", arbiter: "ArbiterSports", usofficials: "USOfficials", refquest: "RefQuest / RQ+", other: "Other ICS feed" };
  const organizationSources = [...new Map(scheduleSources.filter((item) => item.organization_id).map((item) => [item.organization_id!, { id: item.organization_id!, name: item.organization_name || "Law18Ref organization" }])).values()];
  return <article className="panel connected-schedules-card">
    <div className="panel-head"><div><p className="eyebrow">CONNECTED SCHEDULES</p><h2>Personal Calendar Feeds</h2><p>Add private iCalendar/ICS feeds to combine external games with your Law18Ref assignments.</p></div></div>
    <div className="calendar-feed-form"><label>Platform<select value={provider} onChange={(event) => { const next = event.target.value as CalendarFeedConnection["provider"]; setProvider(next); setDisplayName(providerNames[next]); }}><option value="assignr">Assignr</option><option value="arbiter">ArbiterSports</option><option value="usofficials">USOfficials</option><option value="refquest">RefQuest / RQ+</option><option value="other">Other ICS feed</option></select></label><label>Schedule name<input maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label className="calendar-feed-url">Private calendar-feed URL<input type="url" inputMode="url" autoComplete="off" placeholder="https://…/calendar.ics" value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} /><small>The URL is encrypted and will not be displayed again after it is saved.</small></label><button className="primary" disabled={busyId === "new" || !displayName.trim() || !feedUrl.trim()} onClick={() => void connect()}>{busyId === "new" ? "Connecting…" : "Connect Feed"}</button></div>
    {message && <p className="pilot-message">{message}</p>}
    <div className="calendar-feed-list">{feeds.map((feed) => { const sourceKey = `feed:${feed.id}`; return <section key={feed.id}><div><strong>{feed.display_name}</strong><small>{providerNames[feed.provider]} · <span className={`feed-status status-${feed.sync_status}`}>{feed.sync_status}</span></small><small>{feed.last_synced_at ? `Last synchronized ${new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(new Date(feed.last_synced_at))}` : "Waiting for first synchronization"}</small>{feed.last_error && <small className="feed-error">{feed.last_error}</small>}</div><label className="calendar-color-picker">Calendar color<input type="color" value={profile.personal_schedule_colors?.[sourceKey] || "#c62f68"} onChange={(event) => void saveColor(sourceKey, event.target.value)} /></label><AssignmentFilterMenu label="Color display" options={colorModeOptions} selected={profile.personal_schedule_color_modes?.[sourceKey] || ["mark"]} onChange={(modes) => void saveColorModes(sourceKey, modes)} /><div><button className="secondary" disabled={busyId === feed.id || !feed.active} onClick={() => void synchronize(feed)}>Sync Now</button><button className="secondary" disabled={busyId === feed.id} onClick={() => void toggle(feed)}>{feed.active ? "Pause" : "Resume"}</button><button className="danger-button" disabled={busyId === feed.id} onClick={() => void remove(feed)}>Remove</button></div></section>; })}{!feeds.length && <EmptyState>No external calendar feeds are connected.</EmptyState>}</div>
    {!!organizationSources.length && <div className="organization-calendar-colors"><h3>Law18Ref Group Colors</h3>{organizationSources.map((organization) => { const sourceKey = `org:${organization.id}`; return <section key={organization.id}><span>{organization.name}</span><label>Color<input type="color" value={profile.personal_schedule_colors?.[sourceKey] || "#285783"} onChange={(event) => void saveColor(sourceKey, event.target.value)} /></label><AssignmentFilterMenu label="Color display" options={colorModeOptions} selected={profile.personal_schedule_color_modes?.[sourceKey] || ["mark"]} onChange={(modes) => void saveColorModes(sourceKey, modes)} /></section>; })}</div>}
  </article>;
}

function AccountSettings({
  session,
  profile,
  onUpdated,
}: {
  session: Law18Session;
  profile: Profile;
  onUpdated: (profile: Profile) => void;
}) {
  const initialName = splitOfficialName(profile.full_name);
  const [firstName, setFirstName] = useState(profile.first_name || initialName.first_name);
  const [lastName, setLastName] = useState(profile.last_name || initialName.last_name);
  const [preferredName, setPreferredName] = useState(profile.preferred_name || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth || "");
  const [secondaryEmail, setSecondaryEmail] = useState(profile.secondary_email || "");
  const [personalContactLocked, setPersonalContactLocked] = useState(Boolean(profile.personal_contact_locked));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ratingAveragePreferences, setRatingAveragePreferences] = useState({ event_scope: profile.rating_average_preferences?.event_scope || "current_event", display_mode: profile.rating_average_preferences?.display_mode || (profile.rating_average_preferences?.match_position ? "position" : "overall"), match_position: profile.rating_average_preferences?.match_position || false, from: profile.rating_average_preferences?.from || "", through: profile.rating_average_preferences?.through || "" });
  const minor = Boolean(dateOfBirth && new Date(dateOfBirth) > new Date(new Date().setFullYear(new Date().getFullYear() - 18)));
  async function save() {
    if (minor && !secondaryEmail.trim()) {
      setMessage("A parent or guardian email is required for referees under 18.");
      return;
    }
    if (secondaryEmail.trim().toLowerCase() === profile.email.trim().toLowerCase()) {
      setMessage("The secondary email must be different from the primary email.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateOwnProfile(session, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        preferred_name: preferredName.trim() || null,
        phone: normalizePhoneNumber(phone) || null,
        date_of_birth: dateOfBirth || null,
        secondary_email: secondaryEmail.trim().toLowerCase() || null,
        personal_contact_locked: personalContactLocked,
      });
      if (updated) onUpdated(updated);
      setMessage("Your account details were saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save your account.");
    } finally {
      setBusy(false);
    }
  }
  async function saveRatingAveragePreferences() {
    setBusy(true); setMessage("");
    try {
      const updated = await updateDisplayPreferences(session, { personal_schedule_colors: profile.personal_schedule_colors || {}, rating_average_preferences: ratingAveragePreferences as Profile["rating_average_preferences"] });
      if (updated) onUpdated(updated);
      setMessage("Assignment rating display settings saved.");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save rating display settings."); }
    finally { setBusy(false); }
  }
  return <section className="page-section settings-page">
    <div className="section-title"><div><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Personal information</h1><p>Keep the details your organizations may need current.</p></div></div>
    <article className="panel settings-card">
      <label>First name<input autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
      <label>Last name<input autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
      <label>Preferred name<input value={preferredName} onChange={(event) => setPreferredName(event.target.value)} placeholder="Optional" /></label>
      <label>Primary email<input value={profile.primary_email || profile.email} disabled /></label>
      <label>Date of birth<input type="date" required value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /></label>
      <label>{minor ? "Parent or guardian email" : "Secondary email"}<input type="email" required={minor} value={secondaryEmail} onChange={(event) => setSecondaryEmail(event.target.value)} placeholder={minor ? "Required for referees under 18" : "Optional"} /></label>
      <label>Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" /></label>
      <label className="visibility-lock personal-contact-lock"><input type="checkbox" checked={personalContactLocked} onChange={(event) => setPersonalContactLocked(event.target.checked)} /><span><strong>Lock personal contact information</strong><small>Prevents organization and event staff from editing your name, email addresses, date of birth, or phone number. They can still manage your organization and event permissions.</small></span></label>
      <label>Role<input value={profile.role} disabled /></label>
      {message && <p className="pilot-message">{message}</p>}
      <button className="primary" disabled={busy || !firstName.trim() || !lastName.trim()} onClick={save}>{busy ? "Saving…" : "Save account details"}</button>
    </article>
    <article className="panel settings-card rating-average-settings"><div><p className="eyebrow">ASSIGNMENT DISPLAYS</p><h2>Referee Rating Averages</h2><p>Choose which submitted ratings contribute to the averages shown beside referee names in administrative schedule and assigning views.</p></div><label>Rating history<select value={ratingAveragePreferences.event_scope} onChange={(event) => setRatingAveragePreferences({ ...ratingAveragePreferences, event_scope: event.target.value as "current_event" | "organization" })}><option value="current_event">Current event only</option><option value="organization">All permitted ratings in the organization</option></select></label><label>Average display<select value={ratingAveragePreferences.display_mode} onChange={(event) => { const displayMode = event.target.value as "overall" | "position" | "both"; setRatingAveragePreferences({ ...ratingAveragePreferences, display_mode: displayMode, match_position: displayMode === "position" }); }}><option value="overall">Overall average</option><option value="position">Assigned-position average</option><option value="both">Position and overall averages</option></select></label><label>From date<input type="date" value={ratingAveragePreferences.from} onChange={(event) => setRatingAveragePreferences({ ...ratingAveragePreferences, from: event.target.value })} /></label><label>Through date<input type="date" min={ratingAveragePreferences.from || undefined} value={ratingAveragePreferences.through} onChange={(event) => setRatingAveragePreferences({ ...ratingAveragePreferences, through: event.target.value })} /></label><button className="primary" disabled={busy} onClick={() => void saveRatingAveragePreferences()}>Save Rating Display</button></article>
    <ConnectedSchedules session={session} profile={profile} onUpdated={onUpdated} />
  </section>;
}

function OrganizationLogoEditor({
  session,
  organizationId,
  logoUrl,
  onChange,
  onBusyChange,
  onError,
}: {
  session: Law18Session;
  organizationId: string;
  logoUrl: string;
  onChange: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  async function chooseLogo(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      onError("Choose a PNG, JPEG, or WebP group logo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onError("Group logos must be 5 MB or smaller.");
      return;
    }
    onBusyChange(true);
    onError("");
    try {
      onChange(await uploadOrganizationLogo(session, organizationId, file));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Unable to upload the group logo.");
    } finally {
      onBusyChange(false);
    }
  }
  return <div className={`organization-logo-upload ${dragging ? "dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void chooseLogo(event.dataTransfer.files[0]); }}>
    <div className="organization-logo-preview">{logoUrl ? <img src={logoUrl} alt="Group logo preview" /> : <span>GRP</span>}</div>
    <div><strong>{logoUrl ? "Group logo selected" : "Add a group logo"}</strong><small>Drop a PNG, JPEG, or WebP here · maximum 5 MB</small></div>
    <label className="secondary file-button">{logoUrl ? "Replace Logo" : "Choose Logo"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseLogo(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {logoUrl && <button className="text-button organization-logo-remove" type="button" onClick={() => onChange("")}>Remove Logo</button>}
  </div>;
}

function GroupsSettings({
  session,
  organization,
  canManage,
  onUpdated,
}: {
  session: Law18Session;
  organization: OrganizationRecord | null;
  canManage: boolean;
  onUpdated: (organization: OrganizationRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [organizationName, setOrganizationName] = useState(organization?.name || "");
  const [leavePassword, setLeavePassword] = useState("");
  const [leaveCaptchaToken, setLeaveCaptchaToken] = useState("");
  const [leaveAttempt, setLeaveAttempt] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  useEffect(() => { setLeaveOpen(false); setLeavePassword(""); setLeaveCaptchaToken(""); }, [organization?.id]);
  const [logoUrl, setLogoUrl] = useState(organization?.logo_url || "");
  const [approvalRole, setApprovalRole] = useState<NonNullable<OrganizationRecord["public_rating_approval_role"]>>(organization?.public_rating_approval_role || "none");
  useEffect(() => {
    setOrganizationName(organization?.name || "");
    setLogoUrl(organization?.logo_url || "");
    setApprovalRole(organization?.public_rating_approval_role || "none");
  }, [organization?.id, organization?.logo_url, organization?.name, organization?.public_rating_approval_role]);
  async function saveSettings() {
    if (!organization || !canManage) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateOrganizationSettings(session, organization.id, { name: organizationName, logo_url: logoUrl || null, public_rating_approval_role: approvalRole });
      onUpdated(updated);
      setMessage("Group settings saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save group settings.");
    } finally {
      setBusy(false);
    }
  }
  async function leave(event: FormEvent) {
    event.preventDefault();
    if (!organization || busy || !leavePassword || (turnstileEnabled() && !leaveCaptchaToken)) return;
    setBusy(true);
    setMessage("");
    try {
      const verified = await auth.verifyPassword(session.user.email || "", leavePassword, leaveCaptchaToken);
      if (verified.user.id !== session.user.id) throw new Error("Password verification did not match your account.");
      await leaveCurrentOrganization(verified, organization.id);
      window.location.reload();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to leave this group.");
    } finally {
      setLeavePassword("");
      setLeaveCaptchaToken("");
      setLeaveAttempt((attempt) => attempt + 1);
      setBusy(false);
    }
  }
  return <section className="page-section settings-page">
    <div className="section-title"><div><p className="eyebrow">GROUPS</p><h1>Group Membership</h1><p>Review the groups connected to your account.</p></div></div>
    {organization && canManage && <article className="panel organization-profile-settings">
      <div className="panel-head"><div><p className="eyebrow">GROUP SETTINGS</p><h2>Group Identity</h2><p>The logo appears in the active-group bar for all members.</p></div></div>
      <label>Group Name<input value={organizationName} maxLength={120} onChange={(event) => setOrganizationName(event.target.value)} /></label>
      <OrganizationLogoEditor session={session} organizationId={organization.id} logoUrl={logoUrl} onChange={setLogoUrl} onBusyChange={setBusy} onError={setMessage} />
      <label>Default Public Eval Approval<select value={approvalRole} onChange={(event) => setApprovalRole(event.target.value as typeof approvalRole)}><option value="none">No Approval — Share Immediately</option><option value="organization_admin">Group Admin Approval</option><option value="event_admin">Event Admin Approval</option></select><small>Events can inherit or override this setting.</small></label>
      <button className="primary" disabled={busy || organizationName.trim().length < 2} onClick={saveSettings}>{busy ? "Saving…" : "Save Group Settings"}</button>
      {message && <p className="pilot-message">{message}</p>}
    </article>}
    <article className="panel group-card">
      {organization?.logo_url ? <img className="group-logo" src={organization.logo_url} alt="" /> : <span className="group-mark">{organization?.name?.[0] || "L"}</span>}
      <div><h2>{organization?.name || "Current group"}</h2><p>Your events and assignments from this group appear in Law18Ref.</p></div>
      {organization && <details className="group-membership-options" open={leaveOpen} onToggle={(event) => { setLeaveOpen(event.currentTarget.open); if (!event.currentTarget.open) { setLeavePassword(""); setLeaveCaptchaToken(""); } }}>
        <summary>Membership Options</summary>
        {leaveOpen && <form className="group-leave-form" onSubmit={leave}>
          <h3>Leave {organization.name}</h3>
          <p>You will lose access to this group’s events and schedules. Your account, other group memberships, and historical records will be kept.</p>
          <label>Confirm your password<input type="password" autoComplete="current-password" required value={leavePassword} disabled={busy} onChange={(event) => setLeavePassword(event.target.value)} /></label>
          <TurnstileChallenge key={`${organization.id}-${leaveAttempt}`} action="leave_group" onToken={setLeaveCaptchaToken} />
          <div className="group-leave-actions"><button type="button" className="secondary" disabled={busy} onClick={() => { setLeaveOpen(false); setLeavePassword(""); setLeaveCaptchaToken(""); }}>Cancel</button><button type="submit" className="danger-button" disabled={busy || !leavePassword || (turnstileEnabled() && !leaveCaptchaToken)}>{busy ? "Leaving…" : "Confirm and Leave Group"}</button></div>
        </form>}
      </details>}
      {message && <p className="group-message">{message}</p>}
    </article>
  </section>;
}

function SiteGroupsAdmin({ session, ownerEmail, onOpen, onUpdated }: { session: Law18Session; ownerEmail: string; onOpen: (organizationId: string) => void; onUpdated: (organization: OrganizationRecord) => void }) {
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ organization: OrganizationRecord; action: "deactivate" | "delete" } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [editing, setEditing] = useState<OrganizationRecord | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingLogoUrl, setEditingLogoUrl] = useState("");
  const [editingFeatures, setEditingFeatures] = useState<EventFeatureSettings>({ ...defaultEventFeatures });
  const [showDeactivated, setShowDeactivated] = useState(false);
  const refreshOrganizations = useCallback(async () => {
    setOrganizations(await loadOrganizations(session));
  }, [session]);

  useEffect(() => {
    refreshOrganizations().catch((reason) => setMessage(reason instanceof Error ? reason.message : "Unable to load groups."));
  }, [refreshOrganizations]);

  async function create() {
    setBusy(true);
    setMessage("");
    try {
      const created = await createOrganization(session, name.trim());
      setName("");
      await refreshOrganizations();
      setMessage(`${created.name} was created. You can now add Group Admins and events.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to create the group.");
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(organization: OrganizationRecord) {
    setBusy(true);
    setMessage("");
    try {
      await reactivateOrganization(session, organization.id);
      await refreshOrganizations();
      setMessage(`${organization.name} is active again.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to reactivate the group.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOrganizationSettings() {
    if (!editing) return;
    setBusy(true);
    setMessage("");
    try {
      const updated = await updateOrganizationSettings(session, editing.id, { name: editingName, logo_url: editingLogoUrl || null, feature_entitlements: editingFeatures });
      onUpdated(updated);
      setEditing(null);
      await refreshOrganizations();
      setMessage("Group settings saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save group settings.");
    } finally {
      setBusy(false);
    }
  }

  async function requestVerification() {
    if (!pending) return;
    if (pending.action === "delete" && confirmName.trim() !== pending.organization.name) {
      setMessage(`Type “${pending.organization.name}” exactly to confirm permanent deletion.`);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const refreshed = await auth.verifyPassword(ownerEmail, password, captchaToken);
      const challengeId = await beginOrganizationAction(refreshed, pending.organization.id, pending.action);
      const result = await completeOrganizationAction(refreshed, challengeId);
      setPending(null);
      setPassword("");
      setConfirmName("");
      await refreshOrganizations();
      setMessage(result);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to complete the action.");
    } finally {
      setCaptchaToken("");
      setCaptchaAttempt((attempt) => attempt + 1);
      setBusy(false);
    }
  }

  return <section className="page-section site-groups-page">
    <div className="section-title"><div><p className="eyebrow">SITE OWNER · GROUPS</p><h1>Groups</h1><p>Create and manage every group using Law18Ref.</p></div></div>
    <div className="organization-admin-grid">
      <article className="panel create-organization-card">
        <div className="panel-head"><div><p className="eyebrow">NEW GROUP</p><h2>Create a Group</h2><p>Only the Site Owner can create groups.</p></div></div>
        <label>Group Name<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Example Soccer Association" /></label>
        <button className="primary" disabled={busy || name.trim().length < 2} onClick={create}>{busy ? "Working…" : "Create Group"}</button>
      </article>
      <article className="panel organization-safety">
        <p className="eyebrow">SAFE ORGANIZATION CONTROL</p>
        <h2>Deactivate before deleting</h2>
        <p>Deactivation immediately suspends access and changes while preserving all records. It is reversible. Permanent deletion becomes available after seven days and cannot be undone.</p>
      </article>
    </div>
    {message && <p className="pilot-message organization-message">{message}</p>}
    {organizations.some((item) => item.active === false) && <button className="secondary collapsed-section-control" onClick={() => setShowDeactivated((value) => !value)}>{showDeactivated ? "Collapse" : "Show"} deactivated groups ({organizations.filter((item) => item.active === false).length})</button>}
    <div className="organization-list">
      {organizations.filter((item) => item.active !== false || showDeactivated).map((item) => {
        const deleteAvailable = Boolean(item.deactivated_at && Date.now() - new Date(item.deactivated_at).getTime() >= 7 * 24 * 60 * 60 * 1000);
        return <article className={`panel organization-admin-row ${item.active === false ? "deactivated" : ""}`} key={item.id}>
          <span className="group-mark">{item.name[0]}</span>
          <div><h2>{item.name}</h2><p>{item.slug}</p><span className={`status ${item.active === false ? "missing" : "ready"}`}><b />{item.active === false ? "Deactivated" : "Active"}</span></div>
          <div className="organization-actions">
            {item.active !== false && <button className="primary" onClick={() => onOpen(item.id)}>Open Group</button>}
            <button className="secondary" onClick={() => { setEditing(item); setEditingName(item.name); setEditingLogoUrl(item.logo_url || ""); setEditingFeatures({ ...defaultEventFeatures, ...(item.feature_entitlements || {}) }); }}>Settings</button>
            {item.active === false
              ? <>
                <button className="secondary" disabled={busy} onClick={() => reactivate(item)}>Reactivate</button>
                <button className="danger-button" disabled={busy || !deleteAvailable} title={deleteAvailable ? "Permanently delete group" : "Available seven days after deactivation"} onClick={() => { setPending({ organization: item, action: "delete" }); setMessage(""); }}>Delete Permanently</button>
              </>
              : <button className="danger-button" disabled={busy} onClick={() => { setPending({ organization: item, action: "deactivate" }); setMessage(""); }}>Deactivate</button>}
          </div>
          {item.active === false && item.deactivated_at && <small className="deactivation-note">Deactivated {formatDate(item.deactivated_at)}{deleteAvailable ? " · Eligible for permanent deletion" : " · Seven-day recovery period in progress"}</small>}
        </article>;
      })}
      {!organizations.length && <article className="panel empty-state">No groups have been created yet.</article>}
    </div>
    {pending && <div className="confirmation-backdrop" role="presentation">
      <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="organization-confirm-title">
        <p className="eyebrow">{pending.action === "delete" ? "PERMANENT ACTION" : "SECURITY CONFIRMATION"}</p>
        <h2 id="organization-confirm-title">{pending.action === "delete" ? "Permanently delete" : "Deactivate"} {pending.organization.name}?</h2>
        <p>{pending.action === "delete"
          ? "This permanently removes the group and all connected events, schedules, officials, ratings, and history. It cannot be recovered."
          : "Members will lose access and event operations will stop. All data remains stored and the group can be reactivated."}</p>
        {pending.action === "delete" && <label>Type the group name<input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} /></label>}
        <label>Confirm your password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <TurnstileChallenge key={captchaAttempt} action="privileged_action" onToken={setCaptchaToken} />
        <p className="verification-note">Your password confirms this action directly during the beta phase.</p>
        <div><button className="secondary" disabled={busy} onClick={() => { setPending(null); setPassword(""); setConfirmName(""); setCaptchaToken(""); }}>Cancel</button><button className="danger-button" disabled={busy || !password || (turnstileEnabled() && !captchaToken)} onClick={requestVerification}>{busy ? "Verifying…" : pending.action === "delete" ? "Permanently Delete" : "Deactivate Group"}</button></div>
      </section>
    </div>}
    {editing && <div className="confirmation-backdrop" role="presentation"><section className="confirmation-dialog organization-settings-dialog" role="dialog" aria-modal="true"><p className="eyebrow">GROUP SETTINGS</p><h2>{editing.name}</h2><label>Group name<input value={editingName} maxLength={120} onChange={(event) => setEditingName(event.target.value)} /></label><OrganizationLogoEditor session={session} organizationId={editing.id} logoUrl={editingLogoUrl} onChange={setEditingLogoUrl} onBusyChange={setBusy} onError={setMessage} /><fieldset className="site-owner-feature-settings"><legend>Enabled Group Features</legend><p>These switches are the maximum features this group can use. Disabled features cannot be enabled by Group or Event Admins.</p>{(Object.keys(eventFeatureLabels) as EventFeatureKey[]).map((feature) => <label className={editingFeatures[feature] ? "selected" : ""} key={feature}><input type="checkbox" checked={editingFeatures[feature]} onChange={(change) => setEditingFeatures((current) => ({ ...current, [feature]: change.target.checked }))} /><span><strong>{eventFeatureLabels[feature].title}</strong><small>{eventFeatureLabels[feature].description}</small></span></label>)}</fieldset><p className="verification-note">The logo appears in the active-group bar. The internal group address remains unchanged so imports and existing links continue working.</p><div><button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary" disabled={busy || editingName.trim().length < 2} onClick={saveOrganizationSettings}>{busy ? "Saving…" : "Save Settings"}</button></div></section></div>}
  </section>;
}

function Dashboard({ session, onSessionExpired }: { session: Law18Session; onSessionExpired: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<OrganizationRecord | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [organizationRoles, setOrganizationRoles] = useState<MembershipRole[]>([]);
  const [eventRoles, setEventRoles] = useState<MembershipRole[]>([]);
  const [eventAccess, setEventAccess] = useState<EventMembership[]>([]);
  const [organizationOfficials, setOrganizationOfficials] = useState<OfficialRecord[]>([]);
  const [allEvents, setAllEvents] = useState<EventRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventId, setEventId] = useState("");
  const [data, setData] = useState<EventData>({ games: [], assignments: [], officials: [], checkIns: [], attendanceOverrides: [], assessments: [], coachAssignments: [], documents: [], provisionalAccess: [] });
  const [loading, setLoading] = useState(true);
  const [dashboardLoadError, setDashboardLoadError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ratingModalGameId, setRatingModalGameId] = useState<string | null>(null);
  const [ratingEditAssessmentId, setRatingEditAssessmentId] = useState<string | null>(null);
  const [scheduleOfficialId, setScheduleOfficialId] = useState<string | null>(null);
  const [scheduleOfficialDate, setScheduleOfficialDate] = useState<string | null>(null);
  const [officialToEditId, setOfficialToEditId] = useState<string | null>(null);
  const [organizationActionMessage, setOrganizationActionMessage] = useState("");
  const [qrCheckInMessage, setQrCheckInMessage] = useState("");
  const [administrativeRatingHistory, setAdministrativeRatingHistory] = useState<{ assessments: AssessmentRecord[]; games: GameRecord[]; assignments: AssignmentRecord[] }>({ assessments: [], games: [], assignments: [] });
  useEffect(() => {
    const closeDropdowns = (event: PointerEvent) => {
      document.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((dropdown) => {
        if (!dropdown.contains(event.target as Node)) dropdown.removeAttribute("open");
      });
      if (!(event.target as Element).closest?.(".account-menu")) setAccountOpen(false);
      if (!(event.target as Element).closest?.(".notification-menu")) setNotificationsOpen(false);
    };
    const closeAccountTray = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("pointerdown", closeDropdowns);
    document.addEventListener("keydown", closeAccountTray);
    return () => {
      document.removeEventListener("pointerdown", closeDropdowns);
      document.removeEventListener("keydown", closeAccountTray);
    };
  }, []);
  const allRoles = new Set<MembershipRole>([
    ...(profile?.is_site_owner ? ["site_owner" as MembershipRole] : []),
    ...organizationRoles,
    ...eventRoles,
  ]);
  const activeGroupRoles = [...new Set<MembershipRole>([
    ...(profile?.is_site_owner ? ["site_owner" as MembershipRole] : []),
    ...organizationRoles,
    ...eventRoles,
  ])];
  const helpByRole: Record<MembershipRole, { title: string; items: string[] }> = {
    site_owner: { title: "Site Owner Navigation", items: ["Use the group selector below the header to open the group you want to manage.", "Open Groups from your initials menu to create, open, archive, restore, rename, upload a logo, or configure features for a group.", "Open Site Appearance from your initials menu to edit, save, schedule, or restore site themes.", "Open Documentation from your initials menu to download product and basic overviews, the platform update spreadsheet, and user guides. Updated source documents become available with the next site deployment.", "Open Officials and use Copy Join Link to invite members to the active group.", "Open Activity within a group to review its audit log and event archive.", "After selecting a group and event, use the same event tabs described for Group Admins."] },
    organization_director: { title: "Group Director Navigation", items: ["Use the group and event selectors below the header to choose your working scope.", "Open Officials to appoint Group Admins and lower group roles, or open Event Access to appoint Event Admins and lower event roles.", "Use Groups, Activity, Import, Schedule, Check-In, Coaching, and Ratings for complete group administration. Schedule includes list, time-and-field, by-field, and first-assignment views.", "Only the Site Owner can appoint or remove a Group Director."] },
    organization_admin: { title: "Group Admin Navigation", items: ["Choose the group and active event from the selectors below the header.", "Open Groups from your initials menu to update the active group's name or logo.", "Open Officials to copy the group join link, add or edit people, review last activity, set group roles, remove a member, merge accounts, or open Event Access. Use the selection boxes for bulk archive or deletion.", "Open Activity to review meaningful changes or bulk archive, restore, and delete events.", "Open Import to add officials, upload an Assignr schedule, configure automatic archiving, or archive the selected event now.", "Open Schedule to filter games by date, field, site, official, time, age group, gender, or competition. Switch between list, time-and-field, by-field, and first-assignment views; save filters; or export games.", "Open Check-In to manage arrivals and Coaching to assign coaches.", "Open Ratings to configure evaluations; filter All, Submitted, or Draft history; switch between individual and full-game views; submit a saved draft; or export filtered ratings as individual rows, full-game rows, or a grouped summary. Archived-event ratings remain available here."] },
    event_admin: { title: "Event Admin Navigation", items: ["Select an assigned event from the Active Event menu below the header.", "Open Officials, then Event Access, to add or update event staff and set a Site Supervisor’s dates, sites, and assignment-editing access.", "Open Import for event schedule data and Event Lifecycle controls, including automatic archiving or Archive Now.", "Open Schedule to correct posted crews. Updated games remain orange until you use Change Confirmed after updating any outside records.", "Open Check-In for arrivals, Coaching for coach assignments, and Ratings for evaluation settings and history."] },
    assignor: { title: "Assignor Navigation", items: ["Select the event you are working from the Active Event menu below the header.", "Open Import to upload an authorized schedule, then use Schedule to review crews in list, time-and-field, by-field, or first-assignment view.", "In Schedule, filter games, arrange three sort levels, save filter setups, export games, or use Edit Assignments to correct a posted crew. These corrections do not notify officials.", "Open Check-In to filter arrivals, manually check someone in, undo a check-in, or select an official’s name to see their event schedule and contact details.", "Open Coaching to place coaches on games. Use Rate Crew on a schedule game, or open Ratings and choose a game, when coaching tools are enabled."] },
    site_coordinator: { title: "Site Supervisor Navigation", items: ["Select today’s event from the Active Event menu.", "Open Schedule and select list, time-and-field, by-field, or first-assignment view to review games within your assigned dates and sites. Orange time columns indicate a schedule change awaiting Event Admin confirmation.", "If assignment editing was enabled for you, use Edit Assignments on a game in your scope; no notification is sent by this correction tool.", "Open Check-In to monitor arrivals. Select an official’s name to view their full schedule for that date—including read-only games outside your management scope—and contact details."] },
    referee_coach: { title: "Referee Coach Navigation", items: ["Select the event you are coaching from the My Event menu.", "Open Schedule to see games and crews in your coaching scope. Use its filters, three-level sorting, saved filter setups, and Excel/PDF export controls when you need a focused coaching schedule.", "Select Rate Crew on a game to open its evaluation form, complete the crew ratings, and submit them together.", "Open Ratings to review only the ratings you submitted. Use the status selector for All, Submitted, or Draft ratings; select Submit Draft to finish a saved draft; and choose individual, full-game, or summary format when exporting the filtered results.", "When Check-In appears, open it at the venue, select Scan QR Code, and scan the code displayed by event staff."] },
    referee: { title: "Referee Navigation", items: ["Your Dashboard lists every group and upcoming event linked to your account; referees do not need to select an active group or event.", "Open My Assignments to view one schedule containing all of your Law18Ref games and any personal external calendar feeds you have connected. When an evaluation for a game has been shared with you, select View My Eval beside that assignment.", "Open your initials menu, then Account Settings, to manage account-wide personal information and private calendar feeds.", "On an assigned event day, open Check-In. Law18Ref opens the eligible event automatically or asks you to choose when you have more than one check-in that day.", "Select Scan QR Code and scan the code displayed by event staff. The scanner disappears after your check-in is recorded.", "Open My Evals to review your complete history of evaluations that have been shared with you."] },
  };
  const quickGuidesByRole: Partial<Record<MembershipRole, { title: string; description: string; href: string }[]>> = {
    site_owner: [{ title: "Group Admin Quick Guide", description: "Group setup, officials, events, schedules, check-ins, coaching, and ratings.", href: "/guides/Law18Ref-Group-Admin-Quick-Guide.pdf" }],
    organization_director: [{ title: "Group Admin Quick Guide", description: "Group setup, officials, events, schedules, check-ins, coaching, and ratings.", href: "/guides/Law18Ref-Group-Admin-Quick-Guide.pdf" }],
    organization_admin: [{ title: "Group Admin Quick Guide", description: "Group setup, officials, events, schedules, check-ins, coaching, and ratings.", href: "/guides/Law18Ref-Group-Admin-Quick-Guide.pdf" }],
    event_admin: [{ title: "Event Admin Quick Guide", description: "Event access, schedule operations, check-in management, coaching, and ratings.", href: "/guides/Law18Ref-Event-Admin-Quick-Guide.pdf" }],
    site_coordinator: [{ title: "Site Supervisor Quick Guide", description: "Assigned-site schedules, check-in monitoring, and tournament-day tools.", href: "/guides/Law18Ref-Site-Supervisor-Quick-Guide.pdf" }],
    referee_coach: [{ title: "Referee Coach Quick Guide", description: "Finding assigned games, reviewing crews, and submitting ratings.", href: "/guides/Law18Ref-Referee-Coach-Quick-Guide.pdf" }],
    referee: [{ title: "Referee Quick Guide", description: "Account creation, assignments, event-day check-in, and shared evaluations.", href: "/guides/Law18Ref-Referee-Quick-Guide.pdf" }],
  };
  const subordinateHelpRoles: Record<MembershipRole, MembershipRole[]> = {
    site_owner: ["site_owner", "organization_director", "organization_admin", "event_admin", "assignor", "site_coordinator", "referee_coach", "referee"],
    organization_director: ["organization_director", "organization_admin", "event_admin", "assignor", "site_coordinator", "referee_coach", "referee"],
    organization_admin: ["organization_admin", "event_admin", "assignor", "site_coordinator", "referee_coach", "referee"],
    event_admin: ["event_admin", "assignor", "site_coordinator", "referee_coach", "referee"],
    assignor: ["assignor", "site_coordinator", "referee_coach", "referee"],
    site_coordinator: ["site_coordinator", "referee"],
    referee_coach: ["referee_coach", "referee"],
    referee: ["referee"],
  };
  const helpRoleOrder: MembershipRole[] = ["site_owner", "organization_director", "organization_admin", "event_admin", "assignor", "site_coordinator", "referee_coach", "referee"];
  const helpVisibleRoleSet = new Set(activeGroupRoles.flatMap((role) => subordinateHelpRoles[role]));
  const helpVisibleRoles = helpRoleOrder.filter((role) => helpVisibleRoleSet.has(role));
  const activeQuickGuides = [...new Map(helpVisibleRoles
    .flatMap((role) => quickGuidesByRole[role] || [])
    .map((guide) => [guide.href, guide])).values()];
  const isAdministrativeStaff = ["site_owner", "organization_director", "organization_admin", "event_admin", "assignor"].some((role) => allRoles.has(role as MembershipRole));
  const isSiteCoordinator = allRoles.has("site_coordinator");
  const isStaff = isAdministrativeStaff || isSiteCoordinator;
  const isCoach = allRoles.has("referee_coach");
  const isPersonalWorkspace = Boolean(profile && !isStaff && !isCoach);
  const canAssess = isCoach
    || ["site_owner", "organization_director", "organization_admin", "event_admin"].some((role) => allRoles.has(role as MembershipRole))
    || eventAccess.some((membership) => membership.coaching_tools_enabled);
  const canConfigureRatings = ["site_owner", "organization_director", "organization_admin", "event_admin"].some((role) => allRoles.has(role as MembershipRole));
  const canConfigureEvent = ["site_owner", "organization_director", "organization_admin", "event_admin"].some((role) => allRoles.has(role as MembershipRole));
  const event = events.find((item) => item.id === eventId);
  const supervisorEventAccess = eventAccess.find((membership) => membership.role === "site_coordinator");
  const siteSupervisorCanEditAssignments = Boolean(isSiteCoordinator && (supervisorEventAccess?.assignment_editing_override ?? event?.site_supervisor_assignment_editing_enabled ?? false));
  const canEditAssignments = isAdministrativeStaff || siteSupervisorCanEditAssignments;
  const selectScheduleOfficial = (officialId: string, eventDate?: string) => { setScheduleOfficialId(officialId); setScheduleOfficialDate(eventDate || null); };
  const effectiveRatingApprovalRole = event?.public_rating_approval_role && event.public_rating_approval_role !== "inherit"
    ? event.public_rating_approval_role
    : organization?.public_rating_approval_role || "none";
  const canApprovePublicRatings = Boolean(
    profile?.is_site_owner
    || (effectiveRatingApprovalRole === "organization_admin" && (organizationRoles.includes("organization_director") || organizationRoles.includes("organization_admin")))
    || (effectiveRatingApprovalRole === "event_admin" && eventRoles.includes("event_admin")),
  );

  useEffect(() => {
    if (!isAdministrativeStaff) {
      setAdministrativeRatingHistory({ assessments: [], games: [], assignments: [] });
      return;
    }
    if (!organization?.id) return;
    loadAuthorizedRatingHistory(session, organization.id)
      .then((history) => setAdministrativeRatingHistory({ assessments: history.assessments, games: history.games, assignments: history.assignments }))
      .catch(() => setAdministrativeRatingHistory({ assessments: [], games: [], assignments: [] }));
  }, [isAdministrativeStaff, organization?.id, session]);

  const refresh = useCallback(async (selectedId = eventId) => {
    if (!selectedId) return;
    setData(await loadEventData(session, selectedId));
  }, [eventId, session]);
  const refreshCheckIns = useCallback(async () => {
    if (!eventId) return;
    const [checkIns, attendanceOverrides] = await Promise.all([
      loadEventCheckIns(session, eventId),
      loadEventAttendanceOverrides(session, eventId),
    ]);
    setData((current) => ({ ...current, checkIns, attendanceOverrides }));
  }, [eventId, session]);
  const applySavedRatings = useCallback((savedRatings: AssessmentRecord[]) => {
    const savedById = new Map(savedRatings.map((rating) => [rating.id, rating]));
    setData((current) => ({
      ...current,
      assessments: [
        ...current.assessments.map((rating) => savedById.get(rating.id) || rating),
        ...savedRatings.filter((rating) => !current.assessments.some((existing) => existing.id === rating.id)),
      ],
    }));
  }, []);

  useEffect(() => {
    (async () => {
      setDashboardLoadError("");
      try {
        const joinToken = new URLSearchParams(window.location.search).get("join") || localStorage.getItem("law18ref-join-token");
        if (joinToken) {
          try {
            const joined = await claimOrganizationJoinLink(session, joinToken);
            localStorage.removeItem("law18ref-join-token");
            if (joined?.organization_id) {
              localStorage.setItem("law18ref-active-organization", joined.organization_id);
              setOrganizationActionMessage(`You joined ${joined.organization_name}.`);
            }
          } catch (reason) {
            setOrganizationActionMessage(reason instanceof Error ? reason.message : "Unable to use this Join Group link.");
          }
          const url = new URL(window.location.href);
          url.searchParams.delete("join");
          history.replaceState(null, "", `${url.pathname}${url.search}`);
        }
        await recordCurrentActivity(session).catch(() => undefined);
        await linkCurrentReferee(session);
        const [currentProfile, availableEvents, memberships, availableOrganizations] = await Promise.all([loadProfile(session), loadEvents(session), loadMemberships(session), loadOrganizations(session)]);
        loadUserNotifications(session).then(setNotifications).catch(() => setNotifications([]));
        setProfile(currentProfile);
        setOrganizations(availableOrganizations.filter((item) => item.active !== false));
        setAllEvents(availableEvents);
        const eventSlug = new URLSearchParams(window.location.search).get("event");
        const linkedEvent = availableEvents.find((item) => item.check_in_slug === eventSlug);
        const storedOrganizationId = localStorage.getItem("law18ref-active-organization");
        const organizationId = linkedEvent?.organization_id
          || (availableOrganizations.some((item) => item.id === storedOrganizationId && item.active !== false) ? storedOrganizationId : null)
          || memberships.organizations[0]?.organization_id
          || currentProfile?.organization_id
          || availableOrganizations.find((item) => item.active !== false)?.id;
        if (currentProfile && organizationId) {
          setOrganization(availableOrganizations.find((item) => item.id === organizationId) || await loadOrganization(session, organizationId));
          setOrganizationOfficials(await loadOrganizationOfficials(session, organizationId));
          localStorage.setItem("law18ref-active-organization", organizationId);
        }
        const organizationEvents = availableEvents.filter((item) => item.organization_id === organizationId);
        setEvents(organizationEvents);
        const refreshEventId = sessionStorage.getItem("law18ref-refresh-event");
        const refreshView = sessionStorage.getItem("law18ref-refresh-view") as View | null;
        const selected = organizationEvents.find((item) => item.check_in_slug === eventSlug)?.id
          || organizationEvents.find((item) => item.id === refreshEventId)?.id
          || organizationEvents[0]?.id
          || "";
        setOrganizationRoles(memberships.organizations.filter((membership) => membership.organization_id === organizationId).map((membership) => membership.role));
        setEventRoles(memberships.events.filter((membership) => membership.event_id === selected).map((membership) => membership.role));
        setEventAccess(memberships.events.filter((membership) => membership.event_id === selected));
        setEventId(selected);
        if (selected) {
          let selectedData = await loadEventData(session, selected);
          const scannedDate = new URLSearchParams(window.location.search).get("date");
          if (eventSlug && scannedDate) {
            setView("checkin");
            const selectedEvent = organizationEvents.find((item) => item.id === selected);
            const official = selectedData.officials.find((item) => item.linked_user_id === session.user.id || item.email?.toLowerCase() === session.user.email?.toLowerCase());
            const assignedThatDay = Boolean(official && selectedData.assignments.some((assignment) =>
              assignment.official_id === official.id
              && selectedData.games.some((game) => game.id === assignment.game_id && game.starts_at.startsWith(scannedDate))));
            const today = selectedEvent
              ? new Intl.DateTimeFormat("en-CA", { timeZone: selectedEvent.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
              : "";
            if (!selectedEvent || !eventFeatureEnabled(selectedEvent, "check_in") || selectedEvent.check_in_slug !== eventSlug || scannedDate < today || !official || !assignedThatDay) {
              setQrCheckInMessage("This QR code does not match one of your assigned event days.");
            } else {
              try {
                await checkIn(session, selectedEvent.id, official.id, "qr", scannedDate);
                selectedData = await loadEventData(session, selected);
                setQrCheckInMessage(`You are checked in for ${formatDate(scannedDate)} as ${official.full_name}.`);
              } catch (reason) {
                setQrCheckInMessage(reason instanceof Error ? reason.message : "The QR code was valid, but check-in could not be recorded.");
              }
            }
          }
          setData(selectedData);
        }
        if (!eventSlug && refreshView && refreshableViews.includes(refreshView)) setView(refreshView);
        sessionStorage.removeItem("law18ref-refresh-view");
        sessionStorage.removeItem("law18ref-refresh-event");
      } catch (reason) {
        if (isSessionExpiredError(reason)) onSessionExpired();
        else setDashboardLoadError(reason instanceof Error ? reason.message : "Law18Ref could not load. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [session.user.id, onSessionExpired]);

  useEffect(() => {
    loadAppearanceCampaigns(session).then((campaigns) => {
      const now = Date.now();
      const active = campaigns.find((campaign) => campaign.active && new Date(campaign.starts_at).getTime() <= now && new Date(campaign.ends_at).getTime() > now);
      displayAppearance(active);
    }).catch(() => undefined);
  }, [session, view]);

  useEffect(() => {
    const recordVisibleActivity = () => {
      if (document.visibilityState === "visible") void recordCurrentActivity(session).catch(() => undefined);
    };
    const heartbeat = window.setInterval(recordVisibleActivity, 5 * 60 * 1000);
    window.addEventListener("focus", recordVisibleActivity);
    document.addEventListener("visibilitychange", recordVisibleActivity);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", recordVisibleActivity);
      document.removeEventListener("visibilitychange", recordVisibleActivity);
    };
  }, [session]);

  async function switchEvent(nextId: string) {
    const nextEvent = allEvents.find((item) => item.id === nextId);
    if (view === "checkin" && nextEvent && !eventFeatureEnabled(nextEvent, "check_in")) setView("dashboard");
    setEventId(nextId);
    setLoading(true);
    try {
      const [nextData, memberships] = await Promise.all([loadEventData(session, nextId), loadMemberships(session)]);
      setData(nextData);
      setEventRoles(memberships.events.filter((membership) => membership.event_id === nextId).map((membership) => membership.role));
      setEventAccess(memberships.events.filter((membership) => membership.event_id === nextId));
    } finally {
      setLoading(false);
    }
  }

  function refreshCurrentPage() {
    sessionStorage.setItem("law18ref-refresh-view", view);
    if (eventId) sessionStorage.setItem("law18ref-refresh-event", eventId);
    else sessionStorage.removeItem("law18ref-refresh-event");
    window.location.reload();
  }

  async function openNotifications() {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    setAccountOpen(false);
    if (opening && notifications.some((item) => !item.read_at)) {
      await markUserNotificationsRead(session).catch(() => undefined);
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    }
  }

  async function switchOrganization(nextId: string, nextView?: View) {
    let nextOrganization = organizations.find((item) => item.id === nextId);
    if (!nextOrganization) {
      const refreshedOrganizations = (await loadOrganizations(session)).filter((item) => item.active !== false);
      setOrganizations(refreshedOrganizations);
      nextOrganization = refreshedOrganizations.find((item) => item.id === nextId);
    }
    if (!nextOrganization) return;
    setLoading(true);
    try {
      localStorage.setItem("law18ref-active-organization", nextId);
      setOrganization(nextOrganization);
      const nextEvents = allEvents.filter((item) => item.organization_id === nextId);
      setEvents(nextEvents);
      const [nextOfficials, memberships] = await Promise.all([loadOrganizationOfficials(session, nextId), loadMemberships(session)]);
      setOrganizationOfficials(nextOfficials);
      const nextEventId = nextEvents[0]?.id || "";
      setEventId(nextEventId);
      setOrganizationRoles(memberships.organizations.filter((membership) => membership.organization_id === nextId).map((membership) => membership.role));
      setEventRoles(memberships.events.filter((membership) => membership.event_id === nextEventId).map((membership) => membership.role));
      setEventAccess(memberships.events.filter((membership) => membership.event_id === nextEventId));
      setData(nextEventId ? await loadEventData(session, nextEventId) : { games: [], assignments: [], officials: [], checkIns: [], attendanceOverrides: [], assessments: [], coachAssignments: [], documents: [], provisionalAccess: [] });
      if (nextView) setView(nextView);
    } finally {
      setLoading(false);
    }
  }

  async function handleImported(newEvent: EventRecord) {
    const [nextEvents, nextNotifications] = await Promise.all([
      loadEvents(session),
      loadUserNotifications(session).catch(() => [] as UserNotification[]),
    ]);
    setNotifications(nextNotifications);
    setAllEvents(nextEvents);
    setEvents(nextEvents.filter((item) => item.organization_id === organization?.id));
    if (organization?.id) setOrganizationOfficials(await loadOrganizationOfficials(session, organization.id));
    await switchEvent(newEvent.id);
  }

  async function handleEventsChanged() {
    if (!organization) return;
    const nextEvents = await loadEvents(session);
    const organizationEvents = nextEvents.filter((item) => item.organization_id === organization.id);
    setAllEvents(nextEvents);
    setEvents(organizationEvents);
    const nextEventId = organizationEvents.some((item) => item.id === eventId) ? eventId : organizationEvents[0]?.id || "";
    setEventId(nextEventId);
    const memberships = await loadMemberships(session);
    setEventRoles(memberships.events.filter((membership) => membership.event_id === nextEventId).map((membership) => membership.role));
    setEventAccess(memberships.events.filter((membership) => membership.event_id === nextEventId));
    setData(nextEventId ? await loadEventData(session, nextEventId) : { games: [], assignments: [], officials: [], checkIns: [], attendanceOverrides: [], assessments: [], coachAssignments: [], documents: [], provisionalAccess: [] });
  }

  function handleEventUpdated(updated: EventRecord) {
    setEvents((current) => current.map((item) => item.id === updated.id ? updated : item));
    setAllEvents((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  const refereeOfficial = data.officials.find((item) => item.linked_user_id === session.user.id || item.email?.toLowerCase() === session.user.email?.toLowerCase());
  const unreadPublicRatingCount = refereeOfficial ? data.assessments.filter((assessment) =>
    assessment.official_id === refereeOfficial.id
    && assessment.include_in_averages !== false
    && assessment.visibility === "public"
    && assessment.status === "shared"
    && !assessment.referee_seen_at
  ).length : 0;
  async function openView(nextView: View) {
    setView(nextView);
    void recordCurrentActivity(session).catch(() => undefined);
    if (nextView === "assessments" && event && unreadPublicRatingCount) {
      await markEventRatingsSeen(session, event.id).catch(() => undefined);
      setData((current) => ({ ...current, assessments: current.assessments.map((assessment) =>
        assessment.official_id === refereeOfficial?.id && assessment.include_in_averages !== false && assessment.visibility === "public" && assessment.status === "shared"
          ? { ...assessment, referee_seen_at: new Date().toISOString() }
          : assessment,
      ) }));
    }
  }
  const todayInEvent = event
    ? new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    : "";
  const refereeHasCurrentOrFutureAssignment = Boolean(refereeOfficial && data.assignments.some((assignment) => {
    if (assignment.official_id !== refereeOfficial.id) return false;
    const game = data.games.find((item) => item.id === assignment.game_id);
    if (!game || !event) return false;
    const gameDate = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at));
    return gameDate >= todayInEvent;
  }));
  const coachHasCurrentOrFutureAssignment = data.coachAssignments.some((assignment) => {
    if (assignment.coach_id !== session.user.id || !event) return false;
    if (assignment.full_schedule) return event.ends_on >= todayInEvent;
    const game = data.games.find((item) => item.id === assignment.game_id);
    if (!game) return false;
    const gameDate = new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(game.starts_at));
    return gameDate >= todayInEvent;
  });

  const nav: [View, string][] = isAdministrativeStaff
    ? [["dashboard", "Dashboard"], ...(eventFeatureEnabled(event, "check_in") ? [["checkin", "Check-In"] as [View, string]] : []), ["schedule", "Schedule"], ["officials", "Officials"], ...(eventFeatureEnabled(event, "coaching") ? [["coaching", "Coaching"] as [View, string]] : []), ...(eventFeatureEnabled(event, "ratings") ? [["assessments", "Ratings"] as [View, string]] : []), ["import", "Import"], ...(canConfigureEvent ? [["event_settings", "Event Settings"] as [View, string]] : []), ...(profile?.is_site_owner || organizationRoles.includes("organization_director") || organizationRoles.includes("organization_admin") ? [["activity", "Activity"] as [View, string]] : [])]
    : isSiteCoordinator
      ? [["dashboard", "Dashboard"], ...(eventFeatureEnabled(event, "check_in") ? [["checkin", "Check-In"] as [View, string]] : []), ["schedule", "Schedule"], ...(canAssess && eventFeatureEnabled(event, "ratings") ? [["assessments", "Ratings"] as [View, string]] : [])]
    : isCoach
      ? [["dashboard", "Dashboard"], ...(eventFeatureEnabled(event, "check_in") && coachHasCurrentOrFutureAssignment ? [["checkin", "Check-In"] as [View, string]] : []), ["schedule", "Schedule"], ...(eventFeatureEnabled(event, "ratings") ? [["assessments", "Ratings"] as [View, string]] : [])]
      : [["dashboard", "Dashboard"], ["board", "My Assignments"], ["checkin", "Check-In"], ["assessments", "My Evals"]];
  const dashboardRoleLabel = activeGroupRoles.map((role) => roleNames[role]).join(" · ") || "Referee";
  const contextViews: View[] = ["board", "checkin", "schedule", "officials", "coaching", "assessments", "import", "event_settings", "activity"];
  const showAdministrativeContext = !isPersonalWorkspace && contextViews.includes(view);

  if (loading) return <main className="auth-page"><p className="auth-loading">Loading Dashboard</p></main>;
  if (dashboardLoadError) return <AutomaticRecovery reason="dashboard" />;
  return <main>
    <header className="topbar">
      <button className="brand" aria-label="Law18Referee Management dashboard" onClick={() => void openView("dashboard")}><Mark /></button>
      <div className="topbar-account-actions">
        {profile?.is_site_owner && <span className="owner-version" aria-label={`Law18Ref version ${APP_VERSION}`}>v{APP_VERSION}</span>}
        <button className="help-button" aria-label="Open role help" title="Help and how-to" onClick={() => setHelpOpen(true)}>?</button>
        <button className="page-refresh-button" aria-label="Refresh page" title="Refresh page" onClick={refreshCurrentPage}>↻</button>
        <div className="notification-menu">
          <button className="notification-button" aria-label="Open notifications" aria-expanded={notificationsOpen} title="Notifications" onClick={() => void openNotifications()}>!{notifications.some((item) => !item.read_at) && <span className="nav-notification-badge">{notifications.filter((item) => !item.read_at).length}</span>}</button>
          {notificationsOpen && <div className="notification-popover"><header><strong>Notifications</strong></header>{notifications.map((item) => <article className={item.read_at ? "" : "unread"} key={item.id}><strong>{item.title}</strong><p>{item.message}</p><time>{new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time></article>)}{!notifications.length && <p className="notification-empty">No notifications.</p>}</div>}
        </div>
        <div className="account-menu">
          <button className="avatar account-avatar" aria-label="Open navigation and account menu" aria-expanded={accountOpen} aria-controls="account-navigation-tray" onClick={() => setAccountOpen((open) => !open)}>{initials(profile?.full_name || session.user.email || "RH")}</button>
          {accountOpen && <div className="account-tray-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setAccountOpen(false); }}><aside className="account-popover account-tray" id="account-navigation-tray" aria-label="Navigation and account menu">
            <header className="account-tray-header"><div className="account-identity"><strong>{profile?.full_name}</strong><span>{profile?.email}</span></div><button className="account-tray-close" aria-label="Close navigation menu" onClick={() => setAccountOpen(false)}>×</button></header>
            <div className="account-tray-scroll"><div className="account-roles">{[...allRoles].map((role) => <span key={role}>{roleNames[role]}</span>)}</div>
            <nav className="account-tray-navigation" aria-label="Main navigation">{nav.map(([id, label]) => <button key={id} className={view === id || (id === "schedule" && isStaff && view === "board") ? "active" : ""} onClick={() => { void openView(id); setAccountOpen(false); }}><span>{label}</span>{id === "assessments" && unreadPublicRatingCount > 0 && <b className="nav-notification-badge" aria-label={`${unreadPublicRatingCount} unread public ratings`}>{unreadPublicRatingCount > 99 ? "99+" : unreadPublicRatingCount}</b>}</button>)}</nav>
            <div className="account-tray-account-actions">
              <p>Account</p>
              <button onClick={() => { setView("my_assignments"); setAccountOpen(false); }}><span>☷</span><div><strong>My Assignments</strong><small>Unified personal schedule</small></div></button>
              <button onClick={() => { setView("account"); setAccountOpen(false); }}><span>⚙</span><div><strong>Account Settings</strong><small>Personal information</small></div></button>
              <button onClick={() => { setView("groups"); setAccountOpen(false); }}><span>♙</span><div><strong>Groups</strong><small>Group membership</small></div></button>
              {allRoles.has("site_owner") && <button onClick={() => { setView("appearance"); setAccountOpen(false); }}><span>◐</span><div><strong>Site Appearance</strong><small>Theme and schedule</small></div></button>}
              {allRoles.has("site_owner") && <button onClick={() => { setView("documentation"); setAccountOpen(false); }}><span aria-hidden="true">▤</span><div><strong>Documentation</strong><small>Overviews, updates, and user guides</small></div></button>}
              <button className="signout-menu" onClick={() => auth.signOut()}><span>↪</span><div><strong>Sign Out</strong></div></button>
            </div></div>
          </aside></div>}
        </div>
      </div>
    </header>
    {helpOpen && <div className="confirmation-backdrop help-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}><section className="confirmation-dialog role-help-dialog" role="dialog" aria-modal="true" aria-labelledby="role-help-title">
      <header><div><p className="eyebrow">HELP & HOW-TO</p><h2 id="role-help-title">How to Navigate Law18Ref</h2><p>Follow the directions below for your role in {organization?.name || "the active group"}.</p></div><button className="modal-close-button" aria-label="Close help" onClick={() => setHelpOpen(false)}>×</button></header>
      <p>To leave a group, open your initials menu → Groups → Membership Options. Enter your password and select Confirm and Leave Group. Your account and historical records are kept; the site owner and last group administrator cannot leave through this option.</p>
      <aside className="role-help-roles" aria-label="Active group roles">{activeGroupRoles.map((role) => <span className="role-badge" key={role}>{roleNames[role]}</span>)}</aside>
      <main className="role-help-content">{activeQuickGuides.length > 0 && <section className="role-quick-guides"><h3>Quick Guides</h3><p>Open or download guides for your active roles and the roles you oversee.</p><div>{activeQuickGuides.map((guide) => <a href={guide.href} target="_blank" rel="noreferrer" key={guide.href}><span><strong>{guide.title}</strong><small>{guide.description}</small></span><b>Open PDF ↗</b></a>)}</div></section>}{helpVisibleRoles.map((role) => <section key={role}><h3>{helpByRole[role].title}</h3><ol>{helpByRole[role].items.map((item) => <li key={item}>{item}</li>)}</ol></section>)}{!activeGroupRoles.length && <EmptyState>No active role is assigned in this group.</EmptyState>}</main>
      <footer className="role-help-actions"><button className="primary" onClick={() => setHelpOpen(false)}>Close Help</button></footer>
    </section></div>}
    <div className="personal-header-spacer" aria-hidden="true" />
    <div className="shell">
      {showAdministrativeContext && <section className="panel workspace-context-bar" aria-label="Administrative workspace context"><div className="workspace-context-heading">{organization?.logo_url ? <img className="event-organization-logo" src={organization.logo_url} alt="" /> : <span className="event-mark">{organization?.name[0] || "R"}</span>}<div><strong>Workspace</strong><small>Select the group and event for this tool.</small></div></div><label><span>Group</span><select value={organization?.id || ""} onChange={(change) => switchOrganization(change.target.value)} disabled={organizations.length < 2}>{organizations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Event</span><select value={eventId} onChange={(change) => switchEvent(change.target.value)} disabled={!events.length}><option value="">{events.length ? "Select Event" : "No Events Yet"}</option>{events.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{event && <span className="workspace-context-date">{formatDate(event.starts_on)}</span>}</section>}
      {organizationActionMessage && <p className="pilot-message organization-message">{organizationActionMessage}</p>}
      {qrCheckInMessage && <p className="pilot-message qr-checkin-message">{qrCheckInMessage}</p>}
      {profile && view === "dashboard" && (isPersonalWorkspace ? <PersonalDashboard session={session} profile={profile} organizations={organizations} onNavigate={setView} /> : <DashboardHome profile={profile} event={event} data={data} navigation={nav} roleLabel={dashboardRoleLabel} canManageCheckIns={isStaff && eventFeatureEnabled(event, "check_in")} onNavigate={setView} />)}
      {view === "board" && !isStaff && profile && <UnifiedAssignmentsView session={session} profile={profile} />}
      {view === "my_assignments" && profile && <UnifiedAssignmentsView session={session} profile={profile} />}
      {view === "checkin" && (isPersonalWorkspace ? <PersonalCheckInHub session={session} events={allEvents} /> : eventFeatureEnabled(event, "check_in") && event && (isStaff ? <CheckInView event={event} data={data} session={session} canManageCheckIns={isStaff} onRefresh={refreshCheckIns} onSelectOfficial={selectScheduleOfficial} /> : refereeHasCurrentOrFutureAssignment || coachHasCurrentOrFutureAssignment ? <RefereeCheckIn event={event} data={data} session={session} onCheckedIn={() => refresh(event.id)} /> : null))}
      {event && profile && (view === "schedule" || (isStaff && view === "board")) && (isStaff || isCoach) && <ScheduleView session={session} event={event} data={data} availableOfficials={organizationOfficials.length ? organizationOfficials : data.officials} canEdit={isAdministrativeStaff} canEditAssignments={canEditAssignments} canConfirmChanges={canConfigureEvent} canManageCheckIns={isStaff && eventFeatureEnabled(event, "check_in")} showScheduleChangeMarkers={isStaff} canRateCrew={canAssess} coachView={isCoach && !isAdministrativeStaff} siteSupervisorView={isSiteCoordinator && !isAdministrativeStaff} staffingViewsEnabled={isStaff} onRateCrew={(gameId) => { setRatingEditAssessmentId(null); setRatingModalGameId(gameId); }} onCreated={() => refresh(event.id)} onRefreshCheckIns={refreshCheckIns} profile={profile} ratingHistory={administrativeRatingHistory} showRatingAverages={isAdministrativeStaff} onSelectOfficial={selectScheduleOfficial} />}
      {isAdministrativeStaff && profile && organization && view === "officials" && <OfficialsDirectory session={session} profile={profile} organizationRoles={organizationRoles} eventRoles={eventRoles} canManageOrganizationRoles={Boolean(profile.is_site_owner || organizationRoles.includes("organization_director") || organizationRoles.includes("organization_admin"))} canManageOfficials={Boolean(profile.is_site_owner || organizationRoles.some((role) => ["organization_director", "organization_admin", "assignor"].includes(role)) || eventRoles.some((role) => ["event_admin", "assignor"].includes(role)))} organizationId={organization.id} officials={organizationOfficials} data={data} event={event} events={events} openOfficialId={officialToEditId} onOpenOfficialHandled={() => setOfficialToEditId(null)} onCreated={() => loadOrganizationOfficials(session, organization.id).then(setOrganizationOfficials)} />}
      {event && profile && view === "coaching" && isAdministrativeStaff && eventFeatureEnabled(event, "coaching") && <CoachWorkspace session={session} profile={profile} event={event} data={data} organizationOfficials={organizationOfficials} canManage onSaved={() => refresh(event.id)} />}
      {event && organization && view === "assessments" && eventFeatureEnabled(event, "ratings") && <AssessmentCenter session={session} event={event} events={events} organizationId={organization.id} data={data} canSubmit={canAssess} canConfigure={canConfigureRatings} canApprovePublic={canApprovePublicRatings} hideWorkspace={canAssess} onOpenRating={() => { setRatingEditAssessmentId(null); setRatingModalGameId(""); }} onEditRating={async (gameId, targetEventId, assessmentId) => { if (targetEventId !== event.id) await switchEvent(targetEventId); setRatingEditAssessmentId(assessmentId); setRatingModalGameId(gameId); }} onSaved={applySavedRatings} onEventUpdated={handleEventUpdated} />}
      {isAdministrativeStaff && organization && view === "import" && profile && <ImportView session={session} profile={profile} organizationId={organization.id} organization={organization} events={events} activeEvent={event} canCreateEvent={Boolean(profile.is_site_owner || organizationRoles.includes("organization_director") || organizationRoles.includes("organization_admin") || organizationRoles.includes("event_admin"))} canManageLifecycle={Boolean(profile.is_site_owner || organizationRoles.includes("organization_director") || organizationRoles.includes("organization_admin") || eventRoles.includes("event_admin"))} canConfigureAliases={canConfigureRatings} onEventsChanged={handleEventsChanged} onImported={handleImported} />}
      {event && organization && view === "event_settings" && canConfigureEvent && <><EventSettingsPanel session={session} organization={organization} event={event} events={events} onChanged={handleEventsChanged} /><EventLifecyclePanel session={session} event={event} onChanged={handleEventsChanged} /></>}
      {organization && view === "activity" && Boolean(profile?.is_site_owner || organizationRoles.includes("organization_director") || organizationRoles.includes("organization_admin")) && <OrganizationActivity session={session} organization={organization} events={events} onEventsChanged={handleEventsChanged} />}
      {profile && view === "account" && <AccountSettings session={session} profile={profile} onUpdated={setProfile} />}
      {view === "groups" && (allRoles.has("site_owner")
        ? <SiteGroupsAdmin session={session} ownerEmail={profile?.primary_email || profile?.email || session.user.email || ""} onOpen={(organizationId) => switchOrganization(organizationId, "dashboard")} onUpdated={(updated) => { setOrganizations((current) => current.map((item) => item.id === updated.id ? updated : item)); if (organization?.id === updated.id) setOrganization(updated); }} />
        : <GroupsSettings session={session} organization={organization} canManage={organizationRoles.includes("organization_director") || organizationRoles.includes("organization_admin")} onUpdated={(updated) => { setOrganization(updated); setOrganizations((current) => current.map((item) => item.id === updated.id ? updated : item)); }} />)}
      {view === "appearance" && allRoles.has("site_owner") && <AppearanceSettings session={session} />}
      {view === "documentation" && allRoles.has("site_owner") && <Documentation session={session} />}
    </div>
    {event && scheduleOfficialId && (() => { const official = data.officials.find((item) => item.id === scheduleOfficialId) || organizationOfficials.find((item) => item.id === scheduleOfficialId); return official ? <OfficialEventScheduleModal session={session} official={official} event={event} data={data} initialDate={scheduleOfficialDate || undefined} canEdit={isAdministrativeStaff} siteSupervisorView={isSiteCoordinator && !isAdministrativeStaff} onClose={() => { setScheduleOfficialId(null); setScheduleOfficialDate(null); }} onEdit={() => { setScheduleOfficialId(null); setScheduleOfficialDate(null); setOfficialToEditId(official.id); setView("officials"); }} /> : null; })()}
    {event && organization && ratingModalGameId !== null && <AssessmentCenter session={session} event={event} events={events} organizationId={organization.id} data={data} canSubmit={canAssess} canConfigure={false} canApprovePublic={false} initialGameId={ratingModalGameId || undefined} initialAssessmentId={ratingEditAssessmentId || undefined} modal onClose={() => { setRatingModalGameId(null); setRatingEditAssessmentId(null); }} onSaved={applySavedRatings} onEventUpdated={handleEventUpdated} />}
      <footer><div className="brand footer-brand"><Mark /></div><div className="footer-legal"><span>© 2026 Law18Ref · Version {APP_VERSION}</span><small>by Falksport91 LLC</small></div></footer>
  </main>;
}

export default function Home() {
  const [externalCheckInRequest] = useState(() => {
    if (typeof window === "undefined") return null;
    const parameters = new URLSearchParams(window.location.search);
    const eventSlug = parameters.get("event");
    const eventDate = parameters.get("date");
    const externalRequested = parameters.get("external") === "1" || parameters.get("guest") === "1";
    return externalRequested && eventSlug && eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? { eventSlug, eventDate } : null;
  });
  const [session, setSession] = useState<Law18Session | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");
  const [reloadRequired, setReloadRequired] = useState(false);
  const handleSession = useCallback((nextSession: Law18Session) => {
    setRecovery(false);
    setAuthMessage("");
    setSession(nextSession);
  }, []);
  const handleSessionExpired = useCallback(() => {
    auth.signOut();
    setAuthMessage("");
    setReloadRequired(true);
  }, []);
  useEffect(() => {
    const initial = auth.initialize();
    // Authentication is stored outside React and hydrated once on startup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(initial.recovery ? null : initial.session);
    setRecovery(initial.recovery);
    setLoading(false);
    return auth.subscribe(setSession);
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let replacingPage = false;
    const reloadForVersion = (version: string) => {
      if (replacingPage || sessionStorage.getItem("law18ref-version-reload") === version) return;
      replacingPage = true;
      sessionStorage.setItem("law18ref-version-reload", version);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("app-version", version);
      window.location.replace(nextUrl.toString());
    };
    const checkForLatestVersion = async () => {
      try {
        const response = await fetch(`/version.json?check=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const latest = await response.json() as { version?: string };
        if (latest.version && latest.version !== APP_VERSION) {
          const registration = await navigator.serviceWorker.getRegistration();
          await registration?.update();
          reloadForVersion(latest.version);
        } else if (latest.version === APP_VERSION) {
          sessionStorage.removeItem("law18ref-version-reload");
          const currentUrl = new URL(window.location.href);
          if (currentUrl.searchParams.has("app-version")) {
            currentUrl.searchParams.delete("app-version");
            window.history.replaceState({}, "", currentUrl.toString());
          }
        }
      } catch {
        // Offline users keep the installed version until connectivity returns.
      }
    };
    const controllerChanged = () => {
      if (replacingPage) return;
      replacingPage = true;
      window.location.reload();
    };
    const becameVisible = () => { if (document.visibilityState === "visible") void checkForLatestVersion(); };
    navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update()).then(checkForLatestVersion).catch(() => undefined);
    window.addEventListener("focus", checkForLatestVersion);
    document.addEventListener("visibilitychange", becameVisible);
    const periodicCheck = window.setInterval(checkForLatestVersion, 5 * 60 * 1000);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
      window.removeEventListener("focus", checkForLatestVersion);
      document.removeEventListener("visibilitychange", becameVisible);
      window.clearInterval(periodicCheck);
    };
  }, []);
  if (externalCheckInRequest) return <ExternalCheckInPage eventSlug={externalCheckInRequest.eventSlug} eventDate={externalCheckInRequest.eventDate} onExit={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }} />;
  if (loading) return <main className="auth-page"><p className="auth-loading">Loading Dashboard</p></main>;
  if (reloadRequired) return <AutomaticRecovery reason="session" />;
  if (!session || recovery) return <AuthPanel onSession={handleSession} recovery={recovery} initialMessage={authMessage} />;
  return <Dashboard session={session} onSessionExpired={handleSessionExpired} />;
}
