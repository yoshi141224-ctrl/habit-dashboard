import { useState } from 'react';
import './StackedBarChart.css';
import type { StackedBarDatum } from '../types';

type Tab = 'Day' | '7 Days' | 'Month';

interface LegendItem { itemId: string; name: string; color: string; }

interface Props {
  weekData: StackedBarDatum[];
  monthData: StackedBarDatum[];
  legendItems: LegendItem[];
}

// ── Time helpers ────────────────────────────────────────────────

/** Round up to a "nice" ceiling in seconds for Y-axis scaling */
function niceMaxSeconds(maxSec: number): number {
  if (maxSec <= 0) return 3600; // default 1h when no data
  const steps = [
    15 * 60,   //  15m
    30 * 60,   //  30m
    60 * 60,   //  1h
    90 * 60,   //  1h 30m
    120 * 60,  //  2h
    180 * 60,  //  3h
    240 * 60,  //  4h
    360 * 60,  //  6h
    480 * 60,  //  8h
    600 * 60,  // 10h
    720 * 60,  // 12h
  ];
  for (const s of steps) {
    if (s >= maxSec) return s;
  }
  // For very large values, round up to nearest hour
  return Math.ceil(maxSec / 3600) * 3600;
}

/** Format seconds as a short time string for Y-axis labels */
function fmtAxisTime(sec: number): string {
  if (sec === 0) return '0';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = m / 60;
  // Only show decimal if not a whole number
  return Number.isInteger(h) ? `${h}h` : `${Math.floor(h)}h${m % 60 > 0 ? `${m % 60}m` : ''}`;
}

/** Format seconds as a short time string for bar labels and footer */
function fmtDuration(sec: number): string {
  if (sec < 60) return '<1m';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

// ────────────────────────────────────────────────────────────────

export default function StackedBarChart({ weekData, monthData, legendItems }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('7 Days');

  const today = new Date();
  const dayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

  const baseData = activeTab === 'Month' ? monthData : weekData;
  const data = activeTab === 'Day'
    ? [weekData[dayIndex] ?? { label: 'Today', segments: [], totalSeconds: 0 }]
    : baseData;

  // Average in seconds per period
  const periodAvgSec = Math.round(
    baseData.reduce((s, d) => s + d.totalSeconds, 0) / Math.max(baseData.length, 1)
  );

  // Auto-scale Y-axis based on actual max in the displayed data
  const maxSec = Math.max(...data.map(d => d.totalSeconds), 0);
  const niceMax = niceMaxSeconds(maxSec);

  // 5 evenly-spaced Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => Math.round(r * niceMax));

  const svgW = 280;
  const svgH = 140;
  const leftPad = 34;
  const rightPad = 4;
  const topPad = 16;
  const bottomPad = 20;
  const chartW = svgW - leftPad - rightPad;
  const chartH = svgH - topPad - bottomPad;
  const n = data.length;
  const slotW = chartW / n;
  const barW = n <= 1 ? slotW * 0.4 : n <= 7 ? slotW * 0.55 : slotW * 0.72;
  const labelStep = n > 15 ? Math.ceil(n / 6) : 1;

  // Only legend items that appear in the data
  const activeIds = new Set(weekData.flatMap(d => d.segments.map(s => s.itemId)));
  const visibleLegend = legendItems.filter(l => activeIds.has(l.itemId)).slice(0, 8);

  return (
    <div className="sbc-card card">
      <div className="sbc-header">
        <span className="sbc-title">Time Spent</span>
        <div className="sbc-tabs">
          {(['Day', '7 Days', 'Month'] as Tab[]).map(tab => (
            <button
              type="button"
              key={tab}
              className={`sbc-tab${activeTab === tab ? ' sbc-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="sbc-chart-wrap">
        <svg
          width="100%"
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          {/* Y-axis grid lines and labels — time-based, auto-scaled */}
          {yTicks.map(v => {
            const y = topPad + chartH - (v / niceMax) * chartH;
            return (
              <g key={v}>
                <line x1={leftPad} y1={y} x2={svgW - rightPad} y2={y} stroke="#f0ece6" strokeWidth="1" />
                <text x={leftPad - 4} y={y + 3} textAnchor="end" fontSize="7.5" fill="#b0a89e">
                  {fmtAxisTime(v)}
                </text>
              </g>
            );
          })}

          {/* Stacked bars */}
          {data.map((d, i) => {
            const x = leftPad + i * slotW + (slotW - barW) / 2;
            const labelX = x + barW / 2;
            const totalH = Math.min((d.totalSeconds / niceMax) * chartH, chartH);
            let stackY = topPad + chartH; // starts at bottom

            return (
              <g key={d.label + i}>
                {d.segments.map(seg => {
                  const segH = Math.max(1, Math.min((seg.seconds / niceMax) * chartH, totalH));
                  stackY -= segH;
                  const ry = stackY;
                  return (
                    <rect
                      key={seg.itemId}
                      x={x} y={ry}
                      width={barW} height={segH}
                      fill={seg.color}
                      rx={segH > 3 ? '2' : '0'}
                    >
                      <title>{seg.name}: {fmtDuration(seg.seconds)}</title>
                    </rect>
                  );
                })}
                {/* Total label above bar — now in time format */}
                {d.totalSeconds > 0 && (
                  <text
                    x={labelX} y={topPad + chartH - totalH - 3}
                    textAnchor="middle" fontSize="7" fill="#9a938c" fontWeight="500"
                  >
                    {fmtDuration(d.totalSeconds)}
                  </text>
                )}
                {/* X-axis label */}
                {i % labelStep === 0 && (
                  <text x={labelX} y={svgH - 4} textAnchor="middle" fontSize="7.5" fill="#9a938c">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      {visibleLegend.length > 0 && (
        <div className="sbc-legend">
          {visibleLegend.map(item => (
            <div key={item.itemId} className="sbc-legend-item">
              <span className="sbc-legend-dot" style={{ background: item.color }} />
              <span className="sbc-legend-name">{item.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sbc-footer">
        <span className="sbc-avg-label">{activeTab === 'Month' ? 'Monthly Average' : 'Weekly Average'}</span>
        <span className="sbc-avg-value">{fmtDuration(periodAvgSec)}</span>
      </div>
    </div>
  );
}
