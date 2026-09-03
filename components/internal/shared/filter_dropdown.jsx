"use client";

// Shared filter dropdown — the single-select used by every list toolbar
// (channels, views, tickets, team, overview widgets). The implementation
// lives here so list screens don't import from another screen's folder.
// `overview/filter_dropdown` re-exports this to keep existing imports working.

export { default, default as FilterDropdown } from "@/components/internal/screens/overview/filter_dropdown";
