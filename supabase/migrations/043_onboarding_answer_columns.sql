-- 043_onboarding_answer_columns.sql
-- Proper homes for three onboarding answers that src/app/api/onboarding/step/route.ts currently writes into
-- business fields (verified mapping defect):
--   step 3 team size      → profiles.business_model        (should be profiles.team_size)
--   step 6 decision style → ceo_context.revenue_model      (should be ceo_context.decision_style)
--   step 7 risk tolerance → ceo_context.avoided_decision   (should be ceo_context.risk_tolerance)
-- Additive only: three nullable columns. NO existing row is changed by this file. The onboarding route must be
-- changed (separately authorized) to write here. Reading code already treats exact onboarding answers found in the
-- old fields as those answers (src/lib/company-context/field-validation.ts).
-- Rollback: ALTER TABLE public.profiles DROP COLUMN IF EXISTS team_size;
--           ALTER TABLE public.ceo_context DROP COLUMN IF EXISTS decision_style, DROP COLUMN IF EXISTS risk_tolerance;

ALTER TABLE public.profiles    ADD COLUMN IF NOT EXISTS team_size text;
ALTER TABLE public.ceo_context ADD COLUMN IF NOT EXISTS decision_style text;
ALTER TABLE public.ceo_context ADD COLUMN IF NOT EXISTS risk_tolerance text;

-- OPTIONAL, founder decision, run separately and only after reviewing the counts. It copies exact onboarding answers
-- out of the wrong fields and clears them there (history is kept by 042's trigger when installed). Not run by any
-- deployment.
--
-- UPDATE public.profiles SET team_size = business_model, business_model = NULL
--   WHERE team_size IS NULL AND business_model IN ('Solo','2–5','6–15','16–50','51–200','200+');
-- UPDATE public.ceo_context SET decision_style = revenue_model, revenue_model = NULL
--   WHERE decision_style IS NULL AND revenue_model IN ('Analytical','Intuitive','Consensus','Decisive','Collaborative');
-- UPDATE public.ceo_context SET risk_tolerance = avoided_decision, avoided_decision = NULL
--   WHERE risk_tolerance IS NULL AND avoided_decision IN ('Low','Medium','High','Calculated');
