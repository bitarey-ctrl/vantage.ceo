-- PRODUCTION SCHEMA BASELINE (schema only, no rows) for a DISPOSABLE test database. NEVER run against production.
-- Generated 2026-11-05 from the production catalog (odahuetnflsqkligzwpm) with read-only queries: enums, tables,
-- columns, defaults, constraints, indexes, public functions, triggers (incl. auth.users -> handle_new_user), RLS
-- flags, policies and table grants. Not captured: the ensure_rls event trigger (rls_auto_enable) and Supabase's own
-- schemas. Purpose: verify the candidate's migrations 039-044 against the schema and policies production has.

CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;

CREATE TYPE public.bias_type AS ENUM ('recency_bias', 'optimism_inflation', 'avoidance_pattern', 'confirmation_sequence');

CREATE TYPE public.brief_type AS ENUM ('daily', 'weekly');

CREATE TYPE public.consequence_status AS ENUM ('pending', 'accepted', 'rejected');

CREATE TYPE public.decision_category AS ENUM ('hiring', 'pricing', 'expansion', 'product', 'team', 'regulatory', 'partnerships', 'fundraising', 'marketing', 'operations', 'other');

CREATE TYPE public.decision_status AS ENUM ('draft', 'active', 'pending', 'resolved', 'archived');

CREATE TYPE public.delivery_channel AS ENUM ('whatsapp', 'slack', 'email', 'web');

CREATE TYPE public.impact_level AS ENUM ('high', 'medium', 'low', 'none');

CREATE TYPE public.recommendation_outcome AS ENUM ('correct', 'incorrect', 'partial', 'unmeasured');

CREATE TYPE public.recommendation_status AS ENUM ('pending', 'accepted', 'dismissed');

CREATE TYPE public.signal_relevance AS ENUM ('high', 'medium', 'low', 'irrelevant');

CREATE TYPE public.signal_source AS ENUM ('perplexity', 'rss', 'manual');

CREATE TYPE public.subscription_tier AS ENUM ('starter', 'growth', 'scale');

CREATE TYPE public.urgency_level AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE public.advisor_context_links (
  session_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  context_kind text NOT NULL,
  context_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.advisor_reads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  quote text NOT NULL,
  source_count integer DEFAULT 0 NOT NULL,
  local_date text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.advisor_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  title text DEFAULT 'New conversation'::text NOT NULL,
  messages jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.assessments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  strategic_clarity integer DEFAULT 0 NOT NULL,
  information_processing integer DEFAULT 0 NOT NULL,
  risk_calibration integer DEFAULT 0 NOT NULL,
  execution_followthrough integer DEFAULT 0 NOT NULL,
  strengths text DEFAULT ''::text NOT NULL,
  focus_area text DEFAULT ''::text NOT NULL,
  detected_patterns text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  company_growth_score integer DEFAULT 0,
  company_risk_score integer DEFAULT 0,
  company_execution_score integer DEFAULT 0,
  company_market_score integer DEFAULT 0,
  company_strengths text DEFAULT ''::text,
  company_focus_area text DEFAULT ''::text,
  external_evaluation text DEFAULT ''::text,
  investor_ready_score integer DEFAULT 0,
  assessment_type text DEFAULT 'full'::text
);

CREATE TABLE public.blind_spot_patterns (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid NOT NULL,
  pattern_type text NOT NULL,
  alert_message text NOT NULL,
  confidence integer DEFAULT 50 NOT NULL,
  detection_data jsonb DEFAULT '{}'::jsonb NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  detected_at timestamp with time zone DEFAULT now() NOT NULL,
  acknowledged_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.blind_spots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  detected_at timestamp with time zone DEFAULT now() NOT NULL,
  bias_type bias_type NOT NULL,
  supporting_decision_ids uuid[] NOT NULL,
  pattern_description text NOT NULL,
  quantified_cost text,
  alert_headline text NOT NULL,
  alert_full text NOT NULL,
  ceo_acknowledged boolean DEFAULT false NOT NULL,
  ceo_acknowledged_at timestamp with time zone,
  ceo_response text,
  resolved boolean DEFAULT false NOT NULL
);

CREATE TABLE public.briefing_send_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL,
  local_date text NOT NULL,
  signal_count integer DEFAULT 0 NOT NULL,
  error text,
  resend_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.briefs (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid NOT NULL,
  type brief_type DEFAULT 'daily'::brief_type NOT NULL,
  health_score integer,
  health_score_delta integer,
  health_score_rationale text,
  top_signals jsonb DEFAULT '[]'::jsonb NOT NULL,
  required_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ceo_business_context (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  priority_1 text,
  priority_1_delay_impact text,
  priority_2 text,
  priority_2_delay_impact text,
  priority_3 text,
  priority_3_delay_impact text,
  revenue_model_detail text,
  monthly_revenue_range text,
  competitor_1 text,
  competitor_1_threat text,
  competitor_2 text,
  competitor_2_threat text,
  avoided_decision text,
  avoidance_stated_reason text,
  sector text,
  geography text,
  past_decision_regret text,
  past_decision_cost text,
  signal_categories text[],
  risk_tolerance text,
  current_weekly_priorities jsonb
);

CREATE TABLE public.ceo_context (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid NOT NULL,
  strategic_priorities jsonb DEFAULT '[]'::jsonb NOT NULL,
  revenue_model text,
  monthly_revenue_range text,
  competitors jsonb DEFAULT '[]'::jsonb NOT NULL,
  avoided_decision text,
  avoided_decision_stated_reason text,
  sector text,
  sector_tags text[] DEFAULT '{}'::text[] NOT NULL,
  geography_detail text,
  past_decision_regrets jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  arr_band text,
  product_description text,
  target_customer text,
  top_priority text,
  top_priority_other text,
  additional_context text
);

CREATE TABLE public.consequence_maps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  signal_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  immediate_consequence text,
  immediate_second_order text,
  immediate_third_order text,
  medium_consequence text,
  medium_second_order text,
  medium_third_order text,
  strategic_consequence text,
  strategic_second_order text,
  strategic_third_order text,
  action_1 text NOT NULL,
  action_1_window text,
  action_1_cost_of_inaction text,
  action_2 text,
  action_2_window text,
  action_3 text,
  action_3_window text,
  so_what_headline text NOT NULL,
  so_what_full text NOT NULL,
  urgency_score smallint,
  confidence_score smallint
);

