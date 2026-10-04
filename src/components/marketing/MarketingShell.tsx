'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowUpRight, Menu, Moon, Sun, X } from 'lucide-react';
import { BrandLogo } from '@/components/vantage/brand-logo';
import { MarketingMotionContext, useHeadlineReveal } from './HeadlineReveal';

const navigation = [['/product', 'How it works'], ['/use-cases', 'Who it’s for'], ['/about', 'Our story']] as const;
type PublicTheme = 'day' | 'night';
let fallbackTheme: PublicTheme = 'day';
function readTheme(): PublicTheme {
  try { const saved = localStorage.getItem('vantage-public-theme'); return saved === 'night' || saved === 'day' ? saved : fallbackTheme; }
  catch { return fallbackTheme; }
}
function subscribeTheme(callback: () => void) {
  window.addEventListener('vantage-public-theme', callback);
  window.addEventListener('storage', callback);
  return () => { window.removeEventListener('vantage-public-theme', callback); window.removeEventListener('storage', callback); };
}
function setPublicTheme(theme: PublicTheme) {
  fallbackTheme = theme;
  try { localStorage.setItem('vantage-public-theme', theme); } catch { /* Session fallback when storage is unavailable. */ }
  window.dispatchEvent(new Event('vantage-public-theme'));
}
export function MarketingShell({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const pathname = usePathname();
  useHeadlineReveal(root, motionEnabled, pathname);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === pathname;
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'day');
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.getAttribute('content');
    meta?.setAttribute('content', theme === 'night' ? '#080808' : '#fbfbfb');
    return () => { if (previous) meta?.setAttribute('content', previous); };
  }, [theme]);
  return <MarketingMotionContext.Provider value={{ motionEnabled, setMotionEnabled }}><div className="vsite" data-theme={theme} ref={root}>
    <a className="vs-skip" href="#main">Skip to content</a>
    <header className="vs-header"><div className="vs-container vs-nav">
      <Link href="/" className="vs-wordmark" aria-label="VANTAGE home"><BrandLogo />VANTAGE</Link>
      <nav className="vs-desktop-nav" aria-label="Main navigation">{navigation.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}</nav>
      <div className="vs-nav-actions"><Link href="/login" className="vs-login">Log in</Link><Link href="/book" className="vs-button vs-button-small">Book 30 minutes <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
      <button className="vs-theme-toggle" aria-label={theme === 'day' ? 'Switch to night mode' : 'Switch to day mode'} title={theme === 'day' ? 'Night mode' : 'Day mode'} onClick={() => setPublicTheme(theme === 'day' ? 'night' : 'day')}>{theme === 'day' ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}</button>
      <button className="vs-menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="vs-mobile-nav" onClick={() => setMenuPath(menuOpen ? null : pathname)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
    </div>{menuOpen && <nav id="vs-mobile-nav" className="vs-mobile-nav" aria-label="Mobile navigation" onKeyDown={e => { if (e.key === 'Escape') setMenuPath(null); }}>
      {navigation.map(([href, label]) => <Link key={href} href={href} onClick={() => setMenuPath(null)} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}
      <Link href="/book" onClick={() => setMenuPath(null)}>Book a 30-minute meeting <ArrowUpRight size={16} /></Link><Link href="/pilot" onClick={() => setMenuPath(null)}>Free 14-day pilot <ArrowUpRight size={16} /></Link><Link href="/login" onClick={() => setMenuPath(null)}>Log in</Link>
    </nav>}</header>
    {children}
    <footer className="vs-footer"><div className="vs-container vs-footer-top">
      <div><Link href="/" className="vs-wordmark"><BrandLogo />VANTAGE</Link><p>Command the signal.<br />Eliminate the noise.</p></div>
      <div><span className="vs-kicker">Explore</span><Link href="/product">How VANTAGE works</Link><Link href="/use-cases">Who it’s for</Link><Link href="/pilot">The free pilot</Link><Link href="/book">Book a 30-minute meeting</Link></div>
      <div><span className="vs-kicker">Company</span><Link href="/about">Our story</Link><Link href="/trust">Sources & AI</Link><Link href="/about#mission">Mission & vision</Link><Link href="/contact">Contact the founder</Link></div>
      <div className="vs-footer-note"><span className="vs-kicker">Built around your next decision</span><p>For founders and operating CEOs who need to understand what a changing market means for their business.</p></div>
    </div><div className="vs-container vs-footer-bottom"><span>© {new Date().getFullYear()} VANTAGE</span><span>Better evidence. Clearer decisions.</span><Link href="/login">Open your workspace <ArrowUpRight size={14} /></Link></div></footer>
  </div></MarketingMotionContext.Provider>;
}
