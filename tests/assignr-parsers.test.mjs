import assert from "node:assert/strict";
import test from "node:test";
import { createOfficialsExportCsv, isOperationalGame, normalizePosition, parseAssignrCsv, parseAssignrOfficialsCsv, parseGotSportWorksheet, positionAliasKey, zonedLocalDateTimeToIso } from "../app/supabase-client.ts";

test("parses an actual Assignr games export layout", () => {
  const csv = [
    "Game ID,Date,Start Time,Venue,Sub-Venue,Age Group,League,Home Team,Away Team,Assignr Database ID,Position 1,Official 1,Position 2,Official 2",
    '1049552,2026-06-30,8:00 AM,Morningside Farm,Field #11,U14,ECNL RL Girls,East Meadow,FC DELCO,27781620,Referee,"Chamberlain, Jessica",Asst. Referee,"Moreth, Maximilian"',
  ].join("\n");
  const rows = parseAssignrCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].external_id, "27781620");
  assert.equal(rows[0].start_time, "08:00:00");
  assert.equal(rows[0].official_name, "Jessica Chamberlain");
  assert.equal(rows[1].position, "Asst. Referee");
  assert.equal(rows[0].official_email, null);
  assert.equal(rows[0].age_group, "U14");
});

test("parses the row-per-official Assignr assignments export layout", () => {
  const csv = [
    "Game ID,Date,Start Time,Venue,Sub-Venue,Age Group,League,Gender,Game Type,Home Team,Away Team,Position,Official,Email Address,Mobile Phone,Assignr Database ID",
    '1111212,2026-08-21,8:00 AM,Morningside Farm,Field #11,U13,ECNL RL Girls,Girls,Regional League,Home FC,Away FC,Referee,"Damas, Harold",harold@example.com,9739023240,27961499',
    '1111212,2026-08-21,8:00 AM,Morningside Farm,Field #11,U13,ECNL RL Girls,Girls,Regional League,Home FC,Away FC,Asst. Referee,"Briones, Mathew",mathew@example.com,,27961499',
    '1111212,2026-08-21,8:00 AM,Morningside Farm,Field #11,U13,ECNL RL Girls,Girls,Regional League,Home FC,Away FC,Asst. Referee,"Candido, Sebastian",sebastian@example.com,,27961499',
  ].join("\n");
  const rows = parseAssignrCsv(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual([...new Set(rows.map((row) => row.external_id))], ["27961499"]);
  assert.equal(rows[0].official_name, "Harold Damas");
  assert.equal(rows[1].position, "Asst. Referee");
  assert.equal(rows[2].official_email, "sebastian@example.com");
  assert.equal(rows[0].official_phone, "(973) 902-3240");
});

test("retains an unstaffed game from an Assignr assignments export", () => {
  const csv = [
    "Game ID,Date,Start Time,Venue,Sub-Venue,Home Team,Away Team,Position,Official,Assignr Database ID",
    "open-1,2026-08-22,10:00 AM,Main Complex,Field 2,Home FC,Away FC,Referee,,game-db-1",
  ].join("\n");
  const rows = parseAssignrCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].external_id, "game-db-1");
  assert.equal(rows[0].official_name, "");
});

test("parses a GotSport Assignor Matches worksheet with ordered crew columns", () => {
  const sheet = parseGotSportWorksheet("Challenge Cup", [
    ["Event", "Match Number", "Division", "Date", "Start Time", "Venue", "Home Club", "Home Team", "Visiting Club", "Away Team", "Referee", "Asst Referee 1", "Asst Referee 2", "4th Official"],
    ["NJYS Challenge Cup Fall 2026", 349, "11U Boys", new Date("2026-09-18T00:00:00.000Z"), "06:00 PM", "Count Basie: Count Basie Field", "Red Bank FC", "Riptides", "Point Pleasant", "Kilauea", "Ref, Riley", "One, Avery", "Two, Alex", "Fourth, Finley"],
  ]);
  assert.equal(sheet.event_name, "NJYS Challenge Cup Fall 2026");
  assert.equal(sheet.rows.length, 4);
  assert.equal(sheet.rows[0].external_id, "gotsport:njys-challenge-cup-fall-2026:349");
  assert.equal(sheet.rows[0].date, "2026-09-18");
  assert.equal(sheet.rows[0].start_time, "18:00:00");
  assert.equal(sheet.rows[0].venue, "Count Basie");
  assert.equal(sheet.rows[0].field, "Count Basie Field");
  assert.equal(sheet.rows[0].age_group, "11U");
  assert.equal(sheet.rows[0].gender, "Boys");
  assert.deepEqual(sheet.rows.map((row) => row.position), ["Referee", "AR1", "AR2", "4th Official"]);
  assert.deepEqual(sheet.rows.map((row) => row.official_name), ["Riley Ref", "Avery One", "Alex Two", "Finley Fourth"]);
});

