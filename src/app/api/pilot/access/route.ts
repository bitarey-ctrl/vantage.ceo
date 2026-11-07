import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PilotAccessError } from "@/lib/pilot/access";

/** Whether the signed-in account may use this pilot build (lets the app show why access is refused). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error instanceof PilotAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  return NextResponse.json({ allowed: true });
}