CREATE TABLE public.consequences (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid NOT NULL,
  signal_id uuid,
  brief_id uuid,
  so_what text NOT NULL,
  primary_impact text NOT NULL,
  secondary_impact text,
  tertiary_risk text,
  action_recommendation text NOT NULL,
  urgency_window text NOT NULL,
  urgency_days integer DEFAULT 7 NOT NULL,
  confidence_score integer DEFAULT 50 NOT NULL,
  impact_matrix jsonb DEFAULT '{"cost": "medium", "revenue": "medium", "regulatory_exposure": "none", "competitive_position": "medium"}'::jsonb NOT NULL,
  consequence_horizons jsonb DEFAULT '[]'::jsonb NOT NULL,
  status consequence_status DEFAULT 'pending'::consequence_status NOT NULL,
  responded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.decision_workspaces (
  decision_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  support jsonb DEFAULT '{}'::jsonb NOT NULL,
  parent_decision_id uuid,
  version integer DEFAULT 1 NOT NULL,
  provenance text DEFAULT 'account'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.decisions (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid NOT NULL,
  title text NOT NULL,
  category decision_category,
  rationale text DEFAULT ''::text NOT NULL,
  predicted_outcome text DEFAULT ''::text NOT NULL,
  confidence_score integer DEFAULT 3 NOT NULL,
  urgency_level urgency_level DEFAULT 'medium'::urgency_level NOT NULL,
  emotional_context text,
  alternatives_considered jsonb DEFAULT '[]'::jsonb NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  actual_outcome text,
  outcome_variance_cost numeric,
  outcome_variance_description text,
  outcome_reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source text,
  source_id uuid,
  deadline timestamp with time zone,
  blind_spots jsonb,
  description text,
  confidence text DEFAULT 'torn'::text NOT NULL,
  known_context text,
  open_questions text
);

CREATE TABLE public.feature_events (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid NOT NULL,
  event text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.feedback (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid,
  rating integer,
  category text,
  message text NOT NULL,
  page text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.health_scores (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid NOT NULL,
  score integer DEFAULT 50 NOT NULL,
  delta integer DEFAULT 0 NOT NULL,
  rationale text DEFAULT ''::text NOT NULL,
  components jsonb DEFAULT '{"action_bias": 50, "signal_quality": 50, "blind_spot_risk": 50, "decision_velocity": 50}'::jsonb NOT NULL,
  calculated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.invite_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  used_at timestamp with time zone,
  used_by_email text
);

CREATE TABLE public.memory_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  snapshot_type text NOT NULL,
  business_summary text NOT NULL,
  decision_patterns jsonb DEFAULT '{}'::jsonb NOT NULL,
  active_priorities jsonb DEFAULT '[]'::jsonb NOT NULL,
  risk_profile text,
  recent_decisions jsonb DEFAULT '[]'::jsonb NOT NULL,
  accuracy_score smallint
);

CREATE TABLE public.missed_signal_emails (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  user_id uuid NOT NULL,
  signal_id uuid NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notification_preferences (
  user_id uuid NOT NULL,
  daily_briefing boolean DEFAULT true NOT NULL,
  missed_signals boolean DEFAULT true NOT NULL,
  monthly_recap boolean DEFAULT true NOT NULL,
  decision_nudges boolean DEFAULT true NOT NULL,
  briefing_time text DEFAULT '07:00'::text NOT NULL,
  timezone text DEFAULT 'UTC'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  company_name text,
  industry text,
  company_stage text,
  geography text,
  revenue_range text,
  business_model text,
  onboarding_completed boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  timezone text,
  brief_delivery_time text,
  plan text DEFAULT 'trial'::text NOT NULL,
  trial_ends_at timestamp with time zone,
  plan_started_at timestamp with time zone
);

CREATE TABLE public.recommendations (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  profile_id uuid NOT NULL,
  brief_id uuid,
  consequence_id uuid,
  linked_consequence_id uuid,
  description text NOT NULL,
  time_window text NOT NULL,
  category text,
  status recommendation_status DEFAULT 'pending'::recommendation_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  growth_score integer DEFAULT 0 NOT NULL,
  risk_mgmt_score integer DEFAULT 0 NOT NULL,
  opportunity_score integer DEFAULT 0 NOT NULL,
  investor_ready_score integer DEFAULT 0 NOT NULL,
  external_evaluation text DEFAULT ''::text NOT NULL,
  strategies_accepted_30d integer DEFAULT 0 NOT NULL,
  activity_note text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.roi_cases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  decision_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  category text NOT NULL,
  headline text NOT NULL,
  value_preserved text NOT NULL,
  narrative text NOT NULL,
  ceo_approved boolean DEFAULT false NOT NULL,
  published boolean DEFAULT false NOT NULL
);

CREATE TABLE public.signal_assessments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  signal_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  assessed_at timestamp with time zone DEFAULT now() NOT NULL,
  relevance signal_relevance NOT NULL,
  relevance_score smallint,
  relevance_reason text,
  included_in_brief boolean DEFAULT false NOT NULL
);

CREATE TABLE public.signal_preferences (
  profile_id uuid NOT NULL,
  signal_id uuid NOT NULL,
  watching boolean DEFAULT false NOT NULL,
  watch_baseline text,
  acknowledged_revision text,
  dismissed boolean DEFAULT false NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  provenance text DEFAULT 'account'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.signal_triages (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  signal_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  relevant boolean DEFAULT true NOT NULL,
  relevance_score integer NOT NULL,
  relevance_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.signals (
  id uuid DEFAULT uuid_generate_v4() NOT NULL,
  source signal_source NOT NULL,
  title text NOT NULL,
  content text DEFAULT ''::text NOT NULL,
  url text,
  published_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  urgency text DEFAULT 'watch'::text NOT NULL,
  reviewed_at timestamp with time zone,
  category text,
  what_happened text,
  why_it_matters text,
  what_to_consider text
);

CREATE TABLE public.strategies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  signal_id uuid,
  title text NOT NULL,
  description text NOT NULL,
  timeline_30d text,
  timeline_90d text,
  timeline_6m text,
  cost_of_inaction text,
  status text DEFAULT 'considering'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  outcome_status text,
  outcome_notes text,
  outcome_recorded_at timestamp with time zone
);

CREATE TABLE public.waitlist_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  industry text,
  role text,
  challenge text,
  source text DEFAULT 'landing'::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.advisor_context_links ADD CONSTRAINT advisor_context_links_kind CHECK ((context_kind = ANY (ARRAY['decision'::text, 'signal'::text, 'strategy'::text])));

ALTER TABLE public.advisor_context_links ADD CONSTRAINT advisor_context_links_pkey PRIMARY KEY (session_id);

ALTER TABLE public.advisor_reads ADD CONSTRAINT advisor_reads_pkey PRIMARY KEY (id);

ALTER TABLE public.advisor_sessions ADD CONSTRAINT advisor_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.assessments ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);

ALTER TABLE public.blind_spot_patterns ADD CONSTRAINT blind_spot_patterns_confidence_check CHECK (((confidence >= 0) AND (confidence <= 100)));

ALTER TABLE public.blind_spot_patterns ADD CONSTRAINT blind_spot_patterns_pkey PRIMARY KEY (id);

ALTER TABLE public.blind_spots ADD CONSTRAINT blind_spots_pkey PRIMARY KEY (id);

ALTER TABLE public.briefing_send_log ADD CONSTRAINT briefing_send_log_pkey PRIMARY KEY (id);

ALTER TABLE public.briefing_send_log ADD CONSTRAINT briefing_send_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'skipped'::text])));

