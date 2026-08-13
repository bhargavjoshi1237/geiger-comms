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
    { screen: "Side Conversations", requires: ["All Conversations"] },
    { screen: "Spam", requires: ["All Conversations"] },
    {
      screen: "Back-office Tickets",
      requires: ["Tickets"],
      reason: "Back-office work is tracked as a ticket type.",
    },
    { screen: "Tracker Tickets", requires: ["Tickets"] },

    // Channels — the Messenger is the surface live chat runs inside.
    {
      screen: "Messenger",
      requires: ["Live Chat"],
      reason: "The Messenger widget hosts the live chat session.",
    },

    // Voice & IVR — call features hang off calls, IVR features off the flows.
    { screen: "IVR Routing", requires: ["IVR Flows"] },
    { screen: "Voice Recognition", requires: ["IVR Flows"] },
    { screen: "Text-to-Speech", requires: ["IVR Flows"] },
    { screen: "Callbacks", requires: ["Calls"] },
    { screen: "Voicemail", requires: ["Calls"] },
    { screen: "Call Recordings", requires: ["Calls"] },
    {
      screen: "Call Transcripts",
      requires: ["Call Recordings"],
      reason: "Transcripts are produced from the call recording.",
    },

    // Customers — People is the hub; the rest are lenses and actions on it.
    {
      screen: "Unified Timeline",
      requires: ["People"],
      reason: "The timeline is one customer's history end to end.",
    },
    { screen: "Segments", requires: ["People"] },
    { screen: "Health Scores", requires: ["People"] },
    { screen: "Order History", requires: ["People"] },
    {
      screen: "Order Actions",
      requires: ["Order History"],
      reason: "Refunds and cancellations act on an order in the history.",
    },

    // Automation — routing and approvals are layers on the base surfaces.
    { screen: "Skills-based Routing", requires: ["Routing Rules"] },
    { screen: "Approval Workflows", requires: ["Workflows"] },

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
    { screen: "Translations", requires: ["Articles"] },
    {
      screen: "Customer Portal",
      requires: ["Help Centers"],
      reason: "The portal is served from a help center.",
    },
    { screen: "Community Forum", requires: ["Help Centers"] },

    // Proactive messages target the audience segments in Customers.
    {
      screen: "Campaigns",
      requires: ["Segments"],
      reason: "Outbound campaigns target the segments built in Customers.",
    },

    // Reports read from the areas that generate the data.
    { screen: "Custom Dashboards", requires: ["Analytics"] },
    { screen: "SLA Compliance", requires: ["SLA Policies"] },
    { screen: "Channel Performance", requires: ["Channels"] },
    {
      screen: "Quality Assurance",
      requires: ["CSAT & Quality"],
      reason: "QA scores are graded against the satisfaction signal.",
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
