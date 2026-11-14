import clsx from 'clsx';
import { GitFork, History as HistoryIcon, Home, Plus } from 'lucide-react';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { USE_FIXTURE } from '../api/client';
import { Logo, LogoMark } from './Logo';
import { ToastProvider } from './Toast';
import { buttonClass } from '../lib/buttonClass';
import { Badge } from './ui';

const TEAM = [
  'Akshay Kumar Tapraniya',
  'Gokul Faleja',
  'Saransh Sarang Naik',
  'Shreya Tiwari',
] as const;

/** Placeholder: replace with the team repository URL before the final submission. */
export const GITHUB_URL = 'https://github.com/your-team/spm-planning-agent';

const navLink = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4',
    isActive
      ? 'bg-sand-300 text-brand-green-950'
      : 'text-sand-200 hover:bg-sand-100/10 hover:text-sand-50',
  );

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-sand-300/10 bg-brand-green-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" aria-label="Planning Agent home" className="shrink-0 rounded-xl">
          <span className="hidden sm:block">
            <Logo tone="light" />
          </span>
          <span className="sm:hidden">
            <LogoMark />
          </span>
        </Link>
        <nav
          aria-label="Main"
          className="flex items-center gap-1 rounded-full border border-sand-300/15 bg-sand-100/5 p-1"
        >
          <NavLink to="/" end className={navLink}>
            <Home className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            Home
          </NavLink>
          <NavLink to="/history" className={navLink}>
            <HistoryIcon className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            History
          </NavLink>
          <Link
            to="/#new"
            className={buttonClass('primary', 'sm', 'ml-0.5 !px-3 sm:!px-4 sm:!py-2 sm:!text-sm')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New plan
          </Link>
        </nav>
        <div className="hidden shrink-0 lg:block">
          {USE_FIXTURE ? (
            <Badge
              className="bg-amber-50 text-amber-900 ring-amber-200"
              title="Plans come from /golden/*.json and runs are simulated in the browser."
            >
              Fixture mode
            </Badge>
          ) : (
            <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">Live API</Badge>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-0 bg-brand-green-950 text-sand-200">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo tone="light" />
          <p className="mt-4 max-w-sm text-sm text-sand-300">
            AI Software Requirement and Planning Agent. A one-line idea becomes a traceable,
            schedule-consistent plan: the model drafts it, deterministic code verifies it.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-sand-50">Team</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-sand-300">
            {TEAM.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-sand-50">Project</h2>
          <p className="mt-3 text-sm text-sand-300">
            IIIT Vadodara, International Campus Diu
            <br />
            Software Project Management
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-sand-300/25 px-3.5 py-1.5 text-sm text-sand-100 hover:bg-sand-100/10"
          >
            <GitFork className="h-4 w-4" aria-hidden="true" />
            GitHub repository
          </a>
        </div>
      </div>
      <div className="border-t border-sand-300/10 py-4 text-center text-xs text-sand-300">
        Built by the team above for the Software Project Management course.
      </div>
    </footer>
  );
}

export function AppShell() {
  const { pathname, hash } = useLocation();

  // Scroll to the top on a new page, or to an in-page anchor such as /#demos.
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  const landing = pathname === '/';
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-accent-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <TopBar />
        <main
          id="main"
          className={clsx(
            'w-full flex-1',
            !landing && 'mx-auto max-w-[1400px] px-4 pt-6 pb-16 sm:px-6 sm:pt-8',
          )}
        >
          <Outlet />
        </main>
        <Footer />
      </div>
    </ToastProvider>
  );
}
