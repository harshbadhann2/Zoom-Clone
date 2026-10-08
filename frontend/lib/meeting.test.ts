// Run with: npm test  (uses Node's built-in test runner, no extra packages)
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDayLabel, formatDuration, formatMeetingCode, initials, parseMeetingInput } from "./meeting.ts";

test("parseMeetingInput accepts IDs with spaces or dashes", () => {
  assert.equal(parseMeetingInput("6148385880"), "6148385880");
  assert.equal(parseMeetingInput(" 614 838 5880 "), "6148385880");
  assert.equal(parseMeetingInput("614-838-5880"), "6148385880");
});

test("parseMeetingInput extracts the ID from an invite link", () => {
  assert.equal(parseMeetingInput("https://zoom-clone.app/join/6148385880"), "6148385880");
  assert.equal(parseMeetingInput("http://localhost:3000/join/6148385880?x=1"), "6148385880");
});

test("parseMeetingInput rejects malformed input", () => {
  assert.equal(parseMeetingInput(""), null);
  assert.equal(parseMeetingInput("12345"), null);
  assert.equal(parseMeetingInput("abcdefghij"), null);
  assert.equal(parseMeetingInput("https://zoom-clone.app/join/not-a-code"), null);
  assert.equal(parseMeetingInput("https://zoom-clone.app/meeting"), null);
});

test("formatting helpers", () => {
  assert.equal(formatMeetingCode("6148385880"), "614 838 5880");
  assert.equal(initials("Harsh Badhan"), "HB");
  assert.equal(initials("priya"), "PR");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(90), "1 hr 30 min");
  assert.equal(formatDuration(120), "2 hr");
});

test("formatDayLabel uses relative words for nearby days", () => {
  const now = new Date(2026, 9, 8, 22, 0);
  assert.equal(formatDayLabel(new Date(2026, 9, 8, 23, 30), now), "Today");
  assert.equal(formatDayLabel(new Date(2026, 9, 9, 0, 30), now), "Tomorrow");
  assert.equal(formatDayLabel(new Date(2026, 9, 7, 9, 0), now), "Yesterday");
});
