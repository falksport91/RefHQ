import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPostEventSummarySheets } from "../app/post-event-export.ts";

const event = {
  id: "event-1", organization_id: "group-1", name: "Summer Cup", venue_name: "Sports Complex", starts_on: "2026-08-22", ends_on: "2026-08-23", timezone: "America/New_York",
};
const officials = [
  { id: "ref-1", organization_id: "group-1", full_name: "Alex Center", email: "alex@example.com", secondary_email: null, phone: "5551112222", date_of_birth: "1990-01-01", badge_level: "Regional", ussf_id: "100", linked_user_id: "user-ref", pending_org_roles: ["referee"] },
  { id: "ar-1", organization_id: "group-1", full_name: "Bailey Assistant", email: "bailey@example.com", linked_user_id: "user-ar", pending_org_roles: ["referee"] },
  { id: "coach-1", organization_id: "group-1", full_name: "Chris Coach", email: "coach@example.com", linked_user_id: "user-coach", pending_org_roles: ["referee_coach"] },
];
const games = [
  { id: "game-1", event_id: "event-1", external_id: "1", starts_at: "2026-08-22T12:00:00.000Z", field_name: "Field 1", home_team: "Blue", away_team: "Red", division: "U14", venue_name: "Sports Complex", age_group: "U14", gender: "Girls", game_type: "Group", operational: false },
  { id: "game-2", event_id: "event-1", external_id: "2", starts_at: "2026-08-23T13:00:00.000Z", field_name: "Field 2", home_team: "Green", away_team: "Gold", division: "U15", venue_name: "Sports Complex", age_group: "U15", gender: "Boys", game_type: "Final", operational: false },
];
const assignments = [
  { id: "assignment-1", game_id: "game-1", official_id: "ref-1", position: "referee", position_title: "Referee", source_position_title: "Referee", crew_order: 1 },
  { id: "assignment-2", game_id: "game-1", official_id: "ar-1", position: "assistant_referee", position_title: "AR1", source_position_title: "AR1", crew_order: 2 },
  { id: "assignment-3", game_id: "game-2", official_id: "ref-1", position: "referee", position_title: "Referee", source_position_title: "Referee", crew_order: 1 },
];
const assessments = [
  { id: "rating-1", game_id: "game-1", official_id: "ref-1", coach_id: "user-coach", visibility: "private", status: "submitted", evaluation_type: "basic_eval", include_in_averages: true, overall_rating: 4, positioning: null, decision_making: null, communication: null, match_control: null, strengths: "Control", development_focus: "Movement", additional_comments: "Good", coach_notes: "Private", submitted_at: "2026-08-22T15:00:00Z", rated_position: "referee", rated_position_title: "Referee" },
  { id: "rating-2", game_id: "game-1", official_id: "ar-1", coach_id: "user-coach", visibility: "private", status: "submitted", evaluation_type: "basic_eval", include_in_averages: true, overall_rating: 3, positioning: null, decision_making: null, communication: null, match_control: null, strengths: "Signals", development_focus: "Movement", additional_comments: "Good", coach_notes: "Private", submitted_at: "2026-08-22T15:00:00Z", rated_position: "assistant_referee", rated_position_title: "AR1" },
];

test("post-event workbook contains one schedule worksheet per event date", () => {
  const sheets = buildPostEventSummarySheets(event, {
    games, assignments, officials,
    assessments,
    coachAssignments: [{ id: "coach-access", event_id: "event-1", game_id: "game-1", coach_id: "user-coach", coach_official_id: "coach-1", official_id: null, scope_date: null, venue_name: null, field_name: null, full_schedule: false }],
    checkIns: [{ id: "checkin-1", event_id: "event-1", official_id: "ref-1", checked_in_at: "2026-08-22T11:30:00Z", status: "checked_in", method: "guest_qr", event_date: "2026-08-22" }],
    attendanceOverrides: [],
  });
  assert.deepEqual(sheets.map((sheet) => sheet.name), ["Event Summary", "Schedule 2026-08-22", "Schedule 2026-08-23", "Ratings - Full Games", "Ratings - Individual", "Officials", "Check-Ins"]);
  assert.deepEqual(sheets[0].rows[4].slice(1), [1, 1, 3, 3.5, 2]);
  assert.deepEqual(sheets[0].rows[5].slice(1), [1, 1, 1, null, 0]);
  assert.ok(sheets[1].rows[3].includes("Alex Center"));
  assert.ok(sheets[1].rows[3].includes("Bailey Assistant"));
  assert.ok(sheets[2].rows[3].includes("Green"));
  assert.ok(!sheets[2].rows.flat().includes("Bailey Assistant"));
  assert.deepEqual(sheets[3].rows[2], ["All Positions", 2, 3.5]);
  assert.deepEqual(sheets[4].rows[3], ["Referee", 1, 4]);
  assert.equal(sheets[5].rows.find((row) => row[0] === "Alex Center")?.[10], 1);
  assert.equal(sheets[5].rows.find((row) => row[0] === "Alex Center")?.[11], 4);
  assert.match(String(sheets[6].rows.find((row) => row[1] === "Alex Center")?.[6]), /External Check-In/);
  assert.equal(sheets[6].rows.find((row) => row[1] === "Bailey Assistant")?.[4], "Not Checked In");
});

test("authorized schedule users can download the v0.38.1 post-event workbook", async () => {
  const [page, packageJson] = await Promise.all([readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../package.json", import.meta.url), "utf8")]);
  assert.match(page, /await import\("\.\/post-event-export"\)/);
  assert.match(page, /Post-Event Summary/);
  assert.match(page, /canEdit && <button className="secondary" disabled=\{postEventExportBusy\}/);
  assert.match(page, /const APP_VERSION = "0\.44\.2"/);
  assert.equal(JSON.parse(packageJson).version, "0.44.2");
});
