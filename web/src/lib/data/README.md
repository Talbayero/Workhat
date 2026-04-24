`src/lib/data` exposes product-domain data helpers for pages and route-level loaders.

Rules:
- Import by domain (`inbox`, `contacts`, `companies`, `knowledge`) instead of from a catch-all query file.
- Keep data shaping and shared server-side reads here or in focused infrastructure modules.
- Do not put raw Supabase access directly into many page components when a reusable domain helper exists.
