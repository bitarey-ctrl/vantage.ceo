import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { Landing } from "@/components/marketing/Landing";

/*
 * "/" — the logged-out front door.
 *
 * Server component: runs the auth gate (logged-in → /command), then renders
 * the public landing page.
 *
 * The early-access waitlist that used to live here has been removed. Every
 * primary CTA on the landing page now opens the app directly at /signup, which
 * is where account creation (and therefore email capture) happens.
 *
 * The older full marketing stack (Hero / ProblemStats / ScrollTunnel /
 * ProductShowcase / WhyNow / Pricing / SocialProof / FinalCTA / Footer) still
 * exists unmounted in components/marketing — see git history for how it was
 * composed if any of it is ever wanted back.
 */
export default async function MarketingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/command");
  }

  return <Landing />;
}
