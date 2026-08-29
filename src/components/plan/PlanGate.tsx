"use client";

import { Lock } from "lucide-react";
import type { PlanAccess } from "@/lib/plan";

interface PlanGateProps {
  feature: string;
  access: PlanAccess;
  children: React.ReactNode;
  featureLabel?: string;
}

export function PlanGate({ access, children, featureLabel }: PlanGateProps) {
  const allowed =
    access.effectivePlan === "pro" ||
    (access.plan === "trial" && !access.isTrialExpired);

  if (allowed) return <>{children}</>;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-[#CC1F1F]/10 border border-[#CC1F1F]/20 flex items-center justify-center mx-auto mb-6">
          <Lock size={20} className="text-[#CC1F1F]" />
        </div>
        <h2 className="text-lg font-semibold text-[#f5f5f5] mb-2">
          {featureLabel ?? "Pro Feature"}
        </h2>
        <p className="text-sm text-[#666666] leading-relaxed mb-6">
          {access.isTrialExpired
            ? "Your 14-day trial has ended. Upgrade to Pro to continue using this feature."
            : "This feature is available on the Pro plan."}
        </p>
        <div className="flex flex-col gap-3">
          <a
            href="/profile"
            className="block w-full py-3 px-6 rounded-lg bg-[#CC1F1F] text-sm font-semibold text-white hover:bg-[#b01818] transition-colors"
          >
            Upgrade to Pro — $199/mo
          </a>
          <p className="text-xs text-[#444444]">
            Cancel anytime · Instant access
          </p>
        </div>
      </div>
    </div>
  );
}
