"use client";

// Shared by the Messenger Install section and the in-app widget test
// launcher: the loader always lives at BASE + "/widget/v1.js", where BASE
// mirrors next.config.mjs's basePath (empty locally, "/comms" in prod) —
// never hardcode the prefix, it 404s in dev.

// Next serves this app under basePath ("/comms" in prod), but fetch() is not
// basePath-aware — a bare "/api/..." would miss the prefix and 404 there.
export function apiPath(path) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;
}

export function widgetLoaderUrl() {
  if (typeof window === "undefined") return "";
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${window.location.origin}${base}/widget/v1.js`;
}

export function widgetInstallSnippet(appId) {
  return (
    `<script>\n  (function(){var w=window,g=w.GeigerComms;if(!g){g=function(){g.q.push(arguments)};\n` +
    `  g.q=[];w.GeigerComms=g}var s=document.createElement('script');\n` +
    `  s.src='${widgetLoaderUrl()}';s.async=1;\n` +
    `  document.head.appendChild(s)})();\n` +
    `  GeigerComms('boot', { appId: '${appId}' });\n</script>`
  );
}
