import test from "node:test";
import assert from "node:assert/strict";
import { clusterByKeywords, jaccard, rankTopic, tokenize } from "./gap_cluster.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-21T12:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();

test("tokenize drops stop words, short tokens and redaction tokens, and stems", () => {
  assert.deepEqual(tokenize("How do I reset my passwords?? Email [email]"), ["reset", "password", "email"]);
  assert.deepEqual(tokenize("Exporting invoices"), ["export", "invoice"]);
  assert.deepEqual(tokenize("invoice boxes"), ["invoice", "box"]);
  assert.deepEqual(tokenize("hi!!"), []);
});

test("jaccard", () => {
  assert.equal(jaccard(["a", "b"], ["a", "b"]), 1);
  assert.equal(jaccard(["a", "b", "c"], ["a", "b", "d"]), 0.5);
  assert.equal(jaccard([], []), 0);
});

test("clusterByKeywords groups shared signatures and labels by the most frequent question", () => {
  const signals = [
    { id: "1", question: "How do I reset two-factor authentication?" },
    { id: "2", question: "How do I reset two-factor authentication?" },
    { id: "3", question: "reset two factor authentication on new phone" },
    { id: "4", question: "Where can I download invoices?" },
    { id: "5", question: "???" },
  ];
  const out = clusterByKeywords(signals);
  assert.deepEqual(out.unclusterable, ["5"]);
  const keyOf = (id) => out.assignments.find((a) => a.signalId === id).newTopicKey;
  assert.equal(keyOf("1"), keyOf("2"));
  assert.notEqual(keyOf("1"), keyOf("4"));
  const twoFactor = out.newTopics.find((t) => t.key === keyOf("1"));
  assert.equal(twoFactor.label, "How do I reset two-factor authentication?");
  assert.ok(twoFactor.sampleQuestions.length <= 5);
});

test("clusterByKeywords merges into an existing topic at Jaccard >= 0.5", () => {
  const signals = [{ id: "a", question: "download invoice pdf" }];
  const out = clusterByKeywords(signals, [{ id: "t1", keywords: ["download", "invoice", "pdf"] }]);
  assert.deepEqual(out.assignments, [{ signalId: "a", topicId: "t1", newTopicKey: null }]);
  assert.deepEqual(out.newTopics, []);
});

test("labels are cut to 60 characters", () => {
  const long = "When I try to connect my company calendar the integration keeps failing every single time";
  const out = clusterByKeywords([{ id: "x", question: long }]);
  assert.ok(out.newTopics[0].label.length <= 60);
  assert.ok(out.newTopics[0].label.endsWith("…"));
});

test("rankTopic: impact weights volume and span; trend compares two 14-day windows", () => {
  const signals = [
    { occurredAt: ago(1), conversationId: "c1" },
    { occurredAt: ago(2), conversationId: "c2" },
    { occurredAt: ago(3), conversationId: "c3" },
    { occurredAt: ago(20), conversationId: "c4" },
    { occurredAt: ago(60), conversationId: "c5" },
  ];
  const rank = rankTopic(signals, NOW);
  assert.equal(rank.volume30d, 4);
  assert.equal(rank.volume90d, 5);
  assert.equal(rank.activeDays30, 4);
  assert.equal(rank.impact, Math.round(4 + 0.5 * 1 + 0.25 * 4));
  assert.equal(rank.trend, "up");
  assert.equal(rank.trendPct, 200);
  assert.equal(rankTopic([], NOW).trend, "flat");
});
