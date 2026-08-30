// Shared response helpers for the widget API. Every route answers plain JSON
// view models with no-store; ownership misses answer 404, never 403 (§10.8).

import { NextResponse } from "next/server";

export function jsonResponse(data, status = 200, headers = {}) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export function errorResponse(status, code = "error") {
  return jsonResponse({ error: code }, status);
}

export function corsHeaders(origin) {
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

export async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}
