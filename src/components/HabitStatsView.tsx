import { useState, useMemo } from 'react';
import './HabitStatsView.css';
import type { Habit, CompletionMap } from '../types';

type TimeLog = Record<string, Record<string, number>>;

interface Props {
  habits: Habit[];
  completions: CompletionMap;
  timeLogs?: TimeLog;
  colorMap?: Record<string, string>;
}

type Period = '1日' | '1週' | '1ヶ月' | '3ヶ月' | '半年' | '1年';
type ChartType = '達成率' | '時間' | '習慣別';

interface BarDatum { label: string; value: number; subLabel?: string; }

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rateForDay(completions: CompletionMap, habits: Habit[], key: string): number {
  if (habits.length === 0) return 0;
  return Math.round(((completions[key] ?? []).length / habits.length) * 100);
}

function minutesForDay(timeLogs: TimeLog, dateKey: string): number {
  const dayLog = timeLogs[dateKey];
  if (!dayLog) return 0;
  return Object.values(dayLog).reduce((s, v) => s + v, 0) / 60;
}

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${Math.round(totalMinutes)}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function yAxisMax(maxVal: number): number {
  if (maxVal <= 0) return 30;
  return Math.ceil(maxVal / 30) * 30;
}

function yLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${minutes / 60}h`;
}

/** Returns list of date keys for the selected period (oldest first) */
function datesForPeriod(period: Period): string[] {
  const today = new Date();
  const keys: string[] = [];

  if (period === '1日') {
    keys.push(localDateKey(today));
    return keys;
  }
  if (period === '1週') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      keys.push(localDateKey(d));
    }
    return keys;
  }
  if (period === '1ヶ月') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      keys.push(localDateKey(d));
    }
    return keys;
  }
  if (period === '3ヶ月') {
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      keys.push(localDateKey(d));
    }
    return keys;
  }
  if (period === '半年') {
    for (let i = 179; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      keys.push(localDateKey(d));
    }
    return keys;
  }
  // 1年
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    keys.push(localDateKey(d));
  }
  return keys;
}

export default function HabitStatsView({ habits, completions, timeLogs = {}, colorMap = {} }: Props) {
  const [period, setPeriod] = useState<Period>('1週');
  const [chartType, setChartType] = useState<ChartType>('達成率');

  // ── 達成率 data ──────────────────────────────────────────────
  const rateData: BarDatum[] = useMemo(() => {
    const today = new Date();

    if (period === '1日') {
      return [{ label: 'Today', value: rateForDay(completions, habits, localDateKey(today)) }];
    }
    if (period === '1週') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (6 - i));
        return { label: DAY_ABBR[d.getDay()], value: rateForDay(completions, habits, localDateKey(d)) };
      });
    }
    if (period === '1ヶ月') {
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (29 - i));
        return { label: `${d.getMonth()+1}/${d.getDate()}`, value: rateForDay(completions, habits, localDateKey(d)) };
      });
    }
    if (period === '3ヶ月') {
      return Array.from({ length: 13 }, (_, i) => {
        const weekEndDaysAgo = (12 - i) * 7;
        const rates: number[] = [];
        let weekLabel = '';
        for (let j = 6; j >= 0; j--) {
          const d = new Date(today); d.setDate(today.getDate() - weekEndDaysAgo - j);
          rates.push(rateForDay(completions, habits, localDateKey(d)));
          if (j === 6) weekLabel = `${d.getMonth()+1}/${d.getDate()}`;
        }
        return { label: weekLabel, value: Math.round(rates.reduce((s, v) => s + v, 0) / rates.length) };
      });
    }
    if (period === '半年') {
      return Array.from({ length: 6 }, (_, i) => {
        const refDate = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
        const year = refDate.getFullYear(), month = refDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const rates: number[] = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(year, month, day);
          if (d > today) break;
          rates.push(rateForDay(completions, habits, localDateKey(d)));
        }
        return { label: MONTH_ABBR[month], value: rates.length ? Math.round(rates.reduce((s, v) => s + v, 0) / rates.length) : 0, subLabel: String(year) };
      });
    }
    return Array.from({ length: 12 }, (_, i) => {
      const refDate = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
      const year = refDate.getFullYear(), month = refDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const rates: number[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        if (d > today) break;
        rates.push(rateForDay(completions, habits, localDateKey(d)));
      }
      return { label: MONTH_ABBR[month], value: rates.length ? Math.round(rates.reduce((s, v) => s + v, 0) / rates.length) : 0, subLabel: String(year) };
    });
  }, [period, completions, habits]);

  // ── 時間 data ────────────────────────────────────────────────
  const timeData: BarDatum[] = useMemo(() => {
    const today = new Date();
    if (period === '1日') return [{ label: 'Today', value: minutesForDay(timeLogs, utcDateKey(today)) }];
    if (period === '1週') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (6 - i));
        return { label: DAY_ABBR[d.getDay()], value: minutesForDay(timeLogs, utcDateKey(d)) };
      });
    }
    if (period === '1ヶ月') {
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (29 - i));
        return { label: `${d.getMonth()+1}/${d.getDate()}`, value: minutesForDay(timeLogs, utcDateKey(d)) };
      });
    }
    if (period === '3ヶ月') {
      return Array.from({ length: 13 }, (_, i) => {
        const weekEndDaysAgo = (12 - i) * 7;
        let total = 0, weekLabel = '';
        for (let j = 6; j >= 0; j--) {
          const d = new Date(today); d.setDate(today.getDate() - weekEndDaysAgo - j);
          total += minutesForDay(timeLogs, utcDateKey(d));
          if (j === 6) weekLabel = `${d.getMonth()+1}/${d.getDate()}`;
        }
        return { label: weekLabel, value: total };
      });
    }
    if (period === '半年') {
      return Array.from({ length: 6 }, (_, i) => {
        const refDate = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
        const year = refDate.getFullYear(), month = refDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let total = 0;
        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(year, month, day);
          if (d > today) break;
          total += minutesForDay(timeLogs, utcDateKey(d));
        }
        return { label: MONTH_ABBR[month], value: total, subLabel: String(year) };
      });
    }
    return Array.from({ length: 12 }, (_, i) => {
      const refDate = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
      const year = refDate.getFullYear(), month = refDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      let total = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        if (d > today) break;
        total += minutesForDay(timeLogs, utcDateKey(d));
      }
      return { label: MONTH_ABBR[month], value: total, subLabel: String(year) };
    });
  }, [period, timeLogs]);

  // ── 習慣別 data ──────────────────────────────────────────────
  const habitBreakdownData = useMemo(() => {
    const keys = datesForPeriod(period);
    return habits.map(h => {
      const completedDays = keys.filter(k => (completions[k] ?? []).includes(h.id)).length;
      const rate = keys.length > 0 ? Math.round((completedDays / keys.length) * 100) : 0;
      return { habit: h, rate, completedDays, totalDays: keys.length };
    }).sort((a, b) => b.rate - a.rate);
  }, [period, habits, completions]);

  const isTime = chartType === '時間';
  const isHabitBreakdown = chartType === '習慣別';
  const data = isTime ? timeData : rateData;

  const avgValue = data.length ? data.reduce((s, d) => s + d.value, 0) / data.length : 0;

  // SVG layout
  const svgW = 320, svgH = 150;
  const leftPad = 34, rightPad = 4, topPad = 18, bottomPad = period === '3ヶ月' ? 28 : 22;
  const chartW = svgW - leftPad - rightPad;
  const chartH = svgH - topPad - bottomPad;
  const n = data.length;
  const slotW = chartW / n;
  const barW = n <= 1 ? slotW * 0.4 : n <= 7 ? slotW * 0.55 : slotW * 0.72;
  const labelStep = n > 15 ? Math.ceil(n / 7) : 1;

  const rateYLabels = [100, 75, 50, 25, 0];
  const timeMaxRaw = Math.max(...timeData.map(d => d.value), 0);
  const timeYMax = yAxisMax(timeMaxRaw);
  const timeYStep = timeYMax <= 60 ? 30 : timeYMax <= 120 ? 30 : timeYMax <= 240 ? 60 : timeYMax <= 480 ? 120 : 240;
  const timeYLabels: number[] = [];
  for (let v = 0; v <= timeYMax; v += timeYStep) timeYLabels.push(v);

  const BAR_COLOR = '#939b7e';
  const BAR_HIGH  = '#c49476';
  const BAR_TIME  = '#7ba7bc';

  return (
    <div className="hsv-card card">
      {/* Header */}
      <div className="hsv-header">
        <div className="hsv-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9a938c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6"  y1="20" x2="6"  y2="14"/>
          </svg>
          <span className="hsv-title">習慣スタッツ</span>
        </div>
      </div>

      {/* Chart Type Toggle */}
      <div className="hsv-type-toggle">
        {(['達成率', '時間', '習慣別'] as ChartType[]).map(t => (
          <button type="button" key={t}
            className={`hsv-type-btn${chartType === t ? ' hsv-type-btn--active' : ''}`}
            onClick={() => setChartType(t)}
          >{t}</button>
        ))}
      </div>

      {/* Period Tabs */}
      <div className="hsv-tabs">
        {(['1日','1週','1ヶ月','3ヶ月','半年','1年'] as Period[]).map(p => (
          <button type="button" key={p}
            className={`hsv-tab${period === p ? ' hsv-tab--active' : ''}`}
            onClick={() => setPeriod(p)}
          >{p}</button>
        ))}
      </div>

      {/* ── 習慣別 view ── */}
      {isHabitBreakdown ? (
        <div className="hsv-habit-breakdown">
          {habitBreakdownData.length === 0 ? (
            <p className="hsv-empty">習慣がありません</p>
          ) : (
            habitBreakdownData.map(({ habit, rate, completedDays, totalDays }) => (
              <div key={habit.id} className="hsv-hb-row">
                <div className="hsv-hb-label">
                  <span className="hsv-hb-dot" style={{ background: colorMap[habit.id] ?? '#ccc' }} />
                  <span className="hsv-hb-name">{habit.emoji ? habit.emoji + ' ' : ''}{habit.name}</span>
                  <span className="hsv-hb-count">{completedDays}/{totalDays}</span>
                </div>
                <div className="hsv-hb-bar-track">
                  <div className="hsv-hb-bar-fill"
                    style={{ width: `${rate}%`, background: colorMap[habit.id] ?? '#939b7e' }} />
                </div>
                <span className="hsv-hb-pct">{rate}%</span>
              </div>
            ))
          )}
        </div>
      ) : period === '1日' ? (
        /* Single-day big display */
        <div className="hsv-today-display">
          {isTime ? (
            <>
              <div className="hsv-big-pct" style={{ color: BAR_TIME }}>{formatMinutes(data[0]?.value ?? 0)}</div>
              <div className="hsv-today-label">Today's time spent</div>
            </>
          ) : (
            <>
              <div className="hsv-big-pct" style={{ color: data[0]?.value >= 70 ? '#939b7e' : data[0]?.value >= 40 ? '#c49476' : '#7ba7bc' }}>
                {data[0]?.value ?? 0}%
              </div>
              <div className="hsv-today-label">Today's completion rate</div>
              <div className="hsv-habit-list">
                {habits.map(h => {
                  const key = localDateKey(new Date());
                  const done = (completions[key] ?? []).includes(h.id);
                  return (
                    <div key={h.id} className={`hsv-habit-row${done ? ' hsv-habit-row--done' : ''}`}>
                      <span className="hsv-habit-dot" style={{ background: done ? (colorMap[h.id] ?? '#939b7e') : '#ccc8c4' }} />
                      <span className="hsv-habit-name">{h.emoji ? h.emoji + ' ' : ''}{h.name}</span>
                      {done && <span className="hsv-habit-check">✓</span>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Bar Chart */}
          <div className="hsv-chart-wrap">
            <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
              {isTime ? (
                <>
                  {timeYLabels.map(v => {
                    const y = topPad + chartH - (v / timeYMax) * chartH;
                    return (
                      <g key={v}>
                        <line x1={leftPad} y1={y} x2={svgW - rightPad} y2={y} stroke="#f0ece6" strokeWidth="1"/>
                        <text x={leftPad - 4} y={y + 3} textAnchor="end" fontSize="7.5" fill="#b0a89e">{yLabel(v)}</text>
                      </g>
                    );
                  })}
                  {data.map((d, i) => {
                    const barH = Math.max(d.value > 0 ? 3 : 0, (d.value / timeYMax) * chartH);
                    const x = leftPad + i * slotW + (slotW - barW) / 2;
                    const y = topPad + chartH - barH;
                    const cx = x + barW / 2;
                    return (
                      <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH} fill={BAR_TIME} rx="2" ry="2">
                          <title>{d.label}: {formatMinutes(d.value)}</title>
                        </rect>
                        {d.value > 0 && n <= 12 && (
                          <text x={cx} y={y - 3} textAnchor="middle" fontSize="7" fill="#9a938c" fontWeight="500">{formatMinutes(d.value)}</text>
                        )}
                        {i % labelStep === 0 && (
                          <>
                            <text x={cx} y={svgH - (d.subLabel ? 12 : 4)} textAnchor="middle" fontSize="7.5" fill="#9a938c">{d.label}</text>
                            {d.subLabel && <text x={cx} y={svgH - 2} textAnchor="middle" fontSize="6.5" fill="#c5bfb8">{d.subLabel}</text>}
                          </>
                        )}
                      </g>
                    );
                  })}
                </>
              ) : (
                <>
                  {rateYLabels.map(v => {
                    const y = topPad + chartH - (v / 100) * chartH;
                    return (
                      <g key={v}>
                        <line x1={leftPad} y1={y} x2={svgW - rightPad} y2={y} stroke="#f0ece6" strokeWidth="1"/>
                        <text x={leftPad - 4} y={y + 3} textAnchor="end" fontSize="7.5" fill="#b0a89e">{v}%</text>
                      </g>
                    );
                  })}
                  {data.map((d, i) => {
                    const barH = Math.max(d.value > 0 ? 3 : 0, (d.value / 100) * chartH);
                    const x = leftPad + i * slotW + (slotW - barW) / 2;
                    const y = topPad + chartH - barH;
                    const cx = x + barW / 2;
                    return (
                      <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH} fill={d.value >= 80 ? BAR_HIGH : BAR_COLOR} rx="2" ry="2">
                          <title>{d.label}: {d.value}%</title>
                        </rect>
                        {d.value > 0 && n <= 12 && (
                          <text x={cx} y={y - 3} textAnchor="middle" fontSize="7" fill="#9a938c" fontWeight="500">{d.value}%</text>
                        )}
                        {i % labelStep === 0 && (
                          <>
                            <text x={cx} y={svgH - (d.subLabel ? 12 : 4)} textAnchor="middle" fontSize="7.5" fill="#9a938c">{d.label}</text>
                            {d.subLabel && <text x={cx} y={svgH - 2} textAnchor="middle" fontSize="6.5" fill="#c5bfb8">{d.subLabel}</text>}
                          </>
                        )}
                      </g>
                    );
                  })}
                </>
              )}
            </svg>
          </div>

          <div className="hsv-footer">
            <span className="hsv-avg-label">
              {period === '1週' ? 'Weekly' : period === '1ヶ月' ? 'Monthly' : period === '3ヶ月' ? '3-Month' : period === '半年' ? '6-Month' : 'Yearly'} Average
            </span>
            <span className="hsv-avg-value">
              {isTime ? formatMinutes(avgValue) : `${Math.round(avgValue)}%`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
