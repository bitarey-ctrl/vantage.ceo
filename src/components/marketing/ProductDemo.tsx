'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, ChevronRight, Command, GitBranch, LayoutGrid, Link2, MessageSquare, Plus, RotateCcw, Zap } from 'lucide-react';
import { BrandLogo } from '@/components/vantage/brand-logo';

// Public, fictional examples only. Keep the screen hierarchy and field names
// aligned with Command, Signals, Strategies and Decisions in the real app.
// This walkthrough never calls the authenticated app or generates AI output.
const signals = [
  {
    title: 'A competitor adds usage-based pricing.', category: 'Competition', urgency: 'Decide this month', source: 'Example pricing announcement',
    summary: 'A rival now offers a monthly allowance with extra charges above it.',
    why: 'Buyers may start comparing your flat price with a lower starting price. The total bill depends on how much they use.',
    next: 'Compare the full cost for your typical customers before changing your plans.',
    soWhat: 'Your flat price could become a useful point of difference. First check whether your busiest accounts still have healthy margins.',
    act: 'A usage allowance may protect margins, but makes the customer’s bill less predictable.',
    dont: 'Your price stays easy to understand. High-usage accounts may still need a closer look.',
    action: 'Review usage and cost across your busiest accounts. Ask customers how much they value a predictable bill.',
  },
  {
    title: 'An infrastructure supplier changes its rates.', category: 'Cost Base', urgency: 'Act this week', source: 'Example supplier notice',
    summary: 'A supplier announces a change to its consumption rates at renewal.',
    why: 'A change in one supplier’s rates could affect your cost per account. Check the contract and your actual usage.',
    next: 'Model the new rates against your usage before your next renewal.',
    soWhat: 'The impact depends on your contract and which features drive consumption. The headline alone cannot tell you the margin effect.',
    act: 'You can compare a renewal, an alternative supplier and a change to usage before committing.',
    dont: 'You preserve your current setup, but may miss the chance to negotiate before renewal.',
    action: 'Confirm when the rates apply. Compare your last invoice with a model using the new rates.',
  },
  {
    title: 'A larger rival acquires a complementary product.', category: 'Competition', urgency: 'Watch', source: 'Example acquisition announcement',
    summary: 'A competitor announces an acquisition that could broaden its offer.',
    why: 'A broader offer may change buyer comparisons. An announcement does not prove the products already work together.',
    next: 'Check what is available now and which of your buyers would value the combination.',
    soWhat: 'Watch for a change in real buyer requirements before moving your roadmap. The acquisition itself is not evidence of lost demand.',
    act: 'Customer conversations can help separate a new requirement from a competitor’s promise.',
    dont: 'You keep your roadmap focused, but should still check whether the combination appears in sales conversations.',
    action: 'Review recent buyer objections and ask which missing capability would change the purchase decision.',
  },
] as const;

const strategies = [
  { title: 'Test a usage allowance before changing every plan.', description: 'Use the usage review and customer conversations to frame a small pricing test. Keep existing plans in place while you examine the trade-off.', now: 'Review cost and usage by account. Talk to customers about predictable bills.', later: 'Compare the evidence with a flat price increase before choosing a model.', inaction: 'Keep the current price, with the high-usage margin question still unresolved.' },
  { title: 'Keep flat pricing and improve the cost picture.', description: 'Retain a predictable bill while investigating which features and accounts drive cost. Examine whether cost changes can address the margin question.', now: 'Check cost by feature and account. Confirm which costs you can influence.', later: 'Review whether the cost work changes the need for a pricing test.', inaction: 'The offer stays simple, but the reason for weak margins may remain unclear.' },
] as const;

type View = 'Command' | 'Signals' | 'Strategies' | 'Decisions' | 'Advisor';
const navigation = [{ label: 'Command', icon: Command }, { label: 'Signals', icon: Zap }, { label: 'Strategies', icon: LayoutGrid }, { label: 'Decisions', icon: GitBranch }, { label: 'Advisor', icon: MessageSquare }] as const;
const advisorExamples = [
  { question: 'Should we change our pricing?', answer: 'First check account costs and customer expectations. A competitor’s move is a reason to investigate, not a reason to copy it.', next: 'Which customers would benefit from a predictable bill?' },
  { question: 'What are we missing?', answer: 'High usage could signal strong customer value. Compare retention and willingness to pay before treating those accounts only as a cost problem.', next: 'What evidence would change your mind?' },
] as const;

