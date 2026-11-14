import { Link, Outlet } from 'react-router-dom';
import { USE_FIXTURE } from '../api/client';
import { Badge } from './ui';

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
                <path d="M8 20h6v4H8zM13 14h6v4h-6zM18 8h6v4h-6z" fill="currentColor" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-slate-900">Planning Agent</span>
              <span className="block text-[11px] text-slate-500">
                AI generates, algorithms verify
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {USE_FIXTURE ? (
              <Badge
                className="bg-amber-50 text-amber-800 ring-amber-200"
                title="Plans come from /golden/*.json and runs are simulated in the browser."
              >
                Fixture mode
              </Badge>
            ) : (
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">Live API</Badge>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        Software Project Management · requirements, estimates and schedules you can verify
      </footer>
    </div>
  );
}
