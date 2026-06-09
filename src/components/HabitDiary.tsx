import { useState, useRef } from 'react';
import './HabitDiary.css';
import type { Habit, CompletionMap, FocusSession, SubCompletionMap } from '../types';
import AddHabitModal from './AddHabitModal';

function formatTimeShort(isoStr: string): string {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m === 0) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`;
}

const DAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

interface Props {
  habits: Habit[];
  completions: CompletionMap;
  subCompletions: SubCompletionMap;
  selectedDate: string;
  timeLogs: Record<string, number>;
  sessions: FocusSession[];
  activeItemId: string | null;
  timerRunning: boolean;
  colorMap: Record<string, string>;
  onToggle: (habitId: string, date: string) => void;
  onToggleSub: (habitId: string, subId: string, date: string) => void;
  onNavigate: (delta: -1 | 1) => void;
  onSelect: (id: string) => void;
  onAddHabit: (name: string, detail: string) => void;
  onRemoveHabit: (id: string) => void;
  onEditHabit: (id: string, name: string, detail: string, emoji?: string) => void;
  onAddSubHabit: (habitId: string, name: string, emoji: string) => void;
  onRemoveSubHabit: (habitId: string, subId: string) => void;
  onEditSubHabit: (habitId: string, subId: string, name: string, emoji: string) => void;
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}月${d}日（${DAY_JP[date.getDay()]}）`;
}

function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m === 0) return '';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// EditState: parent habit fields (name or detail only — no emoji)
type EditField = 'name' | 'detail';
type EditState = { habitId: string; field: EditField; value: string } | null;

// SubEditState: sub-habit name only
type SubEditState = { habitId: string; subId: string; name: string } | null;