function AdvisorExample({ selected, onChoose, compact = false }: { selected: number | null; onChoose: (index: number) => void; compact?: boolean }) {
  return <div className={`vd-advisor-example${compact ? ' vd-advisor-compact' : ''}`}>
    <span className="vd-advisor-context"><i className="vs-dot" />Aster · Pricing context attached</span>
    {selected === null ? <div className="vd-advisor-welcome"><BrandLogo /><h3>What are you weighing?</h3><p>Bring a decision or an assumption you want challenged.</p></div> : <div className="vd-advisor-conversation" aria-live="polite"><div className="vd-advisor-question"><span>You</span><p>{advisorExamples[selected].question}</p></div><div className="vd-advisor-answer"><span>VANTAGE Advisor · Sample answer</span><p>{advisorExamples[selected].answer}</p><p>{advisorExamples[selected].next}</p></div></div>}
    <div className="vd-advisor-prompts" aria-label={compact ? 'Phone Advisor sample questions' : 'Advisor sample questions'}><span>Choose a sample question</span>{advisorExamples.map((item, index) => <button key={item.question} aria-pressed={selected === index} onClick={() => onChoose(index)}>{item.question}<ArrowUpRight size={12} aria-hidden="true" /></button>)}</div>
  </div>;
}

function SampleAnalysis({ index = 0 }: { index?: number }) {
  const signal = signals[index];
  return <div className="vd-analysis">
    <div className="vd-analysis-lead"><span className="vd-label">So what</span><p>{signal.soWhat}</p></div>
    <div className="vd-outcomes"><div><span className="vd-label">If you act</span><p>{signal.act}</p></div><div><span className="vd-label">If you don’t</span><p>{signal.dont}</p></div></div>
    <div className="vd-callout"><span className="vd-label">Immediate action</span><p>{signal.action}</p></div>
  </div>;
}

export function ImpactPreview() {
  return <div className="vd-snippet"><div className="vd-snippet-top"><Zap size={14} aria-hidden="true" /><span>Company-specific analysis</span><small>Example data</small></div><SampleAnalysis /><span className="vd-footnote">Aster · Fictional B2B SaaS company reviewing pricing</span></div>;
}

function DemoButton({ children, onClick, secondary = false }: { children: ReactNode; onClick: () => void; secondary?: boolean }) {
  return <button className={secondary ? 'vd-text-button' : 'vd-button'} onClick={onClick}>{children}<ArrowUpRight size={14} aria-hidden="true" /></button>;
}

