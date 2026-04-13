# Supabase Layout

`supabase/migrations/` is the authoritative schema history for the app.

The top-level SQL files are convenience bootstrap scripts for fast setup in the Supabase SQL Editor:

- `001_schema.sql`
- `002_seed.sql`

They should mirror the migration direction, not replace it. If the schema changes, update the migration files first and then keep the bootstrap SQL aligned.
