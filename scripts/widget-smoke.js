// Smoke test for the widget public API against a LOCAL dev server and a NON-shared database. It writes fixture rows (a channel, an app,
// visitors, contacts, conversations) and soft-deletes the channel/app at the end. Usage: node scripts/widget-smoke.js [http://localhost:3000]
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function env() {
  const out = { ...process.env };
  for (const file of [".env", ".env.local"]) {
    const full = path.join(__dirname, "..", file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  return out;
}

const e = env();
const SERVER = process.argv[2] || "http://localhost:3000";
const BASE = e.NEXT_PUBLIC_BASE_PATH || "";
const HOST = "https://smoke-host.example"; // the customer's page
const APP_ID = `wg_smoke${crypto.randomBytes(4).toString("hex")}`;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : `  (${detail})`}`);
}

async function api(pathname, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(`${SERVER}${BASE}/api/widget${pathname}`, {
    method,
    headers: body && !(body instanceof FormData) ? { "content-type": "application/json", ...headers } : headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const json = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body: json };
}

// Boot as the iframe does: same-origin request + the parent origin the bridge verified.
function boot(payload, { origin = SERVER, parentOrigin = HOST } = {}) {
  return api("/session", { method: "POST", headers: { origin }, body: { ...payload, parentOrigin } });
}

const bearer = (token) => ({ authorization: `Bearer ${token}` });

// Mirrors lib/widget/secrets.js sealSigningSecret (lib files are ESM + server-only).
function seal(secret) {
  const key = crypto.createHash("sha256").update(`geiger-comms-widget-seal:${e.WIDGET_SESSION_SECRET}`).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const sealed = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1.aesgcm", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), sealed.toString("base64url")].join(".");
}

function signJwt(claims, secret, alg = "HS256") {
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = b64({ alg, typ: "JWT" });
  const body = b64(claims);
  const sig = alg === "none" ? "" : crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

(async () => {
  const { createClient } = require("@supabase/supabase-js");
  const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "comms" },
    auth: { persistSession: false },
  });
  const anon = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    db: { schema: "comms" },
    auth: { persistSession: false },
  });

  const secret = `sk_${crypto.randomBytes(24).toString("base64url")}`;
  const channel = await admin
    .from("channels")
    .insert({ kind: "messenger", name: "Smoke", status: "connected" })
    .select("id")
    .single();
  if (channel.error) throw new Error(channel.error.message);
  const app = await admin
    .from("widget_apps")
    .insert({
      public_id: APP_ID,
      name: "Smoke",
      secret_hash: seal(secret),
      secret_last4: secret.slice(-4),
      allowed_origins: [HOST],
      channel_id: channel.data.id,
    })
    .select("id")
    .single();
  if (app.error) throw new Error(app.error.message);
  console.log("fixture app", APP_ID);

  try {
    // §3.2 / DoD: the anon key reads nothing in comms.
    const leak = await anon.from("widget_apps").select("secret_hash").limit(1);
    check("anon cannot select widget_apps", Boolean(leak.error) || (leak.data || []).length === 0, leak.error?.message);
    const leak2 = await anon.from("messages").select("id").limit(1);
    check("anon cannot select messages", Boolean(leak2.error) || (leak2.data || []).length === 0, leak2.error?.message);

    // §10.2: origins.
    let r = await boot({ appId: APP_ID, anonymousId: "smoke-anon-1" }, { origin: "https://evil.example", parentOrigin: null });
    check("boot from a foreign origin → 403", r.status === 403, r.status);
    r = await boot({ appId: APP_ID, anonymousId: "smoke-anon-1" }, { parentOrigin: "https://evil-smoke-host.example" });
    check("boot with a non-allowlisted parent → 403", r.status === 403, r.status);

    r = await boot({ appId: APP_ID, anonymousId: "smoke-anon-1" });
    check("anonymous boot → 200 with both tokens", r.status === 200 && r.body?.sessionToken && "realtimeToken" in r.body, r.status);
    const visitorToken = r.body.sessionToken;

    r = await api("/conversations", { method: "POST", headers: bearer(visitorToken), body: { firstMessage: "hello" } });
    check("start conversation → 201", r.status === 201, r.status);
    const convId = r.body.conversation.id;

    r = await api(`/conversations/${convId}/messages`, {
      method: "POST",
      headers: bearer(visitorToken),
      body: { body: 'hi <img src=x onerror=alert(1)> & "quotes"' },
    });
    check("send message → 201", r.status === 201, r.status);

    r = await api(`/conversations/${convId}/messages`, {
      method: "POST",
      headers: bearer(visitorToken),
      body: { body: "x", attachments: [{ url: "javascript:alert(1)" }] },
    });
    check("forged attachment → 400", r.status === 400, r.status);

    // An internal note written by an agent must never reach the visitor.
    await admin.rpc("post_message", {
      p_conversation: convId,
      p_body: "INTERNAL NOTE — do not show",
      p_author_role: "agent",
      p_author_name: "Agent",
      p_message_type: "note",
    });
    r = await api(`/conversations/${convId}/messages`, { headers: bearer(visitorToken) });
    const bodies = (r.body?.messages || []).map((m) => m.body);
    check("thread excludes internal notes", r.status === 200 && !bodies.some((b) => b.includes("INTERNAL NOTE")), JSON.stringify(bodies));
    r = await api("/conversations", { headers: bearer(visitorToken) });
    check("list preview excludes notes", !JSON.stringify(r.body).includes("INTERNAL NOTE"));

    r = await api(`/conversations/${convId}/read`, { method: "POST", headers: bearer(visitorToken) });
    check("mark read → 200", r.status === 200, r.status);
    r = await api(`/conversations/${convId}/rating`, { method: "POST", headers: bearer(visitorToken), body: { score: 5 } });
    check("rating → 200", r.status === 200, r.status);

    // §10.8: someone else's id is 404, never 403.
    const other = await boot({ appId: APP_ID, anonymousId: "smoke-anon-2" });
    r = await api(`/conversations/${convId}/messages`, { headers: bearer(other.body.sessionToken) });
    check("foreign thread → 404", r.status === 404, r.status);

    // §10.4: JWT verification.
    const exp = Math.floor(Date.now() / 1000) + 3600;
    r = await boot({ appId: APP_ID, jwt: signJwt({ user_id: "u1", exp }, null, "none"), anonymousId: "smoke-anon-1" });
    check("alg:none JWT → 401", r.status === 401, r.status);
    r = await boot({ appId: APP_ID, jwt: signJwt({ user_id: "u1", exp: exp - 7200 }, secret), anonymousId: "smoke-anon-1" });
    check("expired JWT → 401", r.status === 401, r.status);
    r = await boot({ appId: APP_ID, jwt: signJwt({ user_id: "u1", exp: exp + 3 * 86400 }, secret), anonymousId: "smoke-anon-1" });
    check("JWT living > 24h → 401", r.status === 401, r.status);

    r = await api("/session/refresh", { method: "POST", headers: bearer(visitorToken) });
    check("refresh → new tokens", r.status === 200 && r.body?.sessionToken && "realtimeToken" in r.body, r.status);

    // §4.2: sign-in merges the anonymous history; signing out on the same browser does not reopen it.
    r = await boot({ appId: APP_ID, jwt: signJwt({ user_id: "user-777", email: "smoke@example.com", exp }, secret), anonymousId: "smoke-anon-1" });
    check("identified boot → 200", r.status === 200 && r.body?.contact?.email === "smoke@example.com", r.status);
    const identified = await api("/conversations", { headers: bearer(r.body.sessionToken) });
    check("identified sees merged history", (identified.body?.conversations || []).some((c) => c.id === convId));
    r = await boot({ appId: APP_ID, anonymousId: "smoke-anon-1" });
    const after = await api("/conversations", { headers: bearer(r.body.sessionToken) });
    check("anonymous re-boot on the same browser sees none of it", (after.body?.conversations || []).length === 0);

    // Item B: a disconnected messenger channel stops its widget like a revoked app.
    await admin.from("channels").update({ status: "disconnected" }).eq("id", channel.data.id);
    r = await boot({ appId: APP_ID, anonymousId: "smoke-anon-3" });
    check("disconnected channel → boot 404", r.status === 404, r.status);
  } finally {
    const now = new Date().toISOString();
    await admin.from("widget_apps").update({ deleted_at: now }).eq("id", app.data.id);
    await admin.from("channels").update({ deleted_at: now }).eq("id", channel.data.id);
  }

  const failed = results.filter((x) => !x.ok).length;
  console.log(failed ? `${failed} check(s) failed` : "all checks passed");
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
