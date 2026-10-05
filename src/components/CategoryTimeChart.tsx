import { useMemo, useState } from 'react';
import './CategoryTimeChart.css';
import type { Habit, Task, CompletedTask, TimeLog } from '../types';

type Range = 7 | 14 | 30;

interface Props {
  habits: Habit[];
  tasks: Task[];
  completedTasks: CompletedTask[];
  timeLogs: TimeLog;
  colorMap: Record<string, string>;
}

interface Category { id: string; name: string; color: string; }
interface Segment extends Category { seconds: number; }
interface DayDatum { key: string; date: Date; segments: Segment[]; totalSeconds: number; }

const DAY_JP = ['日', '月', '火', '水', '木', '金', '土'];
const OTHER: Category = { id: '__other', name: 'その他', color: '#ccc8c4' };

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Round up to a "nice" ceiling in seconds for Y-axis scaling */
function niceMaxSeconds(maxSec: number): number {
  if (maxSec <= 0) return 3600;
  const steps = [15, 30, 60, 90, 120, 180, 240, 360, 480, 600, 720].map(m => m * 60);
  for (const s of steps) {
    if (s >= maxSec) return s;
  }
  return Math.ceil(maxSec / 3600) * 3600;
}

function fmtAxisTime(sec: number): string {
  if (sec === 0) return '0';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h${m % 60}m`;
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return '0m';
  if (sec < 60) return '<1m';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const rem = m % 60;
  return rem > 0 ? `${Math.floor(m / 60)}h ${rem}m` : `${Math.floor(m / 60)}h`;
}

/**
 * 日付 × カテゴリ別の経過時間。
 * カテゴリ = 習慣（サブ習慣は親の習慣にまとめる）またはタスク。
 */
export default function CategoryTimeChart({ habits, tasks, completedTasks, timeLogs, colorMap }: Props) {
  const [range, setRange] = useState<Range>(7);
  // 何ページ前を見ているか（0 = 今日で終わる期間）
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // itemId → カテゴリ
  const categoryOf = useMemo(() => {
    const map = new Map<string, Category>();
    habits.forEach(h => {
      const cat: Category = {
        id: h.id,
        name: `${h.emoji ? h.emoji + ' ' : ''}${h.name}`,
        color: colorMap[h.id] ?? OTHER.color,
      };
      map.set(h.id, cat);
      h.subHabits?.forEach(sh => map.set(sh.id, cat));
    });
    [...tasks, ...completedTasks].forEach(t => {
      if (!map.has(t.id)) map.set(t.id, { id: t.id, name: t.title, color: colorMap[t.id] ?? OTHER.color });
    });
    return map;
  }, [habits, tasks, completedTasks, colorMap]);

  const { days, totals } = useMemo(() => {
    const today = new Date();
    const perDay = Array.from({ length: range }, (_, i) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - page * range - (range - 1 - i));
      const key = localDateKey(date);
      const byCat = new Map<string, Segment>();
      Object.entries(timeLogs[key] ?? {}).forEach(([itemId, seconds]) => {
        if (!(seconds > 0)) return;
        const cat = categoryOf.get(itemId) ?? OTHER;
        const prev = byCat.get(cat.id);
        byCat.set(cat.id, { ...cat, seconds: (prev?.seconds ?? 0) + seconds });
      });
      return { key, date, byCat };
    });

    // 期間合計（多い順）。積み上げの順番もこれに揃えて、日ごとに色の位置がブレないようにする
    const totalMap = new Map<string, Segment>();
    perDay.forEach(d => d.byCat.forEach(seg => {
      const prev = totalMap.get(seg.id);
      totalMap.set(seg.id, { ...seg, seconds: (prev?.seconds ?? 0) + seg.seconds });
    }));
    const totals = [...totalMap.values()].sort((a, b) => b.seconds - a.seconds);
    const order = new Map(totals.map((t, i) => [t.id, i]));

    const days: DayDatum[] = perDay.map(d => {
      const segments = [...d.byCat.values()].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return { key: d.key, date: d.date, segments, totalSeconds: segments.reduce((s, seg) => s + seg.seconds, 0) };
    });
    return { days, totals };
  }, [range, page, timeLogs, categoryOf]);

  const selected = days.find(d => d.key === selectedKey) ?? days[days.length - 1];
  const periodTotal = totals.reduce((s, t) => s + t.seconds, 0);
  const first = days[0].date, last = days[days.length - 1].date;
  const rangeLabel = `${first.getMonth() + 1}/${first.getDate()} – ${last.getMonth() + 1}/${last.getDate()}`;

  // SVG layout
  const svgW = 320, svgH = 160;
  const leftPad = 34, rightPad = 4, topPad = 16, bottomPad = range === 7 ? 28 : 20;
  const chartW = svgW - leftPad - rightPad;
  const chartH = svgH - topPad - bottomPad;
  const n = days.length;
  const slotW = chartW / n;
  const barW = n <= 7 ? slotW * 0.55 : slotW * 0.72;
  const labelStep = n > 15 ? 5 : n > 7 ? 2 : 1;
  const niceMax = niceMaxSeconds(Math.max(...days.map(d => d.totalSeconds), 0));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => Math.round(r * niceMax));

  function changeRange(r: Range) {
    setRange(r);
    setPage(0);
    setSelectedKey(null);
  }

  function changePage(delta: number) {
    setPage(p => Math.max(0, p + delta));
    setSelectedKey(null);
  }

  return (
    <div className="ctc-card card">
      <div className="ctc-header">
        <span className="ctc-title">カテゴリ別の時間</span>
        <div className="ctc-tabs">
          {([7, 14, 30] as Range[]).map(r => (
            <button
              type="button"
              key={r}
              className={`ctc-tab${range === r ? ' ctc-tab--active' : ''}`}
              onClick={() => changeRange(r)}
            >
              {r}日
            </button>
          ))}
        </div>
      </div>

      <div className="ctc-nav">
        <button type="button" className="ctc-nav-btn" onClick={() => changePage(1)} aria-label="前の期間">‹</button>
        <span className="ctc-nav-label">{rangeLabel}</span>
        <button type="button" className="ctc-nav-btn" onClick={() => changePage(-1)} disabled={page === 0} aria-label="次の期間">›</button>
      </div>

      <div className="ctc-chart-wrap">
        <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
          {yTicks.map(v => {
            const y = topPad + chartH - (v / niceMax) * chartH;
            return (
              <g key={v}>
                <line x1={leftPad} y1={y} x2={svgW - rightPad} y2={y} stroke="#f0ece6" strokeWidth="1" />
                <text x={leftPad - 4} y={y + 3} textAnchor="end" fontSize="7.5" fill="#b0a89e">{fmtAxisTime(v)}</text>
              </g>
            );
          })}

          {days.map((d, i) => {
            const slotX = leftPad + i * slotW;
            const x = slotX + (slotW - barW) / 2;
            const labelX = x + barW / 2;
            const totalH = (d.totalSeconds / niceMax) * chartH;
            const isSelected = d.key === selected.key;
            let stackY = topPad + chartH;

            return (
              <g key={d.key} className="ctc-day" onClick={() => setSelectedKey(d.key)}>
                {/* タップ領域 + 選択中の日のハイライト */}
                <rect
                  x={slotX} y={topPad - 10} width={slotW} height={svgH - topPad + 10}
                  fill={isSelected ? '#f2ede5' : 'transparent'} rx="3"
                />
                {d.segments.map(seg => {
                  const segH = Math.max(1, (seg.seconds / niceMax) * chartH);
                  stackY -= segH;
                  return (
                    <rect key={seg.id} x={x} y={stackY} width={barW} height={segH} fill={seg.color} rx={segH > 3 ? '2' : '0'}>
                      <title>{seg.name}: {fmtDuration(seg.seconds)}</title>
                    </rect>
                  );
                })}
                {d.totalSeconds > 0 && n <= 14 && (
                  <text x={labelX} y={topPad + chartH - totalH - 3} textAnchor="middle" fontSize={n <= 7 ? 7 : 5.5} fill="#9a938c" fontWeight="500">
                    {fmtDuration(d.totalSeconds)}
                  </text>
                )}
                {(i % labelStep === 0 || i === n - 1) && (
                  <>
                    <text x={labelX} y={topPad + chartH + 11} textAnchor="middle" fontSize="7.5" fill={isSelected ? '#17120b' : '#9a938c'} fontWeight={isSelected ? 700 : 400}>
                      {d.date.getMonth() + 1}/{d.date.getDate()}
                    </text>
                    {range === 7 && (
                      <text x={labelX} y={topPad + chartH + 21} textAnchor="middle" fontSize="6.5" fill="#c5bfb8">
                        {DAY_JP[d.date.getDay()]}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 選択した日の内訳 */}
      <div className="ctc-section">
        <div className="ctc-section-head">
          <span className="ctc-section-title">
            {selected.date.getMonth() + 1}月{selected.date.getDate()}日（{DAY_JP[selected.date.getDay()]}）の内訳
          </span>
          <span className="ctc-section-total">{fmtDuration(selected.totalSeconds)}</span>
        </div>
        {selected.segments.length === 0 ? (
          <p className="ctc-empty">この日の記録はありません</p>
        ) : (
          [...selected.segments].sort((a, b) => b.seconds - a.seconds).map(seg => (
            <div key={seg.id} className="ctc-row">
              <span className="ctc-dot" style={{ background: seg.color }} />
              <span className="ctc-row-name">{seg.name}</span>
              <div className="ctc-track">
                <div className="ctc-fill" style={{ width: `${(seg.seconds / selected.totalSeconds) * 100}%`, background: seg.color }} />
              </div>
              <span className="ctc-row-time">{fmtDuration(seg.seconds)}</span>
            </div>
          ))
        )}
      </div>

      {/* 期間全体のカテゴリ別合計 */}
      {totals.length > 0 && (
        <div className="ctc-section">
          <div className="ctc-section-head">
            <span className="ctc-section-title">期間の合計</span>
            <span className="ctc-section-total">{fmtDuration(periodTotal)}</span>
          </div>
          <div className="ctc-legend">
            {totals.map(t => (
              <div key={t.id} className="ctc-legend-item">
                <span className="ctc-dot" style={{ background: t.color }} />
                <span className="ctc-legend-name">{t.name}</span>
                <span className="ctc-legend-time">{fmtDuration(t.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ctc-footer">
        <span className="ctc-avg-label">1日あたりの平均</span>
        <span className="ctc-avg-value">{fmtDuration(Math.round(periodTotal / range))}</span>
      </div>
    </div>
  );
}
