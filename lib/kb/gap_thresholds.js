// Initial thresholds for matching a customer question to existing articles (KB spec §11.2), to be tuned against
// real data. Embedding similarity is cosine 0..1; FTS rank is ts_rank_cd normalised to 0..1.

export const EMBEDDING_COVERED = 0.75;
export const EMBEDDING_WEAK = 0.55;
export const FTS_COVERED = 0.2;

// -> "covered" | "weak_match" | "no_match"; score is null when nothing matched.
export function matchOutcome(method, score) {
  if (score === null || score === undefined) return "no_match";
  if (method === "embedding") {
    if (score >= EMBEDDING_COVERED) return "covered";
    return score >= EMBEDDING_WEAK ? "weak_match" : "no_match";
  }
  return score >= FTS_COVERED ? "covered" : "weak_match";
}