export default function HabitDiary({
  habits, completions, subCompletions, selectedDate, timeLogs, sessions,
  activeItemId, timerRunning, colorMap,
  onToggle, onToggleSub, onNavigate, onSelect, onAddHabit,
  onRemoveHabit, onEditHabit, onAddSubHabit, onRemoveSubHabit, onEditSubHabit,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  // Parent habit context menu
  const [contextMenu, setContextMenu] = useState<{ habitId: string; x: number; y: number } | null>(null);
  // Parent habit inline edit
  const [editState, setEditState] = useState<EditState>(null);
  // Sub-habit expand state
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);
  // Sub-habit inline add form
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  // Sub-habit context menu
  const [subContextMenu, setSubContextMenu] = useState<{ habitId: string; subId: string; x: number; y: number } | null>(null);
  // Sub-habit inline edit
  const [subEditState, setSubEditState] = useState<SubEditState>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track if sub-edit is being cancelled (to skip onBlur save)
  const subEditCancelRef = useRef(false);

  // ── Helpers ─────────────────────────────────────────────────

  function closeAllMenus() {
    setContextMenu(null);
    setSubContextMenu(null);
  }

  function showParentMenu(e: React.MouseEvent, habitId: string) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 200);
    const y = Math.min(rect.bottom + 4, window.innerHeight - 160);
    setContextMenu({ habitId, x, y });
    setSubContextMenu(null);
  }

  function showSubMenu(e: React.MouseEvent | React.TouchEvent, habitId: string, subId: string) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth - 180);
    const y = Math.min(rect.bottom + 4, window.innerHeight - 100);
    setSubContextMenu({ habitId, subId, x, y });
    setContextMenu(null);
  }

  // Parent habit inline edit
  function startEdit(e: React.MouseEvent, habitId: string, field: EditField, value: string) {
    e.stopPropagation();
    setEditState({ habitId, field, value });
    closeAllMenus();
  }

  function commitEdit() {
    if (!editState) return;
    const habit = habits.find(h => h.id === editState.habitId);
    if (!habit) { setEditState(null); return; }
    if (editState.field === 'name') {
      onEditHabit(editState.habitId, editState.value.trim() || habit.name, habit.detail);
    } else {
      onEditHabit(editState.habitId, habit.name, editState.value.trim());
    }
    setEditState(null);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); setEditState(null); }
  }

  // Sub-habit inline edit
  function startSubEdit(habitId: string, subId: string, name: string) {
    subEditCancelRef.current = false;
    setSubEditState({ habitId, subId, name });
    setSubContextMenu(null);
  }

  function commitSubEdit() {
    if (!subEditState || subEditCancelRef.current) {
      setSubEditState(null);
      return;
    }
    onEditSubHabit(subEditState.habitId, subEditState.subId, subEditState.name, '');
    setSubEditState(null);
  }

  function cancelSubEdit() {
    subEditCancelRef.current = true;
    setSubEditState(null);
  }

  function handleSubEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commitSubEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelSubEdit(); }
  }

  // Add sub-habit
  function handleAddSub(habitId: string) {
    const trimName = newSubName.trim();
    if (!trimName) return;
    onAddSubHabit(habitId, trimName, '');
    setNewSubName('');
    setAddingSubFor(null);
  }

  function toggleExpand(habitId: string) {
    setExpandedHabitId(prev => prev === habitId ? null : habitId);
  }

  // Total time for a habit = own time + all sub-habit times
  function getHabitTotalSeconds(habit: Habit): number {
    let total = timeLogs[habit.id] ?? 0;
    (habit.subHabits ?? []).forEach(sh => { total += timeLogs[sh.id] ?? 0; });
    return total;
  }

  const completed = completions[selectedDate] ?? [];
  const completedCount = completed.length;
  const totalCount = habits.length;
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div
      className="hd-card card"
      onClick={closeAllMenus}
    >
      {/* ── Header ── */}
      <div className="hd-header">
        <div className="hd-header-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9a938c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <span className="hd-title">習慣ダイアリー</span>
        </div>
        <div className="hd-date-nav">
          <button type="button" className="hd-nav-btn" onClick={() => onNavigate(-1)}>&#8249;</button>
          <span className="hd-date-label">{formatDate(selectedDate)}</span>
          <button type="button" className="hd-nav-btn" onClick={() => onNavigate(1)}>&#8250;</button>
        </div>
        <button type="button" className="hd-add-btn-header" onClick={() => setShowModal(true)}>
          <span>+</span> 習慣を追加
        </button>
      </div>

      {/* ── Grid ── */}
      <div className="hd-grid">
        {habits.map(habit => {
          const isDone = completed.includes(habit.id);
          const isActive = activeItemId === habit.id;
          const totalSec = getHabitTotalSeconds(habit);
          const spentLabel = formatMinutes(totalSec);
          const color = colorMap[habit.id] ?? '#9a938c';
          const habitSessions = sessions.filter(s => s.itemId === habit.id);
          const subHabits = habit.subHabits ?? [];
          const hasSubHabits = subHabits.length > 0;
          const isExpanded = expandedHabitId === habit.id;
          const subDoneIds = (subCompletions[selectedDate]?.[habit.id]) ?? [];
          const isSubActive = subHabits.some(sh => activeItemId === sh.id);

          return (
            <div
              key={habit.id}
              className={[
                'hd-cell',
                isDone ? 'hd-cell--done' : '',
                (isActive || isSubActive) ? 'hd-cell--active' : '',
                isExpanded ? 'hd-cell--expanded' : '',
              ].filter(Boolean).join(' ')}
              style={(isActive || isSubActive) ? { borderColor: color, background: color + '10' } : undefined}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ habitId: habit.id, x: e.clientX, y: e.clientY });
                setSubContextMenu(null);
              }}
            >
              {/* ── Main row ── */}
              <div className="hd-cell-main">
                {/* Checkbox */}
                <button
                  type="button"
                  className="hd-checkbox-btn"
                  onClick={e => { e.stopPropagation(); onToggle(habit.id, selectedDate); }}
                >
                  {/* IMPORTANT: polyline always in DOM — opacity pattern for iOS WKWebView safety */}
                  <svg width="26" height="26" viewBox="0 0 28 28">
                    <circle cx="14" cy="14" r="13" fill={isDone ? '#2d2926' : 'none'} stroke={isDone ? '#2d2926' : '#ccc8c4'} strokeWidth="1.5"/>
                    <polyline points="8,14 12,18 20,10" fill="none" stroke="#fff" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" opacity={isDone ? 1 : 0}/>
                  </svg>
                </button>

                {/* Text block */}
                <div
                  className="hd-cell-text"
                  onClick={() => editState?.habitId !== habit.id && !timerRunning && onSelect(habit.id)}
                >
                  {/* Name */}
                  {editState?.habitId === habit.id && editState.field === 'name' ? (
                    <input
                      ref={inputRef}
                      className="hd-edit-input hd-edit-name"
                      value={editState.value}
                      autoFocus
                      onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                      onBlur={commitEdit}
                      onKeyDown={handleEditKeyDown}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <p className="hd-habit-name" onDoubleClick={e => startEdit(e, habit.id, 'name', habit.name)}>{habit.name}</p>
                  )}

                  {/* Detail */}
                  {editState?.habitId === habit.id && editState.field === 'detail' ? (
                    <input
                      ref={inputRef}
                      className="hd-edit-input hd-edit-detail"
                      value={editState.value}
                      autoFocus
                      onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                      onBlur={commitEdit}
                      onKeyDown={handleEditKeyDown}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <p className="hd-habit-detail" onDoubleClick={e => startEdit(e, habit.id, 'detail', habit.detail)}>{habit.detail}</p>
                  )}

                  {/* Time spent */}
                  {spentLabel && (
                    <span className="hd-spent" style={{ background: color + '22', color }}>{spentLabel}</span>
                  )}

                  {/* Session log */}
                  {habitSessions.length > 0 && (
                    <div className="hd-cell-sessions">
                      {habitSessions.map(s => (
                        <span key={s.id} className="hd-session-entry" style={{ color }}>
                          <span className="hd-session-time">{formatTimeShort(s.startTime)} → {formatTimeShort(s.endTime)}</span>
                          <span className="hd-session-dur"> · {formatDurationShort(s.durationSeconds)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Running dot (parent) */}
                {isActive && timerRunning && (
                  <span className="hd-running-dot" style={{ background: color }} />
                )}

                {/* Expand toggle (show only when has sub-habits) */}
                {hasSubHabits && (
                  <button
                    type="button"
                    className={`hd-expand-btn${isExpanded ? ' hd-expand-btn--open' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleExpand(habit.id); }}
                    aria-label={isExpanded ? '折りたたむ' : 'サブ習慣を表示'}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" opacity={1}/>
                    </svg>
                  </button>
                )}

                {/* Parent kebab ⋮ */}
                <button
                  type="button"
                  className="hd-kebab-btn"
                  onClick={e => showParentMenu(e, habit.id)}
                  aria-label="メニューを開く"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                  </svg>
                </button>
              </div>

              {/* ── Sub-habits section ── */}
              {isExpanded && (
                <div
                  className="hd-sub-list"
                  style={{
                    borderLeftColor: color,
                    background: color + '1a',   /* ~10% opacity tint of habit color */
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Sub-list header: label + done/total */}
                  <div className="hd-sub-list-header" style={{ borderBottomColor: color + '30' }}>
                    <span className="hd-sub-list-label" style={{ color }}>サブ習慣</span>
                    <span className="hd-sub-list-count" style={{ color: color + 'bb' }}>
                      {subDoneIds.length} / {subHabits.length}
                    </span>
                  </div>

                  {subHabits.map((sh, idx) => {
                    const shDone = subDoneIds.includes(sh.id);
                    const shActive = activeItemId === sh.id;
                    const shSec = timeLogs[sh.id] ?? 0;
                    const shSpentLabel = formatMinutes(shSec);
                    const shSessions = sessions.filter(s => s.itemId === sh.id);
                    const isEditing = subEditState?.subId === sh.id;

                    return (
                      <div
                        key={sh.id}
                        className={[
                          'hd-sub-row',
                          shDone ? 'hd-sub-row--done' : '',
                          shActive ? 'hd-sub-row--active' : '',
                          idx < subHabits.length - 1 ? 'hd-sub-row--divider' : '',
                        ].filter(Boolean).join(' ')}
                        onContextMenu={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSubContextMenu({ habitId: habit.id, subId: sh.id, x: e.clientX, y: e.clientY });
                          setContextMenu(null);
                        }}
                      >
                        {/* Sub checkbox — rounded square (visually distinct from parent circle) */}
                        <button
                          type="button"
                          className="hd-sub-checkbox"
                          onClick={e => { e.stopPropagation(); onToggleSub(habit.id, sh.id, selectedDate); }}
                        >
                          {/* IMPORTANT: polyline always in DOM — opacity pattern for iOS WKWebView safety */}
                          <svg width="20" height="20" viewBox="0 0 20 20">
                            <rect x="1.5" y="1.5" width="17" height="17" rx="4.5"
                              fill={shDone ? color : 'none'}
                              stroke={shDone ? color : '#ccc8c4'}
                              strokeWidth="1.5"/>
                            <polyline points="4.5,10 8,13.5 15.5,6.5" fill="none" stroke="#fff" strokeWidth="1.8"
                              strokeLinecap="round" strokeLinejoin="round" opacity={shDone ? 1 : 0}/>
                          </svg>
                        </button>

                        {/* ── Name / Edit mode ── */}
                        {isEditing ? (
                          <div className="hd-sub-edit-row" onClick={e => e.stopPropagation()}>
                            <input
                              className="hd-sub-edit-name"
                              value={subEditState!.name}
                              autoFocus
                              onChange={e => setSubEditState(prev => prev ? { ...prev, name: e.target.value } : null)}
                              onBlur={commitSubEdit}
                              onKeyDown={handleSubEditKeyDown}
                              onClick={e => e.stopPropagation()}
                            />
                            <button
                              type="button"
                              className="hd-sub-edit-save"
                              onMouseDown={e => { e.preventDefault(); commitSubEdit(); }}
                            >✓</button>
                            <button
                              type="button"
                              className="hd-sub-edit-cancel"
                              onMouseDown={e => { e.preventDefault(); cancelSubEdit(); }}
                            >×</button>
                          </div>
                        ) : (
                          <span
                            className="hd-sub-name"
                            onDoubleClick={e => { e.stopPropagation(); startSubEdit(habit.id, sh.id, sh.name); }}
                          >
                            {sh.name}
                          </span>
                        )}

                        {/* Time spent badge */}
                        {shSpentLabel && !isEditing && (
                          <span className="hd-sub-spent" style={{ background: color + '20', color }}>{shSpentLabel}</span>
                        )}

                        {/* Running dot */}
                        {shActive && timerRunning && !isEditing && (
                          <span className="hd-running-dot hd-sub-running" style={{ background: color }} />
                        )}

                        {/* Timer select ▷ */}
                        {!isEditing && (
                          <button
                            type="button"
                            className={`hd-sub-timer-btn${shActive ? ' hd-sub-timer-btn--active' : ''}`}
                            style={shActive ? { background: color, color: '#fff', borderColor: color } : undefined}
                            onClick={e => { e.stopPropagation(); !timerRunning && onSelect(sh.id); }}
                            title="フォーカスタイマーで計測"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5,3 19,12 5,21"/>
                            </svg>
                          </button>
                        )}

                        {/* Sub-habit kebab ⋮ */}
                        {!isEditing && (
                          <button
                            type="button"
                            className="hd-sub-kebab"
                            onClick={e => showSubMenu(e, habit.id, sh.id)}
                            aria-label="サブ習慣のメニュー"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                            </svg>
                          </button>
                        )}

                        {/* Session log */}
                        {shSessions.length > 0 && !isEditing && (
                          <div className="hd-sub-sessions">
                            {shSessions.map(s => (
                              <span key={s.id} className="hd-session-entry" style={{ color }}>
                                <span className="hd-session-time">{formatTimeShort(s.startTime)} → {formatTimeShort(s.endTime)}</span>
                                <span className="hd-session-dur"> · {formatDurationShort(s.durationSeconds)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ── Inline add sub-habit form ── */}
                  {addingSubFor === habit.id ? (
                    <div className="hd-sub-add-form" onClick={e => e.stopPropagation()}>
                      <input
                        className="hd-sub-add-name"
                        placeholder="サブ習慣名を入力..."
                        value={newSubName}
                        autoFocus
                        onChange={e => setNewSubName(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          e.stopPropagation();
                          if (e.key === 'Enter') handleAddSub(habit.id);
                          if (e.key === 'Escape') {
                            setAddingSubFor(null);
                            setNewSubName('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="hd-sub-add-submit"
                        onClick={e => { e.stopPropagation(); handleAddSub(habit.id); }}
                        disabled={!newSubName.trim()}
                      >追加</button>
                      <button
                        type="button"
                        className="hd-sub-add-cancel"
                        onClick={e => {
                          e.stopPropagation();
                          setAddingSubFor(null);
                          setNewSubName('');
                        }}
                      >×</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="hd-sub-add-btn"
                      onClick={e => {
                        e.stopPropagation();
                        setAddingSubFor(habit.id);
                        setExpandedHabitId(habit.id);
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      サブ習慣を追加
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="hd-footer">
        <div className="hd-progress-info">
          <span className="hd-progress-text">{completedCount} / {totalCount} 習慣完了</span>
        </div>
        <div className="hd-progress-track">
          <div className="hd-progress-fill" style={{ width: `${completionRate}%` }} />
        </div>
      </div>

      {/* ── Add habit modal ── */}
      {showModal && (
        <AddHabitModal
          onAdd={(name, detail) => { onAddHabit(name, detail); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── Parent habit context menu ── */}
      {contextMenu && (
        <div
          className="hd-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button type="button" className="hd-context-item" onClick={() => {
            const habit = habits.find(h => h.id === contextMenu.habitId);
            if (habit) setEditState({ habitId: habit.id, field: 'name', value: habit.name });
            setContextMenu(null);
          }}>✏️ 名前を編集</button>

          <button type="button" className="hd-context-item" onClick={() => {
            const habit = habits.find(h => h.id === contextMenu.habitId);
            if (habit) setEditState({ habitId: habit.id, field: 'detail', value: habit.detail });
            setContextMenu(null);
          }}>📝 詳細を編集</button>

          <button type="button" className="hd-context-item" onClick={() => {
            setExpandedHabitId(contextMenu.habitId);
            setAddingSubFor(contextMenu.habitId);
            setContextMenu(null);
          }}>＋ サブ習慣を追加</button>

          <button type="button" className="hd-context-item hd-context-delete"
            onClick={() => { onRemoveHabit(contextMenu.habitId); setContextMenu(null); }}>
            🗑️ 習慣を削除
          </button>
        </div>
      )}

      {/* ── Sub-habit context menu ── */}
      {subContextMenu && (
        <div
          className="hd-context-menu"
          style={{ top: subContextMenu.y, left: subContextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button type="button" className="hd-context-item" onClick={() => {
            const habit = habits.find(h => h.id === subContextMenu.habitId);
            const sh = habit?.subHabits?.find(s => s.id === subContextMenu.subId);
            if (sh) startSubEdit(subContextMenu.habitId, sh.id, sh.name);
            setSubContextMenu(null);
          }}>✏️ 名前を編集</button>

          <button type="button" className="hd-context-item hd-context-delete" onClick={() => {
            onRemoveSubHabit(subContextMenu.habitId, subContextMenu.subId);
            setSubContextMenu(null);
          }}>🗑️ 削除</button>
        </div>
      )}
    </div>
  );
}
