'use client';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronRight, FileText, Radio, Compass, Pause, Play } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ImpactPreview, ProductDemo } from './ProductDemo';
import { useMarketingMotion } from './HeadlineReveal';
if (typeof window !== 'undefined') gsap.registerPlugin(useGSAP, ScrollTrigger);

const storyLines = ['The hard part isn’t finding more information.', 'It’s knowing what it changes for you.'];

const examples = [
  { label: 'Signal', kicker: 'What changed', title: 'A competitor introduces usage-based pricing.', body: 'A new pricing model is a signal. It isn’t evidence that your customers want the same thing.', note: 'Go back to the source', detail: 'Check the allowance, overage charges and which customers the announcement applies to.' },
  { label: 'Impact', kicker: 'What it means for you', title: 'Your pricing decision has a new question.', body: 'Compare customer expectations with your own usage costs before changing your plans.', note: 'An assumption worth challenging', detail: 'Are high-usage accounts less profitable—or are they also your most valuable customers?' },
  { label: 'Decision', kicker: 'What deserves action', title: 'Test the trade-off before changing every plan.', body: 'Compare a usage allowance with a flat price increase. Save your reasoning and what you still need to learn.', note: 'A practical next step', detail: 'Review your highest-usage accounts and speak with customers before choosing a pricing model.' },
] as const;

export function DecisionExample() {
  const [active, setActive] = useState(1);
  const id = useId();
  const item = examples[active];
  return <div className="vs-example" aria-label="Illustrative signal to decision walkthrough">
    <div className="vs-example-top"><span><Compass size={16} aria-hidden="true" /> Your next decision</span><span className="vs-example-label">Illustrative example</span></div>
    <div className="vs-example-context"><span className="vs-kicker">Your company context</span><strong>AI-enabled SaaS · Reviewing pricing</strong></div>
    <div className="vs-example-tabs" aria-label="Example stages">{examples.map((example, i) => <button key={example.label} aria-pressed={active === i} aria-controls={id} onClick={() => setActive(i)}><span>0{i + 1}</span>{example.label}<ChevronRight size={13} aria-hidden="true" /></button>)}</div>
    <div id={id} className="vs-example-content" aria-live="polite" aria-atomic="true"><span className="vs-kicker">{item.kicker}</span><h3>{item.title}</h3><p>{item.body}</p><div className="vs-evidence"><span><FileText size={14} aria-hidden="true" />{item.note}</span><p>{item.detail}</p></div></div>
    <div className="vs-example-bottom"><span>Source → context → reasoning</span><span>You make the call.</span></div>
  </div>;
}

function SignalScene() {
  return <div className="vs-signal-scene" aria-label="Illustrative market, competitor and regulatory signal cards">
    <span className="vs-scene-label"><Radio size={12} aria-hidden="true" /> Your signal feed</span>
    <div className="vs-source-card vs-source-back" data-source-card><span className="vs-category">Market</span><h4>Buying patterns are shifting.</h4><p>Check what changed in your market.</p><span className="vs-source-link"><FileText size={12} />Original source <ArrowUpRight size={12} /></span></div>
    <div className="vs-source-card vs-source-middle" data-source-card><span className="vs-category">Regulatory</span><h4>A new rule may affect your plans.</h4><p>Confirm the scope before acting.</p><span className="vs-source-link"><FileText size={12} />Original source <ArrowUpRight size={12} /></span></div>
    <div className="vs-source-card vs-source-front" data-source-card><span className="vs-category"><Radio size={11} />Competitors</span><h4>A rival changes how it charges.</h4><p>Examine the details. Then your exposure.</p><span className="vs-source-link"><FileText size={12} />Original source <ArrowUpRight size={12} /></span></div>
    <span className="vs-art-disclaimer">Illustrative signals · Source links stay close</span>
  </div>;
}

const questions = [
  ['Who is VANTAGE for?', 'Founders and operating CEOs of growing companies who make consequential decisions without a dedicated intelligence team or chief of staff. Our first pilots focus on B2B SaaS.'],
  ['What does VANTAGE actually do?', 'It brings market, competitor, regulatory and wider business signals into a workspace, relates them to your company context, and helps you explore consequences and options. Advisor helps you work through a choice with your company context attached. Save strategies and decisions with their reasoning and return to them later.'],
  ['How is this different from asking a chatbot?', 'Your company context, signals, saved strategies and decisions stay together. Move from a change to its possible impact and a recorded decision, instead of rebuilding the context in a new conversation.'],
  ['How should I use the AI analysis?', 'Start with the original sources. Challenge assumptions and verify consequential claims. The analysis helps you work through a choice; you make the call.'],
  ['What does the free pilot include?', 'Fourteen days around one real decision, founder-led setup, an early written check, a midpoint conversation and a final review. You can contact Bita, VANTAGE’s founder, directly throughout. Honest feedback is the exchange. A public review is optional.'],
  ['What happens after fourteen days?', 'We discuss what helped, what missed the mark and whether continued access would be useful. There is no automatic paid commitment in the pilot invitation. Paid pricing will be informed by pilot feedback.'],
] as const;

