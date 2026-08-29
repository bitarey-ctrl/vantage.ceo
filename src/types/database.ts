// ─── Scalar enums ─────────────────────────────────────────────────────────────

export type ImpactLevel = 'high' | 'medium' | 'low' | 'none';

export type DecisionCategory =
  | 'hiring'
  | 'pricing'
  | 'expansion'
  | 'product'
  | 'team'
  | 'regulatory'
  | 'partnerships'
  | 'fundraising'
  | 'marketing'
  | 'operations'
  | 'other';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

// Signal urgency tiers — distinct from a Decision's UrgencyLevel.
// Drives the prioritised signal feed (act-this-week first).
export type SignalUrgency = 'act_this_week' | 'decide_this_month' | 'watch';

export type { SignalCategory } from '@/lib/signals/icp';
import type { SignalCategory } from '@/lib/signals/icp';

export type DecisionStatus = 'draft' | 'active' | 'pending' | 'resolved' | 'archived';

/** Must match the CHECK constraint in migration 024. */
export type ArrBand = 'pre_seed' | 'pre_1m' | '1m_5m' | '5m_20m' | '20m_plus';

// ─── Nested value objects ──────────────────────────────────────────────────────

export interface AlternativeConsidered {
  description: string;
  reasonRejected: string;
}

export interface StrategicPriority {
  title: string;
  description?: string;
  timeHorizon?: string;
  delay_impact?: string; // What happens if this priority slips
  weight?: number;       // Relative importance 1–10
}

export interface Competitor {
  name: string;
  threat_level?: 'low' | 'medium' | 'high';
  differentiator?: string;
  worst_case_move?: string; // What's the scariest thing they could do
}

export interface PastDecisionRegret {
  description: string;
  lessons_learned?: string;
  actual_cost?: number | null;
  cost_description?: string;
  lesson?: string;
}

export interface ImpactMatrix {
  revenue: ImpactLevel;
  cost: ImpactLevel;
  competitive_position: ImpactLevel;
  regulatory_exposure: ImpactLevel;
}

export interface ConsequenceHorizon {
  days: number;
  description: string;
}

// ─── Database row types (snake_case — matches Supabase columns) ───────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  industry: string | null;
  company_stage: string | null;
  geography: string | null;       // e.g. "United States"
  revenue_range: string | null;   // e.g. "$1M–$5M ARR"
  business_model: string | null;  // e.g. "SaaS", "Marketplace"
  timezone: string | null;        // e.g. "America/New_York" (added in 002)
  brief_delivery_time: string | null; // e.g. "07:00" (added in 002)
  onboarding_completed: boolean;
  plan: 'trial' | 'solo' | 'pro';
  trial_ends_at: string | null;
  plan_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CeoContext {
  id: string;
  profile_id: string;
  strategic_priorities: StrategicPriority[];
  revenue_model: string | null;
  monthly_revenue_range: string | null;
  competitors: Competitor[];
  /**
   * ARR band captured at onboarding (migration 024). Optional so the routes
   * that build CeoContext literals from partial rows keep compiling.
   */
  arr_band?: ArrBand | null;
  avoided_decision: string | null;
  avoided_decision_stated_reason: string | null;
  sector: string | null;
  sector_tags: string[];
  geography_detail: string | null; // Specific geography context
  past_decision_regrets: PastDecisionRegret[];
  past_decision_regret?: PastDecisionRegret | null; // singular alias used by onboarding
  created_at: string;
  updated_at: string;
}

export type DecisionSource = 'signal' | 'strategy' | 'manual';

export type DecisionLifecycle = 'open' | 'decided' | 'archived';

export type BlindSpotCategory =
  | 'financial'
  | 'regulatory'
  | 'competitive'
  | 'operational'
  | 'reputational'
  | 'market_timing'
  | 'team_capacity'
  | 'customer_perception';

export type DecisionConfidence = 'confident' | 'torn' | 'exploring';

