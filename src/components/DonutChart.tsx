import './DonutChart.css';

export interface DonutSegment {
  itemId: string;
  name: string;
  color: string;
  seconds: number;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
}

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number): string {
  const o1 = polarToXY(cx, cy, outerR, startDeg);
  const o2 = polarToXY(cx, cy, outerR, endDeg);
  const i1 = polarToXY(cx, cy, innerR, endDeg);
  const i2 = polarToXY(cx, cy, innerR, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${o1.x} ${o1.y} A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y} L ${i1.x} ${i1.y} A ${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y} Z`;
}

export default function DonutChart({ segments, size = 96 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.58;

  const totalSeconds = segments.reduce((s, seg) => s + seg.seconds, 0);
  const totalMin = Math.round(totalSeconds / 60);

  if (totalSeconds === 0) {
    return (
      <div className="dc-root">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="#ede9e3" strokeWidth={outerR - innerR} />
          <text x={cx} y={cy - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#c0b8b2">0m</text>
          <text x={cx} y={cy + 9} textAnchor="middle" fontSize="8" fill="#c0b8b2">today</text>
        </svg>
      </div>
    );
  }

  let currentAngle = 0;
  const paths: { path: string; color: string; name: string; seconds: number }[] = [];

  segments.filter(s => s.seconds > 0).forEach(seg => {
    const angleDelta = (seg.seconds / totalSeconds) * 360;
    const endAngle = currentAngle + angleDelta;
    // Avoid rendering extremely thin slices (< 1 deg) to prevent SVG artefacts
    if (angleDelta >= 1) {
      // Handle 360-degree (full circle) case by capping at 359.9
      const safeEnd = angleDelta >= 359.9 ? currentAngle + 359.9 : endAngle;
      paths.push({
        path: arcPath(cx, cy, outerR, innerR, currentAngle, safeEnd),
        color: seg.color,
        name: seg.name,
        seconds: seg.seconds,
      });
    }
    currentAngle = endAngle;
  });

  return (
    <div className="dc-root">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths.map((p, i) => (
          <path key={i} d={p.path} fill={p.color}>
            <title>{p.name}: {Math.round(p.seconds / 60)}m</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e1b17">{totalMin}m</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize="7.5" fill="#9a938c">today</text>
      </svg>
    </div>
  );
}
