import { useState } from 'react';
import './SessionEditModal.css';
import type { FocusSession } from '../types';

export interface SessionItemOption {
  id: string;
  name: string;
  color: string;
  group: string;
}

interface Props {
  mode: 'add' | 'edit';
  /** 編集対象のセッション（mode === 'add' のときは null） */
  session: FocusSession | null;
  items: SessionItemOption[];
  /** 追加モードの初期日付 YYYY-MM-DD */
  defaultDate: string;
  /** 追加モードの初期選択項目 */
  defaultItemId?: string | null;
  onSave: (data: {
    itemId: string | null;
    startTime: string;
    endTime: string;
    durationSeconds: number;
    notes: string;
  }) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const MAX_MINUTES = 24 * 60;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateStrOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeStrOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'YYYY-MM-DD' + 'HH:MM' → ローカル時刻の Date */
function toDate(dateStr: string, timeStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  return new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
}

function clampMinutes(m: number): number {
  return Math.max(1, Math.min(MAX_MINUTES, Math.round(m)));
}

export default function SessionEditModal({
  mode, session, items, defaultDate, defaultItemId, onSave, onDelete, onClose,
}: Props) {
  const initialStart = session ? new Date(session.startTime) : null;

  const [itemId, setItemId] = useState<string>(
    session ? (session.itemId ?? '') : (defaultItemId ?? ''),
  );
  const [date, setDate] = useState<string>(
    initialStart ? dateStrOf(initialStart) : defaultDate,
  );
  const [start, setStart] = useState<string>(
    initialStart ? timeStrOf(initialStart) : timeStrOf(new Date()),
  );
  // 実時間（分）が正。終了時刻はここから逆算するので、両者がズレることはない
  const [durationMin, setDurationMin] = useState<number>(
    session ? clampMinutes(session.durationSeconds / 60) : 30,
  );
  const [notes, setNotes] = useState<string>(session?.notes ?? '');

  const startDate = toDate(date, start);
  const endDate = new Date(startDate.getTime() + durationMin * 60_000);
  const crossesMidnight = dateStrOf(endDate) !== date;

  const hours = Math.floor(durationMin / 60);
  const minutes = durationMin % 60;

  /** 終了時刻を直接いじられたら、そこから実時間を計算し直す（日をまたぐ場合は +24h 扱い） */
  function handleEndChange(value: string) {
    if (!value) return;
    const [h, mi] = value.split(':').map(Number);
    let diff = (h * 60 + mi) - (startDate.getHours() * 60 + startDate.getMinutes());
    if (diff <= 0) diff += MAX_MINUTES;
    setDurationMin(clampMinutes(diff));
  }

  function setHours(h: number) {
    setDurationMin(clampMinutes((Number.isFinite(h) ? h : 0) * 60 + minutes));
  }

  function setMinutes(m: number) {
    setDurationMin(clampMinutes(hours * 60 + (Number.isFinite(m) ? m : 0)));
  }

  function bump(delta: number) {
    setDurationMin(clampMinutes(durationMin + delta));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      itemId: itemId || null,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      durationSeconds: durationMin * 60,
      notes: notes.trim(),
    });
  }

  // 項目をグループごとにまとめる（習慣 → タスク の順）
  const groups: { name: string; options: SessionItemOption[] }[] = [];
  items.forEach(item => {
    const g = groups.find(x => x.name === item.group);
    if (g) g.options.push(item);
    else groups.push({ name: item.group, options: [item] });
  });

  const selectedColor = items.find(i => i.id === itemId)?.color ?? null;

  return (
    <div className="sem-overlay" onClick={onClose}>
      <div className="sem-card" onClick={e => e.stopPropagation()}>
        <div className="sem-header">
          <h3 className="sem-title">
            {mode === 'edit' ? '実時間を訂正' : '時間を手動で記録'}
          </h3>
          <button type="button" className="sem-close" onClick={onClose} aria-label="閉じる">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <p className="sem-lead">
          {mode === 'edit'
            ? 'タイマーを止め忘れた・回し忘れたときは、実際に費やした時間に書き換えてな。グラフの合計も一緒に直るで。'
            : 'タイマーを回さずにやった分を、あとから記録できるで。'}
        </p>

        <form onSubmit={handleSubmit} className="sem-form">
          <div className="sem-field">
            <label className="sem-label">項目</label>
            <div className="sem-select-wrap">
              {selectedColor && <span className="sem-dot" style={{ background: selectedColor }} />}
              <select
                className={`sem-select${selectedColor ? ' sem-select--dotted' : ''}`}
                value={itemId}
                onChange={e => setItemId(e.target.value)}
              >
                <option value="">（項目なし）</option>
                {groups.map(g => (
                  <optgroup key={g.name} label={g.name}>
                    {g.options.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {!itemId && (
              <p className="sem-note">項目を選ばへんと、集計グラフには反映されへんで。</p>
            )}
          </div>

          <div className="sem-row">
            <div className="sem-field sem-field--grow">
              <label className="sem-label">日付</label>
              <input
                className="sem-input"
                type="date"
                value={date}
                onChange={e => e.target.value && setDate(e.target.value)}
              />
            </div>
            <div className="sem-field">
              <label className="sem-label">開始</label>
              <input
                className="sem-input"
                type="time"
                value={start}
                onChange={e => e.target.value && setStart(e.target.value)}
              />
            </div>
            <div className="sem-field">
              <label className="sem-label">終了</label>
              <input
                className="sem-input"
                type="time"
                value={timeStrOf(endDate)}
                onChange={e => handleEndChange(e.target.value)}
              />
            </div>
          </div>

          <div className="sem-field">
            <label className="sem-label">実際に費やした時間</label>
            <div className="sem-duration">
              <div className="sem-dur-input">
                <input
                  className="sem-input sem-input--num"
                  type="number"
                  min={0}
                  max={24}
                  value={hours}
                  onChange={e => setHours(Number(e.target.value))}
                />
                <span className="sem-unit">時間</span>
              </div>
              <div className="sem-dur-input">
                <input
                  className="sem-input sem-input--num"
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={e => setMinutes(Number(e.target.value))}
                />
                <span className="sem-unit">分</span>
              </div>
            </div>
            <div className="sem-bumps">
              {[-15, -5, 5, 15].map(d => (
                <button
                  key={d}
                  type="button"
                  className="sem-bump"
                  onClick={() => bump(d)}
                >
                  {d > 0 ? `+${d}分` : `${d}分`}
                </button>
              ))}
            </div>
            {crossesMidnight && (
              <p className="sem-note">終了が翌日（{dateStrOf(endDate).slice(5).replace('-', '/')}）になるで。</p>
            )}
          </div>

          <div className="sem-field">
            <label className="sem-label">メモ</label>
            <textarea
              className="sem-input sem-textarea"
              rows={2}
              placeholder="訂正した理由など"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="sem-actions">
            {mode === 'edit' && onDelete && (
              <button type="button" className="sem-btn sem-btn--del" onClick={onDelete}>
                削除
              </button>
            )}
            <span className="sem-spacer" />
            <button type="button" className="sem-btn sem-btn--cancel" onClick={onClose}>
              キャンセル
            </button>
            <button type="submit" className="sem-btn sem-btn--save">
              {mode === 'edit' ? '訂正を保存' : '記録する'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
