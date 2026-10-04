'use client';

import { useState } from 'react';
import { ArrowUpRight, Clock, CalendarDays, MessageSquare } from 'lucide-react';

function schedulerUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!['calendly.com', 'outlook.office.com', 'outlook.office365.com', 'book.ms', 'bookings.microsoft.com', 'bookings.cloud.microsoft'].includes(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

export function MeetingBooking({ bookingUrl }: { bookingUrl?: string }) {
  const url = schedulerUrl(bookingUrl);
  const [open, setOpen] = useState(false);
  return <>
    <section className="vs-container vs-page-hero"><span className="vs-kicker">30 minutes · With the founder</span><h1>Bring the question.<br /><em>Let’s work through it.</em></h1><p>Meet Bita, founder of VANTAGE. Show me what you’re building and one decision you’re facing. We’ll see whether the product—and a free 14-day pilot—can help.</p></section>
    <section className="vs-container vs-page-section vs-meeting-layout">
      <div><span className="vs-kicker">A useful first conversation</span><h2>Your business.<br /><em>One real decision.</em></h2><div className="vs-meeting-agenda">
        <article><Clock size={20} aria-hidden="true" /><div><h3>30 minutes, focused</h3><p>Your business, the change you’re watching and what you need to decide.</p></div></article>
        <article><MessageSquare size={20} aria-hidden="true" /><div><h3>A conversation with Bita</h3><p>Ask questions, see the workspace, and talk openly about where it fits or falls short.</p></div></article>
        <article><CalendarDays size={20} aria-hidden="true" /><div><h3>Agree on the next step</h3><p>If there’s a fit, choose one decision to examine during the free pilot. No paid commitment in this invitation.</p></div></article>
      </div></div>
      <div className="vs-meeting-card"><span className="vs-kicker">Bita · Founder, VANTAGE</span><h3>Let’s start with context.</h3><p>When booking, share your name, work email, phone number, company, role and the decision you want to discuss. Keep confidential customer records and passwords out.</p>
        {url ? <><button className="vs-button" onClick={() => { setOpen(true); requestAnimationFrame(() => document.getElementById('founder-scheduler')?.scrollIntoView({ behavior: 'instant', block: 'start' })); }} aria-expanded={open} aria-controls="founder-scheduler">Choose an available time <ArrowUpRight size={17} /></button><p className="vs-meeting-fine">Every day, 9am–6pm Eastern Time. The calendar displays times in your time zone and excludes unavailable slots. Meet on Microsoft Teams.</p><a className="vs-text-link" href={url} target="_blank" rel="noopener noreferrer">Open the booking page in a new tab <ArrowUpRight size={15} /></a></> : <><a className="vs-button" href="mailto:bita@vantage.ceo?subject=VANTAGE%20%E2%80%94%2030-minute%20conversation&body=Name%3A%20%0AWork%20email%3A%20%0APhone%20(with%20country%20code)%3A%20%0ACompany%20and%20website%3A%20%0ARole%3A%20%0ADecision%20to%20discuss%3A%20%0APreferred%20times%20and%20time%20zone%3A%20">Request a time by email <ArrowUpRight size={17} /></a><p className="vs-meeting-fine">Online scheduling is being connected. For now, send your details and preferred times. Your meeting is confirmed when Bita replies.</p></>}
      </div>
    </section>
    {url && open && <section id="founder-scheduler" className="vs-container vs-scheduler" aria-label="Book a 30-minute meeting with the founder"><iframe title="VANTAGE founder meeting booking calendar" src={url} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /><p>Can’t see the calendar? <a href={url} target="_blank" rel="noopener noreferrer">Open the booking page.</a></p></section>}
  </>;
}
