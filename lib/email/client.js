import "server-only";

// Suite email transport: geiger-dash owns sending (its Resend account + send log), so Comms posts to its cross-app
// API the way geiger-events does (lib/email/client.js there). Pre-rendered mode: Comms renders its own HTML and
// `template` is only the label dash records in its log.

const DEFAULT_API_URL = "https://geiger.studio";

export function isEmailConfigured() {
  return Boolean(process.env.GEIGER_EMAIL_API_KEY);
}

// { ok, id, providerId } on success; { ok: false, error, uncertain } otherwise. `uncertain` means the mail may
// have gone out (network failure or an upstream 5xx other than dash's own 502 delivery failure): never resend it blindly.
export async function sendSuiteEmail({ to, subject, html, from, template, signal } = {}) {
  const apiKey = process.env.GEIGER_EMAIL_API_KEY;
  const baseUrl = process.env.GEIGER_EMAIL_API_URL || DEFAULT_API_URL;

  if (!apiKey) {
    console.error("[email] GEIGER_EMAIL_API_KEY is not set — skipping send");
    return { ok: false, error: "not_configured" };
  }
  if (!to || !subject || !html) {
    return { ok: false, error: "to, subject and html are required" };
  }

  try {
    const res = await fetch(`${baseUrl}/api/email/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ to, subject, html, ...(from ? { from } : {}), ...(template ? { template } : {}) }),
      cache: "no-store",
      ...(signal ? { signal } : {}),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("[email] send failed:", res.status, json?.error);
      return {
        ok: false,
        error: json?.error || `HTTP ${res.status}`,
        uncertain: res.status >= 500 && res.status !== 502,
      };
    }

    return { ok: true, id: json.id ?? null, providerId: json.providerId ?? null };
  } catch (err) {
    console.error("[email] send request error:", err);
    return { ok: false, error: "request_failed", uncertain: true };
  }
}
