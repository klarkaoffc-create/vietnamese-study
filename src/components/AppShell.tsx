import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from '../learning/store';
import { dashboardCounts } from '../learning/session';

const NAV = [
  { to: '/', icon: '🏠', label: 'Dzisiaj', end: true },
  { to: '/lekcje', icon: '📚', label: 'Lekcje' },
  { to: '/powtorki', icon: '🧠', label: 'Powtórki', countKey: 'due' as const },
  { to: '/tony', icon: '🎧', label: 'Tony i słuchanie' },
  { to: '/dialogi', icon: '💬', label: 'Dialogi' },
  { to: '/slownictwo', icon: '🗂', label: 'Słownictwo' },
  { to: '/gramatyka', icon: '📐', label: 'Gramatyka' },
  { to: '/bledy', icon: '❌', label: 'Moje błędy', countKey: 'mistakes' as const },
  { to: '/egzaminy', icon: '📝', label: 'Egzaminy' },
  { to: '/postep', icon: '📊', label: 'Postęp' },
];

export function AppShell() {
  const { state } = useStore();
  const counts = dashboardCounts(state);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));
  return (
    <div className="app">
      <nav className="nav" aria-label="Główna nawigacja">
        <div className="nav-brand">
          <div className="logo" lang="vi">ă</div>
          <div>
            <div className="name">Tiếng Việt</div>
            <div className="sub">nauka wietnamskiego</div>
          </div>
        </div>
        <ul className="nav-list">
          {NAV.map((n) => {
            const count = n.countKey ? counts[n.countKey] : 0;
            return (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                  <span className="icon" aria-hidden>{n.icon}</span>
                  <span>{n.label}</span>
                  {count > 0 && <span className="count">{count}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mobile-topbar">
          <span>
            {current?.icon} {current?.label ?? 'Tiếng Việt'}
          </span>
          <span className="sub" lang="vi">Tiếng Việt</span>
        </div>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
