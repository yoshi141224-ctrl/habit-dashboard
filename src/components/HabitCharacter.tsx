import './HabitCharacter.css';

interface Props {
  completionRate: number;
}

type Mood = 'ecstatic' | 'happy' | 'neutral' | 'meh' | 'sad' | 'crying';

function getMood(rate: number): Mood {
  if (rate >= 90) return 'ecstatic';
  if (rate >= 70) return 'happy';
  if (rate >= 50) return 'neutral';
  if (rate >= 30) return 'meh';
  if (rate >= 10) return 'sad';
  return 'crying';
}

const BODY  = '#f5ddc8';
const EAR   = '#f2b4b4';
const DARK  = '#2d2926';
const CHEEK = '#f0a8a0';
const BLUE  = '#7ba7bc';
const GOLD  = '#d4a76a';
const ROSE  = '#e07878';

// ── helper: 4-point sparkle star ──────────────────────────────────────────
function Star({ x, y, r, cls }: { x: number; y: number; r: number; cls: string }) {
  const s = r, sm = r * 0.55;
  return (
    <g className={cls} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
      <line x1={x} y1={y - s}  x2={x} y2={y + s}  stroke={GOLD} strokeWidth={r * 0.38} strokeLinecap="round"/>
      <line x1={x - s} y1={y}  x2={x + s} y2={y}  stroke={GOLD} strokeWidth={r * 0.38} strokeLinecap="round"/>
      <line x1={x - sm} y1={y - sm} x2={x + sm} y2={y + sm} stroke={GOLD} strokeWidth={r * 0.24} strokeLinecap="round" opacity="0.65"/>
      <line x1={x + sm} y1={y - sm} x2={x - sm} y2={y + sm} stroke={GOLD} strokeWidth={r * 0.24} strokeLinecap="round" opacity="0.65"/>
    </g>
  );
}

// ── helper: heart shape ───────────────────────────────────────────────────
function Heart({ x, y, size, cls }: { x: number; y: number; size: number; cls: string }) {
  const s = size;
  return (
    <path
      className={cls}
      d={`M ${x} ${y + s * 0.3} C ${x} ${y - s * 0.1} ${x - s * 0.6} ${y - s * 0.6} ${x - s * 0.6} ${y - s * 0.1}
          C ${x - s * 0.6} ${y - s * 0.55} ${x} ${y - s * 0.7} ${x} ${y - s * 0.1}
          C ${x} ${y - s * 0.7} ${x + s * 0.6} ${y - s * 0.55} ${x + s * 0.6} ${y - s * 0.1}
          C ${x + s * 0.6} ${y - s * 0.6} ${x} ${y - s * 0.1} ${x} ${y + s * 0.3} Z`}
      fill={ROSE}
      opacity="0.75"
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    />
  );
}

