import { createBrowserClient } from "@supabase/ssr";
import { trackSupabaseFetch } from "./activity";

// The ONE base browser client for the app. Import this everywhere; never call
// createBrowserClient ad hoc. Auth session is shared across the Geiger suite
// (same Supabase project + same origin => same @supabase/ssr localStorage key).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      // This app owns the `comms` Postgres schema; default all PostgREST
      // table/RPC calls to it (auth + storage are unaffected by db.schema).
      // Read the shared public tables (projects, users) via .schema("public").
      db: {
        schema: "comms",
      },
      global: {
        fetch: trackSupabaseFetch,
      },
    },
  );
}