export interface BlindSpot {
  category: BlindSpotCategory;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface Decision {
  id: string;
  profile_id: string;
  title: string;
  description: string | null;
  category: DecisionCategory | null;
  source: DecisionSource | null;
  source_id: string | null;
  deadline: string | null;
  blind_spots: BlindSpot[] | null;
  rationale: string;
  confidence: DecisionConfidence;
  known_context: string | null;
  open_questions: string | null;
  predicted_outcome: string;
  confidence_score: number; // 1–5
  urgency_level: UrgencyLevel;
  emotional_context: string | null;
  alternatives_considered: AlternativeConsidered[];
  status: DecisionLifecycle;
  actual_outcome: string | null;
  outcome_variance_cost: number | null;
  outcome_variance_description: string | null;
  outcome_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: string;
  source: 'perplexity' | 'rss' | 'manual';
  title: string;
  content: string;
  url: string | null;
  published_at: string | null;
  urgency: SignalUrgency;
  /** Which of the five categories the gate matched. Null on pre-gate rows. */
  category: SignalCategory | null;
  what_happened: string | null;
  why_it_matters: string | null;
  what_to_consider: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  daily_briefing: boolean;
  missed_signals: boolean;
  monthly_recap: boolean;
  decision_nudges: boolean;
  briefing_time: string; // 'HH:MM', user-local
  timezone: string;      // IANA tz, e.g. 'America/New_York'
  created_at: string;
  updated_at: string;
}

export type StrategyStatus = 'considering' | 'deciding' | 'decided' | 'archived';

export interface Strategy {
  id: string;
  profile_id: string;
  signal_id: string | null;
  title: string;
  description: string;
  timeline_30d: string | null;
  timeline_90d: string | null;
  timeline_6m: string | null;
  cost_of_inaction: string | null;
  status: StrategyStatus;
  outcome_status?: 'worked' | 'didnt_work' | 'too_early' | 'unclear' | null;
  outcome_notes?: string | null;
  outcome_recorded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Consequence {
  id: string;
  profile_id: string;
  signal_id: string | null;
  brief_id: string | null;
  so_what: string;
  primary_impact: string;
  secondary_impact: string | null;
  tertiary_risk: string | null;
  action_recommendation: string;
  urgency_window: string;
  urgency_days: number;
  confidence_score: number; // 0–100
  impact_matrix: ImpactMatrix;
  consequence_horizons: ConsequenceHorizon[];
  status: 'pending' | 'accepted' | 'rejected';
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined relation (when queried with signal:signals)
  signal?: Pick<Signal, 'id' | 'title' | 'content' | 'source' | 'url' | 'published_at' | 'created_at'> | null;
}

export interface BlindSpotPattern {
  id: string;
  profile_id: string;
  pattern_type: string;
  alert_message: string;
  confidence: number; // 0–100
  detection_data: Record<string, unknown>;
  is_active: boolean;
  detected_at: string;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthScore {
  id: string;
  profile_id: string;
  score: number; // 0–100
  delta: number;
  rationale: string;
  components: {
    signal_quality: number;
    decision_velocity: number;
    blind_spot_risk: number;
    action_bias: number;
  };
  calculated_at: string;
  created_at: string;
}

export interface Brief {
  id: string;
  profile_id: string;
  type: 'daily' | 'weekly';
  health_score: number | null;
  health_score_delta: number | null;
  health_score_rationale: string | null;
  top_signals: Array<{
    consequence_id: string;
    signal_title: string;
    so_what: string;
    action_required: boolean;
    urgency_days: number;
  }>;
  required_actions: Array<{
    description: string;
    time_window: string;
    linked_consequence_id: string | null;
    category: string;
  }>;
  generated_at: string;
  created_at: string;
}

export interface Recommendation {
  id: string;
  profile_id: string;
  brief_id: string | null;
  consequence_id: string | null;
  linked_consequence_id: string | null;
  description: string;
  time_window: string;
  category: string | null;
  status: 'pending' | 'accepted' | 'dismissed';
  created_at: string;
  updated_at: string;
}

// ─── Frontend view types (camelCase, used by components) ──────────────────────
// Mapped from DB rows in API routes before returning to the client.

export interface SignalView {
  id: string; // consequence ID — used for accept/reject calls
  signalTitle: string;
  soWhat: string;
  primaryImpact: string;
  secondaryImpact?: string;
  tertiaryRisk?: string;
  actionRecommendation: string;
  urgencyDays: number;
  confidenceScore: number; // 0–100
  impactMatrix: ImpactMatrix;
  status: 'pending' | 'accepted' | 'rejected';
  sourceType: string;
  createdAt: string;
}

export interface DecisionView {
  id: string;
  title: string;
  category: DecisionCategory;
  rationale: string;
  predictedOutcome: string;
  confidenceScore: number;
  urgencyLevel: UrgencyLevel;
  emotionalContext?: string;
  alternativesConsidered: AlternativeConsidered[];
  status: DecisionStatus;
  actualOutcome?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyHealth {
  id: string;
  score: number;
  delta: number;
  rationale: string;
  calculatedAt: string;
}