ALTER TABLE public.briefs ADD CONSTRAINT briefs_pkey PRIMARY KEY (id);

ALTER TABLE public.ceo_business_context ADD CONSTRAINT ceo_business_context_pkey PRIMARY KEY (id);

ALTER TABLE public.ceo_business_context ADD CONSTRAINT ceo_business_context_profile_id_key UNIQUE (profile_id);

ALTER TABLE public.ceo_context ADD CONSTRAINT ceo_context_arr_band_check CHECK (((arr_band IS NULL) OR (arr_band = ANY (ARRAY['pre_seed'::text, 'pre_1m'::text, '1m_5m'::text, '5m_20m'::text, '20m_plus'::text]))));

ALTER TABLE public.ceo_context ADD CONSTRAINT ceo_context_pkey PRIMARY KEY (id);

ALTER TABLE public.ceo_context ADD CONSTRAINT ceo_context_profile_id_key UNIQUE (profile_id);

ALTER TABLE public.ceo_context ADD CONSTRAINT ceo_context_top_priority_check CHECK (((top_priority IS NULL) OR (top_priority = ANY (ARRAY['Growth'::text, 'Retention'::text, 'Pricing'::text, 'Fundraising'::text, 'Hiring'::text, 'Other'::text]))));

ALTER TABLE public.consequence_maps ADD CONSTRAINT consequence_maps_confidence_score_check CHECK (((confidence_score >= 1) AND (confidence_score <= 100)));

ALTER TABLE public.consequence_maps ADD CONSTRAINT consequence_maps_pkey PRIMARY KEY (id);

ALTER TABLE public.consequence_maps ADD CONSTRAINT consequence_maps_signal_id_profile_id_key UNIQUE (signal_id, profile_id);

ALTER TABLE public.consequence_maps ADD CONSTRAINT consequence_maps_urgency_score_check CHECK (((urgency_score >= 1) AND (urgency_score <= 10)));

ALTER TABLE public.consequences ADD CONSTRAINT consequences_confidence_score_check CHECK (((confidence_score >= 0) AND (confidence_score <= 100)));

ALTER TABLE public.consequences ADD CONSTRAINT consequences_pkey PRIMARY KEY (id);

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_not_own_parent CHECK (((parent_decision_id IS NULL) OR (parent_decision_id <> decision_id)));

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_pkey PRIMARY KEY (decision_id);

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_provenance CHECK ((provenance = ANY (ARRAY['account'::text, 'imported_browser_notes'::text])));

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_support_object CHECK ((jsonb_typeof(support) = 'object'::text));

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_support_size CHECK ((pg_column_size(support) <= 400000));

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_version_positive CHECK ((version > 0));

ALTER TABLE public.decisions ADD CONSTRAINT decisions_confidence_check CHECK ((confidence = ANY (ARRAY['confident'::text, 'torn'::text, 'exploring'::text])));

ALTER TABLE public.decisions ADD CONSTRAINT decisions_confidence_score_check CHECK (((confidence_score >= 1) AND (confidence_score <= 5)));

ALTER TABLE public.decisions ADD CONSTRAINT decisions_pkey PRIMARY KEY (id);

ALTER TABLE public.decisions ADD CONSTRAINT decisions_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['signal'::text, 'strategy'::text, 'manual'::text]))));

ALTER TABLE public.decisions ADD CONSTRAINT decisions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'decided'::text, 'archived'::text])));

ALTER TABLE public.feature_events ADD CONSTRAINT feature_events_pkey PRIMARY KEY (id);

ALTER TABLE public.feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);

ALTER TABLE public.feedback ADD CONSTRAINT feedback_rating_check CHECK (((rating >= 1) AND (rating <= 5)));

ALTER TABLE public.health_scores ADD CONSTRAINT health_scores_pkey PRIMARY KEY (id);

ALTER TABLE public.health_scores ADD CONSTRAINT health_scores_score_check CHECK (((score >= 0) AND (score <= 100)));

ALTER TABLE public.invite_codes ADD CONSTRAINT invite_codes_code_key UNIQUE (code);

ALTER TABLE public.invite_codes ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (id);

ALTER TABLE public.memory_snapshots ADD CONSTRAINT memory_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE public.memory_snapshots ADD CONSTRAINT memory_snapshots_profile_id_snapshot_type_key UNIQUE (profile_id, snapshot_type);

ALTER TABLE public.missed_signal_emails ADD CONSTRAINT missed_signal_emails_pkey PRIMARY KEY (id);

ALTER TABLE public.missed_signal_emails ADD CONSTRAINT missed_signal_emails_user_id_signal_id_key UNIQUE (user_id, signal_id);

ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.recommendations ADD CONSTRAINT recommendations_pkey PRIMARY KEY (id);

ALTER TABLE public.reports ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE public.roi_cases ADD CONSTRAINT roi_cases_pkey PRIMARY KEY (id);

ALTER TABLE public.signal_assessments ADD CONSTRAINT signal_assessments_pkey PRIMARY KEY (id);

ALTER TABLE public.signal_assessments ADD CONSTRAINT signal_assessments_relevance_score_check CHECK (((relevance_score >= 0) AND (relevance_score <= 100)));

ALTER TABLE public.signal_assessments ADD CONSTRAINT signal_assessments_signal_id_profile_id_key UNIQUE (signal_id, profile_id);

ALTER TABLE public.signal_preferences ADD CONSTRAINT signal_preferences_ack_length CHECK (((acknowledged_revision IS NULL) OR (char_length(acknowledged_revision) <= 200)));

ALTER TABLE public.signal_preferences ADD CONSTRAINT signal_preferences_baseline_length CHECK (((watch_baseline IS NULL) OR (char_length(watch_baseline) <= 200)));

