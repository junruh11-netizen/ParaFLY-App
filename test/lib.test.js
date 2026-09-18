import test from "node:test";
import assert from "node:assert/strict";
import { cleanCode, cleanNickname, currentParagraph, publicRoom } from "../lib.js";

test("join codes are normalized", () => assert.equal(cleanCode("ab-12 cd"), "AB12CD"));
test("nicknames are trimmed and compacted", () => assert.equal(cleanNickname("  Blue   Hawk  "), "Blue Hawk"));
test("only current paragraph is selected", () => assert.equal(currentParagraph({ current_round: 1, paragraphs: ["hidden", "shown"] }), "shown"));
test("legacy rooms default to class vote feedback", () => assert.equal(publicRoom({ paragraphs: [] }).feedbackMode, "class_vote"));
test("teacher pick feedback is exposed to clients", () => assert.equal(publicRoom({ paragraphs: [], feedback_mode: "teacher_pick" }).feedbackMode, "teacher_pick"));
