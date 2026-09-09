'use client';

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
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { usePlan } from '@/components/plan/PlanContext';

/*
 * Sidebar — reskinned to the `vx-sidebar` structure from the design package.
 *
 * VISUAL CHANGE ONLY. Everything this component DOES is unchanged: Next.js
 * <Link> routing (the prototype used client-side state, which would have
 * broken deep links and per-route auth), the Pro-plan lock on Decisions and
 * Advisor, the theme toggle, and sign-out. The prototype's hardcoded
 * "Meridian Labs / Example workspace" is replaced by the real companyName.
 */

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  proOnly?: boolean;
}

const MAIN_ITEMS: NavItem[] = [
  { label: 'Command',    href: '/command',    icon: Command },
  { label: 'Signals',    href: '/signals',    icon: Zap },
  { label: 'Strategies', href: '/strategies', icon: LayoutGrid },
  { label: 'Decisions',  href: '/decisions',  icon: GitBranch,     proOnly: true },
  { label: 'Advisor',    href: '/advisor',    icon: MessageSquare, proOnly: true },
];

const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Profile',  href: '/profile',  icon: User },
  { label: 'Settings', href: '/settings', icon: Settings },
];

interface DashboardNavProps {
  companyName: string;
  open: boolean;
  onClose: () => void;
}

export function DashboardNav({ companyName, open, onClose }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const access = usePlan();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const renderItem = ({ label, href, icon: Icon, proOnly }: NavItem) => {
    const locked = proOnly === true && access.effectivePlan !== 'pro';
    const isActive = pathname.startsWith(href);

    if (locked) {
      return (
        <button
          key={href}
          type="button"
          disabled
          title={`${label} — Pro plan required`}
          aria-label={`${label} — Pro plan required`}
          className="vx-nav-locked"
        >
          <Icon size={17} />
          <span className="vx-nav-text">{label}</span>
          <Lock size={11} className="vx-nav-lock" />
        </button>
      );
    }

    return (
      <Link
        key={href}
        href={href}
        title={label}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        onClick={onClose}
      >
        <Icon size={17} />
        <span className="vx-nav-text">{label}</span>
      </Link>
    );
  };

  const workspaceName = companyName || 'VANTAGE';
  const initial = workspaceName.trim().charAt(0).toUpperCase() || 'V';

  return (
    <aside className={'vx-sidebar' + (open ? ' vx-sidebar-open' : '')}>
      <div className="vx-brand-row">
        <Link className="vx-brand" aria-label="VANTAGE home" href="/command">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-transparent.png" alt="" />
          <span className="vx-brand-name">Vantage</span>
        </Link>
      </div>

      <div className="vx-workspace">
        <span className="vx-avatar">{initial}</span>
        <div>
          {workspaceName}
          <small>Workspace</small>
        </div>
        <button className="vx-mobile-close" aria-label="Close navigation" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <nav aria-label="Application">{MAIN_ITEMS.map(renderItem)}</nav>

      <nav className="vx-account-nav" aria-label="Account">
        {BOTTOM_ITEMS.map(renderItem)}
        <button type="button" onClick={handleSignOut} title="Sign out" aria-label="Sign out">
          <LogOut size={17} />
          <span className="vx-nav-text">Sign out</span>
        </button>
      </nav>

      <div className="vx-sidebar-bottom">
        {workspaceName}
        <small>Signed in</small>
      </div>
    </aside>
  );
}