ALTER TABLE public.signal_preferences ADD CONSTRAINT signal_preferences_pkey PRIMARY KEY (profile_id, signal_id);

ALTER TABLE public.signal_preferences ADD CONSTRAINT signal_preferences_provenance CHECK ((provenance = ANY (ARRAY['account'::text, 'imported_browser_notes'::text])));

ALTER TABLE public.signal_preferences ADD CONSTRAINT signal_preferences_version_positive CHECK ((version > 0));

ALTER TABLE public.signal_triages ADD CONSTRAINT signal_triages_pkey PRIMARY KEY (id);

ALTER TABLE public.signal_triages ADD CONSTRAINT signal_triages_relevance_score_check CHECK (((relevance_score >= 0) AND (relevance_score <= 100)));

ALTER TABLE public.signal_triages ADD CONSTRAINT signal_triages_signal_id_profile_id_key UNIQUE (signal_id, profile_id);

ALTER TABLE public.signals ADD CONSTRAINT signals_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['pricing'::text, 'cost_base'::text, 'competition'::text, 'compliance'::text, 'capital'::text]))));

ALTER TABLE public.signals ADD CONSTRAINT signals_pkey PRIMARY KEY (id);

ALTER TABLE public.signals ADD CONSTRAINT signals_urgency_check CHECK ((urgency = ANY (ARRAY['act_this_week'::text, 'decide_this_month'::text, 'watch'::text])));

ALTER TABLE public.strategies ADD CONSTRAINT strategies_outcome_status_check CHECK ((outcome_status = ANY (ARRAY['worked'::text, 'didnt_work'::text, 'too_early'::text, 'unclear'::text])));

ALTER TABLE public.strategies ADD CONSTRAINT strategies_pkey PRIMARY KEY (id);

ALTER TABLE public.strategies ADD CONSTRAINT strategies_status_check CHECK ((status = ANY (ARRAY['considering'::text, 'deciding'::text, 'decided'::text, 'archived'::text])));

ALTER TABLE public.waitlist_requests ADD CONSTRAINT waitlist_requests_email_key UNIQUE (email);

ALTER TABLE public.waitlist_requests ADD CONSTRAINT waitlist_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.advisor_context_links ADD CONSTRAINT advisor_context_links_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.advisor_context_links ADD CONSTRAINT advisor_context_links_session_owner_fk FOREIGN KEY (session_id, profile_id) REFERENCES advisor_sessions(id, profile_id) ON DELETE CASCADE;

ALTER TABLE public.advisor_reads ADD CONSTRAINT advisor_reads_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.advisor_sessions ADD CONSTRAINT advisor_sessions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.assessments ADD CONSTRAINT assessments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.blind_spot_patterns ADD CONSTRAINT blind_spot_patterns_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.briefing_send_log ADD CONSTRAINT briefing_send_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.briefs ADD CONSTRAINT briefs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.ceo_context ADD CONSTRAINT ceo_context_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.consequences ADD CONSTRAINT consequences_brief_id_fkey FOREIGN KEY (brief_id) REFERENCES briefs(id) ON DELETE SET NULL;

ALTER TABLE public.consequences ADD CONSTRAINT consequences_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.consequences ADD CONSTRAINT consequences_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE SET NULL;

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_decision_owner_fk FOREIGN KEY (decision_id, profile_id) REFERENCES decisions(id, profile_id) ON DELETE CASCADE;

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_parent_owner_fk FOREIGN KEY (parent_decision_id, profile_id) REFERENCES decisions(id, profile_id) ON DELETE SET NULL (parent_decision_id);

ALTER TABLE public.decision_workspaces ADD CONSTRAINT decision_workspaces_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.decisions ADD CONSTRAINT decisions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.feature_events ADD CONSTRAINT feature_events_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.feedback ADD CONSTRAINT feedback_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.health_scores ADD CONSTRAINT health_scores_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.missed_signal_emails ADD CONSTRAINT missed_signal_emails_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE;

ALTER TABLE public.missed_signal_emails ADD CONSTRAINT missed_signal_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.recommendations ADD CONSTRAINT recommendations_brief_id_fkey FOREIGN KEY (brief_id) REFERENCES briefs(id) ON DELETE SET NULL;

ALTER TABLE public.recommendations ADD CONSTRAINT recommendations_consequence_id_fkey FOREIGN KEY (consequence_id) REFERENCES consequences(id) ON DELETE SET NULL;

ALTER TABLE public.recommendations ADD CONSTRAINT recommendations_linked_consequence_id_fkey FOREIGN KEY (linked_consequence_id) REFERENCES consequences(id) ON DELETE SET NULL;

ALTER TABLE public.recommendations ADD CONSTRAINT recommendations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.reports ADD CONSTRAINT reports_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.signal_preferences ADD CONSTRAINT signal_preferences_account_link_fk FOREIGN KEY (signal_id, profile_id) REFERENCES signal_triages(signal_id, profile_id) ON DELETE CASCADE;

ALTER TABLE public.signal_triages ADD CONSTRAINT signal_triages_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.signal_triages ADD CONSTRAINT signal_triages_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE;

ALTER TABLE public.strategies ADD CONSTRAINT strategies_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.strategies ADD CONSTRAINT strategies_signal_id_fkey FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX advisor_sessions_id_profile_id_key ON public.advisor_sessions USING btree (id, profile_id);

CREATE UNIQUE INDEX briefing_send_log_sent_once_idx ON public.briefing_send_log USING btree (user_id, local_date) WHERE (status = 'sent'::text);

CREATE INDEX briefing_send_log_user_date_idx ON public.briefing_send_log USING btree (user_id, local_date);

CREATE UNIQUE INDEX decisions_id_profile_id_key ON public.decisions USING btree (id, profile_id);

CREATE INDEX idx_advisor_context_links_context ON public.advisor_context_links USING btree (profile_id, context_kind, context_id);

CREATE UNIQUE INDEX idx_advisor_reads_profile_date ON public.advisor_reads USING btree (profile_id, local_date);

CREATE INDEX idx_advisor_sessions_profile ON public.advisor_sessions USING btree (profile_id);

CREATE INDEX idx_advisor_sessions_updated ON public.advisor_sessions USING btree (updated_at DESC);

CREATE INDEX idx_blind_spots_active ON public.blind_spot_patterns USING btree (profile_id, is_active);

CREATE INDEX idx_blind_spots_profile ON public.blind_spot_patterns USING btree (profile_id);

CREATE INDEX idx_briefs_generated ON public.briefs USING btree (generated_at DESC);

CREATE INDEX idx_briefs_profile ON public.briefs USING btree (profile_id);

