import React from 'react';
import { PenSquare, Calendar as CalendarIcon, Inbox as InboxIcon, Link2 } from 'lucide-react';

// Sidebar sub-section for the Social module — same menu-section/menu-list/
// menu-link markup as every other sidebar section in App.jsx (see
// "Main Dashboard" just above this in the sidebar), so it reads as one
// more section of the same shell, not a bolted-on second nav. Phase 3
// adds Inbox — one unified view over mentions + inbox_messages (see
// social/Inbox.jsx) rather than two separate pages, since the point is
// tracking every query/lead in one place. Analytics stays commented,
// still Phase 4.
function SocialNav({ currentView, setCurrentView }) {
  const items = [
    { view: 'social-compose', icon: PenSquare, label: 'Compose' },
    { view: 'social-calendar', icon: CalendarIcon, label: 'Calendar' },
    { view: 'social-inbox', icon: InboxIcon, label: 'Inbox' },
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
