import "server-only";
import { adminClient } from "./admin";

// Messenger-side knowledge-base events (KB spec §12.2). comms.article_views takes no browser writes, so the
// widget routes record through the service role, scoped to the app's project.

export async function recordArticleView({ articleId, projectId, principal, source = "messenger" }) {
  const db = adminClient();
  if (!db || !articleId || !projectId) return;
  try {
    const { error } = await db.from("article_views").insert({
      article_id: articleId,
      project_id: projectId,
      source,
      visitor_id: principal?.visitorId ?? null,
      contact_id: principal?.contactId ?? null,
    });
    if (error) console.error("[kb.recordArticleView]", error.message);
  } catch (e) {
    console.error("[kb.recordArticleView]", e);
  }
}