CREATE INDEX idx_ceo_context_profile ON public.ceo_context USING btree (profile_id);

CREATE INDEX idx_consequence_maps_profile ON public.consequence_maps USING btree (profile_id, created_at DESC);

CREATE INDEX idx_consequences_brief ON public.consequences USING btree (brief_id);

CREATE INDEX idx_consequences_profile ON public.consequences USING btree (profile_id);

CREATE INDEX idx_consequences_signal ON public.consequences USING btree (signal_id);

CREATE INDEX idx_consequences_status ON public.consequences USING btree (status);

CREATE INDEX idx_decision_workspaces_parent ON public.decision_workspaces USING btree (parent_decision_id) WHERE (parent_decision_id IS NOT NULL);

CREATE INDEX idx_decision_workspaces_profile ON public.decision_workspaces USING btree (profile_id);

CREATE INDEX idx_decisions_created ON public.decisions USING btree (created_at DESC);

CREATE INDEX idx_decisions_deadline ON public.decisions USING btree (deadline);

CREATE INDEX idx_decisions_profile ON public.decisions USING btree (profile_id);

CREATE INDEX idx_decisions_status ON public.decisions USING btree (status);

CREATE INDEX idx_feature_events_created ON public.feature_events USING btree (created_at DESC);

CREATE INDEX idx_feature_events_event ON public.feature_events USING btree (event);

CREATE INDEX idx_feature_events_profile ON public.feature_events USING btree (profile_id);

CREATE INDEX idx_health_scores_calculated ON public.health_scores USING btree (calculated_at DESC);

CREATE INDEX idx_health_scores_profile ON public.health_scores USING btree (profile_id);

CREATE INDEX idx_invite_codes_created ON public.invite_codes USING btree (created_at DESC);

CREATE INDEX idx_invite_codes_unused ON public.invite_codes USING btree (created_at DESC) WHERE (used_at IS NULL);

CREATE INDEX idx_missed_signal_emails_user ON public.missed_signal_emails USING btree (user_id);

CREATE INDEX idx_recommendations_brief ON public.recommendations USING btree (brief_id);

CREATE INDEX idx_recommendations_profile ON public.recommendations USING btree (profile_id);

CREATE INDEX idx_signal_assessments_profile ON public.signal_assessments USING btree (profile_id, assessed_at DESC);

CREATE INDEX idx_signal_triages_created ON public.signal_triages USING btree (created_at DESC);

CREATE INDEX idx_signal_triages_profile ON public.signal_triages USING btree (profile_id);

CREATE INDEX idx_signal_triages_signal ON public.signal_triages USING btree (signal_id);

CREATE INDEX idx_signals_category ON public.signals USING btree (category, created_at DESC);

CREATE INDEX idx_signals_created ON public.signals USING btree (created_at DESC);

CREATE INDEX idx_signals_source ON public.signals USING btree (source);

CREATE INDEX idx_signals_urgency_created ON public.signals USING btree (urgency, created_at);

CREATE INDEX idx_strategies_created ON public.strategies USING btree (created_at DESC);

CREATE INDEX idx_strategies_outcome_status ON public.strategies USING btree (profile_id, outcome_status) WHERE (outcome_status IS NOT NULL);

CREATE INDEX idx_strategies_profile ON public.strategies USING btree (profile_id);

CREATE INDEX idx_strategies_status ON public.strategies USING btree (status);

CREATE INDEX idx_waitlist_created_at ON public.waitlist_requests USING btree (created_at DESC);

CREATE OR REPLACE FUNCTION public.advisor_context_link_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id) THEN
    RAISE EXCEPTION 'conversation ownership cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.context_kind = 'decision' AND NOT EXISTS (SELECT 1 FROM public.decisions WHERE id = NEW.context_id AND profile_id = NEW.profile_id)
     OR NEW.context_kind = 'strategy' AND NOT EXISTS (SELECT 1 FROM public.strategies WHERE id = NEW.context_id AND profile_id = NEW.profile_id)
     OR NEW.context_kind = 'signal' AND NOT EXISTS (SELECT 1 FROM public.signal_triages WHERE signal_id = NEW.context_id AND profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'conversation context is not in this account' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); ELSE NEW.created_at := OLD.created_at; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.decision_workspace_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  old_reviews jsonb; new_reviews jsonb; i integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1; NEW.created_at := now(); NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.decision_id IS DISTINCT FROM OLD.decision_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'decision workspace ownership cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.parent_decision_id IS NOT NULL AND NEW.parent_decision_id IS DISTINCT FROM OLD.parent_decision_id THEN
    RAISE EXCEPTION 'reconsideration link cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'decision workspace version must advance by one' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(OLD.support -> 'snapshot', 'null'::jsonb) <> 'null'::jsonb
     AND NEW.support -> 'snapshot' IS DISTINCT FROM OLD.support -> 'snapshot' THEN
    RAISE EXCEPTION 'a recorded choice snapshot cannot change' USING ERRCODE = 'check_violation';
  END IF;
  old_reviews := COALESCE(OLD.support -> 'reviews', '[]'::jsonb);
  new_reviews := COALESCE(NEW.support -> 'reviews', '[]'::jsonb);
  IF jsonb_typeof(old_reviews) = 'array' THEN
    IF jsonb_typeof(new_reviews) <> 'array' OR jsonb_array_length(new_reviews) < jsonb_array_length(old_reviews) THEN
      RAISE EXCEPTION 'reviews are append-only' USING ERRCODE = 'check_violation';
    END IF;
    FOR i IN 0 .. jsonb_array_length(old_reviews) - 1 LOOP
      IF new_reviews -> i IS DISTINCT FROM old_reviews -> i THEN
        RAISE EXCEPTION 'reviews are append-only' USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.save_decision_workspace(p_decision_id uuid, p_expected_decision_updated_at timestamp with time zone, p_expected_workspace_version integer, p_core jsonb, p_support jsonb, p_parent_decision_id uuid DEFAULT NULL::uuid, p_provenance text DEFAULT 'account'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid uuid := auth.uid();
  d public.decisions%ROWTYPE;
  w public.decision_workspaces%ROWTYPE;
  has_core boolean := p_core IS NOT NULL AND jsonb_typeof(p_core) = 'object' AND p_core <> '{}'::jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauthenticated');
  END IF;
  SELECT * INTO d FROM public.decisions WHERE id = p_decision_id AND profile_id = uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;
  IF d.updated_at IS DISTINCT FROM p_expected_decision_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'decision', to_jsonb(d));
  END IF;
  SELECT * INTO w FROM public.decision_workspaces WHERE decision_id = p_decision_id FOR UPDATE;
  IF COALESCE(w.version, 0) IS DISTINCT FROM COALESCE(p_expected_workspace_version, 0) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'conflict', 'workspaceVersion', COALESCE(w.version, 0));
  END IF;

  IF has_core THEN
    UPDATE public.decisions SET
      title                   = CASE WHEN p_core ? 'title' THEN p_core ->> 'title' ELSE title END,
      description             = CASE WHEN p_core ? 'description' THEN p_core ->> 'description' ELSE description END,
      rationale               = CASE WHEN p_core ? 'rationale' THEN COALESCE(p_core ->> 'rationale', '') ELSE rationale END,
      known_context           = CASE WHEN p_core ? 'known_context' THEN p_core ->> 'known_context' ELSE known_context END,
      open_questions          = CASE WHEN p_core ? 'open_questions' THEN p_core ->> 'open_questions' ELSE open_questions END,
      deadline                = CASE WHEN p_core ? 'deadline' THEN NULLIF(p_core ->> 'deadline', '')::timestamptz ELSE deadline END,
      alternatives_considered = CASE WHEN p_core ? 'alternatives_considered' THEN p_core -> 'alternatives_considered' ELSE alternatives_considered END,
      status                  = CASE WHEN p_core ? 'status' THEN p_core ->> 'status' ELSE status END,
      actual_outcome          = CASE WHEN p_core ? 'actual_outcome' THEN p_core ->> 'actual_outcome' ELSE actual_outcome END,
      outcome_reviewed_at     = CASE WHEN p_core ? 'actual_outcome' THEN now() ELSE outcome_reviewed_at END,
      updated_at              = now()
    WHERE id = p_decision_id AND profile_id = uid
    RETURNING * INTO d;
  END IF;

  IF p_support IS NOT NULL THEN
    IF w.decision_id IS NULL THEN
      INSERT INTO public.decision_workspaces (decision_id, profile_id, support, parent_decision_id, provenance)
      VALUES (p_decision_id, uid, p_support, p_parent_decision_id, COALESCE(p_provenance, 'account'))
      RETURNING * INTO w;
    ELSE
      UPDATE public.decision_workspaces
         SET support = p_support,
             version = w.version + 1,
             parent_decision_id = COALESCE(w.parent_decision_id, p_parent_decision_id)
       WHERE decision_id = p_decision_id
      RETURNING * INTO w;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'decision', to_jsonb(d), 'workspace',
    CASE WHEN w.decision_id IS NULL THEN NULL ELSE to_jsonb(w) END);
