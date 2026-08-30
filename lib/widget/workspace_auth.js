import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Auth for the workspace's own widget-app management routes
// (/api/widget-apps/*). These run on the Node runtime and use the signed-in
// workspace user's Supabase session from cookies — separate from, and stricter
// than, the public widget API.

export async function requireWorkspaceUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; refresh still works via client.
        }
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}
