`src/ai` holds provider integrations, prompt construction, validation schemas, and server-only AI workflows.

Rules:
- Put reusable AI runtime code here, not inside `app/` routes or UI components.
- Keep prompts under `prompts/`, providers under `providers/`, and operational workflows under `workflows/`.
- Prompt experiments belong next to prompts so rollout logic stays auditable.
- Do not embed long prompt strings in route handlers or React components.
- Do not import server secrets into client components.

Not here:
- Supabase clients
- App route handlers
- Product UI
- Generic infrastructure utilities