END $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.signal_preference_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1; NEW.created_at := now(); NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id OR NEW.signal_id IS DISTINCT FROM OLD.signal_id THEN
    RAISE EXCEPTION 'signal preference ownership cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'signal preference version must advance by one' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END $function$
;

CREATE TRIGGER trg_advisor_context_link_guard BEFORE INSERT OR UPDATE ON public.advisor_context_links FOR EACH ROW EXECUTE FUNCTION advisor_context_link_guard();

CREATE TRIGGER trg_blind_spots_updated_at BEFORE UPDATE ON public.blind_spot_patterns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ceo_context_updated_at BEFORE UPDATE ON public.ceo_context FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_consequences_updated_at BEFORE UPDATE ON public.consequences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_decision_workspace_guard BEFORE INSERT OR UPDATE ON public.decision_workspaces FOR EACH ROW EXECUTE FUNCTION decision_workspace_guard();

CREATE TRIGGER trg_decisions_updated_at BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recommendations_updated_at BEFORE UPDATE ON public.recommendations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_signal_preference_guard BEFORE INSERT OR UPDATE ON public.signal_preferences FOR EACH ROW EXECUTE FUNCTION signal_preference_guard();

CREATE TRIGGER trg_signal_triages_updated_at BEFORE UPDATE ON public.signal_triages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_strategies_updated_at BEFORE UPDATE ON public.strategies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

ALTER TABLE public.advisor_context_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.advisor_reads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.advisor_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.blind_spot_patterns ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.blind_spots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.briefing_send_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ceo_business_context ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ceo_context ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consequence_maps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consequences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.decision_workspaces ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feature_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.health_scores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memory_snapshots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.missed_signal_emails ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.roi_cases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.signal_assessments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.signal_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.signal_triages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.waitlist_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advisor_context_links: owner delete" ON public.advisor_context_links AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "advisor_context_links: owner insert" ON public.advisor_context_links AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "advisor_context_links: owner read" ON public.advisor_context_links AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "advisor_context_links: owner update" ON public.advisor_context_links AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = profile_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "advisor_reads: own profile" ON public.advisor_reads AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY advisor_sessions_own ON public.advisor_sessions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY assessments_own ON public.assessments AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY "blind_spot_patterns: own profile" ON public.blind_spot_patterns AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY blind_spots_own ON public.blind_spots AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY "Service role manages briefing send log" ON public.briefing_send_log AS PERMISSIVE FOR ALL TO public USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));

CREATE POLICY "briefs: own profile" ON public.briefs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY ctx_own ON public.ceo_business_context AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY "ceo_context: own profile" ON public.ceo_context AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY maps_own ON public.consequence_maps AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY "consequences: own profile" ON public.consequences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY "decision_workspaces: owner insert" ON public.decision_workspaces AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "decision_workspaces: owner read" ON public.decision_workspaces AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "decision_workspaces: owner update" ON public.decision_workspaces AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = profile_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "decisions: own profile" ON public.decisions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY feature_events_read ON public.feature_events AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = profile_id));

CREATE POLICY feature_events_service ON public.feature_events AS PERMISSIVE FOR ALL TO public USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));

CREATE POLICY "feedback: authenticated insert" ON public.feedback AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY "feedback: service role all" ON public.feedback AS PERMISSIVE FOR ALL TO public USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));

CREATE POLICY "health_scores: own profile" ON public.health_scores AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY memory_own ON public.memory_snapshots AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY "Service role can manage missed-signal emails" ON public.missed_signal_emails AS PERMISSIVE FOR ALL TO public USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));

CREATE POLICY "Users can view own missed-signal emails" ON public.missed_signal_emails AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));

CREATE POLICY "Users can manage own notification preferences" ON public.notification_preferences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "profiles: own row" ON public.profiles AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = id));

CREATE POLICY "recommendations: own profile" ON public.recommendations AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY reports_own ON public.reports AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY assessments_own ON public.signal_assessments AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY "signal_preferences: owner insert" ON public.signal_preferences AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "signal_preferences: owner read" ON public.signal_preferences AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "signal_preferences: owner update" ON public.signal_preferences AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = profile_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = profile_id));

