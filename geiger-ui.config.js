import { defineNavConfig } from "@geiger/ui";

// The @geiger/ui config for Geiger Comms.
//
// Users curate their own sidebar in Settings → Navigation. This file is where
// the product declares the rules around that: what may never be hidden, and
// which nav entries can't function without another. @geiger/ui reads the rules
// and enforces them — a switch that would break the invariant is disabled and
// explains itself, so nothing is hidden or shown behind the user's back.
//
// Titles must match `components/internal/sidebar/sidebar_nav.jsx` exactly, and
// address top-level sections and sub-items alike.

export default defineNavConfig({
  product: "comms",

  // The spine of the workspace, plus the screen that unhides everything else.
  locked: ["Overview", "Inbox", "All Conversations", "Settings", "Navigation"],

  hiddenByDefault: [],

  dependencies: [
    // Inbox — every queue view is a lens on the conversation list.
    {
      screen: "Views",
      requires: ["All Conversations"],
      reason: "A view is a saved filter over the conversation queue.",
    },
    { screen: "Your Inbox", requires: ["All Conversations"] },
    { screen: "Mentions", requires: ["All Conversations"] },

    // Customers — People is the hub; segments are a lens on it.
    { screen: "Segments", requires: ["People"] },

    // AI Agent — Train is the lifecycle hub; the agent answers from the KB.
    {
      screen: "Knowledge Sources",
      requires: ["Articles"],
      reason: "The agent answers from the help center's articles.",
    },
    { screen: "Actions & Procedures", requires: ["Train"] },
    { screen: "Playground", requires: ["Train"] },
    { screen: "Testing & Regression", requires: ["Playground"] },
    { screen: "Evaluations", requires: ["Testing & Regression"] },
    { screen: "Guardrails", requires: ["Train"] },
    {
      screen: "Deployment",
      requires: ["Testing & Regression"],
      reason: "An agent goes live from a tested build.",
    },
    { screen: "Versions", requires: ["Train"] },

    // AI Performance reports on the agent that produces the numbers.
    {
      screen: "AI Performance",
      requires: ["AI Agent"],
      reason: "There is nothing to measure without the AI agent.",
    },
    { screen: "Topics", requires: ["All Conversations"] },
    { screen: "Recommendations", requires: ["Monitors"] },
    {
      screen: "Usage & Spend",
      requires: ["Resolutions"],
      reason: "Outcome pricing bills the resolutions the agent closed.",
    },

    // Knowledge Base — Articles is the content, help centers are the sites.
    { screen: "Help Centers", requires: ["Articles"] },
    {
      screen: "Knowledge Gaps",
      requires: ["Articles"],
      reason: "A gap is closed by writing the article that fills it.",
    },
    {
      screen: "Customer Portal",
      requires: ["Help Centers"],
      reason: "The portal is served from a help center.",
    },

    // Proactive messages target the audience segments in Customers.
    {
      screen: "Campaigns",
      requires: ["Segments"],
      reason: "Outbound campaigns target the segments built in Customers.",
    },

    // Reports read from the areas that generate the data.
    { screen: "Custom Dashboards", requires: ["Analytics"] },
    {
      screen: "Quality & CSAT",
      requires: ["All Conversations"],
      reason: "Scores and satisfaction are graded on the conversations.",
    },

    // Integrations — MCP is how the agent reaches external tools.
    {
      screen: "MCP",
      requires: ["AI Agent"],
      reason: "MCP exposes tools for the AI agent to call.",
    },

    // Settings — roles and seats are assigned to teammates.
    { screen: "Roles & Permissions", requires: ["Teammates"] },
    { screen: "Seats & Licenses", requires: ["Teammates"] },
  ],
});
