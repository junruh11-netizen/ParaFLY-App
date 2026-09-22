import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanCode,
  cleanNickname,
  csvCell,
  currentParagraph,
  phases,
  publicRoom,
  selectTwoTwoTwo,
  studentAlias,
} from "../lib.js";

test("join codes are normalized", () =>
  assert.equal(cleanCode("ab-12 cd"), "AB12CD"));
test("nicknames are trimmed and compacted", () =>
  assert.equal(cleanNickname("  Blue   Hawk  "), "Blue Hawk"));
test("automatic aliases are unique for a 40-student class", () => {
  const aliases = Array.from({ length: 40 }, (_, i) => studentAlias(i));
  assert.equal(new Set(aliases).size, 40);
  assert.ok(aliases.every((x) => /^[A-Z][a-z]+ [A-Z][a-z]+(?: \d+)?$/.test(x)));
});
test("only current paragraph is selected", () =>
  assert.equal(
    currentParagraph({ current_round: 1, paragraphs: ["hidden", "shown"] }),
    "shown",
  ));
test("legacy rooms default to class vote feedback", () =>
  assert.equal(publicRoom({ paragraphs: [] }).feedbackMode, "class_vote"));
test("legacy rooms receive safe identity, timer, voting, and score defaults", () => {
  const room = publicRoom({ paragraphs: [] });
  assert.equal(room.identityMode, "names");
  assert.equal(room.hideIdentities, false);
  assert.equal(room.timerRunning, false);
  assert.equal(room.voteExpected, 0);
  assert.equal(room.voteClosed, false);
  assert.deepEqual(room.scoresReleasedRounds, []);
  assert.equal(room.summaryScoresReleased, false);
});
test("teacher pick feedback is exposed to clients", () =>
  assert.equal(
    publicRoom({ paragraphs: [], feedback_mode: "teacher_pick" }).feedbackMode,
    "teacher_pick",
  ));
test("final summary is a first-class activity phase", () =>
  assert.ok(phases.includes("summary")));
test("sharing is a first-class activity phase", () =>
  assert.ok(phases.includes("sharing")));
test("2+2+2 requires six scored responses", () =>
  assert.deepEqual(selectTwoTwoTwo([{ id: 1, score: 5 }]), []));
test("2+2+2 returns two low, two middle, and two high without duplicates", () => {
  const selected = selectTwoTwoTwo(
    Array.from({ length: 10 }, (_, i) => ({ id: i + 1, score: i + 1 })),
    () => 0.5,
  );
  assert.equal(selected.length, 6);
  assert.equal(new Set(selected).size, 6);
  assert.deepEqual(selected.slice(0, 2), [1, 2]);
  assert.deepEqual(selected.slice(-2), [9, 10]);
});
test("AI fact checking stays off unless a room enables it", () => {
  assert.equal(publicRoom({ paragraphs: [] }).aiFactCheck, false);
  assert.equal(
    publicRoom({ paragraphs: [], ai_fact_check: true }).aiFactCheck,
    true,
  );
});
test("CSV cells neutralize spreadsheet formulas", () => {
  assert.equal(
    csvCell('=HYPERLINK("https://bad.invalid")'),
    '"\'=HYPERLINK(""https://bad.invalid"")"',
  );
  assert.equal(csvCell("  +1+1"), '"\'  +1+1"');
  assert.equal(csvCell("ordinary text"), '"ordinary text"');
});