CREATE POLICY "Service role can manage triages" ON public.signal_triages AS PERMISSIVE FOR ALL TO public USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));

CREATE POLICY "Users can view own triages" ON public.signal_triages AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = profile_id));

CREATE POLICY signal_triages_own ON public.signal_triages AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

CREATE POLICY "signals: authenticated read" ON public.signals AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "signals: service role full access" ON public.signals AS PERMISSIVE FOR ALL TO public USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));

CREATE POLICY "signals: service role insert" ON public.signals AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY strategies_own ON public.strategies AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = profile_id));

REVOKE ALL ON public.advisor_context_links FROM authenticated; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.advisor_context_links TO authenticated;

REVOKE ALL ON public.advisor_context_links FROM service_role; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.advisor_context_links TO service_role;

REVOKE ALL ON public.advisor_reads FROM anon; GRANT DELETE, SELECT, UPDATE, INSERT, TRIGGER, REFERENCES, TRUNCATE ON public.advisor_reads TO anon;

REVOKE ALL ON public.advisor_reads FROM authenticated; GRANT INSERT, DELETE, SELECT, TRUNCATE, REFERENCES, UPDATE, TRIGGER ON public.advisor_reads TO authenticated;

REVOKE ALL ON public.advisor_reads FROM service_role; GRANT INSERT, DELETE, SELECT, TRUNCATE, REFERENCES, UPDATE, TRIGGER ON public.advisor_reads TO service_role;

REVOKE ALL ON public.advisor_sessions FROM anon; GRANT SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT, UPDATE ON public.advisor_sessions TO anon;

REVOKE ALL ON public.advisor_sessions FROM authenticated; GRANT DELETE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE, TRUNCATE ON public.advisor_sessions TO authenticated;

REVOKE ALL ON public.advisor_sessions FROM service_role; GRANT DELETE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE, TRUNCATE ON public.advisor_sessions TO service_role;

REVOKE ALL ON public.assessments FROM anon; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.assessments TO anon;

REVOKE ALL ON public.assessments FROM authenticated; GRANT DELETE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE, TRUNCATE ON public.assessments TO authenticated;

REVOKE ALL ON public.assessments FROM service_role; GRANT DELETE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE, TRUNCATE ON public.assessments TO service_role;

REVOKE ALL ON public.blind_spot_patterns FROM anon; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.blind_spot_patterns TO anon;

REVOKE ALL ON public.blind_spot_patterns FROM authenticated; GRANT DELETE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, UPDATE ON public.blind_spot_patterns TO authenticated;

REVOKE ALL ON public.blind_spot_patterns FROM service_role; GRANT DELETE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, UPDATE ON public.blind_spot_patterns TO service_role;

REVOKE ALL ON public.blind_spots FROM anon; GRANT REFERENCES, SELECT, TRIGGER, INSERT, TRUNCATE, DELETE, UPDATE ON public.blind_spots TO anon;

REVOKE ALL ON public.blind_spots FROM authenticated; GRANT DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE ON public.blind_spots TO authenticated;

REVOKE ALL ON public.blind_spots FROM service_role; GRANT DELETE, TRUNCATE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE ON public.blind_spots TO service_role;

REVOKE ALL ON public.briefing_send_log FROM anon; GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.briefing_send_log TO anon;

REVOKE ALL ON public.briefing_send_log FROM authenticated; GRANT TRUNCATE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE, DELETE ON public.briefing_send_log TO authenticated;

REVOKE ALL ON public.briefing_send_log FROM service_role; GRANT TRUNCATE, REFERENCES, TRIGGER, INSERT, SELECT, UPDATE, DELETE ON public.briefing_send_log TO service_role;

REVOKE ALL ON public.briefs FROM anon; GRANT DELETE, TRIGGER, REFERENCES, TRUNCATE, UPDATE, SELECT, INSERT ON public.briefs TO anon;

REVOKE ALL ON public.briefs FROM authenticated; GRANT UPDATE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE ON public.briefs TO authenticated;

REVOKE ALL ON public.briefs FROM service_role; GRANT UPDATE, SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE ON public.briefs TO service_role;

REVOKE ALL ON public.ceo_business_context FROM anon; GRANT REFERENCES, SELECT, INSERT, TRIGGER, UPDATE, DELETE, TRUNCATE ON public.ceo_business_context TO anon;

REVOKE ALL ON public.ceo_business_context FROM authenticated; GRANT DELETE, TRIGGER, REFERENCES, TRUNCATE, UPDATE, SELECT, INSERT ON public.ceo_business_context TO authenticated;

REVOKE ALL ON public.ceo_business_context FROM service_role; GRANT DELETE, TRIGGER, REFERENCES, TRUNCATE, UPDATE, SELECT, INSERT ON public.ceo_business_context TO service_role;

REVOKE ALL ON public.ceo_context FROM anon; GRANT REFERENCES, DELETE, TRUNCATE, INSERT, TRIGGER, SELECT, UPDATE ON public.ceo_context TO anon;

REVOKE ALL ON public.ceo_context FROM authenticated; GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.ceo_context TO authenticated;

REVOKE ALL ON public.ceo_context FROM service_role; GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.ceo_context TO service_role;

REVOKE ALL ON public.consequence_maps FROM anon; GRANT UPDATE, TRIGGER, REFERENCES, TRUNCATE, DELETE, SELECT, INSERT ON public.consequence_maps TO anon;

REVOKE ALL ON public.consequence_maps FROM authenticated; GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, SELECT ON public.consequence_maps TO authenticated;

REVOKE ALL ON public.consequence_maps FROM service_role; GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, SELECT ON public.consequence_maps TO service_role;

REVOKE ALL ON public.consequences FROM anon; GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.consequences TO anon;

REVOKE ALL ON public.consequences FROM authenticated; GRANT SELECT, DELETE, TRUNCATE, UPDATE, REFERENCES, TRIGGER, INSERT ON public.consequences TO authenticated;

REVOKE ALL ON public.consequences FROM service_role; GRANT SELECT, DELETE, TRUNCATE, UPDATE, REFERENCES, TRIGGER, INSERT ON public.consequences TO service_role;

REVOKE ALL ON public.decision_workspaces FROM authenticated; GRANT DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.decision_workspaces TO authenticated;

REVOKE ALL ON public.decision_workspaces FROM service_role; GRANT DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.decision_workspaces TO service_role;

REVOKE ALL ON public.decisions FROM anon; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.decisions TO anon;

