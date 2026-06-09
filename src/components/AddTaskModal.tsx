import { useState } from 'react';
import './AddTaskModal.css';
import { TAG_COLORS } from '../types';

interface Props {
  onAdd: (title: string, tag: string, time: string) => void;
  onClose: () => void;
}

const TAGS = Object.keys(TAG_COLORS);

export default function AddTaskModal({ onAdd, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('Work');
  const [time, setTime] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim()) {
      onAdd(title.trim(), tag, time.trim() || '—');
    }
  }

  return (
    <div className="atm-overlay" onClick={onClose}>
      <div className="atm-card" onClick={e => e.stopPropagation()}>
        <div className="atm-header">
          <h3 className="atm-title">タスクを追加</h3>
          <button type="button" className="atm-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="atm-form">
          <div className="atm-field">
            <label className="atm-label">タスク名</label>
            <input className="atm-input" type="text" placeholder="例：プロジェクト作業" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="atm-row">
            <div className="atm-field atm-field--half">
              <label className="atm-label">タグ</label>
              <select className="atm-select" value={tag} onChange={e => setTag(e.target.value)}>
                {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="atm-field atm-field--half">
              <label className="atm-label">時間</label>
              <input className="atm-input" type="text" placeholder="例：10:00" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div className="atm-actions">
            <button type="button" className="atm-btn atm-btn--cancel" onClick={onClose}>キャンセル</button>
            <button type="submit" className="atm-btn atm-btn--add" disabled={!title.trim()}>追加する</button>
          </div>
        </form>
      </div>
    </div>
  );
}
