'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Command,
  Zap,
  LayoutGrid,
  GitBranch,
  MessageSquare,
  User,
  Settings,
  LogOut,
  Lock,
  Sun,
  Moon,
} from 'lucide-react';
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { usePlan } from '@/components/plan/PlanContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  proOnly?: boolean;
}

const MAIN_ITEMS: NavItem[] = [
  { label: 'Command',      href: '/command',      icon: Command },
  { label: 'Signals',      href: '/signals',       icon: Zap },
  { label: 'Strategies',   href: '/strategies',    icon: LayoutGrid },
  { label: 'Decisions',    href: '/decisions',     icon: GitBranch,     proOnly: true },
  { label: 'Advisor',      href: '/advisor',       icon: MessageSquare, proOnly: true },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Profile',      href: '/profile',       icon: User },
  { label: 'Settings',     href: '/settings',      icon: Settings },
];

// Concept `.side button` — 46px desktop / 42px mobile, shared by every
// button in the rail regardless of role (nav link, theme toggle, sign out).
const BTN_SIZE =
  'flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[15px] min-[901px]:h-[46px] min-[901px]:w-[46px]';

interface DashboardNavProps {
  companyName: string;
}

export function DashboardNav({ companyName }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const access = usePlan();
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  const handleThemeToggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const renderNavIcon = ({ label, href, icon: Icon, proOnly }: NavItem) => {
    const locked = proOnly === true && access.effectivePlan !== 'pro';
    const isActive = pathname.startsWith(href);

    if (locked) {
      return (
        <div key={href} className="relative group flex justify-center">
          <div
            title={`${label} — Pro plan required`}
            aria-label={`${label} — Pro plan required`}
            className={cn(BTN_SIZE, 'relative cursor-not-allowed select-none text-[#9da0a7]/50')}
          >
            <Icon size={19} strokeWidth={1.8} />
            <Lock size={10} className="absolute right-1 top-1 text-[#9da0a7]" />
          </div>
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border hairline-strong surf-3 px-2.5 py-1.5 text-[11px] font-medium text-foreground opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100">
            {label} — Pro plan required
          </span>
        </div>
      );
    }

    return (
      <div key={href} className="relative group flex justify-center">
        <Link
          href={href}
          title={label}
          aria-label={label}
          aria-current={isActive ? 'page' : undefined}
          className={cn(BTN_SIZE, 'cx-nav-btn', isActive && 'cx-active')}
        >
          <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} />
        </Link>
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border hairline-strong surf-3 px-2.5 py-1.5 text-[11px] font-medium text-foreground opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100">
          {label}
        </span>
      </div>
    );
  };

  return (
    // Concept `.side`: a real grid column, sticky, on desktop; the concept's
    // own max-width:900px override turns it into a static horizontal
    // scrolling row instead of a bottom tab bar — one rail handles both
    // breakpoints, so there's no separate mobile component anymore.
    <nav
      className="cx-nav-rail flex items-center gap-[5px] overflow-x-auto overflow-y-hidden rounded-[19px] p-[8px] min-[901px]:sticky min-[901px]:top-[18px] min-[901px]:h-[calc(100vh-85px)] min-[901px]:min-h-[650px] min-[901px]:flex-col min-[901px]:gap-[9px] min-[901px]:overflow-visible min-[901px]:rounded-[25px] min-[901px]:px-0 min-[901px]:py-[13px]"
      aria-label="Primary navigation"
    >
      {/* Wordmark — a small home link, not in the concept's own .side (it
          has the brand only in the topbar) but keeping one wayfinding icon
          at the top of the rail matches the app's prior nav and costs
          nothing structurally. */}
      <div className="relative group flex justify-center">
        <Link
          href="/command"
          title={companyName || 'VANTAGE'}
          aria-label="VANTAGE home"
          className={cn(BTN_SIZE, 'cx-nav-btn')}
        >
          <img
            src="/logo-transparent.png"
            alt=""
            className="pointer-events-none select-none object-contain"
            style={{ width: '22px', height: '22px' }}
          />
        </Link>
        {companyName && (
          <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border hairline-strong surf-3 px-2.5 py-1.5 text-[11px] font-medium text-foreground opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100">
            {companyName}
          </span>
        )}
      </div>

      {MAIN_ITEMS.map(renderNavIcon)}

      {/* Concept `.side .spacer` — flex:1, hidden below 901px since a
          horizontal scroll row has nothing to push apart. */}
      <span className="hidden flex-1 min-[901px]:block" />

      {BOTTOM_ITEMS.map(renderNavIcon)}

      <div className="relative group flex justify-center">
        <button
          onClick={handleThemeToggle}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className={cn(BTN_SIZE, 'cx-nav-btn')}
        >
          {theme === 'dark'
            ? <Sun size={19} strokeWidth={1.8} />
            : <Moon size={19} strokeWidth={1.8} />
          }
        </button>
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border hairline-strong surf-3 px-2.5 py-1.5 text-[11px] font-medium text-foreground opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100">
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </span>
      </div>

      <div className="relative group flex justify-center">
        <button
          onClick={handleSignOut}
          title="Sign Out"
          aria-label="Sign Out"
          className={cn(BTN_SIZE, 'cx-nav-btn')}
        >
          <LogOut size={19} strokeWidth={1.8} />
        </button>
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border hairline-strong surf-3 px-2.5 py-1.5 text-[11px] font-medium text-foreground opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100">
          Sign Out
        </span>
      </div>
    </nav>
  );
}
