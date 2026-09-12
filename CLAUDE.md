@AGENTS.md
@MODULE_CONVENTIONS.md
@SUPABASE_CONVENTIONS.md
@MIGRATION_CONVENTIONS.md
@crafting.md
Use the shared UI components from `@geiger/ui` instead of building your own; only create a bespoke component when the shared library genuinely lacks what you need.
For loading states, use `LogoLoading` from `@geiger/ui` on full-page and section-level loaders — a screen's initial data fetch, a dialog/panel body, a route-level `loading.jsx`/Suspense fallback. Omit its `name` prop so it randomly picks one of its animated Geiger-mark treatments per mount; pass `size` to fit the space (roughly 32-40px for a compact panel, 40-56px for a standard section card, 72-96px for a full-page loader). Keep the plain `Loader2`/`animate-spin` spinner on buttons and small inline/icon-sized indicators — never put `LogoLoading` there.
When you encounter large multi-line comments, condense them into concise, clear single-line comments; write all new comments in that same concise single-line style.
