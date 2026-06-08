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

const MAX_SECONDS = 120 * 60; // 120 min = 100%

export default function StackedBarChart({ weekData, monthData, legendItems }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('7 Days');

  const today = new Date();
  const dayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

  const baseData = activeTab === 'Month' ? monthData : weekData;
  const data = activeTab === 'Day'
    ? [weekData[dayIndex] ?? { label: 'Today', segments: [], totalSeconds: 0 }]
    : baseData;

  const periodAvgMin = Math.round(
    baseData.reduce((s, d) => s + d.totalSeconds, 0) / 60 / Math.max(baseData.length, 1)
  );
  const periodAvgPct = Math.min(Math.round((periodAvgMin / 120) * 100), 100);

  const svgW = 280;
  const svgH = 140;
  const leftPad = 32;
  const rightPad = 4;
  const topPad = 16;
  const bottomPad = 20;
  const chartW = svgW - leftPad - rightPad;
  const chartH = svgH - topPad - bottomPad;
  const n = data.length;
  const slotW = chartW / n;
  const barW = n <= 1 ? slotW * 0.4 : n <= 7 ? slotW * 0.55 : slotW * 0.72;
  const yLabels = [100, 75, 50, 25, 0];
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
          {/* Y-axis grid lines and labels */}
          {yLabels.map(v => {
            const y = topPad + chartH - (v / 100) * chartH;
            return (
              <g key={v}>
                <line x1={leftPad} y1={y} x2={svgW - rightPad} y2={y} stroke="#f0ece6" strokeWidth="1" />
                <text x={leftPad - 4} y={y + 3} textAnchor="end" fontSize="7.5" fill="#b0a89e">{v}%</text>
              </g>
            );
          })}

          {/* Stacked bars */}
          {data.map((d, i) => {
            const x = leftPad + i * slotW + (slotW - barW) / 2;
            const labelX = x + barW / 2;
            const totalH = Math.min((d.totalSeconds / MAX_SECONDS) * chartH, chartH);
            let stackY = topPad + chartH; // starts at bottom

            return (
              <g key={d.label}>
                {d.segments.map(seg => {
                  const segH = Math.max(1, Math.min((seg.seconds / MAX_SECONDS) * chartH, totalH));
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
                      <title>{seg.name}: {Math.round(seg.seconds / 60)}m</title>
                    </rect>
                  );
                })}
                {/* Total label above bar */}
                {d.totalSeconds > 0 && (
                  <text
                    x={labelX} y={topPad + chartH - totalH - 3}
                    textAnchor="middle" fontSize="7" fill="#9a938c" fontWeight="500"
                  >
                    {Math.round(d.totalSeconds / 60)}m
                  </text>
                )}
                {/* X-axis label (skip for dense month view) */}
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
        <span className="sbc-avg-value">{periodAvgPct}%</span>
      </div>
    </div>
  );
}
