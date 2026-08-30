// One-off smoke test for the widget public API (run against a local dev server).
const fs = require("fs");
const path = require("path");

function env() {
  const out = {};
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const e = env();
const ORIGIN = "http://localhost:3210";
const APP_ID = "wg_smoke7f2k";

async function api(pathname, opts = {}) {
  const res = await fetch(`${ORIGIN}${pathname}`, opts);
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body };
}

(async () => {
  const { createClient } = require("@supabase/supabase-js");
  const admin = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "comms" },
    auth: { persistSession: false },
  });

  // Fresh test app each run.
  await admin.from("widget_apps").delete().eq("public_id", APP_ID);
  await admin.from("widget_apps").insert({
    public_id: APP_ID,
    name: "Smoke",
    secret_hash: "scrypt$AAA$BBB",
    secret_last4: "a91f",
    allowed_origins: [ORIGIN],
  });
  console.log("seeded app", APP_ID);

  // 1 — boot from a disallowed origin must be rejected.
  let r = await api("/api/widget/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example" },
    body: JSON.stringify({ appId: APP_ID, anonymousId: "smoke-anon" }),
  });
  console.log("boot evil origin ->", r.status, r.body);

  // 2 — anonymous boot from the allowlisted origin.
  r = await api("/api/widget/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ appId: APP_ID, anonymousId: "smoke-anon" }),
  });
  console.log("boot anon ->", r.status, Object.keys(r.body || {}));
  const bearer = { authorization: `Bearer ${r.body.sessionToken}` };

  // 3 — start a conversation, send a hostile-looking message, read it back.
  r = await api("/api/widget/conversations", { method: "POST", headers: bearer, body: "{}" });
  console.log("create conversation ->", r.status, r.body && r.body.conversation ? "ok" : r.body);
  const id = r.body.conversation.id;

  r = await api(`/api/widget/conversations/${id}/messages`, {
    method: "POST",
    headers: { ...bearer, "content-type": "application/json" },
    body: JSON.stringify({ body: 'hello <img src=x onerror=alert(1)> & "quotes"', authorName: "Visitor" }),
  });
  console.log("send message ->", r.status, r.body && r.body.message ? "stored" : r.body);

  r = await api(`/api/widget/conversations/${id}/messages`, { headers: bearer });
  console.log("thread ->", r.status, JSON.stringify((r.body.messages || []).map((m) => m.body)));

  // 4 — another visitor's conversation id must 404, not 403.
  const other = await api("/api/widget/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ appId: APP_ID, anonymousId: "smoke-other" }),
  });
  r = await api(`/api/widget/conversations/${id}/messages`, {
    headers: { authorization: `Bearer ${other.body.sessionToken}` },
  });
  console.log("foreign thread ->", r.status);

  // 5 — bad JWT at identify time must 401/400, never a session.
  const crypto = require("crypto");
  const head = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ user_id: "u1", exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  const forged = `${head}.${payload}.`;
  r = await api("/api/widget/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ appId: APP_ID, jwt: forged, anonymousId: "smoke-anon" }),
  });
  console.log("forged jwt ->", r.status, r.body);

  // 6 — refresh keeps the same identity.
  r = await api("/api/widget/session/refresh", { method: "POST", headers: bearer });
  console.log("refresh ->", r.status, r.body && r.body.sessionToken ? "new tokens" : r.body);

  // 7 — identified boot: seal a real signing secret, sign a JWT (HS256 via
  // node crypto), expect the anonymous history to merge onto the new contact.
  // (sealSigningSecret is mirrored here because lib files are ESM.)
  const seal = (secret) => {
    const key = crypto.createHash("sha256").update(`geiger-comms-widget-seal:${e.WIDGET_SESSION_SECRET}`).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const sealed = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return [
      "v1.aesgcm",
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      sealed.toString("base64url"),
    ].join(".");
  };
  const b64url = (buf) => Buffer.from(buf).toString("base64url");
  const signJwt = (claims, signingSecret) => {
    const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify(claims));
    const sig = crypto.createHmac("sha256", signingSecret).update(`${head}.${body}`).digest("base64url");
    return `${head}.${body}.${sig}`;
  };
  const secret = `sk_${Buffer.from(crypto.randomBytes(24)).toString("base64url")}`;
  const upd = await admin
    .from("widget_apps")
    .update({ secret_hash: seal(secret) })
    .eq("public_id", APP_ID)
    .select("public_id")
    .single();
  console.log("seal update ->", upd.status, upd.error ? upd.error.message : "applied");
  const jwt = signJwt(
    { user_id: "user-777", email: "smoke@example.com", exp: Math.floor(Date.now() / 1000) + 3600 },
    secret,
  );
  r = await api("/api/widget/session", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ appId: APP_ID, jwt, anonymousId: "smoke-anon" }),
  });
  console.log(
    "identified boot ->",
    r.status,
    r.body && r.body.contact ? `contact ${r.body.contact.email}` : r.body,
  );

  // Cleanup.
  await admin.from("widget_apps").delete().eq("public_id", APP_ID);
  console.log("done");
})().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