REVOKE ALL ON public.decisions FROM authenticated; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.decisions TO authenticated;

REVOKE ALL ON public.decisions FROM service_role; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.decisions TO service_role;

REVOKE ALL ON public.feature_events FROM anon; GRANT DELETE, INSERT, SELECT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.feature_events TO anon;

REVOKE ALL ON public.feature_events FROM authenticated; GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.feature_events TO authenticated;

REVOKE ALL ON public.feature_events FROM service_role; GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.feature_events TO service_role;

REVOKE ALL ON public.feedback FROM anon; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.feedback TO anon;

REVOKE ALL ON public.feedback FROM authenticated; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.feedback TO authenticated;

REVOKE ALL ON public.feedback FROM service_role; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.feedback TO service_role;

REVOKE ALL ON public.health_scores FROM anon; GRANT SELECT, TRIGGER, INSERT, REFERENCES, TRUNCATE, DELETE, UPDATE ON public.health_scores TO anon;

REVOKE ALL ON public.health_scores FROM authenticated; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.health_scores TO authenticated;

REVOKE ALL ON public.health_scores FROM service_role; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.health_scores TO service_role;

REVOKE ALL ON public.invite_codes FROM anon; GRANT UPDATE, SELECT, INSERT, REFERENCES, TRIGGER, TRUNCATE, DELETE ON public.invite_codes TO anon;

REVOKE ALL ON public.invite_codes FROM authenticated; GRANT SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE ON public.invite_codes TO authenticated;

REVOKE ALL ON public.invite_codes FROM service_role; GRANT SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE ON public.invite_codes TO service_role;

REVOKE ALL ON public.memory_snapshots FROM anon; GRANT TRIGGER, REFERENCES, INSERT, UPDATE, DELETE, TRUNCATE, SELECT ON public.memory_snapshots TO anon;

REVOKE ALL ON public.memory_snapshots FROM authenticated; GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.memory_snapshots TO authenticated;

REVOKE ALL ON public.memory_snapshots FROM service_role; GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.memory_snapshots TO service_role;

REVOKE ALL ON public.missed_signal_emails FROM anon; GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.missed_signal_emails TO anon;

REVOKE ALL ON public.missed_signal_emails FROM authenticated; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.missed_signal_emails TO authenticated;

REVOKE ALL ON public.missed_signal_emails FROM service_role; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.missed_signal_emails TO service_role;

REVOKE ALL ON public.notification_preferences FROM anon; GRANT REFERENCES, UPDATE, TRUNCATE, DELETE, INSERT, SELECT, TRIGGER ON public.notification_preferences TO anon;

REVOKE ALL ON public.notification_preferences FROM authenticated; GRANT REFERENCES, TRUNCATE, DELETE, INSERT, SELECT, TRIGGER, UPDATE ON public.notification_preferences TO authenticated;

REVOKE ALL ON public.notification_preferences FROM service_role; GRANT REFERENCES, TRUNCATE, DELETE, INSERT, SELECT, TRIGGER, UPDATE ON public.notification_preferences TO service_role;

REVOKE ALL ON public.profiles FROM anon; GRANT SELECT, UPDATE, INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles TO anon;

REVOKE ALL ON public.profiles FROM authenticated; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.profiles TO authenticated;

REVOKE ALL ON public.profiles FROM service_role; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.profiles TO service_role;

REVOKE ALL ON public.recommendations FROM anon; GRANT TRIGGER, SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.recommendations TO anon;

REVOKE ALL ON public.recommendations FROM authenticated; GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.recommendations TO authenticated;

REVOKE ALL ON public.recommendations FROM service_role; GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.recommendations TO service_role;

REVOKE ALL ON public.reports FROM anon; GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.reports TO anon;

REVOKE ALL ON public.reports FROM authenticated; GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.reports TO authenticated;

REVOKE ALL ON public.reports FROM service_role; GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.reports TO service_role;

REVOKE ALL ON public.roi_cases FROM anon; GRANT SELECT, INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE ON public.roi_cases TO anon;

REVOKE ALL ON public.roi_cases FROM authenticated; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.roi_cases TO authenticated;

REVOKE ALL ON public.roi_cases FROM service_role; GRANT TRIGGER, INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.roi_cases TO service_role;

REVOKE ALL ON public.signal_assessments FROM anon; GRANT UPDATE, TRIGGER, INSERT, SELECT, DELETE, TRUNCATE, REFERENCES ON public.signal_assessments TO anon;

REVOKE ALL ON public.signal_assessments FROM authenticated; GRANT TRIGGER, UPDATE, INSERT, SELECT, DELETE, TRUNCATE, REFERENCES ON public.signal_assessments TO authenticated;

REVOKE ALL ON public.signal_assessments FROM service_role; GRANT TRIGGER, UPDATE, INSERT, SELECT, DELETE, TRUNCATE, REFERENCES ON public.signal_assessments TO service_role;

REVOKE ALL ON public.signal_preferences FROM authenticated; GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.signal_preferences TO authenticated;

REVOKE ALL ON public.signal_preferences FROM service_role; GRANT TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT, INSERT ON public.signal_preferences TO service_role;

REVOKE ALL ON public.signal_triages FROM anon; GRANT UPDATE, INSERT, SELECT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.signal_triages TO anon;

REVOKE ALL ON public.signal_triages FROM authenticated; GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.signal_triages TO authenticated;

REVOKE ALL ON public.signal_triages FROM service_role; GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.signal_triages TO service_role;

REVOKE ALL ON public.signals FROM anon; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.signals TO anon;

REVOKE ALL ON public.signals FROM authenticated; GRANT TRIGGER, INSERT, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.signals TO authenticated;

REVOKE ALL ON public.signals FROM service_role; GRANT TRIGGER, INSERT, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.signals TO service_role;

REVOKE ALL ON public.strategies FROM anon; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.strategies TO anon;

REVOKE ALL ON public.strategies FROM authenticated; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.strategies TO authenticated;

REVOKE ALL ON public.strategies FROM service_role; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.strategies TO service_role;

REVOKE ALL ON public.waitlist_requests FROM anon; GRANT INSERT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, SELECT ON public.waitlist_requests TO anon;

REVOKE ALL ON public.waitlist_requests FROM authenticated; GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.waitlist_requests TO authenticated;

REVOKE ALL ON public.waitlist_requests FROM service_role; GRANT SELECT, TRIGGER, REFERENCES, TRUNCATE, DELETE, UPDATE, INSERT ON public.waitlist_requests TO service_role;

-- Production also has this event trigger (new public tables get RLS enabled automatically).
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable();
