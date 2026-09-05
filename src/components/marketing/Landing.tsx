/*
 * Landing — the public front door.
 *
 * Ported from the standalone landing project the founder built, then reworked
 * when the early-access waitlist was retired: every primary CTA now opens the
 * app directly at /signup. All styling lives in `landing.css`, scoped under
 * `.landing` so it can never collide with the app's design system. Do not swap
 * these plain CSS classes for the app's token classes — this surface is
 * deliberately independent from the dashboard.
 *
 * With the multi-step waitlist form gone there is no client interactivity left,
 * so this is a server component and ships no JavaScript.
 *
 * The waitlist BACKEND is intentionally still in place (/api/waitlist and the
 * waitlist table from migration 022) along with everything already collected.
 * Only the on-page section was removed.
 */

import "./landing.css";

/** Single source of truth for the primary CTA, so it can never drift. */
const APP_HREF = "/signup";
const CTA = "OPEN VANTAGE";

function Mark() {
  return <><span className="brand-v">V</span>ANTAGE<span className="brand-reg">®</span></>;
}

/** Primary call to action. Every instance on the page renders through this. */
function OpenVantage({ variant = "button" }: { variant?: "button" | "nav" | "link" }) {
  const className = variant === "nav" ? "nav-cta" : variant === "link" ? "text-link" : "button-primary";
  return <a href={APP_HREF} className={className}>{CTA} <b>↗</b></a>;
}

/*
 * The hero mockup. Copy here mirrors what the product actually produces: the
 * five gate categories, and a signal carrying the real three-field output
 * (what happened / why it matters / what to consider).
 */
function CommandCenter() {
  return <div className="product-screen" aria-label="Vantage command center preview">
    <div className="screen-top"><div className="screen-brand"><Mark /></div><span className="screen-live"><i /> LIVE CONTEXT</span><span className="screen-avatar">N</span></div>
    <div className="screen-body">
      <aside className="screen-side"><span className="side-on">⌘</span><span>ϟ</span><span>⊞</span><span>◌</span><span>◫</span><i /><span>⚙</span></aside>
      <div className="screen-main">
        <div className="screen-heading"><div><p>COMMAND CENTER</p><h3>Here’s what<br />matters now.</h3></div><span className="live-pill"><i /> MONITORING</span></div>
        <div className="screen-cats" aria-label="Signal categories"><span>PRICING</span><span className="cat-on">COST BASE</span><span>COMPETITION</span><span>COMPLIANCE</span><span>CAPITAL</span></div>
        <div className="decision-preview"><p>PRIORITY SIGNAL · COST BASE</p><h4>Your model provider cut API pricing by half.</h4><div className="decision-bottom"><span>◉ WHY IT MATTERS</span><span>○ WHAT TO CONSIDER</span><button>REVIEW <b>↗</b></button></div></div>
        <div className="screen-lower"><div className="signal-preview"><p>INCOMING SIGNAL</p><b>New EU AI Act guidance lands for software vendors.</b><span>COMPLIANCE · 18 MIN AGO</span></div><div className="metric-preview"><p>SURFACED TODAY</p><strong>2<span>signals</span></strong><i /></div></div>
      </div>
    </div>
    <div className="screen-ask"><b>＋</b><span>Ask Vantage about a decision…</span><i>◖◗</i><strong>↗</strong></div>
  </div>;
}

/*
 * The in-context view further down the page. Deliberately NOT a second copy of
 * the full mockup — it follows one signal through the three fields the product
 * actually writes, which is the thing the hero screenshot can only hint at.
 */
function SignalFlow() {
  return <div className="signal-flow" aria-label="How one signal becomes a decision">
    <article className="flow-step">
      <p className="flow-kicker"><span className="flow-tag">COST BASE</span> WHAT HAPPENED</p>
      <h4>Your model provider cut API pricing by half.</h4>
      <small>PROVIDER CHANGELOG · 18 MIN AGO</small>
    </article>
    <i className="flow-link" aria-hidden="true" />
    <article className="flow-step">
      <p className="flow-kicker">WHY IT MATTERS TO YOU</p>
      <h4>Anything you shelved because inference was too expensive is worth re-pricing — and the cut is permanent, not promotional.</h4>
    </article>
    <i className="flow-link" aria-hidden="true" />
    <article className="flow-step flow-act">
      <p className="flow-kicker">WHAT TO CONSIDER</p>
      <h4>Re-run your cost model on the features you cut for margin.</h4>
      <small>OWNER · THIS WEEK</small>
    </article>
  </div>;
}

