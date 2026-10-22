'use client';

import {
  Bell,
  Bookmark,
  Bot,
  Building2,
  ChevronDown,
  CreditCard,
  FileText,
  GraduationCap,
  HelpCircle,
  Landmark,
  LayoutGrid,
  LogOut,
  MailCheck,
  Menu,
  Plane,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  User,
  UserCog,
  Upload,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { OnboardingProvider, useOnboarding } from '@/lib/onboarding';
import { fmtDate, PLAN_LABEL } from '@/lib/format';
import type { Role } from '@/lib/types';
import { Avatar, Badge, cx, Spinner } from './ui';

type NavItem = { href: string; label: string; icon: ReactNode; roles?: Role[] };

const STUDENT_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutGrid /> },
  { href: '/universities', label: 'Universities', icon: <Landmark /> },
  { href: '/professors', label: 'Professors', icon: <GraduationCap /> },
  { href: '/email-tracker', label: 'Email tracker', icon: <MailCheck /> },
  { href: '/applications', label: 'Applications', icon: <FileText /> },
  { href: '/visa', label: 'Visa reminders', icon: <Plane /> },
  { href: '/saved', label: 'Saved items', icon: <Bookmark /> },
  { href: '/ai-tools', label: 'AI Tools', icon: <Bot /> },
  { href: '/profile', label: 'Profile', icon: <User /> },
  { href: '/settings', label: 'Settings', icon: <Settings /> },
  { href: '/purchase-plan', label: 'Plans & billing', icon: <CreditCard /> },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: <ShieldCheck />, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/users', label: 'Users', icon: <Users />, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/transactions', label: 'Reconcile payments', icon: <CreditCard />, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/directory', label: 'Directory', icon: <Building2 />, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/imports', label: 'CSV import', icon: <Upload />, roles: ['ADMIN', 'SUPER_ADMIN'] },
  { href: '/superadmin/transactions', label: 'Transaction history', icon: <ScrollText />, roles: ['SUPER_ADMIN'] },
  { href: '/superadmin/audit-logs', label: 'Audit trail', icon: <ScrollText />, roles: ['SUPER_ADMIN'] },
  { href: '/superadmin/staff', label: 'Staff & roles', icon: <UserCog />, roles: ['SUPER_ADMIN'] },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const path = usePathname();
  const { featureFor } = useOnboarding();
  const feature = featureFor(item.href);
  const active = item.href === '/admin' ? path === '/admin' : path === item.href || path.startsWith(item.href + '/');
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={feature ? `${feature.title} — ${feature.body}` : undefined}
      className={cx(
        'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0',
        active ? 'bg-white font-medium text-brand-700 shadow-lift' : 'text-ink-soft hover:bg-white/70 hover:text-ink',
        feature && !active && 'bg-brand-50/70 text-ink',
      )}
    >
      {item.icon}
      <span className="flex-1 truncate">{item.label}</span>
      {feature && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-white" />
          {feature.reason === 'UNLOCKED' ? 'Unlocked' : 'New'}
        </span>
      )}
    </Link>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, logout } = useAuth();
  if (!me) return null;
  const isStaff = me.role !== 'GU';
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-[#1C1F3A]/30 backdrop-blur-[2px] lg:hidden" onClick={onClose} />}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-canvas transition-transform lg:translate-x-0',
          open ? 'translate-x-0 shadow-pop max-lg:bg-white' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-6 pb-5 pt-6">
          <Link href={isStaff ? '/admin' : '/dashboard'} className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-brand-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span className="text-[19px] font-semibold tracking-tight text-ink">HigherStudy</span>
          </Link>
          <button className="lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" data-tour="nav">
          {isStaff && (
            <>
              <p className="px-3.5 pb-1.5 pt-2 text-[13px] font-medium text-ink-faint">Administration</p>
              {ADMIN_NAV.filter((n) => !n.roles || n.roles.includes(me.role)).map((n) => (
                <NavLink key={n.href} item={n} onClick={onClose} />
              ))}
              <p className="px-3.5 pb-1.5 pt-5 text-[13px] font-medium text-ink-faint">Student view</p>
            </>
          )}
          {STUDENT_NAV.filter((n) => !isStaff || ['/universities', '/professors', '/settings'].includes(n.href)).map((n) => (
            <NavLink key={n.href} item={n} onClick={onClose} />
          ))}
        </nav>
        {!isStaff && <PlanNudge />}
        <div className="px-3 pb-4">
          <button onClick={() => logout()} className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] text-ink-mute hover:bg-white/70 hover:text-ink">
            <LogOut className="h-[18px] w-[18px]" /> Log out
          </button>
        </div>
      </aside>
    </>
  );
}

