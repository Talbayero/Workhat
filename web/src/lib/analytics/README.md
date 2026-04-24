`src/lib/analytics` contains reusable reporting logic and analytics-facing types.

Rules:
- Executive reporting, team performance, org activity, task volume, and client-level reporting helpers belong here.
- UI formatting stays in `components/`; data loading and aggregation stay here or in focused data modules.
- New analytics queries should not be added to route files or page components directly.
