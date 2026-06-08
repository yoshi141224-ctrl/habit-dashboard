import { useState, useEffect } from 'react';
import './LeftSidebar.css';
import DonutChart, { type DonutSegment } from './DonutChart';
import HabitCharacter from './HabitCharacter';

const QUOTES = [
  { text: 'Discipline is the bridge between goals and accomplishment.', author: 'Jim Rohn' },
  { text: 'Small daily improvements are the key to staggering long-term results.', author: 'Unknown' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'R. Collier' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
  { text: 'Motivation is what gets you started. Habit is what keeps you going.', author: 'Jim Ryun' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const NAV_ITEMS = [
  { id: 'home',      d: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10', label: 'Home' },
  { id: 'calendar',  d: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', label: 'Calendar' },
  { id: 'habits',    d: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', label: 'Habits' },
  { id: 'stats',     d: 'M18 20V10 M12 20V4 M6 20v-6', label: 'Stats' },
];

interface Props {
  completionRate: number;
  completedCount: number;
  totalCount: number;
  donutSegments: DonutSegment[];
  activeNav: string;
  onNavChange: (nav: string) => void;
}

export default function LeftSidebar({ completionRate, completedCount, totalCount, donutSegments, activeNav, onNavChange }: Props) {
  const [time, setTime] = useState(new Date());
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close on resize to desktop
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth > 767) setMobileOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const quote = QUOTES[time.getDay() % QUOTES.length];
  const hours = time.getHours();
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = String(hours % 12 || 12).padStart(2, '0');
  const dateStr = `${DAYS[time.getDay()]}, ${MONTHS[time.getMonth()]} ${time.getDate()}`;

  const r = 54, cx = 64, cy = 64;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - completionRate / 100);
  const scoreLabel = completionRate >= 80 ? 'Great job!' : completionRate >= 50 ? 'Keep going!' : 'Just start!';

  const legendItems = donutSegments.filter(s => s.seconds > 0).slice(0, 5);

  function handleNavChange(id: string) {
    onNavChange(id);
    setMobileOpen(false);
  }

  return (
    <>
      {/* Hamburger button — mobile only */}
      <button
        type="button"
        className="ls-hamburger"
        onClick={() => setMobileOpen(v => !v)}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
      >
        <span className={mobileOpen ? 'ls-ham-open' : ''} />
        <span className={mobileOpen ? 'ls-ham-open' : ''} />
        <span className={mobileOpen ? 'ls-ham-open' : ''} />
      </button>

      {/* Overlay backdrop — mobile only */}
      {mobileOpen && (
        <div className="ls-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`ls-root${mobileOpen ? ' ls-root--open' : ''}`}>
        {/* Close button — mobile only */}
        <button type="button" className="ls-close-btn" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          ✕
        </button>

        <div className="ls-nav-rail">
          {NAV_ITEMS.map(({ id, d, label }) => (
            <button
              type="button"
              key={id}
              className={`ls-nav-icon${activeNav === id ? ' active' : ''}`}
              onClick={() => handleNavChange(id)}
              title={label}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={d} />
              </svg>
            </button>
          ))}

          {/* Completed Tasks */}
          <button
            type="button"
            className={`ls-nav-icon${activeNav === 'completed' ? ' active' : ''}`}
            onClick={() => handleNavChange('completed')}
            title="Completed Tasks"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1" ry="1"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </button>

          <div className="ls-nav-spacer" />

          {/* Settings */}
          <button type="button" className="ls-nav-icon" title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>

        <div className="ls-content">
          <div className="ls-sun">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c49476" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          </div>

          <div className="ls-time-block">
            <p className="ls-date">{dateStr}</p>
            <p className="ls-clock">{displayHour}:{minutes}</p>
            <p className="ls-ampm">{ampm}</p>
          </div>

          {/* Habit Score */}
          <div className="ls-score-section">
            <p className="ls-score-title">Daily Habit Score</p>
            <div className="ls-ring-container">
              <svg width="120" height="120" viewBox="0 0 128 128">
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8e4de" strokeWidth="10"/>
                <circle
                  cx={cx} cy={cy} r={r} fill="none"
                  stroke="#2d2926" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={dashoffset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
                <text x="64" y="62" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#1e1b17">{completionRate}%</text>
              </svg>
            </div>
            <p className="ls-score-label">{scoreLabel}</p>
            <p className="ls-score-detail">{completedCount} / {totalCount} habits completed</p>
          </div>

          {/* Daily Time Spent donut */}
          <div className="ls-donut-section">
            <p className="ls-score-title">Daily Time Spent</p>
            <DonutChart segments={donutSegments} size={90} />
            {legendItems.length > 0 && (
              <div className="ls-donut-legend">
                {legendItems.map(seg => (
                  <div key={seg.itemId} className="ls-legend-item">
                    <span className="ls-legend-dot" style={{ background: seg.color }} />
                    <span className="ls-legend-name">{seg.name}</span>
                    <span className="ls-legend-time">{Math.round(seg.seconds / 60)}m</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <HabitCharacter completionRate={completionRate} />

          <blockquote className="ls-quote">
            <p>"{quote.text}"</p>
            <footer>— {quote.author}</footer>
          </blockquote>
        </div>
      </aside>
    </>
  );
}
