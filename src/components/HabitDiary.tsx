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
  onEditHabit: (id: string, name: string, detail: string) => void;
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

type EditState = { habitId: string; field: 'name' | 'detail'; value: string } | null;

export default function HabitDiary({
  habits, completions, subCompletions, selectedDate, timeLogs, sessions,
  activeItemId, timerRunning, colorMap,
  onToggle, onToggleSub, onNavigate, onSelect, onAddHabit,
  onRemoveHabit, onEditHabit, onAddSubHabit, onRemoveSubHabit, onEditSubHabit,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ habitId: string; x: number; y: number } | null>(null);
  const [editState, setEditState] = useState<EditState>(null);
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);
  // Sub-habit adding inline form
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [newSubEmoji, setNewSubEmoji] = useState('');
  // Sub-habit context menu
  const [subContextMenu, setSubContextMenu] = useState<{ habitId: string; subId: string; x: number; y: number } | null>(null);
  // Sub-habit inline edit
  const [subEditState, setSubEditState] = useState<{ habitId: string; subId: string; name: string; emoji: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function showCellMenu(e: React.MouseEvent, habitId: string) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ habitId, x: rect.left, y: rect.bottom + 4 });
    setSubContextMenu(null);
  }

  function startEdit(e: React.MouseEvent, habitId: string, field: 'name' | 'detail', currentValue: string) {
    e.stopPropagation();
    setEditState({ habitId, field, value: currentValue });
  }

  function commitEdit() {
    if (!editState) return;
    const habit = habits.find(h => h.id === editState.habitId);
    if (!habit) { setEditState(null); return; }
    const name  = editState.field === 'name'   ? editState.value.trim() || habit.name : habit.name;
    const detail = editState.field === 'detail' ? editState.value.trim()               : habit.detail;
    onEditHabit(editState.habitId, name, detail);
    setEditState(null);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); setEditState(null); }
  }

  function handleAddSub(habitId: string) {
    const trimName = newSubName.trim();
    if (!trimName) return;
    onAddSubHabit(habitId, trimName, newSubEmoji.trim());
    setNewSubName('');
    setNewSubEmoji('');
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
    <div className="hd-card card" onClick={() => { contextMenu && setContextMenu(null); subContextMenu && setSubContextMenu(null); }}>
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

      <div className="hd-grid">
        {habits.map(habit => {
          const isDone = completed.includes(habit.id);
          const isActive = activeItemId === habit.id;
          const totalSec = getHabitTotalSeconds(habit);
          const spentLabel = formatMinutes(totalSec);
          const color = colorMap[habit.id] ?? '#9a938c';
          const habitSessions = sessions.filter(s => s.itemId === habit.id);
          const hasSubHabits = (habit.subHabits?.length ?? 0) > 0;
          const isExpanded = expandedHabitId === habit.id;
          const subDoneIds = (subCompletions[selectedDate]?.[habit.id]) ?? [];

          // Is any sub-habit currently active in the timer?
          const subHabits = habit.subHabits ?? [];
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
              onContextMenu={e => { e.preventDefault(); setContextMenu({ habitId: habit.id, x: e.clientX, y: e.clientY }); }}
            >
              {/* ── Main row ── */}
              <div className="hd-cell-main">
                {/* Checkbox */}
                <button
                  type="button"
                  className="hd-checkbox-btn"
                  onClick={e => { e.stopPropagation(); onToggle(habit.id, selectedDate); }}
                >
                  {/* IMPORTANT: polyline is always in DOM — never conditionally added/removed.
                      iOS WKWebView throws NOT_FOUND_ERR when React inserts/removes SVG child
                      nodes during CSS animations. Use opacity attribute instead. */}
                  <svg width="26" height="26" viewBox="0 0 28 28">
                    <circle cx="14" cy="14" r="13" fill={isDone ? '#2d2926' : 'none'} stroke={isDone ? '#2d2926' : '#ccc8c4'} strokeWidth="1.5"/>
                    <polyline points="8,14 12,18 20,10" fill="none" stroke="#fff" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" opacity={isDone ? 1 : 0}/>
                  </svg>
                </button>

                {/* Text */}
                <div
                  className="hd-cell-text"
                  onClick={() => editState?.habitId !== habit.id && !timerRunning && onSelect(habit.id)}
                >
                  {editState?.habitId === habit.id && editState.field === 'name' ? (
                    <input ref={inputRef} className="hd-edit-input hd-edit-name"
                      value={editState.value} autoFocus
                      onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                      onBlur={commitEdit} onKeyDown={handleEditKeyDown} onClick={e => e.stopPropagation()}/>
                  ) : (
                    <p className="hd-habit-name" onDoubleClick={e => startEdit(e, habit.id, 'name', habit.name)}>{habit.name}</p>
                  )}
                  {editState?.habitId === habit.id && editState.field === 'detail' ? (
                    <input ref={inputRef} className="hd-edit-input hd-edit-detail"
                      value={editState.value} autoFocus
                      onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                      onBlur={commitEdit} onKeyDown={handleEditKeyDown} onClick={e => e.stopPropagation()}/>
                  ) : (
                    <p className="hd-habit-detail" onDoubleClick={e => startEdit(e, habit.id, 'detail', habit.detail)}>{habit.detail}</p>
                  )}
                  {spentLabel && (
                    <span className="hd-spent" style={{ background: color + '22', color }}>{spentLabel}</span>
                  )}
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

                {/* Sub-habits expand toggle */}
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

                {/* Kebab menu */}
                <button
                  type="button"
                  className="hd-kebab-btn"
                  onClick={e => showCellMenu(e, habit.id)}
                  aria-label="More options"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
                  </svg>
                </button>
              </div>

              {/* ── Sub-habits section ── */}
              {isExpanded && (
                <div className="hd-sub-list">
                  {subHabits.map(sh => {
                    const shDone = subDoneIds.includes(sh.id);
                    const shActive = activeItemId === sh.id;
                    const shSec = timeLogs[sh.id] ?? 0;
                    const shSpentLabel = formatMinutes(shSec);
                    const shSessions = sessions.filter(s => s.itemId === sh.id);

                    return (
                      <div
                        key={sh.id}
                        className={`hd-sub-row${shDone ? ' hd-sub-row--done' : ''}${shActive ? ' hd-sub-row--active' : ''}`}
                        onContextMenu={e => { e.preventDefault(); setSubContextMenu({ habitId: habit.id, subId: sh.id, x: e.clientX, y: e.clientY }); }}
                      >
                        {/* Sub checkbox */}
                        <button
                          type="button"
                          className="hd-sub-checkbox"
                          onClick={e => { e.stopPropagation(); onToggleSub(habit.id, sh.id, selectedDate); }}
                        >
                          {/* IMPORTANT: polyline always in DOM — opacity pattern for iOS WKWebView */}
                          <svg width="20" height="20" viewBox="0 0 20 20">
                            <circle cx="10" cy="10" r="9" fill={shDone ? color : 'none'} stroke={shDone ? color : '#ccc8c4'} strokeWidth="1.5"/>
                            <polyline points="5.5,10 8.5,13 14.5,7" fill="none" stroke="#fff" strokeWidth="1.8"
                              strokeLinecap="round" strokeLinejoin="round" opacity={shDone ? 1 : 0}/>
                          </svg>
                        </button>

                        {/* Emoji */}
                        {sh.emoji && <span className="hd-sub-emoji">{sh.emoji}</span>}

                        {/* Sub-habit name (inline edit) */}
                        {subEditState?.subId === sh.id ? (
                          <div className="hd-sub-edit-row">
                            <input
                              className="hd-sub-edit-emoji"
                              value={subEditState.emoji}
                              placeholder="🙂"
                              maxLength={2}
                              onChange={e => setSubEditState(prev => prev ? { ...prev, emoji: e.target.value } : null)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { onEditSubHabit(subEditState.habitId, subEditState.subId, subEditState.name, subEditState.emoji); setSubEditState(null); }
                                if (e.key === 'Escape') setSubEditState(null);
                              }}
                            />
                            <input
                              className="hd-sub-edit-name"
                              value={subEditState.name}
                              autoFocus
                              onChange={e => setSubEditState(prev => prev ? { ...prev, name: e.target.value } : null)}
                              onBlur={() => { onEditSubHabit(subEditState.habitId, subEditState.subId, subEditState.name, subEditState.emoji); setSubEditState(null); }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { onEditSubHabit(subEditState.habitId, subEditState.subId, subEditState.name, subEditState.emoji); setSubEditState(null); }
                                if (e.key === 'Escape') setSubEditState(null);
                              }}
                            />
                          </div>
                        ) : (
                          <span
                            className="hd-sub-name"
                            onDoubleClick={e => { e.stopPropagation(); setSubEditState({ habitId: habit.id, subId: sh.id, name: sh.name, emoji: sh.emoji }); }}
                          >
                            {sh.name}
                          </span>
                        )}

                        {/* Time spent */}
                        {shSpentLabel && (
                          <span className="hd-sub-spent" style={{ background: color + '22', color }}>{shSpentLabel}</span>
                        )}

                        {/* Running dot */}
                        {shActive && timerRunning && (
                          <span className="hd-running-dot hd-sub-running" style={{ background: color }} />
                        )}

                        {/* Timer select button */}
                        <button
                          type="button"
                          className={`hd-sub-timer-btn${shActive ? ' hd-sub-timer-btn--active' : ''}`}
                          style={shActive ? { background: color, color: '#fff', borderColor: color } : undefined}
                          onClick={e => { e.stopPropagation(); !timerRunning && onSelect(sh.id); }}
                          title="フォーカスタイマーで計測"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5,3 19,12 5,21"/>
                          </svg>
                        </button>

                        {/* Session log under sub-row */}
                        {shSessions.length > 0 && (
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

                  {/* ── Inline add form ── */}
                  {addingSubFor === habit.id ? (
                    <div className="hd-sub-add-form">
                      <input
                        className="hd-sub-add-emoji"
                        placeholder="🙂"
                        value={newSubEmoji}
                        maxLength={2}
                        onChange={e => setNewSubEmoji(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { const el = e.currentTarget.nextElementSibling as HTMLInputElement; el?.focus(); } }}
                      />
                      <input
                        className="hd-sub-add-name"
                        placeholder="サブ習慣名..."
                        value={newSubName}
                        autoFocus
                        onChange={e => setNewSubName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddSub(habit.id);
                          if (e.key === 'Escape') { setAddingSubFor(null); setNewSubName(''); setNewSubEmoji(''); }
                        }}
                      />
                      <button
                        type="button"
                        className="hd-sub-add-submit"
                        onClick={() => handleAddSub(habit.id)}
                        disabled={!newSubName.trim()}
                      >追加</button>
                      <button
                        type="button"
                        className="hd-sub-add-cancel"
                        onClick={() => { setAddingSubFor(null); setNewSubName(''); setNewSubEmoji(''); }}
                      >×</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="hd-sub-add-btn"
                      onClick={e => { e.stopPropagation(); setAddingSubFor(habit.id); setExpandedHabitId(habit.id); }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      サブ習慣を追加
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hd-footer">
        <div className="hd-progress-info">
          <span className="hd-progress-text">{completedCount} / {totalCount} 習慣完了</span>
        </div>
        <div className="hd-progress-track">
          <div className="hd-progress-fill" style={{ width: `${completionRate}%` }} />
        </div>
      </div>

      {showModal && (
        <AddHabitModal onAdd={(name, detail) => { onAddHabit(name, detail); setShowModal(false); }} onClose={() => setShowModal(false)} />
      )}

      {/* Parent habit context menu */}
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

      {/* Sub-habit context menu */}
      {subContextMenu && (
        <div
          className="hd-context-menu"
          style={{ top: subContextMenu.y, left: subContextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button type="button" className="hd-context-item" onClick={() => {
            const habit = habits.find(h => h.id === subContextMenu.habitId);
            const sh = habit?.subHabits?.find(s => s.id === subContextMenu.subId);
            if (sh) setSubEditState({ habitId: subContextMenu.habitId, subId: sh.id, name: sh.name, emoji: sh.emoji });
            setSubContextMenu(null);
          }}>✏️ 編集</button>
          <button type="button" className="hd-context-item hd-context-delete" onClick={() => {
            onRemoveSubHabit(subContextMenu.habitId, subContextMenu.subId);
            setSubContextMenu(null);
          }}>🗑️ 削除</button>
        </div>
      )}
    </div>
  );
}
