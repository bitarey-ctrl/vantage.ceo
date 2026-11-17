'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowLeft, ArrowRight, ChevronRight, FileText, RotateCcw, Sparkles } from 'lucide-react';
import { BrandLogo } from '@/components/vantage/brand-logo';

// Public, fictional example only. Mirrors the current signed-in app (/app):
// Today, Signals, My decisions, Ask Advisor and Your company.
// This walkthrough never calls the authenticated app or generates AI output.

type ContextKey = 'focus' | 'buyers' | 'risks' | 'limits';
const company = {
  name: 'Halden', full: 'Halden Components', initial: 'H',
  fields: [
    ['What you sell', 'Precision steel fasteners for industrial equipment makers.'],
    ['Who buys', 'Equipment makers in Germany and the Netherlands, through three EU distributors.'],
    ['Current focus', 'Grow EU volume 15% this year without gross margin falling below 18%.'],
    ['Top risks', 'Steel input costs. One distributor is 40% of EU revenue.'],
    ['Keep within', 'No price changes inside signed contracts. Renewals in June.'],
    ['Competitors', 'Two lower-priced suppliers selling into the same distributors.'],
    ['Past decisions', '3 recorded, including “Move to quarterly steel contracts” (reviewed).'],
  ],
} as const;
const contextLabel: Record<ContextKey, string> = { focus: 'Your focus: 18% margin floor', buyers: 'Your buyers: 3 EU distributors', risks: 'Your risk: one distributor is 40%', limits: 'Your limit: no mid-contract price change' };

const signals = [
  { category: 'Tariffs', date: 'Mar 2', sources: 2, title: 'EU raises duties on imported steel fasteners', summary: 'A provisional 9% duty applies to fastener imports from outside the EU from April 1.', domain: 'example-trade-journal.com', touches: ['focus', 'buyers', 'limits'] as ContextKey[],
    why: 'Most of your EU revenue ships under contracts you can’t reprice until June. The duty lands on margin first, and on your largest distributor most.',
    act: 'A surcharge, where contracts allow it, protects margin but tests the distributor relationships.',
    dont: 'Absorbing the duty until June keeps volume steady but likely takes gross margin below your 18% floor.',
    check: 'Which contracts allow a surcharge, and whether the duty covers your product codes.' },
  { category: 'Competition', date: 'Feb 27', sources: 1, title: 'A rival supplier opens an EU warehouse', summary: 'A competing supplier now holds stock in Rotterdam with 48-hour delivery.', domain: 'example-industry-news.com', touches: ['buyers', 'risks'] as ContextKey[],
    why: 'Faster delivery could matter most to the distributor that already carries 40% of your EU revenue.',
    act: 'Matching delivery times may mean holding stock in the EU, which ties up cash.',
    dont: 'Price and quality may still win, but watch whether delivery time comes up at renewal.',
    check: 'Whether your distributors have raised delivery speed in the last two quarters.' },
  { category: 'Cost base', date: 'Feb 24', sources: 3, title: 'Steel prices fall for a third month', summary: 'Benchmark prices for the steel you buy are down 6% since December.', domain: 'example-commodities.com', touches: ['risks', 'focus'] as ContextKey[],
    why: 'Lower input cost could offset part of the new duty, and your quarterly steel contract renews next month.',
    act: 'A longer contract now could hold the lower price through the duty period.',
    dont: 'Staying quarterly keeps flexibility if prices keep falling.',
    check: 'Your current contract terms and the supplier’s minimum volumes.' },
] as const;

const decisions = [
  { title: 'Absorb the EU duty, or add a surcharge?', note: 'The new duty lands before June renewals.', status: 'Thinking it through', date: 'Decide by Mar 20' },
  { title: 'Add a second EU distributor?', note: 'Reduce dependence on one distributor.', status: 'Thinking it through', date: 'No decision date set' },
  { title: 'Move to quarterly steel contracts', note: 'Chosen in October. Reviewed in January.', status: 'Reviewed', date: 'Past' },
] as const;

const responses = [
  ['Add a surcharge where contracts allow it', 'Protects most of the margin from April.', 'Tests the two smaller distributor relationships.', 'Easy: remove it at renewal.'],
  ['Absorb the duty until June renewals', 'Keeps volume steady through Q2.', 'Gross margin likely below 18% for a quarter.', 'Nothing to undo; the cost is spent.'],
  ['Lock a 12-month steel contract now', 'Offsets part of the duty.', 'Less flexibility if prices keep falling.', 'Hard: a 12-month commitment.'],
] as const;

