import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { WaitlistLanding } from "@/components/marketing/WaitlistLanding";

/*
 * "/" — the logged-out front door.
 *
 * Server component: runs the auth gate (logged-in → /command), then renders
 * the public front door.
 *
 * FRONT DOOR = the waitlist landing (early-access phase). The previous
 * full marketing site (Hero / ProblemStats / ScrollTunnel / ProductShowcase /
 * WhyNow / Pricing / SocialProof / FinalCTA / Footer) is intentionally NOT
 * deleted — those components still exist in components/marketing. When the
 * product opens up publicly, swap <WaitlistLanding /> back for that stack
 * (see git history of this file for the exact composition) or move it to a
 * /product route. A pricing page and a "request access" waitlist shouldn't
 * both be the front door at the same time — mixed message — so only one is
 * mounted here.
 */
export default async function MarketingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/command");
  }

  return <WaitlistLanding />;
}
