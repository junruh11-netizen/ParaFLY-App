import test from "node:test";
import assert from "node:assert/strict";
import { cleanCode, cleanNickname, currentParagraph } from "../lib.js";

test("join codes are normalized", () => assert.equal(cleanCode("ab-12 cd"), "AB12CD"));
test("nicknames are trimmed and compacted", () => assert.equal(cleanNickname("  Blue   Hawk  "), "Blue Hawk"));
test("only current paragraph is selected", () => assert.equal(currentParagraph({ current_round: 1, paragraphs: ["hidden", "shown"] }), "shown"));