const advisorExamples = [
  { question: 'Should we absorb the duty or add a surcharge?', answer: 'Start with the contracts. If the two smaller distributors allow a surcharge, you can protect most of the margin without touching your largest account before June. Absorbing everywhere would likely take you below the 18% floor you set.', next: 'What would your largest distributor do if a rival offered a lower landed price?' },
  { question: 'What am I missing?', answer: 'You’re treating the duty only as a cost. It’s also a negotiating moment: your steel contract renews next month and prices are down 6%. Together they may close most of the gap.', next: 'What evidence would change your mind?' },
  { question: 'What did we learn last time?', answer: 'When you moved to quarterly steel contracts, your review noted that distributors accepted a price change with 60 days’ notice. That supports announcing any surcharge early.', next: 'Do the June renewals leave enough notice?' },
] as const;

type View = 'today' | 'signals' | 'signal' | 'decisions' | 'decision' | 'advisor' | 'company';
const tabs: [View, string][] = [['today', 'Today'], ['signals', 'Signals'], ['decisions', 'My decisions']];

function Chips({ keys }: { keys: readonly ContextKey[] }) {
  return <div className="vx-chips" aria-label="Company context this touches">{keys.map(key => <span key={key}>{contextLabel[key]}</span>)}</div>;
}

function Btn({ children, onClick, dark = false }: { children: ReactNode; onClick: () => void; dark?: boolean }) {
  return <button className={dark ? 'vx-btn vx-btn-dark' : 'vx-btn'} onClick={onClick}>{children}</button>;
}

