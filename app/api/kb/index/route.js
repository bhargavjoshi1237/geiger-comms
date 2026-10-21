import { KB_VIEW, canInProject, openRoute } from "@/lib/server/workspace_auth";
import { aiErrorResponse, errorResponse, jsonResponse, readJsonBody } from "@/lib/server/respond";
import { INDEX_BATCH, indexArticles } from "@/lib/server/kb_index";
import { isUuid } from "@/lib/engine/secrets";

// POST /api/kb/index — one bounded knowledge-index batch for a project (KB spec §5.2, §7.7). Body:
// { projectId, articleIds? } -> { indexed, removed, pending, partial }. Ids from other projects are ignored by RLS;
// without articleIds it takes the stale queue. Writes go through the user's session.
export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 50_000;

export async function POST(request) {
  const started = Date.now();
  const { session, response } = await openRoute(request, { write: true });
  if (response) return response;

  const body = await readJsonBody(request);
  const projectId = body?.projectId;
  const articleIds = body?.articleIds;
  if (!isUuid(projectId)) return errorResponse(422, "invalid_request");
  if (articleIds !== undefined && (!Array.isArray(articleIds) || articleIds.length > INDEX_BATCH || !articleIds.every(isUuid))) {
    return errorResponse(422, "invalid_request");
  }
  if (!(await canInProject(session, projectId, KB_VIEW))) return errorResponse(404, "not_found");

  try {
    return jsonResponse(
      await indexArticles({ session, projectId, articleIds: articleIds ?? null, deadline: started + BUDGET_MS }),
    );
  } catch (err) {
    return aiErrorResponse(err);
  }
}
