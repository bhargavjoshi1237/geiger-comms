// Sending identity of an email channel DB row: config.address, with config.replyToName as the display name.

export const EMAIL_RE = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/;

export function channelSender(channel) {
  const config = channel?.config && typeof channel.config === "object" ? channel.config : {};
  const address = String(config.address ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(address)) return null;
  // Quotes, angle brackets and line breaks would break out of the From header's display name.
  const name = String(config.replyToName ?? "").replace(/["\\<>\r\n]/g, "").trim();
  return { address, name, from: name ? `"${name}" <${address}>` : address };
}
