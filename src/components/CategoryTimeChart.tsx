import { useMemo, useState } from 'react';
import './CategoryTimeChart.css';
import type { Habit, Task, CompletedTask, TimeLog } from '../types';

type Period = '1日' | '1週' | '1ヶ月' | '3ヶ月' | '半年' | '1年';

const PERIODS: Period[] = ['1日', '1週', '1ヶ月', '3ヶ月', '半年', '1年'];
const PERIOD_DAYS: Record<Period, number> = {
  '1日': 1, '1週': 7, '1ヶ月': 30, '3ヶ月': 90, '半年': 180, '1年': 365,
};
const DAY_JP = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_SECONDS = 24 * 3600;
const FALLBACK_COLOR = '#ccc8c4';

interface Props {
  habits: Habit[];
  tasks: Task[];
  completedTasks: CompletedTask[];
  timeLogs: TimeLog;
  colorMap: Record<string, string>;
  /** その日のその項目の合計時間を直接書き換える（0 で記録を消す） */
  onSetItemTime: (date: string, itemId: string, seconds: number) => void;
}

interface Row { itemId: string; name: string; color: string; seconds: number; }

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftKey(key: string, days: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function fmtDay(key: string, withYear = false): string {
  const d = parseKey(key);
  return `${withYear ? d.getFullYear() + '/' : ''}${d.getMonth() + 1}/${d.getDate()}（${DAY_JP[d.getDay()]}）`;
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
 * 項目別の合計時間（縦 = 項目、横 = 時間）。
 * ログが残っている項目はまとめずにそのまま全部出す。
 * 「1日」表示では各項目の時間を直接訂正できる。
 */
export default function CategoryTimeChart({ habits, tasks, completedTasks, timeLogs, colorMap, onSetItemTime }: Props) {
  const todayKey = localDateKey(new Date());
  const [period, setPeriod] = useState<Period>('1週');
  // 表示期間の最終日
  const [endKey, setEndKey] = useState(todayKey);
  // 期間表示で、日別の内訳を開いている項目
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 1日表示で訂正中の項目
  const [editing, setEditing] = useState<{ itemId: string; hours: string; minutes: string } | null>(null);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    habits.forEach(h => {
      map.set(h.id, `${h.emoji ? h.emoji + ' ' : ''}${h.name}`);
      h.subHabits?.forEach(sh => map.set(sh.id, `${h.name} › ${sh.emoji ? sh.emoji + ' ' : ''}${sh.name}`));
    });
    [...tasks, ...completedTasks].forEach(t => { if (!map.has(t.id)) map.set(t.id, t.title); });
    return map;
  }, [habits, tasks, completedTasks]);

  const days = PERIOD_DAYS[period];
  const startKey = shiftKey(endKey, -(days - 1));

  const rows: Row[] = useMemo(() => {
    const totals = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      Object.entries(timeLogs[shiftKey(startKey, i)] ?? {}).forEach(([itemId, seconds]) => {
        if (seconds > 0) totals.set(itemId, (totals.get(itemId) ?? 0) + seconds);
      });
    }
    return [...totals.entries()]
      .map(([itemId, seconds]) => ({
        itemId,
        name: nameOf.get(itemId) ?? '削除済みの項目',
        color: colorMap[itemId] ?? FALLBACK_COLOR,
        seconds,
      }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [timeLogs, startKey, days, nameOf, colorMap]);

  // 1日の合計が24時間を超えている日（タイマーの止め忘れなど、明らかにおかしい記録）
  const overDays = useMemo(() => {
    return Object.entries(timeLogs)
      .map(([key, log]) => ({ key, seconds: Object.values(log).reduce((s, v) => s + v, 0) }))
      .filter(d => d.seconds > DAY_SECONDS)
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [timeLogs]);

  // 開いている項目の日別内訳（長い順 = おかしい記録が上に来る）
  const expandedDays = useMemo(() => {
    if (!expandedId || period === '1日') return [];
    const list: { key: string; seconds: number }[] = [];
    for (let i = 0; i < days; i++) {
      const key = shiftKey(startKey, i);
      const seconds = timeLogs[key]?.[expandedId] ?? 0;
      if (seconds > 0) list.push({ key, seconds });
    }
    return list.sort((a, b) => b.seconds - a.seconds);
  }, [expandedId, period, days, startKey, timeLogs]);

  const total = rows.reduce((s, r) => s + r.seconds, 0);
  const maxSeconds = Math.max(...rows.map(r => r.seconds), 1);
  const isDay = period === '1日';
  const rangeLabel = isDay ? fmtDay(endKey, true) : `${fmtDay(startKey)} – ${fmtDay(endKey)}`;

  function changePeriod(p: Period) {
    setPeriod(p);
    setExpandedId(null);
    setEditing(null);
  }

  function changeEnd(key: string) {
    if (!key) return;
    setEndKey(key > todayKey ? todayKey : key);
    setEditing(null);
  }

  /** その日の「1日」表示に飛ぶ（訂正はそこで行う） */
  function openDay(key: string) {
    setPeriod('1日');
    setEndKey(key);
    setExpandedId(null);
    setEditing(null);
  }

  function startEdit(row: Row) {
    const m = Math.round(row.seconds / 60);
    setEditing({ itemId: row.itemId, hours: String(Math.floor(m / 60)), minutes: String(m % 60) });
  }

  const editSeconds = editing
    ? (Math.max(0, Number(editing.hours) || 0) * 60 + Math.max(0, Number(editing.minutes) || 0)) * 60
    : 0;
  const editInvalid = editSeconds > DAY_SECONDS;

  function saveEdit() {
    if (!editing || editInvalid) return;
    onSetItemTime(endKey, editing.itemId, editSeconds);
    setEditing(null);
  }

  return (
    <div className="ctc-card card">
      <div className="ctc-header">
        <span className="ctc-title">項目別の時間</span>
        <span className="ctc-total">{fmtDuration(total)}</span>
      </div>

      <div className="ctc-tabs">
        {PERIODS.map(p => (
          <button
            type="button"
            key={p}
            className={`ctc-tab${period === p ? ' ctc-tab--active' : ''}`}
            onClick={() => changePeriod(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="ctc-nav">
        <button type="button" className="ctc-nav-btn" onClick={() => changeEnd(shiftKey(endKey, -days))} aria-label="前の期間">‹</button>
        <span className="ctc-nav-label">{rangeLabel}</span>
        <button type="button" className="ctc-nav-btn" onClick={() => changeEnd(shiftKey(endKey, days))} disabled={endKey >= todayKey} aria-label="次の期間">›</button>
        <input
          type="date"
          className="ctc-date-input"
          value={endKey}
          max={todayKey}
          onChange={e => changeEnd(e.target.value)}
          aria-label={isDay ? '日付を選ぶ' : '期間の最終日を選ぶ'}
        />
        {endKey !== todayKey && (
          <button type="button" className="ctc-today-btn" onClick={() => changeEnd(todayKey)}>今日</button>
        )}
      </div>

      {overDays.length > 0 && (
        <div className="ctc-warn">
          <p className="ctc-warn-title">24時間を超えている日があるで（タップして訂正）</p>
          <div className="ctc-warn-list">
            {overDays.map(d => (
              <button type="button" key={d.key} className="ctc-warn-chip" onClick={() => openDay(d.key)}>
                {fmtDay(d.key, true)} <strong>{fmtDuration(d.seconds)}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ctc-rows">
        {rows.length === 0 ? (
          <p className="ctc-empty">この期間の記録はありません</p>
        ) : rows.map(row => {
          const isEditing = editing?.itemId === row.itemId;
          const isExpanded = expandedId === row.itemId && !isDay;
          return (
            <div key={row.itemId} className="ctc-item">
              <button
                type="button"
                className="ctc-row"
                onClick={() => (isDay ? startEdit(row) : setExpandedId(isExpanded ? null : row.itemId))}
                title={isDay ? 'タップして時間を訂正' : 'タップして日別の内訳を表示'}
              >
                <span className="ctc-dot" style={{ background: row.color }} />
                <span className="ctc-row-name">{row.name}</span>
                <span className="ctc-track">
                  <span className="ctc-fill" style={{ width: `${(row.seconds / maxSeconds) * 100}%`, background: row.color }} />
                </span>
                <span className="ctc-row-time">{fmtDuration(row.seconds)}</span>
                <span className="ctc-row-action" aria-hidden="true">{isDay ? '✎' : isExpanded ? '▾' : '▸'}</span>
              </button>

              {isEditing && editing && (
                <div className="ctc-edit">
                  <label className="ctc-edit-field">
                    <input
                      type="number" inputMode="numeric" min={0} max={24}
                      value={editing.hours}
                      onChange={e => setEditing({ ...editing, hours: e.target.value })}
                    />
                    時間
                  </label>
                  <label className="ctc-edit-field">
                    <input
                      type="number" inputMode="numeric" min={0} max={59}
                      value={editing.minutes}
                      onChange={e => setEditing({ ...editing, minutes: e.target.value })}
                    />
                    分
                  </label>
                  <button type="button" className="ctc-edit-save" onClick={saveEdit} disabled={editInvalid}>
                    {editSeconds === 0 ? '記録を消す' : '保存'}
                  </button>
                  <button type="button" className="ctc-edit-cancel" onClick={() => setEditing(null)}>やめる</button>
                  <p className="ctc-edit-note">
                    {editInvalid
                      ? '1日は24時間までやで。'
                      : `${fmtDay(endKey)}の「${row.name}」を ${fmtDuration(editSeconds)} に直す。この日のこの項目のセッション記録は1件にまとめ直すで。`}
                  </p>
                </div>
              )}

              {isExpanded && (
                <div className="ctc-days">
                  {expandedDays.map(d => (
                    <button type="button" key={d.key} className="ctc-day-row" onClick={() => openDay(d.key)}>
                      <span className="ctc-day-date">{fmtDay(d.key, true)}</span>
                      <span className={`ctc-day-time${d.seconds > DAY_SECONDS ? ' ctc-day-time--over' : ''}`}>
                        {fmtDuration(d.seconds)}
                      </span>
                      <span className="ctc-row-action" aria-hidden="true">✎</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ctc-footer">
        <span className="ctc-avg-label">{isDay ? 'この日の合計' : '1日あたりの平均'}</span>
        <span className="ctc-avg-value">{fmtDuration(isDay ? total : Math.round(total / days))}</span>
      </div>
    </div>
  );
}
