import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Additive comparison surface. Authentication and the existing app stay unchanged. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.redirect(new URL('/login', request.url));
  const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', user.id).maybeSingle();
  if (profile && !profile.onboarding_completed) return NextResponse.redirect(new URL('/onboarding', request.url));
  return new Response(`<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>VANTAGE — new design</title><link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/comparison/style.css?v=1"></head><body>
<a class="skip" href="#content">Skip to content</a>
<header class="app-header"><a class="brand" href="#today" aria-label="VANTAGE home"><span class="brand-mark"><img src="/logo-transparent.png" alt=""></span>Vantage</a><nav class="main-nav" aria-label="Main navigation"><a href="#today" data-nav="today">Today</a><a href="#signals" data-nav="signals">Signals</a><a href="#decisions" data-nav="decisions">My decisions</a></nav><div class="header-actions"><a class="ask-advisor-link" href="#advisor" id="ask-advisor-link">Ask Advisor</a><button class="company-button" data-action="menu" aria-label="Workspace menu"><span id="company-avatar" class="avatar">V</span><span id="company-name">Your workspace</span></button></div></header>
<div class="example-strip"><a href="/command">Current design ↗</a><span>New design · Changes appear in both designs</span></div>
<main id="content" tabindex="-1"><div class="empty"><h1>Opening your workspace…</h1><p>Loading your account and saved work.</p></div></main>
<dialog id="dialog" aria-labelledby="dialog-title"><header class="dialog-head"><h2 id="dialog-title"></h2><button class="icon-button" data-action="close" aria-label="Close dialog">×</button></header><div id="dialog-body" class="dialog-body"></div></dialog><div id="toast" role="status" aria-live="polite"></div><noscript><p>This workspace needs JavaScript. <a href="/command">Open the current design</a>.</p></noscript><script src="/comparison/client.js?v=1" defer></script></body></html>`, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  }});
}
