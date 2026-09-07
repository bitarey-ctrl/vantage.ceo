import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

import { Landing } from "@/components/marketing/Landing";

/*
 * "/" — the logged-out front door.
 *
 * Server component: runs the auth gate (logged-in → /command), then renders
 * the public landing page. The landing itself is a client component (GSAP
 * scroll animations) scoped under `.vlp`.
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