test("retains a GotSport game with blank assignment columns", () => {
  const sheet = parseGotSportWorksheet("Presidents Cup", [
    ["Event", "Match Number", "Division", "Date", "Start Time", "Venue", "Home Team", "Away Team", "Referee", "Asst Referee 1", "Asst Referee 2", "4th Official"],
    ["NJYS Presidents Cup", 114, "11U Girls", "09/18/2026", "7:45 PM", "Sid Fay: Field 1", "Home", "Away", "", "", "", ""],
  ]);
  assert.equal(sheet.rows.length, 1);
  assert.equal(sheet.rows[0].official_name, "");
  assert.equal(sheet.rows[0].position, "");
});

test("preserves Assignr assignment role categories", () => {
  assert.equal(normalizePosition("Referee"), "referee");
  assert.equal(normalizePosition("Asst. Referee"), "assistant_referee");
  assert.equal(normalizePosition("4th Official"), "fourth_official");
  assert.equal(normalizePosition("Ref Coord"), "referee_coach");
  assert.equal(normalizePosition("Referee Coach"), "referee_coach");
  assert.equal(normalizePosition("Site Coord"), "site_coordinator");
  assert.equal(normalizePosition("Site Supervisor"), "site_supervisor");
  assert.equal(normalizePosition("Standby"), "standby");
});

test("matches position aliases without case or spacing differences", () => {
  assert.equal(positionAliasKey("  Asst.   Referee "), "asst. referee");
});

test("classifies non-match operational records", () => {
  assert.equal(isOperationalGame({ field: "REF HQ PDA RC", home_team: "Ref Coach", away_team: "Ref Coach", game_type: "Ref Coach" }), true);
  assert.equal(isOperationalGame({ field: "Field 3", home_team: "Home FC", away_team: "Away FC", game_type: "League" }), false);
});

test("interprets imported wall times in the event timezone", () => {
  assert.equal(zonedLocalDateTimeToIso("2026-06-30", "08:00:00", "America/New_York"), "2026-06-30T12:00:00.000Z");
  assert.equal(zonedLocalDateTimeToIso("2026-01-30", "08:00:00", "America/New_York"), "2026-01-30T13:00:00.000Z");
});

test("parses an actual Assignr users export layout", () => {
  const csv = [
    "Last Name,First Name,Grade/Badge Level,Mobile Phone,Primary Email,Secondary Email,Is an Official?,USSF Referee Certification,Assignr Database ID",
    "Official,Olivia,Regional,(555) 555-0100,olivia@example.com,guardian@example.com,YES,Referee,2171650",
  ].join("\n");
  const rows = parseAssignrOfficialsCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].full_name, "Olivia Official");
  assert.equal(rows[0].first_name, "Olivia");
  assert.equal(rows[0].last_name, "Official");
  assert.equal(rows[0].primary_email, "olivia@example.com");
  assert.equal(rows[0].source_official_id, "2171650");
});

test("accepts Assignor Database ID as an officials identifier header alias", () => {
  const csv = [
    "Last Name,First Name,Primary Email,Assignor Database ID",
    "Abajyan,Souren,abajyan73@example.com,souren abajyan",
  ].join("\n");
  const rows = parseAssignrOfficialsCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].full_name, "Souren Abajyan");
  assert.equal(rows[0].source_official_id, "souren abajyan");
});

test("round trips exported Law18Ref official details with stable record IDs", () => {
  const csv = createOfficialsExportCsv([{
    id: "official-123",
    organization_id: "group-1",
    full_name: "Alex Example",
    email: null,
    secondary_email: "guardian@example.com",
    phone: "555-0100",
    date_of_birth: "2010-05-01",
    badge_level: "Grassroots",
    ussf_id: "USSF-42",
    external_check_in_other: "CHECK-42",
    source_official_id: "assignr-9",
    identity_status: "provisional",
    pending_org_roles: ["referee"],
  }]);
  const rows = parseAssignrOfficialsCsv(csv.replace(",,guardian@example.com", ",alex@example.com,guardian@example.com"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].law18ref_official_id, "official-123");
  assert.equal(rows[0].first_name, "Alex");
  assert.equal(rows[0].last_name, "Example");
  assert.equal(rows[0].primary_email, "alex@example.com");
  assert.equal(rows[0].source_official_id, "assignr-9");
  assert.equal(rows[0].date_of_birth, "2010-05-01");
});
