import { PILOT_DENIED } from "@/lib/pilot/access";

export const dynamic = "force-dynamic";

/** Shown to a signed-in account that is not in the pilot (no account data on this page). */
export function GET() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>VANTAGE pilot</title><link rel="stylesheet" href="/comparison/style.css"></head><body><main id="content" class="empty"><h1>This is the pilot address</h1><p>${PILOT_DENIED}</p></main></body></html>`, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
