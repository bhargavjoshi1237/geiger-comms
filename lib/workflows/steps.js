// Workflow steps ↔ the flattened rule columns. `steps` is what the builder edits and the engine runs in order;
// `conditions` / `actions` are the flattened form rows were saved in before the builder, still derived on every save.

// Condition step type → [workflows.conditions key, step config field]; values collect into an array per key.
const CONDITION_KEYS = {
  "if.channel": ["channel", "channel"],
  "if.priority": ["priority", "priority"],
  "if.tag": ["tags", "tag"],
  "if.state": ["state", "state"],
  "if.office_hours": ["office_hours", "when"],
  "if.assignee": ["assignee", "assignee"],
  "if.message_contains": ["message_contains", "text"],
};
const ATTRIBUTE_CONDITION = "if.contact_attribute";

const stepId = () => `step_${crypto.randomUUID()}`;

// steps → { trigger, conditions, actions }. Trigger config rides along as conditions.trigger.
export function rulesFromSteps(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const triggerStep = list[0]?.kind === "trigger" ? list[0] : null;
  const rest = triggerStep ? list.slice(1) : list;
  const conditions = {};
  const actions = [];
  if (triggerStep?.config && Object.values(triggerStep.config).some((v) => v !== "" && v != null)) {
    conditions.trigger = { ...triggerStep.config };
  }
  for (const step of rest) {
    const config = step.config || {};
    if (step.kind === "condition") {
      if (step.type === ATTRIBUTE_CONDITION) {
        (conditions.attributes ??= []).push({ ...config });
        continue;
      }
      const mapping = CONDITION_KEYS[step.type];
      const value = mapping ? config[mapping[1]] : null;
      if (mapping && value !== "" && value != null) (conditions[mapping[0]] ??= []).push(value);
    } else if (step.kind === "action") {
      actions.push({ action: step.type, ...config });
    }
  }
  return { trigger: triggerStep?.type ?? null, conditions, actions };
}

// Rows saved before the builder existed (seeded rules) have no steps — rebuild them from trigger/conditions/actions.
export function stepsFromRules(row) {
  const conditions = row.conditions && typeof row.conditions === "object" ? row.conditions : {};
  const steps = [
    { id: stepId(), kind: "trigger", type: row.trigger || "created", config: { ...(conditions.trigger || {}) } },
  ];
  for (const [type, [key, field]] of Object.entries(CONDITION_KEYS)) {
    for (const value of [].concat(conditions[key] ?? [])) {
      steps.push({ id: stepId(), kind: "condition", type, config: { [field]: value } });
    }
  }
  for (const attr of [].concat(conditions.attributes ?? [])) {
    steps.push({ id: stepId(), kind: "condition", type: ATTRIBUTE_CONDITION, config: { ...attr } });
  }
  for (const entry of Array.isArray(row.actions) ? row.actions : []) {
    const { action, ...config } = entry || {};
    if (!action) continue;
    if (action === "assign" && !config.strategy) config.strategy = config.to ? "direct" : "round_robin";
    steps.push({ id: stepId(), kind: "action", type: action, config });
  }
  return steps.map((s, i) => ({ ...s, position: { x: 0, y: i * 150 } }));
}

// The steps a comms.workflows row runs: its saved steps, else ones rebuilt from its rule columns.
export function workflowSteps(row) {
  return Array.isArray(row?.steps) && row.steps.length ? row.steps : stepsFromRules(row ?? {});
}
