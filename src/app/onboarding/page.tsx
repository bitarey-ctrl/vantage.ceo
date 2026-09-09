"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 9;

const TOP_PRIORITIES = [
  "Growth",
  "Retention",
  "Pricing",
  "Fundraising",
  "Hiring",
  "Other",
] as const;

const COMPANY_STAGES = [
  "Pre-revenue",
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B+",
  "Growth",
  "Public",
];

const TEAM_SIZES = ["Solo", "2–5", "6–15", "16–50", "51–200", "200+"];

const TOP_RISKS = [
  "Regulatory",
  "Competition",
  "Talent",
  "Funding",
  "Macro",
  "Product",
  "Tech disruption",
  "Customer churn",
];

const DECISION_STYLES: { value: string; description: string }[] = [
  { value: "Analytical", description: "Data-driven. You need evidence before committing." },
  { value: "Intuitive", description: "Pattern recognition. You trust your gut backed by experience." },
  { value: "Consensus", description: "You bring the team in before making a call." },
  { value: "Decisive", description: "Action-first. Speed over perfect information." },
  { value: "Collaborative", description: "You co-create decisions with your key stakeholders." },
];

const RISK_TOLERANCES = ["Low", "Medium", "High", "Calculated"];

// Stored on ceo_context.arr_band. Values must match the CHECK constraint in
// migration 024.
const ARR_BANDS: { value: string; label: string }[] = [
  { value: "pre_seed", label: "Pre-seed / pre-revenue" },
  { value: "pre_1m", label: "Under $1M ARR" },
  { value: "1m_5m", label: "$1M–$5M ARR" },
  { value: "5m_20m", label: "$5M–$20M ARR" },
  { value: "20m_plus", label: "$20M+ ARR" },
];

const STEP_META: { title: string; subtitle: string }[] = [
  { title: "Your Company", subtitle: "Tell us what you build, who you build it for, and what matters most right now." },
  { title: "Company Stage", subtitle: "Where are you in the journey?" },
  { title: "Team Size", subtitle: "How big is your team right now?" },
  { title: "Primary Goal", subtitle: "What's the one thing that matters most this quarter?" },
  { title: "Top Risks", subtitle: "Select up to 3 risks that keep you up at night." },
  { title: "Decision Style", subtitle: "How do you typically make important calls?" },
  { title: "Risk Tolerance", subtitle: "How much uncertainty can your company absorb?" },
  { title: "Competitors", subtitle: "Who do you actually lose deals to?" },
  { title: "Revenue Band", subtitle: "Roughly where are you on ARR?" },
];

// ─── Shared primitives ────────────────────────────────────────────────────────

function OptionCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border px-4 py-3 transition-all duration-150 ${
        selected
          ? "border-[#CC1F1F] bg-[#CC1F1F]/8 text-white"
          : "border-[#242424] bg-[#1a1a1a] text-[#a0a0a0] hover:border-[#444444] hover:text-[#d0d0d0]"
      }`}
    >
      <span className="text-sm font-semibold block">{label}</span>
      {description && (
        <span
          className={`text-xs mt-0.5 block leading-relaxed ${
            selected ? "text-[#CC1F1F]/70" : "text-[#555555]"
          }`}
        >
          {description}
        </span>
      )}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Step 1
  const [companyName, setCompanyName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [topPriority, setTopPriority] = useState("");
  const [topPriorityOther, setTopPriorityOther] = useState("");
  // Step 2
  const [companyStage, setCompanyStage] = useState("");
  // Step 3
  const [teamSize, setTeamSize] = useState("");
  // Step 4
  const [primaryGoal, setPrimaryGoal] = useState("");
  // Step 5
  const [topRisks, setTopRisks] = useState<string[]>([]);
  // Step 6
  const [decisionStyle, setDecisionStyle] = useState("");
  // Step 7
  const [riskTolerance, setRiskTolerance] = useState("");
  // Step 8 — named competitors (free text, multiple)
  const [competitors, setCompetitors] = useState<string[]>([]);
  const [competitorDraft, setCompetitorDraft] = useState("");
  // Step 9 — ARR band
  const [arrBand, setArrBand] = useState("");

  function toggleRisk(risk: string) {
    setTopRisks((prev) =>
      prev.includes(risk)
        ? prev.filter((r) => r !== risk)
        : prev.length < 3
        ? [...prev, risk]
        : prev
    );
  }

  function addCompetitor() {
    const name = competitorDraft.trim();
    if (!name) return;
    // Case-insensitive dedupe — "Attio" and "attio" are the same competitor.
    const exists = competitors.some(
      (c) => c.toLowerCase() === name.toLowerCase()
    );
    if (!exists) setCompetitors((prev) => [...prev, name]);
    setCompetitorDraft("");
  }

  function removeCompetitor(name: string) {
    setCompetitors((prev) => prev.filter((c) => c !== name));
  }

  function canContinue(): boolean {
    switch (step) {
      case 1:
        return (
          companyName.trim().length > 0 &&
          productDescription.trim().length > 0 &&
          targetCustomer.trim().length > 0 &&
          topPriority.length > 0 &&
          // "Other" is only a real answer once they have named it.
          (topPriority !== "Other" || topPriorityOther.trim().length > 0)
        );
      case 2:
        return companyStage.length > 0;
      case 3:
        return teamSize.length > 0;
      case 4:
        return primaryGoal.trim().length > 0;
      case 5:
        return topRisks.length >= 1;
      case 6:
        return decisionStyle.length > 0;
      case 7:
        return riskTolerance.length > 0;
      case 8:
        // Optional — a founder may genuinely not have named competitors.
        return true;
      case 9:
        return arrBand.length > 0;
      default:
        return false;
    }
  }

  function getStepData(): Record<string, unknown> {
    switch (step) {
      case 1:
        return {
          companyName: companyName.trim(),
          productDescription: productDescription.trim(),
          targetCustomer: targetCustomer.trim(),
          topPriority,
          topPriorityOther: topPriority === "Other" ? topPriorityOther.trim() : "",
        };
      case 2:
        return { companyStage };
      case 3:
        return { teamSize };
      case 4:
        return { primaryGoal: primaryGoal.trim() };
      case 5:
        return { risks: topRisks };
      case 6:
        return { decisionStyle };
      case 7:
        return { riskTolerance };
      case 8:
        return { competitors };
      case 9:
        return { arrBand };
      default:
        return {};
    }
  }

  async function handleNext() {
    if (!canContinue() || saving) return;
    setSaving(true);
    setSaveError("");

    try {
      const res = await fetch("/api/onboarding/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data: getStepData() }),
      });

      if (!res.ok) {
        setSaveError("Failed to save. Please try again.");
        setSaving(false);
        return;
      }

      if (step === TOTAL_STEPS) {
        const completeRes = await fetch("/api/onboarding/complete", {
          method: "POST",
        });
        if (!completeRes.ok) {
          setSaveError("Failed to complete onboarding. Please try again.");
          setSaving(false);
          return;
        }
        router.push("/command");
        router.refresh();
      } else {
        setStep((s) => s + 1);
        setSaving(false);
      }
    } catch {
      setSaveError("An unexpected error occurred.");
      setSaving(false);
    }
  }

  function handleBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  const meta = STEP_META[step - 1];
  const isFinal = step === TOTAL_STEPS;

  /*
   * Escape hatch.
   *
   * Onboarding was a dead end: the browser Back button cannot get you out,
   * and not because anything here intercepts it. Back goes to /signup, where
   * middleware redirects an authenticated user to /command, where the
   * dashboard layout sees onboarding is incomplete and pushes straight back
   * to /onboarding. A loop, so the only real exit is to stop being signed in.
   *
   * Signing out is therefore the honest control, not a cosmetic one — and it
   * is also what someone who started on the wrong account actually needs.
   */
  async function handleExit() {
    if (exiting) return;
    setExiting(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // Even a failed sign-out should not strand them here.
    }
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[480px]">
        {/* Exit — deliberately quiet, but always reachable. */}
        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={handleExit}
            disabled={exiting}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[#666666] hover:text-[#e8eaee] transition-colors disabled:opacity-50"
          >
            {exiting ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
            {exiting ? "Signing out…" : "Sign out"}
          </button>
        </div>

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-7 h-7 rounded-sm bg-[#CC1F1F] flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M8 1L3 8h4l-1 5 6-8H8L9 1z"
                fill="white"
              />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-[0.12em] uppercase text-white">
            VANTAGE
          </span>
        </div>

        {/* Card */}
        <div className="bg-[#111111] rounded-lg p-8">
          {/* Progress bar */}
          <div className="flex gap-1 mb-6">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  i + 1 <= step ? "bg-[#CC1F1F]" : "bg-[#242424]"
                }`}
              />
            ))}
          </div>

          {/* Step label */}
          <p className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-[#555555] mb-4">
            Step {step} of {TOTAL_STEPS}
          </p>

          {/* Title + subtitle */}
          <h2 className="text-xl font-semibold text-white mb-1">{meta.title}</h2>
          <p className="text-sm text-[#666666] mb-6">{meta.subtitle}</p>

          {/* ── Step content ─────────────────────────────────────────────── */}

          {/* Step 1 — Company + Industry */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#555555] mb-1.5">
                  Company Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg text-sm text-white px-4 py-3 outline-none placeholder:text-[#333333] focus:border-[#CC1F1F]/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#555555] mb-1.5">
                  What does your product do?
                </label>
                <p className="text-[11px] text-[#555555] mb-1.5">
                  One or two sentences, plain English.
                </p>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="e.g. We give finance teams a single view of spend across every SaaS tool they buy."
                  className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg text-sm text-white px-4 py-3 outline-none placeholder:text-[#333333] focus:border-[#CC1F1F]/60 transition-colors resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#555555] mb-1.5">
                  Who is your target customer?
                </label>
                <input
                  type="text"
                  maxLength={160}
                  value={targetCustomer}
                  onChange={(e) => setTargetCustomer(e.target.value)}
                  placeholder="e.g. mid-market fintech CFOs, or engineering leads at Series B startups"
                  className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg text-sm text-white px-4 py-3 outline-none placeholder:text-[#333333] focus:border-[#CC1F1F]/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#555555] mb-1.5">
                  What&apos;s your #1 priority right now?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TOP_PRIORITIES.map((p) => (
                    <OptionCard
                      key={p}
                      label={p}
                      selected={topPriority === p}
                      onClick={() => setTopPriority(p)}
                    />
                  ))}
                </div>
                {topPriority === "Other" && (
                  <input
                    type="text"
                    maxLength={120}
                    value={topPriorityOther}
                    onChange={(e) => setTopPriorityOther(e.target.value)}
                    placeholder="Name it in a few words"
                    className="mt-2 w-full bg-[#1a1a1a] border border-[#242424] rounded-lg text-sm text-white px-4 py-3 outline-none placeholder:text-[#333333] focus:border-[#CC1F1F]/60 transition-colors"
                  />
                )}
              </div>
            </div>
          )}

          {/* Step 2 — Company Stage */}
          {step === 2 && (
            <div className="grid grid-cols-2 gap-2">
              {COMPANY_STAGES.map((stage) => (
                <OptionCard
                  key={stage}
                  label={stage}
                  selected={companyStage === stage}
                  onClick={() => setCompanyStage(stage)}
                />
              ))}
            </div>
          )}

          {/* Step 3 — Team Size */}
          {step === 3 && (
            <div className="grid grid-cols-3 gap-2">
              {TEAM_SIZES.map((size) => (
                <OptionCard
                  key={size}
                  label={size}
                  selected={teamSize === size}
                  onClick={() => setTeamSize(size)}
                />
              ))}
            </div>
          )}

          {/* Step 4 — Primary Goal */}
          {step === 4 && (
            <div>
              <input
                type="text"
                value={primaryGoal}
                onChange={(e) => setPrimaryGoal(e.target.value)}
                placeholder="e.g. Reach $1M ARR by Q4, close Series A, expand to EMEA"
                className="w-full bg-[#1a1a1a] border border-[#242424] rounded-lg text-sm text-white px-4 py-3 outline-none placeholder:text-[#333333] focus:border-[#CC1F1F]/60 transition-colors"
              />
            </div>
          )}

          {/* Step 5 — Top Risks */}
          {step === 5 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-[#555555] mb-1">
                {topRisks.length}/3 selected
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TOP_RISKS.map((risk) => (
                  <OptionCard
                    key={risk}
                    label={risk}
                    selected={topRisks.includes(risk)}
                    onClick={() => toggleRisk(risk)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Step 6 — Decision Style */}
          {step === 6 && (
            <div className="flex flex-col gap-2">
              {DECISION_STYLES.map((style) => (
                <OptionCard
                  key={style.value}
                  label={style.value}
                  description={style.description}
                  selected={decisionStyle === style.value}
                  onClick={() => setDecisionStyle(style.value)}
                />
              ))}
            </div>
          )}

          {/* Step 7 — Risk Tolerance */}
          {step === 7 && (
            <div className="grid grid-cols-2 gap-2">
              {RISK_TOLERANCES.map((level) => (
                <OptionCard
                  key={level}
                  label={level}
                  selected={riskTolerance === level}
                  onClick={() => setRiskTolerance(level)}
                />
              ))}
            </div>
          )}

          {/* Step 8 — Named competitors (free text, multiple) */}
          {step === 8 && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={competitorDraft}
                  onChange={(e) => setCompetitorDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCompetitor();
                    }
                  }}
                  placeholder="e.g. Pipedrive"
                  className="flex-1 bg-[#1a1a1a] border border-[#242424] rounded-lg text-sm text-white px-4 py-3 outline-none placeholder:text-[#333333] focus:border-[#CC1F1F]/60 transition-colors"
                />
                <button
                  type="button"
                  onClick={addCompetitor}
                  disabled={!competitorDraft.trim()}
                  className="px-4 rounded-lg border border-[#242424] text-sm text-white disabled:opacity-40 hover:border-[#CC1F1F]/60 transition-colors"
                >
                  Add
                </button>
              </div>

              {/* Makes the 3-competitor tracking cap visible up front, so the
                  list a founder types matches what the feed actually watches. */}
              <p className="text-[10px] text-[#555555]">
                We&rsquo;ll actively track your top 3.
              </p>

              {competitors.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {competitors.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-2 rounded-full border border-[#242424] bg-[#1a1a1a] px-3 py-1.5 text-xs text-white"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() => removeCompetitor(name)}
                        aria-label={`Remove ${name}`}
                        className="text-[#555555] hover:text-white transition-colors"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-[#555555]">
                  Optional &mdash; you can skip this and add them later.
                </p>
              )}
            </div>
          )}

          {/* Step 9 — ARR band */}
          {step === 9 && (
            <div className="flex flex-col gap-2">
              {ARR_BANDS.map((band) => (
                <OptionCard
                  key={band.value}
                  label={band.label}
                  selected={arrBand === band.value}
                  onClick={() => setArrBand(band.value)}
                />
              ))}
            </div>
          )}

          {/* Error */}
          {saveError && (
            <p className="mt-4 text-xs text-[#e5463e] bg-[#e5463e]/8 border border-[#e5463e]/20 rounded-lg px-4 py-2">
              {saveError}
            </p>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#242424] text-xs font-semibold text-[#666666] hover:border-[#444444] hover:text-[#a0a0a0] transition-colors disabled:opacity-0 disabled:pointer-events-none"
            >
              <ArrowLeft size={12} />
              Back
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!canContinue() || saving}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#CC1F1F] text-xs font-bold uppercase tracking-wider text-white hover:bg-[#b01818] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Saving…
                </>
              ) : isFinal ? (
                "Launch VANTAGE"
              ) : (
                "Continue →"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
