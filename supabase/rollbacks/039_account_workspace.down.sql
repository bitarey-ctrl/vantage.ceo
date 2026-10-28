-- Rolls back 039. Run only if the release is abandoned: it DELETES all account-backed workspace notes,
-- conversation associations and signal preferences created since 039 (decisions, sessions, signals are untouched).
-- Before running, deploy the previous app build (rollback candidate) so nothing writes to these tables.
BEGIN;
DROP FUNCTION IF EXISTS public.save_decision_workspace(uuid, timestamptz, integer, jsonb, jsonb, uuid, text);
DROP TABLE IF EXISTS public.signal_preferences;
DROP TABLE IF EXISTS public.advisor_context_links;
DROP TABLE IF EXISTS public.decision_workspaces;
DROP FUNCTION IF EXISTS public.signal_preference_guard();
DROP FUNCTION IF EXISTS public.advisor_context_link_guard();
DROP FUNCTION IF EXISTS public.decision_workspace_guard();
DROP INDEX IF EXISTS public.advisor_sessions_id_profile_id_key;
DROP INDEX IF EXISTS public.decisions_id_profile_id_key;
COMMIT;
