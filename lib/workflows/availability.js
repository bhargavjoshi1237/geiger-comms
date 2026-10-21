// Builder actions the engine can't run yet, with the reason the builder shows; a live workflow logs these steps as skipped with the same reason.

const UNAVAILABLE_ACTIONS = {
  ai_answer: "There's no AI agent to answer yet.",
  survey:
    "The Messenger already asks for a rating when a conversation closes; workflows can't send a separate survey yet.",
};

export function unavailableReason(type) {
  return UNAVAILABLE_ACTIONS[type] ?? null;
}
