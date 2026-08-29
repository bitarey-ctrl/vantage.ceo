"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { CommandBar } from "@/components/layout/CommandBar";
import { PlanProvider } from "@/components/plan/PlanContext";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { getPlanAccess, type PlanAccess } from "@/lib/plan";
import { applyTheme, getStoredTheme } from '@/lib/theme';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [companyName, setCompanyName] = useState<string>("");
  const [planAccess, setPlanAccess] = useState<PlanAccess>({
    plan: "trial",
    isTrialExpired: false,
    effectivePlan: "pro",
    trialDaysLeft: 14,
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  // Advisor hides the global CommandBar (it already IS that experience,
  // full-page, with its own composer) — so it doesn't need the 126px of
  // bottom canvas padding reserved to clear a bar that isn't there. Advisor
  // manages its own full-height layout instead (see its `100dvh` calc).
  const isAdvisor = pathname?.startsWith("/advisor") ?? false;

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_name, onboarding_completed, plan, trial_ends_at")
        .eq("id", user.id)
        .single();

      if (profile && !profile.onboarding_completed) {
        router.push("/onboarding");
        return;
      }

      setCompanyName(profile?.company_name ?? "");
      const access = getPlanAccess(
        (profile?.plan ?? "trial") as "trial" | "solo" | "pro",
        profile?.trial_ends_at ?? null
      );
      setPlanAccess(access);
      applyTheme(getStoredTheme());
      setLoading(false);
    };

    init();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border" style={{ borderTopColor: 'var(--brand-accent)' }} />
          <span className="font-mono text-xs tracking-widest text-muted-foreground">
            INITIALIZING
          </span>
        </div>
      </div>
    );
  }

  return (
    <PlanProvider value={planAccess}>
      {/* data-app-shell scopes the design-system overrides in globals.css
         (transparent page wrappers + minimum readable type) to the dashboard,
         leaving marketing/auth/onboarding on their own styling.
         grid-ground = concept `.canvas`'s background (two ambient radials +
         dot texture) — it already carries that whole treatment, so this
         wrapper only adds the concept's own canvas padding on top of it.
         126px bottom clears the fixed CommandBar. */}
      <div
        className="grid-ground min-h-screen text-foreground"
        data-app-shell
        style={{ padding: isAdvisor ? '26px 28px' : '26px 28px 126px' }}
      >
        {/* ── Topbar ───────────────────────────────────────────────── */}
        <div className="mx-auto mb-8 flex max-w-[1460px] items-center justify-between">
          <Link href="/command" className="cx-topbar-brand" aria-label="VANTAGE home">
            <b>V</b>ANTAGE
          </Link>
          {/* "Wire the status text to something real" — the company name is
             the one piece of real, already-fetched state available at the
             shell level; falls back to the product name pre-onboarding. */}
          <div className="cx-topbar-status">
            <i />
            {(companyName || 'VANTAGE').toUpperCase()} · ONLINE
          </div>
        </div>

        {/* ── App grid — concept `.app`: 82px rail column + content ──── */}
        <div className="mx-auto grid max-w-[1460px] grid-cols-1 gap-[25px] min-[901px]:grid-cols-[82px_1fr]">
          <DashboardNav companyName={companyName} />
          <main className="min-w-0 overflow-x-hidden text-foreground">
            {children}
          </main>
        </div>

        <CommandBar />
        <FeedbackWidget />
      </div>
    </PlanProvider>
  );
}
