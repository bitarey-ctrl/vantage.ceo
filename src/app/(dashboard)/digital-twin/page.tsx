import { redirect } from "next/navigation";

// Digital Twin is no longer a user-facing surface. The memory engine still runs
// silently inside the Advisor (see src/app/api/advisor/chat/route.ts) and the
// /api/digital-twin engine + tables are intentionally kept. Any direct visit
// here is redirected to the Advisor.
export default function DigitalTwinPage() {
  redirect("/advisor");
}