export default function HabitCharacter({ completionRate }: Props) {
  const mood = getMood(completionRate);

  // ── derived body tint: becomes slightly grayer when very sad ──────────
  const bodyFill = mood === 'crying' ? '#e8d5c2' : BODY;
  const earFill  = mood === 'crying' ? '#e8aaaa' : EAR;

  return (
    <div className={`hc-root hc-${mood}`}>
      <div className="hc-wrap">
        <svg viewBox="0 0 100 100" width="96" height="96" overflow="visible">

          {/* ── Ears ── */}
          <circle cx="26" cy="22" r="14" fill={bodyFill}/>
          <circle cx="74" cy="22" r="14" fill={bodyFill}/>
          <circle cx="26" cy="22" r="8"  fill={earFill}/>
          <circle cx="74" cy="22" r="8"  fill={earFill}/>

          {/* ── Head / Body ── */}
          <circle cx="50" cy="54" r="37" fill={bodyFill}/>

          {/* ── Arms ── */}
          <ellipse cx="12" cy="65" rx="9" ry="14" fill={bodyFill} transform="rotate(15 12 65)"/>
          <ellipse cx="88" cy="65" rx="9" ry="14" fill={bodyFill} transform="rotate(-15 88 65)"/>

          {/* ═══════════════════════ CHEEKS ═══════════════════════ */}
          {(mood === 'ecstatic') && (
            <>
              <circle cx="24" cy="58" r="11" fill={CHEEK} opacity="0.6"/>
              <circle cx="76" cy="58" r="11" fill={CHEEK} opacity="0.6"/>
            </>
          )}
          {(mood === 'happy') && (
            <>
              <circle cx="26" cy="59" r="9" fill={CHEEK} opacity="0.5"/>
              <circle cx="74" cy="59" r="9" fill={CHEEK} opacity="0.5"/>
            </>
          )}
          {(mood === 'neutral') && (
            <>
              <circle cx="26" cy="59" r="8" fill={CHEEK} opacity="0.28"/>
              <circle cx="74" cy="59" r="8" fill={CHEEK} opacity="0.28"/>
            </>
          )}
          {(mood === 'crying') && (
            <>
              <circle cx="28" cy="59" r="7" fill={ROSE} opacity="0.3"/>
              <circle cx="72" cy="59" r="7" fill={ROSE} opacity="0.3"/>
            </>
          )}

          {/* ═══════════════════════ EYES ═══════════════════════ */}

          {/* ECSTATIC: ✦ star eyes */}
          {mood === 'ecstatic' && (
            <g>
              <line x1="38" y1="42" x2="38" y2="52" stroke={DARK} strokeWidth="3"   strokeLinecap="round"/>
              <line x1="33" y1="47" x2="43" y2="47" stroke={DARK} strokeWidth="3"   strokeLinecap="round"/>
              <line x1="34.5" y1="43.5" x2="41.5" y2="50.5" stroke={DARK} strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
              <line x1="41.5" y1="43.5" x2="34.5" y2="50.5" stroke={DARK} strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
              <line x1="62" y1="42" x2="62" y2="52" stroke={DARK} strokeWidth="3"   strokeLinecap="round"/>
              <line x1="57" y1="47" x2="67" y2="47" stroke={DARK} strokeWidth="3"   strokeLinecap="round"/>
              <line x1="58.5" y1="43.5" x2="65.5" y2="50.5" stroke={DARK} strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
              <line x1="65.5" y1="43.5" x2="58.5" y2="50.5" stroke={DARK} strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
            </g>
          )}

          {/* HAPPY: ^ ^ arcs */}
          {mood === 'happy' && (
            <g>
              <path d="M 33 47 Q 39 41 45 47" fill="none" stroke={DARK} strokeWidth="3" strokeLinecap="round"/>
              <path d="M 55 47 Q 61 41 67 47" fill="none" stroke={DARK} strokeWidth="3" strokeLinecap="round"/>
            </g>
          )}

          {/* NEUTRAL: round circles + blink */}
          {mood === 'neutral' && (
            <g className="hc-eyes-blink">
              <circle cx="38" cy="47" r="5.5" fill={DARK}/>
              <circle cx="40" cy="45" r="1.8" fill="white"/>
              <circle cx="62" cy="47" r="5.5" fill={DARK}/>
              <circle cx="64" cy="45" r="1.8" fill="white"/>
            </g>
          )}

          {/* MEH: half-lidded eyes */}
          {mood === 'meh' && (
            <g>
              {/* Left eye */}
              <circle cx="38" cy="48" r="5.5" fill={DARK}/>
              <circle cx="40" cy="46" r="1.6" fill="white" opacity="0.7"/>
              {/* Drooping eyelid */}
              <path d="M 32 45 Q 38 43 44 45" fill={bodyFill}/>
              {/* Right eye */}
              <circle cx="62" cy="48" r="5.5" fill={DARK}/>
              <circle cx="64" cy="46" r="1.6" fill="white" opacity="0.7"/>
              <path d="M 56 45 Q 62 43 68 45" fill={bodyFill}/>
            </g>
          )}

          {/* SAD: droopy filled arcs */}
          {mood === 'sad' && (
            <g>
              <path d="M 31 47 Q 38 58 45 47 Z" fill={DARK}/>
              <path d="M 55 47 Q 62 58 69 47 Z" fill={DARK}/>
            </g>
          )}

          {/* CRYING: tightly squinted eyes */}
          {mood === 'crying' && (
            <g>
              {/* Left squint: two close arcs */}
              <path d="M 32 45 Q 38 50 44 45" fill="none" stroke={DARK} strokeWidth="3"   strokeLinecap="round"/>
              <path d="M 33 48 Q 38 52 43 48" fill="none" stroke={DARK} strokeWidth="1.8" strokeLinecap="round" opacity="0.6"/>
              {/* Right squint */}
              <path d="M 56 45 Q 62 50 68 45" fill="none" stroke={DARK} strokeWidth="3"   strokeLinecap="round"/>
              <path d="M 57 48 Q 62 52 67 48" fill="none" stroke={DARK} strokeWidth="1.8" strokeLinecap="round" opacity="0.6"/>
            </g>
          )}

          {/* ═══════════════════════ NOSE ═══════════════════════ */}
          <ellipse cx="50" cy="57" rx="3.5" ry="2.5" fill={earFill} opacity="0.9"/>

          {/* ═══════════════════════ MOUTH ═══════════════════════ */}
          {mood === 'ecstatic' && (
            <>
              <path d="M 33 63 Q 50 76 67 63" fill="none" stroke={DARK} strokeWidth="2.4" strokeLinecap="round"/>
              {/* Teeth hint */}
              <path d="M 36 65 Q 50 74 64 65 Q 64 69 50 70 Q 36 69 36 65 Z" fill="white" opacity="0.55"/>
            </>
          )}
          {mood === 'happy' && (
            <path d="M 37 63 Q 50 73 63 63" fill="none" stroke={DARK} strokeWidth="2.2" strokeLinecap="round"/>
          )}
          {mood === 'neutral' && (
            <path d="M 40 63 Q 50 67 60 63" fill="none" stroke={DARK} strokeWidth="2" strokeLinecap="round"/>
          )}
          {mood === 'meh' && (
            <path d="M 39 64 Q 50 65 61 64" fill="none" stroke={DARK} strokeWidth="2" strokeLinecap="round"/>
          )}
          {mood === 'sad' && (
            <path d="M 38 67 Q 50 60 62 67" fill="none" stroke={DARK} strokeWidth="2" strokeLinecap="round"/>
          )}
          {mood === 'crying' && (
            /* Wavy/trembling frown */
            <path d="M 36 68 Q 41 63 46 66 Q 50 63 54 66 Q 59 63 64 68" fill="none" stroke={DARK} strokeWidth="2" strokeLinecap="round"/>
          )}

          {/* ═══════════════════════ EXTRAS ═══════════════════════ */}

          {/* ECSTATIC: many sparkles + hearts */}
          {mood === 'ecstatic' && (
            <>
              <Star x={7}  y={25} r={5.5} cls="hc-star1"/>
              <Star x={86} y={22} r={4.5} cls="hc-star2"/>
              <Star x={91} y={40} r={3}   cls="hc-star3"/>
              <Star x={4}  y={44} r={3}   cls="hc-star4"/>
              <Heart x={14}  y={42} size={6} cls="hc-heart1"/>
              <Heart x={84}  y={37} size={5} cls="hc-heart2"/>
            </>
          )}

          {/* HAPPY: sparkles */}
          {mood === 'happy' && (
            <>
              <Star x={8}  y={24} r={5}   cls="hc-star1"/>
              <Star x={85} y={22} r={4}   cls="hc-star2"/>
              <Star x={90} y={40} r={2.8} cls="hc-star3"/>
            </>
          )}

          {/* MEH: small sweat drop */}
          {mood === 'meh' && (
            <path d="M 78 28 Q 80 21 82 28 Q 82 33 80 34 Q 78 33 78 28 Z"
              fill={BLUE} opacity="0.4"/>
          )}

          {/* SAD: one tear + sweat drop */}
          {mood === 'sad' && (
            <>
              <path className="hc-tear hc-tear-l"
                d="M 36 54 Q 33 59 36 64 Q 39 59 36 54 Z"
                fill={BLUE} opacity="0.75"/>
              <path d="M 76 26 Q 78 19 80 26 Q 80 31 78 32 Q 76 31 76 26 Z"
                fill={BLUE} opacity="0.4"/>
            </>
          )}

          {/* CRYING: two tears + heavier drops */}
          {mood === 'crying' && (
            <>
              {/* Left tear stream */}
              <path className="hc-tear hc-tear-l"
                d="M 35 53 Q 31 60 35 68 Q 39 60 35 53 Z"
                fill={BLUE} opacity="0.8"/>
              <path className="hc-tear hc-tear-l2"
                d="M 33 60 Q 30 66 33 71 Q 36 66 33 60 Z"
                fill={BLUE} opacity="0.55"/>
              {/* Right tear stream */}
              <path className="hc-tear hc-tear-r"
                d="M 65 53 Q 61 60 65 68 Q 69 60 65 53 Z"
                fill={BLUE} opacity="0.8"/>
              <path className="hc-tear hc-tear-r2"
                d="M 67 60 Q 64 66 67 71 Q 70 66 67 60 Z"
                fill={BLUE} opacity="0.55"/>
              {/* Heavy sweat drops */}
              <path d="M 76 24 Q 79 16 82 24 Q 82 30 79 31 Q 76 30 76 24 Z"
                fill={BLUE} opacity="0.45"/>
              <path d="M 16 28 Q 18 22 20 28 Q 20 33 18 34 Q 16 33 16 28 Z"
                fill={BLUE} opacity="0.35"/>
            </>
          )}
        </svg>
      </div>

      {/* Score label under character */}
      <div className={`hc-label hc-label-${mood}`}>
        {mood === 'ecstatic' && '最高！🎉'}
        {mood === 'happy'    && 'いい調子！'}
        {mood === 'neutral'  && 'ぼちぼち'}
        {mood === 'meh'      && 'もうちょっと…'}
        {mood === 'sad'      && 'がんばろ…'}
        {mood === 'crying'   && 'ファイト！😭'}
      </div>
    </div>
  );
}
