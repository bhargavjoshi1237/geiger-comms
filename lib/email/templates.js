// Comms' own email HTML, sent through geiger-dash's pre-rendered mode: plain, inline-styled, every interpolated value escaped.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const P = "margin:0 0 16px;font-size:15px;line-height:24px;color:#27272a;";
const MUTED = "margin:24px 0 0;font-size:13px;line-height:20px;color:#71717a;";
const LINK = "color:#18181b;font-weight:600;text-decoration:underline;";

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function lines(text) {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

// Plain text -> paragraphs, keeping the author's line breaks.
function paragraphs(text, style = P) {
  return String(text ?? "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .filter(Boolean)
    .map((block) => `<p style="${style}">${lines(block)}</p>`)
    .join("");
}

function isWebUrl(value) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function button(label, href) {
  return (
    `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" ` +
    `style="display:inline-block;background:#18181b;color:#ffffff;font-size:14px;font-weight:600;` +
    `text-decoration:none;padding:10px 18px;border-radius:6px;">${escapeHtml(label)}</a></p>`
  );
}

function page({ preview, content }) {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:${FONT};">` +
    (preview
      ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>`
      : "") +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;` +
    `border-radius:8px;padding:32px;">${content}</div></body></html>`
  );
}

const oneLine = (text) => String(text ?? "").replace(/[\r\n]+/g, " ").trim();

function preheader(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}

// "Re: <subject>" so the customer's mail client groups the thread by subject (dash's API takes no threading headers).
export function replySubject(subject) {
  const clean = oneLine(subject) || "Your conversation";
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

// A reply as the customer sees it; files go out as download links, not MIME attachments.
export function replyEmail({ body, signature, attachments = [] }) {
  const files = attachments.filter((a) => a && isWebUrl(a.url));
  const fileList = files.length
    ? `<p style="${P}">${files
        .map((a) => `<a href="${escapeHtml(a.url)}" style="${LINK}">${escapeHtml(a.name || "Attachment")}</a>`)
        .join("<br>")}</p>`
    : "";
  const sign = String(signature ?? "").trim();
  return page({
    preview: preheader(body),
    content: paragraphs(body) + fileList + (sign ? `<p style="${MUTED}">${lines(sign)}</p>` : ""),
  });
}

export function inviteEmail({ inviterName, projectName, email, acceptUrl, workspaceUrl, message }) {
  const subject = oneLine(`${inviterName} invited you to ${projectName} on Geiger Comms`);
  const note = String(message ?? "").trim();
  const content =
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#18181b;">Join ${escapeHtml(projectName)} on Geiger Comms</h1>` +
    `<p style="${P}">${escapeHtml(inviterName)} invited you to join the ${escapeHtml(projectName)} workspace, ` +
    `where the team answers customer conversations.</p>` +
    (note
      ? `<blockquote style="margin:0 0 16px;padding:8px 14px;border-left:3px solid #e4e4e7;${P}">${lines(note)}</blockquote>`
      : "") +
    button("Accept invitation", acceptUrl) +
    (workspaceUrl && workspaceUrl !== acceptUrl
      ? `<p style="${P}">Once you've accepted, the workspace is at ` +
        `<a href="${escapeHtml(workspaceUrl)}" style="${LINK}">${escapeHtml(workspaceUrl)}</a>.</p>`
      : "") +
    `<p style="${MUTED}">This invitation was sent to ${escapeHtml(email)}. If you weren't expecting it, you can ignore this email.</p>`;
  return { subject, html: page({ preview: subject, content }) };
}

export function testEmail({ channelName, from }) {
  const subject = oneLine(`Test email from ${channelName}`);
  const content =
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#18181b;">This channel can send email</h1>` +
    `<p style="${P}">This test came from the ${escapeHtml(channelName)} email channel in Geiger Comms, sent as ` +
    `${escapeHtml(from)}. Replies this channel sends by email use the same address.</p>`;
  return { subject, html: page({ preview: subject, content }) };
}
