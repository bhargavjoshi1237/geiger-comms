import "server-only";

// "Only continue if" steps, evaluated against a run's context (lib/automation/context.js). Each returns { met, label }.

const norm = (value) => String(value ?? "").trim().toLowerCase();

// The contact attributes the builder's "Contact attribute" condition offers, read from where the Customers screens store them.
function contactAttribute(contact, attribute) {
  if (!contact) return "";
  const meta = contact.metadata && typeof contact.metadata === "object" ? contact.metadata : {};
  switch (attribute) {
    case "Plan":
      return meta.custom?.plan ?? "";
    case "Company":
      return contact.company ?? "";
    case "Lifecycle":
      return meta.lifecycle ?? "lead";
    case "Location":
      return meta.location ?? "";
    case "Email domain":
      return String(contact.email ?? "").split("@")[1] ?? "";
    default:
      return "";
  }
}

function compare(actual, operator, expected) {
  if (operator === "contains") return Boolean(expected) && actual.includes(expected);
  if (operator === "is not") return actual !== expected;
  return actual === expected;
}

export async function evaluateCondition(step, ctx, env) {
  const config = step.config || {};
  const conversation = ctx.conversation;
  switch (step.type) {
    case "if.channel":
      return { met: norm(conversation?.channel) === norm(config.channel), label: `Channel is ${config.channel}` };
    case "if.priority":
      return { met: norm(conversation?.priority) === norm(config.priority), label: `Priority is ${config.priority}` };
    case "if.state":
      return { met: norm(conversation?.status) === norm(config.state), label: `State is ${config.state}` };
    case "if.tag":
      return {
        met: Boolean(norm(config.tag)) && ctx.tags.some((t) => norm(t.name) === norm(config.tag)),
        label: `Has tag #${config.tag || "—"}`,
      };
    case "if.assignee": {
      const wantAssigned = config.assignee === "assigned";
      return {
        met: Boolean(conversation) && Boolean(conversation.assignee_id) === wantAssigned,
        label: wantAssigned ? "Conversation is assigned" : "Conversation is unassigned",
      };
    }
    case "if.office_hours": {
      const { data, error } = await env.sb.rpc("hours_open", { p_project: env.projectId, p_team: null });
      if (error) throw new Error(error.message);
      const wantInside = config.when === "inside";
      return { met: (data === true) === wantInside, label: wantInside ? "Inside office hours" : "Outside office hours" };
    }
    case "if.message_contains":
      return {
        met: Boolean(norm(config.text)) && norm(ctx.message?.body).includes(norm(config.text)),
        label: `Message contains "${config.text || ""}"`,
      };
    case "if.contact_attribute": {
      const operator = config.operator || "is";
      return {
        met: compare(norm(contactAttribute(ctx.contact, config.attribute)), operator, norm(config.value)),
        label: `${config.attribute} ${operator} "${config.value || ""}"`,
      };
    }
    default:
      return { met: false, label: `Unknown condition (${step.type})` };
  }
}
