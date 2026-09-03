import React from 'react';
import { PenSquare, Calendar as CalendarIcon, AtSign, Inbox as InboxIcon, LineChart, Link2 } from 'lucide-react';

// Sidebar sub-section for the Social module — same menu-section/menu-list/
// menu-link markup as every other sidebar section in App.jsx (see
// "Main Dashboard" just above this in the sidebar), so it reads as one
// more section of the same shell, not a bolted-on second nav. Mentions
// and Inbox land in Phase 3, Analytics in Phase 4 — their entries are
// commented rather than linked to a view that doesn't exist yet, so
// nothing in the sidebar 404s.
function SocialNav({ currentView, setCurrentView }) {
  const items = [
    { view: 'social-compose', icon: PenSquare, label: 'Compose' },
    { view: 'social-calendar', icon: CalendarIcon, label: 'Calendar' },
    // { view: 'social-mentions', icon: AtSign, label: 'Mentions' },   // Phase 3
    // { view: 'social-inbox', icon: InboxIcon, label: 'Inbox' },       // Phase 3
    // { view: 'social-analytics', icon: LineChart, label: 'Analytics' }, // Phase 4
    { view: 'social-accounts', icon: Link2, label: 'Connect Accounts' }
  ];

  return (
    <div className="menu-section">
      <div className="menu-title">Social</div>
      <ul className="menu-list">
        {items.map(({ view, icon: Icon, label }) => (
          <li className="menu-item" key={view}>
            <div
              className={`menu-link ${currentView === view ? 'active' : ''}`}
              onClick={() => setCurrentView(view)}
            >
              <Icon size={18} /> {label}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SocialNav;