export function ProductDemo() {
  const [view, setView] = useState<View>('Command');
  const [selectedSignal, setSelectedSignal] = useState<number | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [strategy, setStrategy] = useState(0);
  const [queue, setQueue] = useState<'Decisions' | 'Signals' | 'Strategies'>('Decisions');
  const [advisorQuestion, setAdvisorQuestion] = useState<number | null>(null);
  const [inspection, setInspection] = useState(0);
  const screen = useRef<HTMLDivElement>(null);
  const phoneScreen = useRef<HTMLDivElement>(null);
  const analysis = useRef<HTMLDetailsElement>(null);
  const screenId = useId();
  const signal = signals[selectedSignal ?? 0];

  useEffect(() => {
    const pane = screen.current;
    const detail = analysis.current;
    if (view === 'Signals' && showAnalysis && pane && detail) {
      pane.scrollTo({ top: detail.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 16, behavior: 'instant' });
    }
  }, [view, showAnalysis, selectedSignal, inspection]);

  useEffect(() => {
    phoneScreen.current?.scrollTo({ top: 0, behavior: 'instant' });
    if (view === 'Advisor') screen.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [advisorQuestion, view]);

  function go(next: View) {
    setView(next); setShowSource(false);
    if (next !== 'Signals') setSelectedSignal(null);
    screen.current?.scrollTo({ top: 0, behavior: 'instant' });
  }
  function openSignal(index: number, analysis = false) {
    setSelectedSignal(index); setShowAnalysis(analysis); setShowSource(false); go('Signals');
    if (analysis) setInspection(value => value + 1);
  }
  function reset() {
    setSelectedSignal(null); setShowAnalysis(false); setStrategy(0); setQueue('Decisions'); setAdvisorQuestion(null); go('Command');
  }

  return <div id="product-demo" className="vs-product-demo" data-hero-layer>
    <div className="vd-shell" aria-label="Interactive VANTAGE product walkthrough with fictional data">
      <aside className="vd-sidebar"><div className="vd-brand"><BrandLogo /><span>Vantage</span></div><span className="vd-workspace">Aster<small>Example workspace</small></span><nav aria-label="Product walkthrough navigation">{navigation.map(({ label, icon: Icon }) => <button key={label} aria-label={label} title={label} aria-current={view === label ? 'page' : undefined} aria-controls={screenId} onClick={() => { if (label === 'Signals') { setSelectedSignal(null); setShowAnalysis(false); } go(label); }}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}</nav><div className="vd-sidebar-note"><span className="vd-label">Your focus</span><p>Review pricing.<br />Protect customer trust.</p></div></aside>
      <div className="vd-workbench"><div className="vd-toolbar"><span>Aster <ChevronRight size={12} aria-hidden="true" /><strong>{view}</strong></span><span className="vd-sample-label">Fictional example</span><button aria-label="Restart product walkthrough" title="Restart walkthrough" onClick={reset}><RotateCcw size={14} aria-hidden="true" /></button></div>
        <div ref={screen} id={screenId} className="vd-screen" tabIndex={0} aria-label={`${view} sample screen`}>
          {view === 'Command' && <>
            <div className="vd-heading"><span className="vd-label">Command centre</span><h2>Your day, in focus.</h2><p>Know what to move forward—and what can wait.</p></div>
            <div className="vd-command-grid"><section className="vd-priority"><span className="vd-label"><i className="vs-dot" />Ready for review</span><h3>Should we change<br />our pricing model?</h3><p>Compare costs and customer expectations.</p><DemoButton onClick={() => go('Decisions')}>Continue decision</DemoButton></section><section className="vd-brief"><span className="vd-label"><Zap size={12} aria-hidden="true" />Signal brief</span><h3>One change to<br />look at first.</h3><button className="vd-brief-story" onClick={() => openSignal(0)}>{signals[0].title}<small>Competition · Decide this month</small></button><DemoButton secondary onClick={() => openSignal(0)}>Review signal</DemoButton></section></div>
            <div className="vd-progress"><strong>0 <span>/ 1</span></strong><span>decisions resolved</span><div /><small>1 still open <span>3 signals tracked</span></small></div>
            <div className="vd-queue"><div className="vd-queue-tabs" aria-label="Command queue">{(['Decisions', 'Signals', 'Strategies'] as const).map(label => <button key={label} aria-pressed={queue === label} onClick={() => setQueue(label)}>{label}<span>{label === 'Decisions' ? 1 : label === 'Signals' ? 3 : 2}</span></button>)}</div>
              {queue === 'Decisions' ? <button className="vd-row" onClick={() => go('Decisions')}><span><small>Open · Pricing</small><strong>Should we change our pricing model?</strong></span><ChevronRight size={14} aria-hidden="true" /></button> : queue === 'Signals' ? signals.map((item, index) => <button className="vd-row" key={item.title} onClick={() => openSignal(index)}><span><small>{item.category}</small><strong>{item.title}</strong></span><ChevronRight size={14} aria-hidden="true" /></button>) : strategies.map((item, index) => <button className="vd-row" key={item.title} onClick={() => { setStrategy(index); go('Strategies'); }}><span><small>Considering</small><strong>{item.title}</strong></span><ChevronRight size={14} aria-hidden="true" /></button>)}
            </div>
          </>}
          {view === 'Signals' && selectedSignal === null && <>
            <div className="vd-heading"><span className="vd-label">Your field of view</span><h2>Signals</h2><p>Changes that could affect your next decision.</p></div><div className="vd-feed-heading"><span>3 sample signals</span><span>Company focus: pricing</span></div>
            {signals.map((item, index) => <button className="vd-feed-row" key={item.title} onClick={() => openSignal(index)}><span className="vd-feed-dot" /><span><small>{item.category} · {item.urgency}</small><strong>{item.title}</strong><p>{item.summary}</p><small>{item.source}</small></span><ChevronRight size={15} aria-hidden="true" /></button>)}
          </>}
          {view === 'Signals' && selectedSignal !== null && <article className="vd-document">
            <button className="vd-back" onClick={() => { setSelectedSignal(null); screen.current?.scrollTo({ top: 0, behavior: 'instant' }); }}><ArrowLeft size={13} aria-hidden="true" />All signals</button><div className="vd-document-meta"><span>{showAnalysis ? 'Analysed example' : signal.urgency}</span>{signal.category}</div><h2>{signal.title}</h2><p className="vd-lede">{signal.summary}</p>
            <button className="vd-source" aria-expanded={showSource} onClick={() => setShowSource(value => !value)}><Link2 size={13} aria-hidden="true" />{signal.source}<Plus size={12} aria-hidden="true" /></button>
            {showSource && <div className="vd-source-example"><span className="vd-label">Fictional source excerpt</span><p>{signal.summary}</p><small>This walkthrough uses fictional announcements. The live app links to the original source.</small></div>}
            <h3>Why it matters</h3><p>{signal.why}</p>
            {!showAnalysis ? <div className="vd-callout"><span className="vd-label">Suggested next step</span><p>{signal.next}</p><DemoButton onClick={() => { setShowAnalysis(true); setInspection(value => value + 1); }}>View sample impact analysis</DemoButton></div> : <><details ref={analysis} className="vd-disclosure" open><summary>Company-specific analysis<Plus size={13} aria-hidden="true" /></summary><SampleAnalysis index={selectedSignal} /></details>{selectedSignal === 0 && <DemoButton onClick={() => { setStrategy(0); go('Strategies'); }}>Explore sample strategy</DemoButton>}</>}
          </article>}
          {view === 'Strategies' && <article className="vd-document"><div className="vd-heading"><span className="vd-label">Strategies · Considering</span><h2>Work through a response.</h2><p>Two sample strategies. Different trade-offs.</p></div><div className="vd-strategy-picker" aria-label="Sample strategies">{strategies.map((item, index) => <button key={item.title} aria-pressed={strategy === index} onClick={() => setStrategy(index)}><span>0{index + 1}</span>{index === 0 ? 'Test an allowance' : 'Keep flat pricing'}</button>)}</div>
            <span className="vd-label">Strategic response</span><h3 className="vd-record-title">{strategies[strategy].title}</h3><p>{strategies[strategy].description}</p><button className="vd-origin" onClick={() => openSignal(0, true)}><span className="vd-label">Originating signal <ArrowUpRight size={12} aria-hidden="true" /></span><strong>{signals[0].title}</strong></button><details className="vd-disclosure" open><summary>Timeline &amp; longer-term impact<Plus size={13} aria-hidden="true" /></summary><div className="vd-timeline"><div><span className="vd-label">Now</span><p>{strategies[strategy].now}</p></div><div><span className="vd-label">Next</span><p>{strategies[strategy].later}</p></div></div><div className="vd-callout"><span className="vd-label">If you do nothing</span><p>{strategies[strategy].inaction}</p></div></details><DemoButton onClick={() => go('Decisions')}>View framed decision</DemoButton>
          </article>}
          {view === 'Advisor' && <article className="vd-advisor"><div className="vd-heading"><h2>Advisor</h2><p>Work through the decision. Keep the context.</p></div><AdvisorExample selected={advisorQuestion} onChoose={setAdvisorQuestion} /></article>}
          {view === 'Decisions' && <article className="vd-document"><div className="vd-document-meta"><span>Open</span>Needs more clarity · Pricing</div><h2>Should we change our pricing model?</h2><span className="vd-label">The choice</span><p>Test a usage allowance, keep flat pricing, or change the flat price. Decide after reviewing account costs and customer expectations.</p><details className="vd-disclosure" open><summary>Context &amp; supporting evidence<Plus size={13} aria-hidden="true" /></summary><div className="vd-analysis"><div><span className="vd-label">Why now</span><p>A competitor’s new offer changes the comparison. It does not prove we should follow it.</p></div><div className="vd-outcomes"><div><span className="vd-label">What we know</span><p>Our current plans offer predictable bills. We have not yet compared usage costs across our busiest accounts.</p></div><div><span className="vd-label">What’s uncertain</span><p>Would customers accept a less predictable bill? Would an allowance improve margins enough to justify it?</p></div></div></div></details><span className="vd-label">Blind spot review</span><details className="vd-risk"><summary><span>Example</span>Customer perspective<Plus size={13} aria-hidden="true" /></summary><p>High usage may be a sign of strong customer value. Check retention and willingness to pay before treating those accounts only as a cost problem.</p></details><span className="vd-footnote">Sample saved reasoning. The decision remains open.</span><DemoButton secondary onClick={() => openSignal(0)}>Return to the signal</DemoButton></article>}
        </div>
      </div>
    </div>
    <aside className="vd-phone" aria-label="Phone preview of VANTAGE Advisor with fictional data"><span className="vd-phone-speaker" aria-hidden="true" /><div className="vd-phone-head"><BrandLogo /><strong>Advisor</strong><MessageSquare size={12} aria-hidden="true" /></div><div ref={phoneScreen} className="vd-phone-screen" tabIndex={0} aria-label="Phone Advisor sample screen"><AdvisorExample compact selected={advisorQuestion} onChoose={setAdvisorQuestion} /></div><span className="vd-phone-note">Fictional conversation</span><span className="vd-phone-home" aria-hidden="true" /></aside>
    <p className="vs-demo-caption">Click inside the workspace.<br />Fictional company, signals and conversations.</p>
    <span className="vs-sr-only" role="status" aria-live="polite">{view} sample screen.</span>
  </div>;
}
