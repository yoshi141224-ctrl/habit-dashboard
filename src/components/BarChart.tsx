import { useState } from 'react';
import './BarChart.css';
import type { BarChartDatum } from '../types';

type Tab = 'Day' | '7 Days' | 'Month';

interface Props {
  title: string;
  color: string;
  weekData: BarChartDatum[];
  monthData: BarChartDatum[];
}

export default function BarChart({ title, color, weekData, monthData }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('7 Days');

  const today = new Date();
  const dayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;

  let data: BarChartDatum[];
  if (activeTab === 'Day') {
    data = [{ label: weekData[dayIndex]?.label ?? 'Today', value: weekData[dayIndex]?.value ?? 0 }];
  } else if (activeTab === 'Month') {
    data = monthData;
  } else {
    data = weekData;
  }

  const periodAvg = activeTab === 'Month'
    ? Math.round(monthData.reduce((sum, d) => sum + d.value, 0) / Math.max(monthData.length, 1))
    : Math.round(weekData.reduce((sum, d) => sum + d.value, 0) / Math.max(weekData.length, 1));

  // SVG layout constants
  const leftPad = 32;  // space for y-axis labels
  const rightPad = 4;
  const topPad = 16;
  const bottomPad = 20;
  const svgW = 280;
  const svgH = 140;
  const chartW = svgW - leftPad - rightPad;
  const chartH = svgH - topPad - bottomPad;

  const n = data.length;
  const slotW = chartW / n;
  const barW = n <= 1 ? slotW * 0.4 : n <= 7 ? slotW * 0.55 : slotW * 0.72;

  const yLabels = [100, 75, 50, 25, 0];
  // For many bars, only show some x-axis labels
  const labelStep = n > 15 ? Math.ceil(n / 6) : 1;

  return (
    <div className="bc-card card">
      <div className="bc-header">
        <span className="bc-title">{title}</span>
        <div className="bc-tabs">
          {(['Day', '7 Days', 'Month'] as Tab[]).map(tab => (
            <button
              type="button"
              key={tab}
              className={`bc-tab${activeTab === tab ? ' bc-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="bc-chart-wrap">
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
                <line
                  x1={leftPad} y1={y}
                  x2={svgW - rightPad} y2={y}
                  stroke="#f0ece6" strokeWidth="1"
                />
                <text
                  x={leftPad - 4} y={y + 3}
                  textAnchor="end"
                  fontSize="7.5"
                  fill="#b0a89e"
                >
                  {v}%
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((d, i) => {
            const barH = Math.max(d.value > 0 ? 3 : 0, (d.value / 100) * chartH);
            const x = leftPad + i * slotW + (slotW - barW) / 2;
            const y = topPad + chartH - barH;
            const labelX = x + barW / 2;

            return (
              <g key={d.label}>
                {/* Bar */}
                <rect
                  x={x} y={y}
                  width={barW} height={barH}
                  fill={color}
                  rx="3" ry="3"
                />
                {/* Value label above bar */}
                {d.value > 0 && (
                  <text
                    x={labelX} y={y - 3}
                    textAnchor="middle"
                    fontSize="7"
                    fill="#9a938c"
                    fontWeight="500"
                  >
                    {d.value}%
                  </text>
                )}
                {/* X-axis label (skip some for dense charts) */}
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

      <div className="bc-footer">
        <span className="bc-avg-label">{activeTab === 'Month' ? 'Monthly Average' : 'Weekly Average'}</span>
        <span className="bc-avg-value">{periodAvg}%</span>
      </div>
    </div>
  );
}
