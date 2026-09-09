"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Menu } from "lucide-react";
// Visual shell styles. Fully namespaced under .vx-app — see index.css.
import "@/components/redesign/index.css";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { CommandBar } from "@/components/layout/CommandBar";
import { PlanProvider } from "@/components/plan/PlanContext";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { getPlanAccess, type PlanAccess } from "@/lib/plan";

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
  // full-page, with its own composer), so it needs neither the 126px of
  // bottom canvas padding that clears the bar nor page-level scrolling. It
  // gets .vx-route-advisor instead, which locks the workbench to the
  // viewport so the topbar stays put and only the chat scrolls.
  const isAdvisor = pathname?.startsWith("/advisor") ?? false;

  // Mobile sidebar. Closed on every route change so navigating from the
  // open drawer does not leave it hanging over the new page.
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [pathname]);

  // Topbar breadcrumb: the current section, derived from the route rather
  // than tracked in state, so it stays correct on deep links and refreshes.
  const areaLabel = (() => {
    const seg = (pathname ?? "/command").split("/")[1] || "command";
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  })();

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
      {/* ── vx-app shell, ported from the design package ────────────────
          Structure only. Routing stays on Next.js <Link>/routes — the
          prototype held the active area in React state, which would have
          broken deep links, per-route auth and the Pro gate.

          data-app-shell is kept: globals.css scopes dashboard-only design
          system overrides to it, and dropping it would restyle every page.

          The prototype's vx-bottom-nav is deliberately NOT ported: it would
          sit on top of the existing CommandBar on mobile, and removing a
          working feature is not a reskin. */}
      <div
        className="vx-app vx-hover-navigation grid-ground min-h-screen text-foreground"
        data-app-shell
        onKeyDown={(e) => { if (e.key === 'Escape') setMenu(false); }}
      >
        {menu && (
          <button
            className="vx-nav-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setMenu(false)}
          />
        )}
        <a className="vx-skip" href="#vx-content">Skip to workspace</a>

        <DashboardNav
          companyName={companyName}
          open={menu}
          onClose={() => setMenu(false)}
        />

        <div className={"vx-workbench" + (isAdvisor ? " vx-route-advisor" : "")}>
          <header className="vx-topbar">
            <button
              className="vx-menu-toggle"
              aria-label="Open navigation"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu size={18} />
            </button>
            <div className="vx-breadcrumb">
              <strong>{areaLabel}</strong>
            </div>
          </header>

          <main
            id="vx-content"
            className="vx-content min-w-0 overflow-x-hidden text-foreground"
            style={{ paddingBottom: isAdvisor ? undefined : 126 }}
          >
            {children}
          </main>
        </div>

        <CommandBar />
      </div>
    </PlanProvider>
  );
}
