// Knowledge-gap clustering and ranking (KB spec §11.3, §11.4). The keyword path is the deterministic fallback the
// LLM path falls back to: normalise each question, sign it with its three most distinctive tokens, group equal
// signatures, then merge into an existing gap topic (or an earlier new group) at Jaccard >= 0.5.

const STOP_WORDS = new Set(
  [
    // English
    "a an and are as at be been but by can could did do does doing for from get got had has have having how i if in",
    "into is it its just me my need not of on or our please so some that the their them then there these they this",
    "to too us was we were what when where which who why will with would you your yours hello hi hey thanks thank",
    "able also any anyone about after again all am because before cant cannot dont im ive still want",
    // French, German, Spanish, Portuguese (minimal)
    "le la les un une des et est pas pour que qui dans sur avec je vous nous",
    "der die das und ist nicht ich sie wir mit auf ein eine für wie",
    "el los las una por para con como que es en mi tu yo",
    "o os as um uma para com como que não eu você é",
  ]
    .join(" ")
    .split(/\s+/),
);

export const MERGE_JACCARD = 0.5;
const SIGNATURE_SIZE = 3;
const LABEL_LENGTH = 60;
const SAMPLE_SIZE = 5;
const DAY_MS = 86_400_000;

function stem(token) {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  // "boxes" -> "box", but "invoices" -> "invoice", so singular and plural meet.
  if (token.length > 4 && /(?:s|x|z|ch|sh)es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

// Distinct normalised tokens of a question.
export function tokenize(question) {
  const words = String(question ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[(?:email|phone|card|url)\]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map(stem)
    .filter((w) => w.length >= 3);
  return [...new Set(words)];
}

export function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size && !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function cutLabel(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= LABEL_LENGTH) return clean;
  const cut = clean.slice(0, LABEL_LENGTH - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trim()}…`;
}

function mostFrequent(questions) {
  const counts = new Map();
  for (const q of questions) counts.set(q, (counts.get(q) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0] ?? "";
}

// signals: [{ id, question }]; topics: existing gap topics [{ id, keywords }].
// -> { assignments: [{ signalId, topicId | null, newTopicKey | null }], newTopics: [{ key, label, keywords, sampleQuestions }],
//      unclusterable: [signalId] } — a question with no meaningful tokens can't be grouped.
export function clusterByKeywords(signals, topics = []) {
  const tokenized = signals.map((s) => ({ ...s, tokens: tokenize(s.question) }));
  const df = new Map();
  for (const s of tokenized) for (const t of s.tokens) df.set(t, (df.get(t) ?? 0) + 1);
  const n = tokenized.length;
  const idf = (t) => Math.log((n + 1) / (df.get(t) ?? 1));

  const groups = new Map();
  const unclusterable = [];
  for (const s of tokenized) {
    if (!s.tokens.length) {
      unclusterable.push(s.id);
      continue;
    }
    const signature = [...s.tokens]
      .sort((a, b) => idf(b) - idf(a) || a.localeCompare(b))
      .slice(0, SIGNATURE_SIZE)
      .sort();
    const key = signature.join(" ");
    if (!groups.has(key)) groups.set(key, { key, keywords: signature, members: [] });
    groups.get(key).members.push(s);
  }

  const assignments = [];
  const newTopics = [];
  const ordered = [...groups.values()].sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
  for (const group of ordered) {
    const best = (list, keywordsOf) => {
      let pick = null;
      for (const item of list) {
        const score = jaccard(group.keywords, keywordsOf(item));
        if (score >= MERGE_JACCARD && (!pick || score > pick.score)) pick = { item, score };
      }
      return pick?.item ?? null;
    };
    const topic = best(topics, (t) => t.keywords ?? []);
    if (topic) {
      for (const s of group.members) assignments.push({ signalId: s.id, topicId: topic.id, newTopicKey: null });
      continue;
    }
    let target = best(newTopics, (t) => t.keywords);
    if (!target) {
      target = { key: group.key, keywords: group.keywords, questions: [] };
      newTopics.push(target);
    }
    target.questions.push(...group.members.map((s) => s.question));
    for (const s of group.members) assignments.push({ signalId: s.id, topicId: null, newTopicKey: target.key });
  }

  return {
    assignments,
    newTopics: newTopics.map(({ key, keywords, questions }) => ({
      key,
      keywords,
      label: cutLabel(mostFrequent(questions)),
      sampleQuestions: [...new Set(questions)].slice(0, SAMPLE_SIZE),
    })),
    unclusterable,
  };
}

// signals: [{ occurredAt, conversationId?, sessionId? }] of one topic. now: ms. -> volumes, impact and trend.
export function rankTopic(signals, now = Date.now()) {
  const within = (days) => signals.filter((s) => now - new Date(s.occurredAt).getTime() <= days * DAY_MS);
  const distinct = (list) =>
    new Set(list.map((s, i) => s.conversationId ?? s.sessionId ?? `signal-${i}-${s.occurredAt}`)).size;
  const last30 = within(30);
  const v30 = distinct(last30);
  const v90 = distinct(within(90));
  const activeDays30 = new Set(last30.map((s) => new Date(s.occurredAt).toISOString().slice(0, 10))).size;
  const recent = within(14).length;
  const previous = signals.filter((s) => {
    const age = now - new Date(s.occurredAt).getTime();
    return age > 14 * DAY_MS && age <= 28 * DAY_MS;
  }).length;
  const change = previous ? (recent - previous) / previous : recent ? 1 : 0;
  const trend = change > 0.2 ? "up" : change < -0.2 ? "down" : "flat";
  return {
    volume30d: v30,
    volume90d: v90,
    activeDays30,
    impact: Math.round(v30 + 0.5 * (v90 - v30) + 0.25 * activeDays30),
    trend,
    trendPct: Math.round(change * 100),
  };
}
