import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { DecisionExample } from '@/components/marketing/Landing';
import { ProductDemo } from '@/components/marketing/ProductDemo';
import { MeetingBooking } from '@/components/marketing/MeetingBooking';

const pages = {
  product: { title: 'How VANTAGE works', description: 'From a relevant market signal to company-specific impact, options and a saved decision. See how the VANTAGE workspace fits together.' },
  'use-cases': { title: 'Who VANTAGE is for', description: 'Strategic intelligence for founders and operating CEOs. Explore SaaS product priorities, pricing choices and business risk.' },
  pilot: { title: 'The free 14-day pilot', description: 'Try VANTAGE around one real decision with founder-led setup, regular check-ins and an honest feedback exchange. No automatic paid commitment.' },
  about: { title: 'Our story', description: 'Why Bita is building VANTAGE: help CEOs understand what a changing market means for their business and decide with clarity.' },
  trust: { title: 'Sources and AI', description: 'Understand the role of original sources, company context and AI interpretation in VANTAGE. Know what to verify before making a decision.' },
  book: { title: 'Meet the founder · 30 minutes', description: 'A 30-minute conversation with Bita, founder of VANTAGE. Discuss your business, one real decision and whether a free pilot fits.' },
  contact: { title: 'Contact the founder', description: 'Talk directly to Bita, founder of VANTAGE, about a pilot, your company’s next decision or a product question.' },
} as const;
type PageName = keyof typeof pages;
function validPage(name: string): name is PageName { return Object.hasOwn(pages, name); }
export function generateStaticParams() { return Object.keys(pages).map(page => ({ page })); }
export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const { page } = await params;
  if (!validPage(page)) return {};
  return { ...pages[page], alternates: { canonical: '/' + page }, openGraph: { ...pages[page], url: '/' + page } };
}
function Intro({ kicker, title, children }: { kicker: string; title: ReactNode; children: ReactNode }) {
  return <section className="vs-container vs-page-hero"><span className="vs-kicker">{kicker}</span><h1>{title}</h1><p>{children}</p></section>;
}
function NextStep() {
  return <section className="vs-closing vs-container"><span className="vs-kicker">A free 14-day feedback pilot</span><h2>Start with the decision<br /><em>you’re facing now.</em></h2><div className="vs-actions"><Link className="vs-button" href="/pilot">Explore the pilot <ArrowUpRight size={17} /></Link><Link className="vs-text-link" href="/book">Book 30 minutes with the founder <ArrowRight size={17} /></Link></div></section>;
}
export default async function PublicPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (!validPage(page)) notFound();
  return <main id="main">
    {page === 'product' && <>
      <Intro kicker="The VANTAGE workspace" title={<>From a market change<br />to <em>a considered decision.</em></>}>Bring your company context, relevant signals, possible moves and decision history together. Keep the reasoning close to the call.</Intro>
      <section className="vs-feature-band vs-texture-field"><div className="vs-container vs-page-section vs-split"><div><span className="vs-kicker">Try the workspace</span><h2>See the pieces<br /><em>work together.</em></h2><p>Choose a signal, inspect its impact, compare strategies, or talk through an assumption with Advisor. This interactive example uses a fictional company and prewritten analysis.</p></div><ProductDemo /></div></section>
      <section className="vs-container vs-page-section vs-split"><div><span className="vs-kicker">01 / Start with your business</span><h2>Your context<br /><em>changes the question.</em></h2><p>Add what you sell, who buys it, your competitors and your current priorities. The same market event can matter very differently to two companies.</p><div className="vs-inline-list"><span>Product</span><span>Customers</span><span>Competitors</span><span>Priorities</span></div></div><DecisionExample /></section>
      <section className="vs-container vs-page-section"><span className="vs-kicker">02 / Work through the change</span><h2>Evidence first.<br /><em>Implications next.</em></h2><div className="vs-workflow">{[
        ['Signals', 'Review changes with source links and categories. Choose a signal worth examining.'],
        ['Impact analysis', 'Explore how it could affect your business. Inspect the source and challenge the interpretation.'],
        ['Strategies & Advisor', 'Compare possible responses. Ask Advisor to work through a choice with your company context attached. Keep assumptions visible.'],
      ].map(([title, copy], i) => <article key={title}><div className="vs-step-top">0{i + 1}</div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="vs-container vs-page-section vs-reading"><span className="vs-kicker">03 / Keep the reasoning</span><h2>Save the call.<br /><em>Come back to the why.</em></h2><p>Record your decision, rationale, confidence, known context and open questions. Use the blind-spot review to question assumptions before you commit. Keep the source of the change alongside the reasoning.</p><p>Return to saved decisions and record strategy outcomes as you learn. A decision history is most useful when your reasoning and results are honest.</p><p className="vs-note">AI analysis is interpretation. Inspect the source and verify consequential claims before acting.</p><Link href="/trust" className="vs-text-link">Read about sources and AI <ArrowRight size={16} /></Link></section><NextStep />
    </>}
    {page === 'use-cases' && <>
      <Intro kicker="For founders and operating CEOs" title={<>A clearer view of<br /><em>the decisions you carry.</em></>}>You’re responsible for the call. You need to understand what changed, where it affects your business and what to investigate before moving.</Intro>
      <section className="vs-container vs-page-section vs-reading"><span className="vs-kicker">Our first focus</span><h2>Growing B2B SaaS.<br /><em>Consequential choices.</em></h2><p>The first pilots focus on SaaS founders and CEOs working through product, pricing and competitive decisions without a dedicated intelligence team or chief of staff.</p><p>Building in fintech or e-commerce? Talk to Bita about your decision and the sources you need. We’ll assess fit before starting a pilot.</p></section>
      {[
        ['Product priorities', 'Should this move change your roadmap?', 'A competitor launches a capability your customers have also asked about.', 'Explore how the change relates to your product and customers. Compare a focused validation step with a larger build. Record which assumptions need evidence.'],
        ['Pricing & margins', 'What should change before your margin does?', 'A vendor changes its commercial terms or a competitor introduces a new pricing model.', 'Bring the signal into your pricing decision. Check actual terms and your own costs, then compare options before changing every customer’s plan.'],
        ['Competitive moves', 'Does their move change your next one?', 'A rival enters your market, changes its pricing or announces a new capability.', 'Look beyond the announcement. Compare the change with your customers and priorities, explore possible consequences, and decide what deserves a response.'],
        ['Business risk', 'Which change deserves a closer look?', 'A relevant policy, market or supplier change raises a question about your current plan.', 'Examine the source and possible exposure. Capture what is known, what requires specialist advice and when the decision needs review.'],
      ].map(([label, title, change, action]) => <section className="vs-container vs-page-section vs-split" key={label}><div><span className="vs-kicker">{label}</span><h2>{title}</h2></div><div><span className="vs-kicker">An illustrative situation</span><p>{change}</p><p>{action}</p></div></section>)}<NextStep />
    </>}
    {page === 'pilot' && <>
      <Intro kicker="14 days · No cost · Founder-led" title={<>One real decision.<br /><em>A better way to weigh it.</em></>}>I’m Bita, founder of VANTAGE. I’ll help you try the product around a decision you’re already facing. In exchange, I want honest feedback about what helped, what was unclear and what you would change.</Intro>
      <section className="vs-container vs-page-section"><span className="vs-kicker">The feedback rhythm</span><h2>Enough time to learn.<br /><em>Enough contact to help.</em></h2><div className="vs-timeline">{[
        ['Day 1', 'Set up together', 'A 30-minute conversation about your business and one current decision. We set your context and choose what to examine.'],
        ['Around day 3', 'An early written check', 'Tell me where you got stuck or what surprised you. You can reach me directly throughout the pilot.'],
        ['Around day 7', 'Review the first insights', 'A 10-minute conversation to check relevance, challenge weak analysis and adjust the focus.'],
        ['Day 14', 'Review what changed', 'A 20-minute review of what helped, what missed the mark and whether VANTAGE belongs in your decision process.'],
      ].map(([day, title, copy]) => <article key={day}><span className="vs-kicker">{day}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="vs-container vs-page-section vs-split"><div><span className="vs-kicker">The exchange</span><h2>Your candour.<br /><em>Our next improvement.</em></h2></div><div><p>The pilot is free. Your feedback helps shape the product and the eventual paid offer. A public review is optional, and I’ll only ask with your permission.</p><p>There is no automatic paid commitment in this invitation. At the final review, we can discuss continued access if it would be useful. We can adjust the review rhythm together.</p></div></section>
      <section className="vs-closing vs-container"><span className="vs-kicker">Let’s start with your business</span><h2>What decision<br /><em>are you working through?</em></h2><div className="vs-actions"><Link className="vs-button" href="/book">Book a 30-minute pilot conversation <ArrowUpRight size={17} /></Link><Link href="/signup" className="vs-text-link">Create your workspace <ArrowRight size={17} /></Link></div><p className="vs-body" style={{ marginInline: 'auto' }}>Start with a 30-minute conversation with Bita, founder of VANTAGE. Bring your company context and one decision you’re facing. We’ll discuss fit before starting the pilot.</p></section>
    </>}
    {page === 'about' && <>
      <Intro kicker="A note from the founder" title={<>You shouldn’t need<br /><em>more noise to find clarity.</em></>}>VANTAGE is built around a simple question: what does this change mean for your business—and what will you do about it?</Intro>
      <section className="vs-container vs-page-section vs-reading"><h2>Why I’m building VANTAGE.</h2><p>I’m Bita, founder of VANTAGE. CEOs and builders have more information than ever, but a headline, dashboard or long report can still leave the most important question unanswered: what should change in the business?</p><p>I’m building VANTAGE to close that gap. Connect the external signal to the company’s context. Make the possible consequences visible. Help you weigh a decision and keep the reasoning behind it.</p><p>The ambition is a dependable intelligence workspace for the person carrying the decision. The work now is to make that useful around real choices, with founders and CEOs who will tell me honestly where it falls short.</p><p className="vs-signature">Bita</p><span className="vs-kicker">Founder, VANTAGE</span></section>
      <section id="mission" className="vs-feature-band vs-texture-field"><div className="vs-container vs-page-section vs-principles"><article><span className="vs-kicker">Our mission</span><h2>Make the change<br /><em>useful to the decision.</em></h2><p>Help CEOs connect credible market signals to their business, understand the possible consequences, and make a considered next move.</p></article><article><span className="vs-kicker">Our vision</span><h2>A clearer view<br /><em>for every builder.</em></h2><p>A future where access to useful strategic intelligence doesn’t depend on having a large research team. Where decisions carry their evidence and reasoning, and founders can learn from the calls they make.</p></article></div></section>
      <section className="vs-container vs-page-section"><span className="vs-kicker">What guides the work</span><h2>Clarity has to be earned.</h2><div className="vs-workflow">{[
        ['Evidence stays visible', 'Keep the original source close. Make the distinction between a reported fact and an AI interpretation clear.'],
        ['Your context matters', 'Understand the business behind the question. The same signal can lead to different choices.'],
        ['You make the call', 'Surface possibilities and challenge assumptions. The decision and judgement remain yours.'],
      ].map(([title, copy], i) => <article key={title}><div className="vs-step-top">0{i + 1}</div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="vs-container vs-page-section vs-reading"><h2>Clarity is a practice.</h2><p>A useful analysis should help you ask a better question, inspect the evidence and make a considered call. That is the standard I want VANTAGE to earn—one decision at a time.</p><Link href="/pilot" className="vs-text-link">Help shape it in a free pilot <ArrowRight size={16} /></Link></section><NextStep />
    </>}
    {page === 'trust' && <>
      <Intro kicker="Sources, context and AI" title={<>Keep the evidence close.<br /><em>Keep your judgement closer.</em></>}>Understand how to read a VANTAGE analysis and what to verify before relying on it for a significant decision.</Intro>
      {[
        ['Original sources', 'Go back to what actually changed.', 'Signals can come from news providers and publisher feeds. Open the original source, check when it was published and confirm that the article supports the claim. A source link helps you inspect an analysis; it does not guarantee the source is correct.'],
        ['AI interpretation', 'Examine the reasoning.', 'VANTAGE uses AI to relate information to your saved company context and explore possible consequences. AI can misunderstand a source, miss context or produce an unsupported claim. Treat recommendations and blind spots as questions to investigate.'],
        ['Your company context', 'Give the analysis a sound starting point.', 'Use accurate product, customer, competitor and priority information. Review it when your business changes. Start a pilot with the context needed for your decision, and avoid adding sensitive customer records or secrets.'],
        ['Company review', 'Ask about data handling before sharing more.', 'If your company requires a security or privacy review, contact Bita before entering confidential information. Ask for the current data-handling details and confirm that they meet your requirements. This page explains the decision workflow; it is not a security certification or a contractual privacy policy.'],
      ].map(([label, title, body]) => <section className="vs-container vs-page-section vs-reading" key={label}><span className="vs-kicker">{label}</span><h2>{title}</h2><p>{body}</p></section>)}
      <section className="vs-closing vs-container"><h2>A question about<br /><em>the evidence or your data?</em></h2><Link href="/contact" className="vs-button">Talk to Bita <ArrowUpRight size={17} /></Link></section>
    </>}
    {page === 'book' && <MeetingBooking bookingUrl={process.env.NEXT_PUBLIC_VANTAGE_BOOKING_URL || 'https://calendly.com/bita-vantage/30min'} />}
    {page === 'contact' && <>
      <Intro kicker="Direct access to the founder" title={<>Let’s talk about<br /><em>your next decision.</em></>}>Tell me what you’re building, what changed and which decision you’re weighing. I’ll help you see whether VANTAGE fits.</Intro>
      <section className="vs-container vs-page-section vs-split"><div><span className="vs-kicker">Bita · Founder, VANTAGE</span><h2>A real conversation.<br /><em>Start here.</em></h2><Link href="/book" className="vs-button">Book a 30-minute conversation <ArrowUpRight size={17} /></Link><a href="mailto:bita@vantage.ceo?subject=VANTAGE%20conversation" className="vs-text-link">bita@vantage.ceo <ArrowUpRight size={17} /></a></div><div><h3>A useful first message</h3><p>Your company and role. One decision you’re facing. The market or competitor change behind it. That’s enough to start.</p><p>For an existing account, include the page where you’re stuck and what you expected to happen. Please keep passwords and private customer data out of your message.</p><Link href="/pilot" className="vs-text-link">Read about the 14-day pilot <ArrowRight size={16} /></Link></div></section>
    </>}
  </main>;
}