export function Landing() {
  const root = useRef<HTMLElement>(null);
  const { motionEnabled, setMotionEnabled } = useMarketingMotion();
  useGSAP(() => {
    if (!motionEnabled) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-hero-copy]', { opacity: 0, y: 14, duration: .8, ease: 'power3.out' });
      gsap.from('[data-hero-layer]', { opacity: 0, y: 30, stagger: .12, duration: 1.1, ease: 'power3.out', delay: .15 });
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach(el => gsap.from(el, { y: 24, opacity: 0, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } }));
      const letters = gsap.utils.toArray<HTMLElement>('[data-story-char]');
      // Custom-property colors keep day/night changes live during the reveal.
      gsap.set(letters, { '--vs-story-enter': '0%', '--vs-story-settle': '0%' });
      gsap.timeline({ scrollTrigger: { trigger: '.vs-story-statement', start: 'top 82%', end: 'bottom 40%', scrub: .4 } })
        .to(letters, { '--vs-story-enter': '100%', duration: .16, stagger: .018, ease: 'none' }, 0)
        .to(letters, { '--vs-story-settle': '100%', duration: .2, stagger: .018, ease: 'none' }, .18);
      gsap.from('[data-source-card]', { x: i => (i - 1) * 35, y: i => 28 + i * 18, rotation: i => (i - 1) * 5, stagger: .08, scrollTrigger: { trigger: '.vs-signal-scene', start: 'top 90%', end: 'center 55%', scrub: 1 } });
    });
    return () => mm.revert();
  }, { scope: root, dependencies: [motionEnabled], revertOnUpdate: true });
  return <main id="main" ref={root}>
    <section className="vs-hero-field vs-texture-field">
      <div className="vs-hero vs-container"><div className="vs-hero-copy" data-hero-copy><span className="vs-kicker"><i className="vs-dot" />Strategic intelligence for B2B SaaS CEOs</span><h1>See the change.<br /><span>Know your next move.</span></h1><p>VANTAGE turns market and competitor signals into a clearer view of your business—what changed, what it could affect, and what to do next.</p><div className="vs-actions"><Link className="vs-button" href="/pilot">Explore the free pilot <ArrowUpRight size={16} aria-hidden="true" /></Link><a className="vs-text-link" href="#product-demo">Try the workspace <ArrowRight size={16} aria-hidden="true" /></a></div><span className="vs-hero-note">14 days. One real decision. Work directly with the founder.</span></div><ProductDemo /></div>
      <div className="vs-hero-base vs-container"><span>For founders and operating CEOs.<br /><strong>Built around the decisions you carry.</strong></span><div className="vs-hero-topics"><span>Product</span><span>Pricing</span><span>Competition</span><span>Risk</span></div><button className="vs-motion-control" aria-pressed={!motionEnabled} onClick={() => setMotionEnabled(v => !v)}>{motionEnabled ? <Pause size={12} /> : <Play size={12} />}{motionEnabled ? 'Pause motion' : 'Play motion'}</button></div>
    </section>

    <section className="vs-story"><div className="vs-story-inner vs-container"><span className="vs-kicker">A headline isn’t a decision.</span><h2 className="vs-story-statement" aria-label={storyLines.join(' ')}>{storyLines.map((line, lineIndex) => <span className="vs-story-line" aria-hidden="true" key={line}>{line.split(' ').map((word, wordIndex) => <span key={wordIndex}><span className="vs-story-word">{Array.from(word).map((char, charIndex) => <span data-story-char key={charIndex}>{char}</span>)}</span>{' '}</span>)}{lineIndex === 0 && <br />}</span>)}</h2><div className="vs-story-bottom"><p>A competitor moves. Costs shift. A new rule appears.<br />VANTAGE connects the change to the business you’re building.</p><span>Market <ArrowRight size={14} />Your business <ArrowRight size={14} />Your next move</span></div></div></section>

    <div id="how-it-works" className="vs-how">
      <section className="vs-feature-band vs-texture-field"><div className="vs-feature-row vs-container"><div className="vs-feature-copy" data-reveal><span className="vs-kicker"><span className="vs-step">01</span>Command the signal</span><h2>Start with what<br />actually changed.</h2><p>Market moves, competitor updates and relevant regulatory news, in one focused feed. Go back to the original source. Choose what deserves a closer look.</p><Link href="/product" className="vs-text-link">Explore the signal feed <ArrowRight size={16} /></Link></div><SignalScene /></div></section>
      <section className="vs-feature-row vs-feature-reverse vs-container"><div className="vs-feature-copy" data-reveal><span className="vs-kicker"><span className="vs-step">02</span>Understand your exposure</span><h2>Same headline.<br />Different implications.</h2><p>Your product, customers and priorities change the picture. VANTAGE explores what a signal could mean for your company—and which assumptions need checking.</p><Link href="/product" className="vs-text-link">See company-specific impact <ArrowRight size={16} /></Link></div><div className="vs-impact-scene" data-reveal><ImpactPreview /></div></section>
      <section className="vs-feature-band vs-texture-field"><div className="vs-feature-row vs-container"><div className="vs-feature-copy" data-reveal><span className="vs-kicker"><span className="vs-step">03</span>Make a considered move</span><h2>Work through the call.<br />Keep the why.</h2><p>Talk it through with Advisor. Compare possible strategies. Challenge blind spots. Record your decision and what you still need to learn.</p><p className="vs-small-copy">Try the example. Move from signal to impact to decision.</p><Link href="/product" className="vs-text-link">Inside the workspace <ArrowRight size={16} /></Link></div><div className="vs-decision-scene" data-reveal><DecisionExample /></div></div></section>
    </div>

    <section className="vs-use-section"><div className="vs-container vs-use-layout"><div data-reveal><span className="vs-kicker">For the person making the call</span><h2>Your desk.<br />Your decisions.<br /><span className="vs-soft-ink">A clearer view.</span></h2><p>Built for founders and operating CEOs without a chief of staff. Our first pilots focus on growing B2B SaaS companies.</p></div><div className="vs-use-rows">{[
      ['01', 'Product priorities', 'What deserves the next build?'],
      ['02', 'Pricing & margins', 'Should our pricing change?'],
      ['03', 'Competitive moves', 'Do we respond—or stay the course?'],
      ['04', 'Business risk', 'What needs my attention now?'],
    ].map(([number, label, question]) => <Link href="/use-cases" key={label}><span className="vs-micro">{number} / {label}</span><span>{question}</span><ArrowUpRight size={19} aria-hidden="true" /></Link>)}</div></div></section>

    <section className="vs-pilot-band vs-texture-field"><div className="vs-container vs-pilot-card" data-reveal><div className="vs-pilot-copy"><span className="vs-kicker">An invitation from the founder</span><h2>Bring a real decision.<br />Let’s make it clearer.</h2><p>I’m Bita, founder of VANTAGE. Try VANTAGE for 14 days at no cost. I’ll help you set it up, check in with you, and listen carefully to what helped—and what didn’t.</p><Link href="/pilot" className="vs-button">Explore the free pilot <ArrowUpRight size={16} /></Link><span className="vs-pilot-fine">Honest feedback in exchange. Any public review is optional.</span></div><div className="vs-pilot-schedule"><span className="vs-pilot-number">14<span>days around<br />one real decision</span></span><div><p><span>Day 1</span>Set up together</p><p><span>Day 3</span>Early feedback check</p><p><span>Day 7</span>Review what’s useful</p><p><span>Day 14</span>Make the next call</p></div><span>Direct access to the founder throughout.<br />No automatic paid commitment.</span></div></div></section>

    <section className="vs-section vs-container vs-faq-layout"><div data-reveal><span className="vs-kicker">A few useful answers</span><h2>Good questions.<br />Straight answers.</h2><Link href="/contact" className="vs-text-link">Talk to the founder <ArrowUpRight size={16} /></Link></div><div className="vs-faq">{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
    <section className="vs-closing"><div className="vs-container"><span className="vs-kicker">Command the signal. Eliminate the noise.</span><h2>Make your next move<br />with a clearer view.</h2><div className="vs-actions"><Link href="/pilot" className="vs-button">Explore the free pilot <ArrowUpRight size={16} /></Link><Link href="/book" className="vs-text-link">Book a 30-minute conversation <ArrowRight size={16} /></Link></div></div></section>
  </main>;
}