export function Landing() {
  return <main className="landing">
    <div className="grain" />

    <nav className="nav">
      <a href="#top" className="brand"><Mark /></a>
      <div className="nav-links"><a href="#product">Product</a><a href="#system">How it works</a></div>
      <OpenVantage variant="nav" />
    </nav>

    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="eyebrow"><i /> THE OPERATING SYSTEM FOR DECISIVE TEAMS</p>
        <h1>See what<br />matters.<br /><em>Move with intent.</em></h1>
        <p className="hero-text">Vantage turns every meaningful signal around your business into a shared, actionable decision—before momentum is lost.</p>
        <div className="hero-actions"><OpenVantage /><a href="#product" className="text-link">EXPLORE THE SYSTEM <b>↓</b></a></div>
        <div className="hero-proof"><div className="proof-orbit"><b>V</b><b>R</b><b>G</b></div><p><strong>Designed for leaders in motion</strong><br />From first signal to next decision.</p></div>
      </div>
      <div className="hero-product"><div className="hero-halo" /><CommandCenter /></div>
    </section>

    <div className="marquee"><div><span>SEE THE SIGNAL</span><i>✦</i><span>MAP THE IMPACT</span><i>✦</i><span>MAKE THE MOVE</span><i>✦</i><span>SEE THE SIGNAL</span><i>✦</i><span>MAP THE IMPACT</span><i>✦</i><span>MAKE THE MOVE</span><i>✦</i></div></div>

    <section className="manifesto">
      <p className="eyebrow"><i /> WHY VANTAGE</p>
      <div><h2>Your business is<br />already telling you<br /><em>what to do next.</em></h2><p>It is in the sales call you almost forgot, the market change you did not connect, and the metric buried in a different tool. Vantage makes those signals visible—then gives your team a decision worth making.</p></div>
    </section>

    <section className="system" id="system">
      <div className="section-top"><div><p className="eyebrow"><i /> ONE SYSTEM, THREE MOVES</p><h2>From noise to<br /><em>operating clarity.</em></h2></div><p>Vantage turns the business environment into a practical, shared rhythm your team can act on.</p></div>
      <div className="system-grid">
        <article className="system-card card-detect"><span>01</span><p className="card-kicker">DETECT</p><h3>Know what changed.</h3><p>Pricing, cost base, competition, compliance, capital—watched continuously, and filtered hard.</p><div className="scan-visual"><i /><i /><i /><b /></div></article>
        <article className="system-card card-map"><span>02</span><p className="card-kicker">MAP</p><h3>See what it means.</h3><p>Vantage connects each signal to the decisions, risks, and opportunities it affects.</p><div className="map-visual"><i /><i /><i /><b>IMPACT</b></div></article>
        <article className="system-card card-act"><span>03</span><p className="card-kicker">ACT</p><h3>Move with alignment.</h3><p>Turn a clear priority into an accountable next move—without another status meeting.</p><div className="act-visual"><span>PRIORITY DECISION</span><b>Review pricing architecture <i>↗</i></b><small>OWNER · THIS WEEK</small></div></article>
      </div>
    </section>

    <section className="product-section" id="product">
      <div className="product-label">
        <p className="eyebrow"><i /> THE VANTAGE COMMAND CENTER</p>
        <h2>One signal.<br /><em>One clear move.</em></h2>
        <p>Most days surface a handful of signals. Each one arrives already answered: what happened, why it matters to you, and what to do about it.</p>
        <OpenVantage variant="link" />
      </div>
      <SignalFlow />
    </section>

    <section className="quote">
      <span>“</span>
      <blockquote>The best leaders do not have more information.<br />They have a faster way to understand it.</blockquote>
      <p>VANTAGE / OPERATING PRINCIPLE 01</p>
    </section>

    <section className="final-cta">
      <p className="eyebrow"><i /> READY WHEN YOU ARE</p>
      <h2>Start with<br /><em>today’s signals.</em></h2>
      <OpenVantage />
    </section>

    <footer className="footer">
      <a href="#top" className="brand"><Mark /></a>
      <p>© 2026 VANTAGE. BUILT FOR MOMENTUM.</p>
      <div><a href="#product">Product</a><a href={APP_HREF}>Open Vantage</a></div>
    </footer>
  </main>;
}
