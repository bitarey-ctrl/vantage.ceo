"use client";

/*
 * WaitlistLanding — the public front door for the early-access phase.
 *
 * Ported verbatim from the standalone landing project the founder built.
 * It is intentionally self-contained: all styling lives in
 * `waitlist-landing.css` (imported here), scoped under `.landing` so it can
 * never collide with the app's design system. Do not swap these plain CSS
 * classes for the app's token classes — the whole point is that this surface
 * is visually independent from the dashboard.
 *
 * The form POSTs to /api/waitlist (Supabase-backed), same contract as the
 * original Cloudflare version.
 */

import { useMemo, useRef, useState } from "react";
import "./waitlist-landing.css";

type FormState = { fullName: string; email: string; industry: string; role: string; challenge: string };
type FieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const initialForm: FormState = { fullName: "", email: "", industry: "", role: "", challenge: "" };
const industries = ["Technology & SaaS", "Professional services", "Retail & ecommerce", "Finance & insurance", "Healthcare", "Real estate", "Media & creative", "Other"];
const roles = ["Founder / CEO", "Operations", "Sales & revenue", "Marketing & growth", "Product", "People & HR", "Other leader"];
const steps: Array<{ key: keyof FormState; rail: string; question: string; hint: string; placeholder: string; type: "text" | "email" | "select" | "textarea"; options?: string[] }> = [
  { key: "fullName", rail: "Name", question: "What’s your name?", hint: "Start with the easy part.", placeholder: "Your full name", type: "text" },
  { key: "email", rail: "Email", question: "Where should we reach you?", hint: "Your work email is best.", placeholder: "you@company.com", type: "email" },
  { key: "industry", rail: "Industry", question: "What world do you work in?", hint: "Pick the closest fit.", placeholder: "Choose your industry", type: "select", options: industries },
  { key: "role", rail: "Role", question: "What’s your role in the company?", hint: "The perspective you bring matters.", placeholder: "Choose your role", type: "select", options: roles },
  { key: "challenge", rail: "Problem", question: "What’s holding the business back?", hint: "One honest sentence is enough.", placeholder: "The problem I most want to solve is…", type: "textarea" },
];

function Mark() { return <><span className="brand-v">V</span>ANTAGE<span className="brand-reg">®</span></>; }

function MiniDashboard() {
  return <div className="product-screen" aria-label="Vantage command center preview">
    <div className="screen-top"><div className="screen-brand"><Mark /></div><span className="screen-live"><i /> LIVE CONTEXT</span><span className="screen-avatar">N</span></div>
    <div className="screen-body">
      <aside className="screen-side"><span className="side-on">⌘</span><span>ϟ</span><span>⊞</span><span>◌</span><span>◫</span><i /><span>⚙</span></aside>
      <div className="screen-main">
        <div className="screen-heading"><div><p>COMMAND CENTER</p><h3>Here’s what<br />matters now.</h3></div><span className="live-pill"><i /> MONITORING</span></div>
        <div className="decision-preview"><p>PRIORITY DECISION</p><h4>Turn partner insight into your next growth move.</h4><div className="decision-bottom"><span>◉ FLAGGED</span><span>○ CONTEXT MAPPED</span><button>REVIEW <b>↗</b></button></div></div>
        <div className="screen-lower"><div className="signal-preview"><p>INCOMING SIGNAL</p><b>Enterprise buyers want clearer performance visibility.</b><span>MARKET · 18 MIN AGO</span></div><div className="metric-preview"><p>DECISION VELOCITY</p><strong>3.1<span>days</span></strong><i /></div></div>
      </div>
    </div>
    <div className="screen-ask"><b>＋</b><span>Ask Vantage about a decision…</span><i>◖◗</i><strong>↗</strong></div>
  </div>;
}

function Waitlist() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const controlRef = useRef<FieldElement>(null);
  const current = steps[step];
  const railItems = useMemo(() => [...steps, ...steps, ...steps], []);
  const activeRailIndex = steps.length + step;
  const update = (key: keyof FormState, value: string) => { setForm((previous) => ({ ...previous, [key]: value })); if (status === "error") setStatus("idle"); };
  const persist = async () => {
    setStatus("submitting"); setMessage("");
    try { const response = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) }); const payload = (await response.json()) as { error?: string }; if (!response.ok) throw new Error(payload.error || "We couldn’t save your place just yet."); setStatus("success"); setMessage("You’re on the list. We’ll use your answers to tailor your Vantage early invitation."); }
    catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Something went wrong. Please try again."); }
  };
  const goForward = () => { if (!controlRef.current?.reportValidity()) return; if (step === steps.length - 1) { void persist(); return; } setStep((currentStep) => currentStep + 1); window.setTimeout(() => controlRef.current?.focus(), 30); };
  const restart = () => { setForm(initialForm); setStep(0); setStatus("idle"); setMessage(""); };
  const renderControl = () => {
    const common = { ref: controlRef as never, required: true, value: form[current.key], onChange: (event: React.ChangeEvent<FieldElement>) => update(current.key, event.target.value), "aria-label": current.question };
    if (current.type === "select") return <select {...common}><option value="" disabled>{current.placeholder}</option>{current.options?.map((option) => <option key={option}>{option}</option>)}</select>;
    if (current.type === "textarea") return <textarea {...common} placeholder={current.placeholder} rows={4} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) goForward(); }} />;
    return <input {...common} type={current.type} placeholder={current.placeholder} autoComplete={current.key === "fullName" ? "name" : "email"} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); goForward(); } }} />;
  };
  return <section className="waitlist-section" id="waitlist">
    <div className="waitlist-intro"><p className="eyebrow"><i /> EARLY ACCESS</p><h2>Built for teams<br />that don’t wait<br />for certainty.</h2><p>Tell us where the business is stuck. We’ll show you how Vantage can help turn that signal into a next move.</p><div className="waitlist-note"><span>01</span><p>Early teams get a guided setup and direct access to the product team.</p></div></div>
    {status === "success" ? <div className="wait-success" aria-live="polite"><span>✓</span><p className="eyebrow"><i /> REQUEST CONFIRMED</p><h3>You’re in.</h3><p>{message}</p><button onClick={restart}>Start another request <b>↗</b></button></div> : <div className="waitlist-flow" aria-label={`Access request, step ${step + 1} of ${steps.length}`}>
      <div className="wait-rail" aria-hidden="true"><div className="wait-track" style={{ transform: `translateY(calc(50% - ${(activeRailIndex + .5) * 66}px))` }}>{railItems.map((item, index) => <span className={index === activeRailIndex ? "selected" : ""} key={`${item.key}-${index}`}>{index === activeRailIndex && <b>→</b>}{item.rail}</span>)}</div></div>
      <div className="wait-card" key={current.key}><div className="wait-card-top"><span>0{step + 1} / 0{steps.length}</span><span>{current.rail.toUpperCase()}</span></div><div className="wait-card-main"><h3>{current.question}</h3><p>{current.hint}</p><div className="wait-control">{renderControl()}</div>{status === "error" && <small role="alert">{message}</small>}</div><div className="wait-actions"><button onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))} disabled={step === 0}>Back</button><button className="wait-next" onClick={goForward} disabled={status === "submitting"}>{status === "submitting" ? "Saving" : step === steps.length - 1 ? "Join waitlist" : "Continue"}<b>↗</b></button></div></div>
    </div>}
  </section>;
}

