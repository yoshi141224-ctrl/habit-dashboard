import { useState, useMemo } from 'react';
import './HabitProgressChart.css';
import type { Habit, CompletionMap } from '../types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  habits: Habit[];
  completions: CompletionMap;
  colorMap: Record<string, string>;
}

type Tab = 'Day' | '7 Days' | 'Month';

interface DayData {
  label: string;
  completedIds: string[];
}

export default function HabitProgressChart({ habits, completions, colorMap }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('7 Days');

  const data: DayData[] = useMemo(() => {
    const today = new Date();
    const ty = today.getFullYear(), tm = today.getMonth(), td = today.getDate();

    if (activeTab === 'Day') {
      const key = localDateStr(today);
      return [{ label: 'Today', completedIds: completions[key] ?? [] }];
    }

    const days = activeTab === '7 Days' ? 7 : 30;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(ty, tm, td - (days - 1 - i));
      const key = localDateStr(d);
      return {
        label: days === 7 ? DAY_LABELS[d.getDay()] : `${d.getMonth() + 1}/${d.getDate()}`,
        completedIds: completions[key] ?? [],
      };
    });
  }, [activeTab, habits, completions]);

  const total = habits.length || 1;

  const avgPct = useMemo(() => {
    if (!data.length || habits.length === 0) return 0;
    const sum = data.reduce((s, d) => s + d.completedIds.length, 0);
    return Math.round((sum / data.length / habits.length) * 100);
  }, [data, habits]);

  // SVG layout
  const svgW = 280, svgH = 140;
  const leftPad = 28, rightPad = 4, topPad = 14, bottomPad = 20;
  const chartW = svgW - leftPad - rightPad;
  const chartH = svgH - topPad - bottomPad;
  const n = data.length;
  const slotW = chartW / n;
  const barW = n <= 1 ? slotW * 0.4 : n <= 7 ? slotW * 0.55 : slotW * 0.72;
  const labelStep = n > 15 ? Math.ceil(n / 6) : 1;
  const segH = chartH / total;

  return (
    <div className="hpc-card card">
      <div className="hpc-header">
        <div className="hpc-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9a938c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span className="hpc-title">Habit Progress</span>
        </div>
        <div className="hpc-tabs">
          {(['Day', '7 Days', 'Month'] as Tab[]).map(t => (
            <button key={t} type="button"
              className={`hpc-tab${activeTab === t ? ' hpc-tab--active' : ''}`}
              onClick={() => setActiveTab(t)}
            >{t}</button>
          ))}
        </div>
      </div>

      {habits.length > 0 && activeTab !== 'Day' && (
        <div className="hpc-legend">
          {habits.slice(0, 7).map(h => (
            <span key={h.id} className="hpc-legend-item">
              <span className="hpc-legend-dot" style={{ background: colorMap[h.id] ?? '#ccc' }} />
              <span className="hpc-legend-name">{h.name}</span>
            </span>
          ))}
          {habits.length > 7 && <span className="hpc-legend-more">+{habits.length - 7}</span>}
        </div>
      )}

      {activeTab === 'Day' ? (
        <div className="hpc-day-view">
          <div className="hpc-day-rate" style={{ color: habits.length === 0 ? '#ccc' : undefined }}>
            {habits.length > 0 ? Math.round((data[0].completedIds.length / habits.length) * 100) : 0}%
          </div>
          <div className="hpc-day-strip">
            {habits.map(h => (
              <div key={h.id} className="hpc-day-seg" title={h.name}
                style={{ background: data[0].completedIds.includes(h.id) ? colorMap[h.id] ?? '#939b7e' : 'rgba(0,0,0,0.07)' }} />
            ))}
          </div>
          <div className="hpc-day-list">
            {habits.map(h => {
              const done = data[0].completedIds.includes(h.id);
              return (
                <div key={h.id} className="hpc-day-row">
                  <span className="hpc-day-dot" style={{ background: done ? colorMap[h.id] ?? '#939b7e' : '#ddd' }} />
                  <span className={`hpc-day-name${done ? ' done' : ''}`}>{h.emoji ? h.emoji + ' ' : ''}{h.name}</span>
                  {done && <span className="hpc-day-check" style={{ color: colorMap[h.id] ?? '#939b7e' }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="hpc-chart-wrap">
          <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
            {[100, 75, 50, 25, 0].map(v => {
              const y = topPad + chartH - (v / 100) * chartH;
              return (
                <g key={v}>
                  <line x1={leftPad} y1={y} x2={svgW - rightPad} y2={y} stroke="#f0ece6" strokeWidth="1" />
                  <text x={leftPad - 4} y={y + 3} textAnchor="end" fontSize="7.5" fill="#b0a89e">{v}%</text>
                </g>
              );
            })}

            {data.map((day, i) => {
              const x = leftPad + i * slotW + (slotW - barW) / 2;
              const cx = x + barW / 2;
              const completedHabits = habits.filter(h => day.completedIds.includes(h.id));
              const pct = Math.round((completedHabits.length / total) * 100);
              let yOff = topPad + chartH;

              return (
                <g key={i}>
                  <rect x={x} y={topPad} width={barW} height={chartH} fill="#f5f2ee" rx="2" />
                  {completedHabits.map(h => {
                    yOff -= segH;
                    return (
                      <rect key={h.id} x={x} y={yOff} width={barW} height={Math.max(segH - 0.5, 1)}
                        fill={colorMap[h.id] ?? '#939b7e'}>
                        <title>{day.label}: {h.name}</title>
                      </rect>
                    );
                  })}
                  {pct > 0 && n <= 10 && (
                    <text x={cx} y={topPad + chartH - completedHabits.length * segH - 3}
                      textAnchor="middle" fontSize="7" fill="#9a938c" fontWeight="500">{pct}%</text>
                  )}
                  {i % labelStep === 0 && (
                    <text x={cx} y={svgH - 4} textAnchor="middle" fontSize="7.5" fill="#9a938c">{day.label}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {activeTab !== 'Day' && (
        <div className="hpc-footer">
          <span className="hpc-avg-label">{activeTab === '7 Days' ? 'Weekly' : 'Monthly'} Average</span>
          <span className="hpc-avg-value">{avgPct}%</span>
        </div>
      )}
    </div>
  );
}
