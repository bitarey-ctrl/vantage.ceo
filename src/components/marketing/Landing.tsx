/*
 * Landing — the public front door.
 *
 * Ported from the standalone Vantage design. All styling is scoped under the
 * `.vlp` class on the root element below; see vantage-landing.css for why.
 *
 * Deviations from the source design, all deliberate:
 *  - `@/components/ui/dialog` is a minimal Radix build, not the design's
 *    @base-ui/react version, so no new dependencies were added.
 *  - Internal links open in the same tab (see Action).
 *  - The design's `@theme inline` and Tailwind/tw-animate imports are dropped;
 *    this page uses no Tailwind utility classes.
 */
'use client';
import { useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Menu, X, Radio, Network, Check } from 'lucide-react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { HeroCommandCenter } from '@/components/vantage/hero-command-center';
import { BrandLogo } from '@/components/vantage/brand-logo';
import { DetectVisual, MapVisual, ActVisual } from '@/components/vantage/workflow-visuals';
import { Figure } from '@/components/vantage/figures';
import { siteConfig, isExternalUrl } from '@/lib/site-config';
import '@/components/vantage/brand-atmosphere.css';
import '@/app/(marketing)/vantage-landing.css';
if(typeof window!=='undefined') gsap.registerPlugin(useGSAP,ScrollTrigger);
export function Landing(){
  const root=useRef<HTMLDivElement>(null);
  const [dialog,setDialog]=useState<'meeting'|'app'|null>(null);
  const [menu,setMenu]=useState(false);
  useGSAP(()=>{
    const mm=gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)',()=>{
      gsap.timeline({defaults:{ease:'power3.out'}})
        .from('.hero-copy > *',{y:22,opacity:0,duration:1.1,stagger:.12})
        .from('.hero-product',{y:36,opacity:0,duration:1.4},.18);
      gsap.utils.toArray<HTMLElement>('.reveal:not(.figure-card)').forEach(el=>gsap.from(el,{y:28,opacity:0,duration:1,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 91%',once:true}}));
      gsap.from('.figure-card',{y:36,opacity:0,duration:1.05,stagger:.13,ease:'power3.out',scrollTrigger:{trigger:'.figure-grid',start:'top 88%',once:true}});
      gsap.utils.toArray<HTMLElement>('.feature-section').forEach(el=>gsap.fromTo(el,{'--rule-progress':0},{'--rule-progress':1,duration:1.2,ease:'power2.inOut',scrollTrigger:{trigger:el,start:'top 86%',once:true}}));
    });
    mm.add('(min-width: 761px) and (prefers-reduced-motion: no-preference)',()=>{
      gsap.utils.toArray<HTMLElement>('.hero-product .hc-window, .workflow-depth').forEach(screen=>{
        gsap.fromTo(screen,{y:12},{y:-12,ease:'none',scrollTrigger:{trigger:screen.closest('.hero-product, .workflow-stage'),start:'top bottom',end:'bottom top',scrub:1.4}});
      });
    });
    return ()=>mm.revert();
  },{scope:root});
  function Action({kind='meeting',secondary=false,small=false}:{kind?:'meeting'|'app',secondary?:boolean,small?:boolean}){
    const url=kind==='meeting'?siteConfig.bookingUrl:siteConfig.appUrl;
    const label=kind==='meeting'?'Book a meeting':'Open the app';
    const className=`button ${secondary?'secondary':''} ${small?'small':''}`;
    if(!url) return <button className={className} onClick={()=>setDialog(kind)}>{label}{!small&&<ArrowUpRight size={14}/>}</button>;
    // Internal routes (e.g. /signup) stay in the same tab — target="_blank" on
    // our own app is wrong. External destinations still open in a new tab.
    const external=isExternalUrl(url);
    return <a className={className} href={url} {...(external?{target:'_blank',rel:'noopener noreferrer'}:{})}>{label}<ArrowUpRight size={14}/></a>;
  }
  return <div ref={root} id="top" className="vlp">
    <a className="skip" href="#main">Skip to content</a>
    <header className="site-header"><div className="container header-inner"><a href="#top" className="wordmark"><BrandLogo/>Vantage</a><nav aria-label="Main navigation"><a href="#product">Product</a><a href="#detect">Detect</a><a href="#map">Map</a><a href="#act">Act</a><a href="#principle">Our principle</a></nav><div className="nav-actions"><Action kind="app" secondary small/><Action small/></div><button className="mobile-toggle" aria-label={menu?'Close navigation':'Open navigation'} aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X size={20}/>:<Menu size={20}/>}</button></div>{menu&&<nav className="mobile-menu" aria-label="Mobile navigation">{['product','detect','map','act','principle'].map(id=><a href={'#'+id} key={id} onClick={()=>setMenu(false)}>{id==='principle'?'Our principle':id}</a>)}<Action kind="app" secondary/></nav>}</header>
    <main id="main">
      <section className="hero"><div className="container hero-copy"><h1>Command the signal.<br/>Eliminate the noise.</h1><div className="hero-subrow"><p>Your business moves faster than its decisions.<br/> Turn scattered signals into priorities your team can act on.</p><div className="hero-actions"><Action/><Action kind="app" secondary/></div></div></div><div className="hero-product"><HeroCommandCenter/></div><div className="hero-foot container"><span>Less time interpreting. More time moving.</span><a href="#product">From signal to action <ArrowRight size={14}/></a></div></section>
      <section className="principles container" id="product"><h2 className="intro-heading reveal"><strong>The cost of noise is hesitation.</strong> Signals scatter. Context gets lost. Decisions wait. Vantage brings the change, the stakes, and the next move into one command center.</h2><div className="figure-grid">{[['Detect','Find the change.','Bring the signal into focus before the opportunity moves on.'],['Map','Know the stakes.','See which decisions the signal touches—and why it matters now.'],['Act','Make the move.','Give the priority an owner. Give the next move a time frame.']].map(([title,label,description],i)=><a className="figure-card reveal" href={"#"+title.toLowerCase()} key={title}><div className="card-index"><span className="fig-label"><span className="system-icon" aria-hidden="true">{i===0?<Radio size={15}/>:i===1?<Network size={15}/>:<Check size={15}/>}</span>0{i+1} / {title.toUpperCase()}</span><span className="card-status" aria-hidden="true"><i/></span></div><div className="system-visual"><Figure index={i}/><span className="system-cross cross-top" aria-hidden="true"/><span className="system-cross cross-bottom" aria-hidden="true"/></div><div className="card-copy"><h3>{label}</h3><p>{description}</p></div><div className="card-tail"><span>FIG 0.{i+1}</span><ArrowRight size={15}/></div></a>)}</div></section>
      <section className="feature-section" id="detect">
        <SectionHeading index="01 / DETECT" title={<>The change that matters.<br/>Before it gets buried.</>}>The customer insight in a call. The shift in the market. The change inside the business. Bring them into view before another day becomes another missed decision.</SectionHeading>
        <div className="workflow-stage reveal"><DetectVisual/></div>
        <div className="feature-footer container"><p><strong>Keep the evidence close.</strong> Source category and timing travel with the signal.</p><p><strong>Protect your attention.</strong> Start with the change that deserves a decision.</p></div>
      </section>
      <section className="feature-section" id="map">
        <SectionHeading index="02 / MAP" title={<>Know what changed.<br/>See what it changes.</>}>Information becomes useful when the stakes are clear. Connect the signal to the priorities, risks, and opportunities it affects—so the team can weigh the same decision.</SectionHeading>
        <div className="workflow-stage reveal"><MapVisual/></div>
        <div className="feature-footer container"><p><strong>See the consequence.</strong> Understand what is at stake before you commit.</p><p><strong>End the context chase.</strong> Give the team a shared starting point for the call.</p></div>
      </section>
      <section className="feature-section" id="act">
        <SectionHeading index="03 / ACT" title={<>A clear priority.<br/>A move someone owns.</>}>A decision is only useful when it moves the business. Make the next step explicit, put a name against it, and keep momentum in view.</SectionHeading>
        <div className="workflow-stage reveal"><ActVisual/></div>
        <div className="feature-footer container"><p><strong>Make ownership visible.</strong> One priority. An accountable owner. A time frame.</p><p><strong>Watch the distance to action.</strong> Keep decision velocity beside the work that moves it.</p></div>
      </section>
      <section className="principle-section" id="principle"><div className="container principle-layout"><div className="trust-note"><span className="eyebrow">FOR THE DECISIONS YOU CARRY</span><h3>Bring the decision that cannot wait.</h3><p>Walk through Vantage with the product team. Start with what changed, what is at stake, and where you need to move.</p></div><blockquote>“Clarity is knowing what deserves your attention—and taking responsibility for what happens next.”<cite>Vantage · Our point of view</cite></blockquote></div></section>
      <section className="closing"><div className="container closing-inner"><div><h2>Make the call.<br/>Own what comes next.</h2><p>The signal is the start. Your next move is the point.</p></div><div className="closing-actions"><Action/><Action kind="app" secondary/></div></div></section>
    </main>
    <footer className="site-footer container"><a href="#top" className="wordmark"><BrandLogo/>Vantage</a><span>Command the signal. Move with intent.</span><a href="#top">Back to top ↑</a></footer>
    <Dialog open={dialog!==null} onOpenChange={open=>{if(!open)setDialog(null)}}><DialogContent className="conversion-dialog"><DialogTitle>{dialog==='meeting'?'Book a meeting':'Open the app'}</DialogTitle><DialogDescription>{dialog==='meeting'?'Your meeting calendar will open here.':'Your Vantage workspace will open here.'}</DialogDescription><p>{dialog==='meeting'?'Preview only. A Calendly or Google Calendar booking link is still needed.':'Preview only. The product URL is still needed.'}</p><button className="button secondary" onClick={()=>setDialog(null)}>Back to Vantage</button></DialogContent></Dialog>
  </div>;
}
function SectionHeading({index,title,children}:{index:string,title:ReactNode,children:ReactNode}){return <div className="section-heading container reveal"><div><span className="eyebrow">{index}</span><h2>{title}</h2></div><p>{children}</p></div>}