/** A static "Your company" card, matching the app's company context page. */
export function CompanyContextPreview() {
  return <div className="vx-context" aria-label="Illustrative company context in VANTAGE">
    <div className="vx-context-top"><span className="vx-avatar">{company.initial}</span><span><strong>Your company.</strong><small>The context behind the guidance</small></span><em>Illustrative example</em></div>
    <dl>{company.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="vx-fine">Advisor suggests updates as your business changes. Every answer starts from this.</p>
  </div>;
}

export function ProductDemo() {
  const [view, setView] = useState<View>('today');
  const [signal, setSignal] = useState(0);
  const [analysed, setAnalysed] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [question, setQuestion] = useState<number | null>(null);
  const screen = useRef<HTMLDivElement>(null);
  const screenId = useId();
  const active = view === 'signal' ? 'signals' : view === 'decision' ? 'decisions' : view;

  function go(next: View) { setView(next); screen.current?.scrollTo({ top: 0, behavior: 'instant' }); }
  function openSignal(index: number) { setSignal(index); setAnalysed(false); go('signal'); }
  function reset() { setSignal(0); setAnalysed(false); setRecorded(false); setQuestion(null); go('today'); }
  const s = signals[signal];

  return <div id="product-demo" className="vs-product-demo" data-hero-layer>
    <div className="vx-app" aria-label="Interactive VANTAGE walkthrough with a fictional company">
      <header className="vx-header">
        <span className="vx-brand"><BrandLogo />Vantage</span>
        <nav aria-label="Walkthrough navigation">{tabs.map(([key, label]) => <button key={key} aria-current={active === key ? 'page' : undefined} aria-controls={screenId} onClick={() => go(key)}>{label}</button>)}</nav>
        <button className="vx-ask" aria-current={view === 'advisor' ? 'page' : undefined} onClick={() => go('advisor')}>Ask Advisor</button>
        <button className="vx-company" aria-label="Open company context" aria-current={view === 'company' ? 'page' : undefined} onClick={() => go('company')}><span className="vx-avatar">{company.initial}</span><span>{company.name}</span></button>
      </header>
      <div className="vx-strip"><span>Fictional example workspace</span><button aria-label="Restart walkthrough" title="Restart walkthrough" onClick={reset}><RotateCcw size={12} aria-hidden="true" /></button></div>
      <div ref={screen} id={screenId} className="vx-screen" tabIndex={0} aria-label="Sample screen">

        {view === 'today' && <>
          <span className="vx-date">Tuesday, March 3</span>
          <h2>What needs your attention?</h2>
          <p className="vx-sub">3 check-ins and changes for {company.full}.</p>
          <button className="vx-askbox" onClick={() => go('advisor')}><Sparkles size={15} aria-hidden="true" /><span><small>Already have something on your mind?</small>Ask a question, or think something through…</span><span className="vx-btn vx-btn-dark">Ask Advisor <ArrowRight size={12} aria-hidden="true" /></span></button>
          <div className="vx-section-head"><strong>Check-ins &amp; changes</strong><span>Why these items?</span></div>
          <article className="vx-card">
            <span className="vx-meta"><Activity size={12} aria-hidden="true" />New · {signals[0].date} · {signals[0].category}</span>
            <h3>{signals[0].title}</h3>
            <p>{signals[0].summary}</p>
            <div className="vx-rule" />
            <span className="vx-small-strong">Why it may matter to you</span>
            <Chips keys={signals[0].touches} />
            <div className="vx-actions"><Btn onClick={() => openSignal(0)}>Inspect the signal <ArrowRight size={12} aria-hidden="true" /></Btn><button className="vx-link" onClick={() => go('decision')}>Continue the decision</button></div>
          </article>
          <div className="vx-section-head"><strong>Continue your work</strong></div>
          {decisions.slice(0, 2).map(d => <button key={d.title} className="vx-row" onClick={() => go('decision')}><span><strong>{d.title}</strong><small>{d.status}</small></span><ChevronRight size={14} aria-hidden="true" /></button>)}
        </>}

        {view === 'signals' && <>
          <h2>Signals.</h2>
          <p className="vx-sub">Understand a change, inspect its basis, then decide whether to watch or respond.</p>
          <div className="vx-tabs"><span aria-current="true">All signals</span><span>Watching</span><span>Dismissed</span></div>
          {signals.map((item, index) => <button key={item.title} className="vx-signal-row" onClick={() => openSignal(index)}><span><small>{item.category} · Published {item.date} · {item.sources} source record{item.sources > 1 ? 's' : ''}</small><strong>{item.title}</strong><span>{item.summary}</span><Chips keys={item.touches} /></span><ArrowRight size={14} aria-hidden="true" /></button>)}
        </>}

        {view === 'signal' && <article>
          <button className="vx-back" onClick={() => go('signals')}><ArrowLeft size={12} aria-hidden="true" />Signals</button>
          <span className="vx-kicker">{s.category} · External event</span>
          <h2>{s.title}</h2>
          <div className="vx-block"><span className="vx-small-strong">What changed</span><p>{s.summary}</p><span className="vx-source"><FileText size={12} aria-hidden="true" />{s.domain}</span><small className="vx-fine">{s.sources} source record{s.sources > 1 ? 's' : ''}. Fictional for this example.</small></div>
          <div className="vx-block"><span className="vx-small-strong">Why it may matter to you</span><Chips keys={s.touches} /><p>{s.why}</p><small className="vx-fine">Interpretation from your company context. Not a verified effect on your business.</small></div>
          <div className="vx-block"><div className="vx-split"><span className="vx-small-strong">What a response could change</span>{!analysed && <Btn onClick={() => setAnalysed(true)}>Analyse impact</Btn>}</div>
            {analysed ? <div className="vx-impact"><div><small>If you act</small><p>{s.act}</p></div><div><small>If you don’t</small><p>{s.dont}</p></div><div><small>Check first</small><p>{s.check}</p></div></div> : <p className="vx-muted">See the trade-off for {company.name} before you respond.</p>}
            {analysed && signal === 0 && <div className="vx-actions"><Btn dark onClick={() => go('decision')}>Work it through as a decision <ArrowRight size={12} aria-hidden="true" /></Btn></div>}
          </div>
        </article>}

        {view === 'decisions' && <>
          <h2>My decisions.</h2>
          <p className="vx-sub">Every question, your reasoning, the choice and what happened next.</p>
          <div className="vx-tabs"><span aria-current="true">Active</span><span>Past</span><span>Review due</span><span>Strategies</span></div>
          {decisions.map(d => <button key={d.title} className="vx-row vx-row-tall" onClick={() => go('decision')}><span><strong>{d.title}</strong><small>{d.note}</small></span><span className="vx-status"><small>{d.title === decisions[0].title && recorded ? 'Choice recorded' : d.status}</small><small>{d.date}</small></span><ChevronRight size={14} aria-hidden="true" /></button>)}
        </>}

        {view === 'decision' && <article>
          <button className="vx-back" onClick={() => go('decisions')}><ArrowLeft size={12} aria-hidden="true" />My decisions</button>
          <span className="vx-badge">{recorded ? 'Choice recorded' : 'Thinking it through'}</span>
          <h2>{decisions[0].title}</h2>
          <div className="vx-card vx-card-tight">
            <span className="vx-small-strong">What a good outcome looks like</span>
            <p className="vx-strong">Keep EU volume while holding gross margin above 18%.</p>
            <p className="vx-muted"><b>Keep within</b> No price changes inside signed contracts.</p>
          </div>
          {recorded ? <div className="vx-card vx-card-tight vx-recorded"><span className="vx-small-strong">Your recorded choice</span><p className="vx-strong">Surcharge for the two smaller distributors. Absorb for the largest until June.</p><p className="vx-muted">Reasoning, options and evidence saved as they were today. Review set for June 1: did EU volume hold, and where did margin land?</p><div className="vx-actions"><span className="vx-btn vx-btn-off">Review what happened · June 1</span></div></div> : <>
            <span className="vx-small-strong vx-gap">Responses considered</span>
            <div className="vx-responses">{responses.map(([title, effect, downside, undo]) => <div key={title}><strong>{title}</strong><dl><dt>Expected effect</dt><dd>{effect}</dd><dt>Downside</dt><dd>{downside}</dd><dt>Undoing it</dt><dd>{undo}</dd></dl></div>)}</div>
            <span className="vx-small-strong vx-gap">What supports this?</span>
            <button className="vx-evidence" onClick={() => openSignal(0)}><FileText size={12} aria-hidden="true" /><span>Signal · {signals[0].title}</span></button>
            <div className="vx-evidence"><Activity size={12} aria-hidden="true" /><span>Assumption · The duty covers our product codes. <em>Not yet checked.</em></span></div>
          </>}
          <aside className="vx-advisor-panel"><span className="vx-panel-head"><Sparkles size={13} aria-hidden="true" />Advisor<small>One continuing conversation with this decision.</small></span>
            <span className="vx-kicker">Next useful step</span>
            <p className="vx-strong">{recorded ? 'Set what you’ll compare on June 1.' : 'Check which contracts allow a surcharge.'}</p>
            <p className="vx-muted">{recorded ? 'Note the margin and volume you expect, so the review is honest.' : 'Two of three distributor contracts decide whether the first response is open to you.'}</p>
            <div className="vx-actions">{!recorded && <Btn dark onClick={() => setRecorded(true)}>Record a choice</Btn>}<Btn onClick={() => go('advisor')}>Ask Advisor</Btn></div>
          </aside>
        </article>}

        {view === 'advisor' && <article>
          <h2>Ask Advisor.</h2>
          <p className="vx-sub">Think it through with your company context attached.</p>
          <span className="vx-context-pill"><Sparkles size={12} aria-hidden="true" />{company.full} context: focus, risks, limits, signals and past decisions</span>
          {question !== null && <div className="vx-chat" aria-live="polite"><div className="vx-you"><small>You</small><p>{advisorExamples[question].question}</p></div><div className="vx-answer"><small>Advisor · Sample answer</small><p>{advisorExamples[question].answer}</p><p className="vx-strong">{advisorExamples[question].next}</p></div></div>}
          <div className="vx-prompts"><small>Choose a sample question</small>{advisorExamples.map((item, index) => <button key={item.question} aria-pressed={question === index} onClick={() => setQuestion(index)}>{item.question}<ArrowRight size={12} aria-hidden="true" /></button>)}</div>
        </article>}

        {view === 'company' && <article>
          <h2>Your company.</h2>
          <p className="vx-sub">The context behind the guidance.</p>
          <dl className="vx-fields">{company.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className="vx-fine">Supplied context is not independently verified. Advisor suggests updates as your business changes.</p>
        </article>}
      </div>
    </div>
    <p className="vs-demo-caption">Click inside the workspace.<br />Fictional company, signals and conversations.</p>
    <span className="vs-sr-only" role="status" aria-live="polite">{view} sample screen.</span>
  </div>;
}