export function WaitlistLanding() {
  return <main className="landing">
    <div className="grain" />
    <nav className="nav"><a href="#top" className="brand"><Mark /></a><div className="nav-links"><a href="#product">Product</a><a href="#system">How it works</a><a href="#waitlist">Early access</a></div><a href="#waitlist" className="nav-cta">REQUEST ACCESS <b>↗</b></a></nav>
    <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow"><i /> THE OPERATING SYSTEM FOR DECISIVE TEAMS</p><h1>See what<br />matters.<br /><em>Move with intent.</em></h1><p className="hero-text">Vantage turns every meaningful signal around your business into a shared, actionable decision—before momentum is lost.</p><div className="hero-actions"><a href="#waitlist" className="button-primary">REQUEST EARLY ACCESS <b>↗</b></a><a href="#product" className="text-link">EXPLORE THE SYSTEM <b>↓</b></a></div><div className="hero-proof"><div className="proof-orbit"><b>V</b><b>R</b><b>G</b></div><p><strong>Designed for leaders in motion</strong><br />From first signal to next decision.</p></div></div><div className="hero-product"><div className="hero-halo" /><MiniDashboard /></div></section>
    <div className="marquee"><div><span>SEE THE SIGNAL</span><i>✦</i><span>MAP THE IMPACT</span><i>✦</i><span>MAKE THE MOVE</span><i>✦</i><span>SEE THE SIGNAL</span><i>✦</i><span>MAP THE IMPACT</span><i>✦</i><span>MAKE THE MOVE</span><i>✦</i></div></div>
    <section className="manifesto"><p className="eyebrow"><i /> WHY VANTAGE</p><div><h2>Your business is<br />already telling you<br /><em>what to do next.</em></h2><p>It is in the sales call you almost forgot, the market change you did not connect, and the metric buried in a different tool. Vantage makes those signals visible—then gives your team a decision worth making.</p></div></section>
    <section className="system" id="system"><div className="section-top"><div><p className="eyebrow"><i /> ONE SYSTEM, THREE MOVES</p><h2>From noise to<br /><em>operating clarity.</em></h2></div><p>Vantage turns the business environment into a practical, shared rhythm your team can act on.</p></div><div className="system-grid"><article className="system-card card-detect"><span>01</span><p className="card-kicker">DETECT</p><h3>Know what changed.</h3><p>Bring together market movement, customer context, team notes, and business data.</p><div className="scan-visual"><i /><i /><i /><b /></div></article><article className="system-card card-map"><span>02</span><p className="card-kicker">MAP</p><h3>See what it means.</h3><p>Vantage connects each signal to the decisions, risks, and opportunities it affects.</p><div className="map-visual"><i /><i /><i /><b>IMPACT</b></div></article><article className="system-card card-act"><span>03</span><p className="card-kicker">ACT</p><h3>Move with alignment.</h3><p>Turn a clear priority into an accountable next move—without another status meeting.</p><div className="act-visual"><span>PRIORITY DECISION</span><b>Review pricing architecture <i>↗</i></b><small>OWNER · THIS WEEK</small></div></article></div></section>
    <section className="product-section" id="product"><div className="product-label"><p className="eyebrow"><i /> THE VANTAGE COMMAND CENTER</p><h2>The whole business.<br /><em>In one view.</em></h2><p>Built to make complexity feel calm, precise, and actionable. Not another dashboard: an operating surface for the next decision.</p><a href="#waitlist" className="text-link">GET EARLY ACCESS <b>↗</b></a></div><div className="product-large"><MiniDashboard /></div></section>
    <section className="quote"><span>“</span><blockquote>The best leaders do not have more information.<br />They have a faster way to understand it.</blockquote><p>VANTAGE / OPERATING PRINCIPLE 01</p></section>
    <Waitlist />
    <footer className="footer"><a href="#top" className="brand"><Mark /></a><p>© 2026 VANTAGE. BUILT FOR MOMENTUM.</p><div><a href="#product">Product</a><a href="#waitlist">Early access</a></div></footer>
  </main>;
}
