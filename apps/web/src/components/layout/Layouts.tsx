import * as React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthContext';
import { cn } from '@/lib/utils';
import { initials, roleLabel } from '@/lib/format';

const PUBLIC_LINKS = [
  { to: '/verify', label: 'Verify a certificate' },
  { to: '/login', label: 'Student sign in' },
  { to: '/admin/login', label: 'Staff sign in' },
];

export function PublicHeader() {
  const { status, user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="container flex h-[72px] items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {PUBLIC_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-secondary text-navy-900'
                    : 'text-muted-foreground hover:bg-cream-100 hover:text-foreground',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
          {status === 'authenticated' && user ? (
            <Button asChild size="sm" className="ml-2">
              <Link to={user.role === 'STUDENT' ? '/student' : '/admin'}>Open dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="ml-2">
              <Link to="/login">Request a certificate</Link>
            </Button>
          )}
        </nav>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card text-foreground md:hidden"
          aria-expanded={open}
          aria-controls="public-mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <nav
          id="public-mobile-nav"
          aria-label="Mobile primary"
          className="border-t border-border bg-background px-4 pb-4 pt-2 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {PUBLIC_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-lg px-3 py-2.5 text-sm font-semibold',
                      isActive ? 'bg-secondary text-navy-900' : 'text-muted-foreground',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li className="mt-2">
              <Button asChild className="w-full">
                <Link to={status === 'authenticated' && user ? '/student' : '/login'}>
                  {status === 'authenticated' && user ? 'Open dashboard' : 'Request a certificate'}
                </Link>
              </Button>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-20 border-t border-navy-900/10 bg-navy-950 text-cream-100">
      <div className="container grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo tone="light" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream-100/70">
            Official certificate requests, verification, and issuance for NTTF students and alumni.
            Every certificate carries a unique public verification code.
          </p>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold-400">Students</h2>
          <ul className="mt-4 space-y-2 text-sm text-cream-100/75">
            <li>
              <Link className="hover:text-white" to="/login">
                Sign in to the portal
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" to="/student/new">
                Request a certificate
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" to="/verify">
                Verify a certificate
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-gold-400">
            Administration
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-cream-100/75">
            <li>
              <Link className="hover:text-white" to="/admin/login">
                Staff sign in
              </Link>
            </li>
            <li className="text-cream-100/70">Clerk document verification</li>
            <li className="text-cream-100/70">HOD approval and issuance</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-2 py-5 text-xs text-cream-100/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} NTTF. All rights reserved.</p>
          <p>Authorised use only. Activity on this portal is audited.</p>
        </div>
      </div>
    </footer>
  );
}

function BadgeAvatar({ name }: { name: string }) {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-500/15 text-xs font-bold text-gold-400"
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  if (!user) return null;
  const admin = user.role !== 'STUDENT';
  const navItems = admin
    ? [
        { to: '/admin', label: 'Overview', end: true },
        { to: '/admin/requests', label: 'Request queue', end: false },
      ]
    : [
        { to: '/student', label: 'Overview', end: true },
        { to: '/student/new', label: 'New request', end: false },
        { to: '/student/requests', label: 'My requests', end: false },
        { to: '/student/profile', label: 'My profile', end: false },
      ];

  const sidebar = (
    <>
      <div className="px-5 pb-5 pt-6">
        <Logo tone="light" />
      </div>
      <div className="mx-4 mb-6 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-center gap-3">
          <BadgeAvatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-cream-50">{user.name}</p>
            <p className="truncate text-xs text-cream-100/70">
              {user.role === 'STUDENT' ? (user.rollNumber ?? 'Student') : roleLabel(user.role)}
            </p>
          </div>
        </div>
      </div>
      <nav aria-label="Dashboard" className="flex-1 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'block rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-cream-100/70 hover:bg-white/[0.06] hover:text-cream-50',
                  )
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <Link
              to="/verify"
              className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-cream-100/70 transition-colors hover:bg-white/[0.06] hover:text-cream-50"
            >
              Verify a certificate
            </Link>
          </li>
        </ul>
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-cream-100/70 transition-colors hover:bg-white/[0.06] hover:text-cream-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="hidden bg-navy-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        {sidebar}
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Logo compact />
          <div className="flex items-center gap-2">
            <span className="max-w-[45vw] truncate text-sm font-semibold">{user.name}</span>
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card"
              aria-expanded={menuOpen}
              aria-controls="dashboard-mobile-nav"
              aria-label={menuOpen ? 'Close dashboard menu' : 'Open dashboard menu'}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </header>
        {menuOpen ? (
          <div
            id="dashboard-mobile-nav"
            className="flex flex-col border-b border-border bg-navy-950 lg:hidden"
          >
            {sidebar}
          </div>
        ) : null}

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="container flex-1 py-8 focus:outline-none sm:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
