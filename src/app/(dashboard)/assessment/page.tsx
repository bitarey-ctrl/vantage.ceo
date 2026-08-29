import { redirect } from "next/navigation";

// Assessment is deactivated as a user-facing feature. The underlying engine
// (/api/assessment/generate + tables) is intentionally left intact; only access
// is removed. Any direct visit here is redirected to the dashboard home.
export default function AssessmentPage() {
  redirect("/command");
}