/** Small plan card at the foot of the student sidebar. */
function PlanNudge() {
  const { me } = useAuth();
  if (!me || me.plan === 'PREMIUM') return null;
  return (
    <Link href="/purchase-plan" className="mx-3 mb-2 block rounded-2xl bg-white p-4 shadow-card transition-shadow hover:shadow-lift">
      <p className="text-[13px] text-ink-mute">You’re on {PLAN_LABEL[me.plan]}</p>
      <p className="mt-0.5 text-sm font-medium text-brand-700">See what the next plan adds</p>
    </Link>
  );
}

interface Notification {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  readAt: string | null;
  createdAt: string;
}

function Bell_() {
  const { me, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!open) setItems(await api<Notification[]>('/notifications').catch(() => []));
  };
  const readAll = async () => {
    await api('/notifications/read', { method: 'POST' });
    setItems((i) => i?.map((n) => ({ ...n, readAt: new Date().toISOString() })) ?? null);
    refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-white" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {!!me?.unreadNotifications && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-canvas">{me.unreadNotifications}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden rounded-2xl border border-line-soft bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <button onClick={readAll} className="text-xs font-medium text-brand-600">
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!items ? (
              <Spinner inline />
            ) : !items.length ? (
              <p className="px-4 py-8 text-center text-sm text-ink-mute">You're all caught up.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setOpen(false);
                    if (n.link) router.push(n.link);
                  }}
                  className={cx('block w-full border-b border-line-soft px-4 py-3 text-left last:border-0 hover:bg-canvas', !n.readAt && 'bg-brand-25')}
                >
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-mute">{n.body}</p>
                  <p className="mt-1 text-[11px] text-ink-faint">{fmtDate(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function HelpButton() {
  const { hasTour, replay } = useOnboarding();
  const { me } = useAuth();
  if (me?.role !== 'GU' || !hasTour) return null;
  return (
    <button onClick={replay} className="grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-white" aria-label="Show tips for this screen" title="Show tips for this screen">
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { me, logout } = useAuth();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  if (!me) return null;
  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 bg-canvas/80 px-4 backdrop-blur-md sm:px-8">
      <button className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <form
        className="relative hidden max-w-xl flex-1 md:block"
        data-tour="topbar-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/professors?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search professors by name, research area, or keyword…"
          className="h-11 w-full rounded-2xl border border-transparent bg-white pl-10 pr-4 text-sm shadow-card placeholder:text-ink-faint focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <HelpButton />
        <Bell_ />
        <div className="h-8 w-px bg-line" />
        <div className="relative">
          <button className="flex items-center gap-3" onClick={() => setMenu((m) => !m)}>
            <Avatar name={me.fullName} src={me.avatarUrl} size={40} />
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-semibold text-ink">{me.fullName}</span>
              <span className="block text-xs text-ink-mute">{me.email}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-ink-faint" />
          </button>
          {menu && (
            <div className="absolute right-0 z-40 mt-2 w-56 animate-fade-up rounded-2xl border border-line-soft bg-white p-2 shadow-pop" onMouseLeave={() => setMenu(false)}>
              <div className="px-3 py-2 text-xs text-ink-mute">
                {me.role === 'GU' ? (
                  <>
                    Plan <Badge tone="indigo">{PLAN_LABEL[me.plan]}</Badge>
                  </>
                ) : (
                  <Badge tone="violet">{me.role.replace('_', ' ')}</Badge>
                )}
              </div>
              {me.role === 'GU' && (
                <Link href="/profile" className="block rounded-xl px-3 py-2 text-sm hover:bg-canvas" onClick={() => setMenu(false)}>
                  Profile
                </Link>
              )}
              <button onClick={() => logout()} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

/** Authenticated layout: redirects to /login, and keeps students out of admin routes. */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace('/login');
    else if (me.role === 'GU' && !me.setupDone) router.replace('/welcome');
    else if (me.role === 'GU' && (path.startsWith('/admin') || path.startsWith('/superadmin'))) router.replace('/dashboard');
    else if (me.role === 'ADMIN' && path.startsWith('/superadmin')) router.replace('/admin');
  }, [me, loading, path, router]);

  if (loading || !me || (me.role === 'GU' && !me.setupDone)) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <Spinner />
      </div>
    );
  }
  return (
    <OnboardingProvider>
      <div className="min-h-screen bg-canvas">
        <Sidebar open={open} onClose={() => setOpen(false)} />
        <div className="lg:pl-64">
          <Topbar onMenu={() => setOpen(true)} />
          <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-4 sm:px-8">{children}</main>
        </div>
      </div>
    </OnboardingProvider>
  );
}
