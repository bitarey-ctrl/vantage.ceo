import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Bump when the client assets change so browsers fetch the matching files. */
export const ASSET_VERSION = '20261028-main1';

/**
 * The maintained main app: one HTML shell for /app (main entry) and /test (alias). Old paths redirect here
 * (next.config.ts). Auth and onboarding gates are the same as the rest of the private product.
 */
export async function workspaceResponse(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.redirect(new URL('/login', request.url));
  const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', user.id).maybeSingle();
  if (profile && !profile.onboarding_completed) return NextResponse.redirect(new URL('/onboarding', request.url));
  const v = ASSET_VERSION;
  return new Response(`<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>VANTAGE</title><link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/comparison/style.css?v=${v}"></head><body>
<a class="skip" href="#content">Skip to content</a>
<header class="app-header"><a class="brand" href="#today" aria-label="VANTAGE home"><span class="brand-mark"><img src="/logo-transparent.png" alt=""></span>Vantage</a><nav class="main-nav" aria-label="Main navigation"><a href="#today" data-nav="today">Today</a><a href="#signals" data-nav="signals">Signals</a><a href="#decisions" data-nav="decisions">My decisions</a></nav><div class="header-actions"><a class="ask-advisor-link" href="#advisor" id="ask-advisor-link">Ask Advisor</a><button class="company-button" data-action="menu" aria-label="Workspace menu"><span id="company-avatar" class="avatar">V</span><span id="company-name">Your workspace</span></button></div></header>
<div class="example-strip" id="save-status" role="status" aria-live="polite"><span>Opening your account…</span></div>
<main id="content" tabindex="-1"><div class="empty"><h1>Opening your workspace…</h1><p>Loading your account and saved work.</p></div></main>
<dialog id="dialog" aria-labelledby="dialog-title"><header class="dialog-head"><h2 id="dialog-title"></h2><button class="icon-button" data-action="close" aria-label="Close dialog">×</button></header><div id="dialog-body" class="dialog-body"></div></dialog><div id="toast" role="status" aria-live="polite"></div><noscript><p>VANTAGE needs JavaScript to open your workspace.</p></noscript><script src="/comparison/engine.js?v=${v}" defer></script><script src="/comparison/attention-engine.js?v=${v}" defer></script><script src="/comparison/client.js?v=${v}" defer></script></body></html>`, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  }});
}
