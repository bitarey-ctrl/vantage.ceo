export type Plan = 'trial' | 'solo' | 'pro';

export interface PlanAccess {
  plan: Plan;
  isTrialExpired: boolean;
  effectivePlan: 'solo' | 'pro';
  trialDaysLeft: number | null;
}

export const PLAN_FEATURES = {
  solo: [
    'dashboard', 'signals', 'strategies',
    'digital_twin', 'assessment', 'report', 'profile',
  ],
  pro: [
    'dashboard', 'signals', 'strategies',
    'digital_twin', 'assessment', 'report', 'profile',
    'decisions', 'ai_chat', 'blind_spots',
  ],
} as const;

export function getPlanAccess(
  plan: Plan,
  trialEndsAt: string | null
): PlanAccess {
  // Plan restrictions removed — all users get full Pro access.
  // trialEndsAt is accepted for backward compatibility but ignored.
  void trialEndsAt;
  return {
    plan,
    isTrialExpired: false,
    effectivePlan: 'pro',
    trialDaysLeft: null,
  };
}

export function canAccess(feature: string, access: PlanAccess): boolean {
  // All features unlocked.
  void feature;
  void access;
  return true;
}
