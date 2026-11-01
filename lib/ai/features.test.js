import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AI_FEATURES, DEFAULT_FEATURES, DEFAULT_LIMITS, NON_FEATURE_USAGE, featureAvailability, isFeatureKey } from "./features.js";

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

// The jsonb default the newest migration gives ai_settings.<column>: the ai_providers create or a later `alter column`.
function sqlDefault(column) {
  const pattern = new RegExp(`(?:${column}\\s+jsonb not null default|alter column ${column} set default)\\s+'([^']+)'::jsonb`, "g");
  let latest = null;
  for (const file of readdirSync(migrations).filter((name) => /^\d{14}_[\w-]+\.sql$/.test(name)).sort()) {
    const up = readFileSync(migrations + file, "utf8").split(/^-- @down/m)[0];
    if (!up.includes("comms.ai_settings")) continue;
    for (const match of up.matchAll(pattern)) latest = match[1];
  }
  return JSON.parse(latest);
}

test("every switch key has a usage label, distinct from every other usage value", () => {
  const usages = Object.values(AI_FEATURES).map((f) => f.usage);
  for (const [key, feature] of Object.entries(AI_FEATURES)) {
    assert.match(feature.usage, /^[a-z_]+$/, key);
    assert.ok(feature.label, key);
  }
  assert.equal(new Set([...usages, ...NON_FEATURE_USAGE]).size, usages.length + NON_FEATURE_USAGE.length);
  assert.equal(isFeatureKey("articleAssist"), true);
  assert.equal(isFeatureKey("article_assist"), false);
  assert.equal(isFeatureKey("constructor"), false);
});

test("the §4 defaults use only known keys and match the migrations", () => {
  assert.deepEqual(Object.keys(DEFAULT_FEATURES), Object.keys(AI_FEATURES));
  assert.deepEqual(Object.keys(DEFAULT_LIMITS), [...Object.keys(AI_FEATURES), "perUserPerMinute"]);
  assert.deepEqual(sqlDefault("features"), DEFAULT_FEATURES);
  assert.deepEqual(sqlDefault("limits"), DEFAULT_LIMITS);
  // Answers in the Messenger can only be switched on with a limit above 0.
  assert.equal(DEFAULT_FEATURES.messengerAnswers, false);
  assert.equal(DEFAULT_LIMITS.messengerAnswers, 0);
});

test("feature availability follows chatModelFor's refusal order", () => {
  const ready = {
    chat: { available: true, reason: null },
    features: { ...DEFAULT_FEATURES },
    limits: { ...DEFAULT_LIMITS },
    usageToday: { articleAssist: 3 },
  };
  assert.deepEqual(featureAvailability(ready, "articleAssist"), { available: true, reason: null });
  assert.equal(featureAvailability(null, "articleAssist").reason, "unknown");
  assert.equal(featureAvailability({ ...ready, chat: { available: false, reason: "not_configured" } }, "articleAssist").reason, "not_configured");
  assert.equal(featureAvailability({ ...ready, chat: { available: false, reason: "no_default" }, features: {} }, "articleAssist").reason, "no_default");
  assert.equal(featureAvailability({ ...ready, chat: { available: false, reason: "consent_required" }, features: {} }, "articleAssist").reason, "feature_disabled");
  assert.equal(featureAvailability({ ...ready, chat: { available: false, reason: "consent_required" } }, "articleAssist").reason, "consent_required");
  assert.equal(featureAvailability({ ...ready, chat: { available: false, reason: "provider_error" } }, "translation").reason, "provider_error");
  assert.equal(featureAvailability(ready, "messengerAnswers").reason, "feature_disabled");
  assert.equal(featureAvailability({ ...ready, limits: { ...DEFAULT_LIMITS, translation: 0 } }, "translation").reason, "feature_disabled");
  assert.equal(featureAvailability({ ...ready, usageToday: { gapClustering: 40 } }, "gapClustering").reason, "quota_exceeded");
});
