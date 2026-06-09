import { useState } from 'react';
import './AddHabitModal.css';

interface Props {
  onAdd: (name: string, detail: string) => void;
  onClose: () => void;
}

export default function AddHabitModal({ onAdd, onClose }: Props) {
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) {
      onAdd(name.trim(), detail.trim());
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">習慣を追加</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-field">
            <label className="modal-label">習慣名</label>
            <input
              className="modal-input"
              type="text"
              placeholder="例：朝のランニング"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="modal-field">
            <label className="modal-label">詳細</label>
            <input
              className="modal-input"
              type="text"
              placeholder="例：30分"
              value={detail}
              onChange={e => setDetail(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>キャンセル</button>
            <button type="submit" className="modal-btn modal-btn--add" disabled={!name.trim()}>追加する</button>
          </div>
        </form>
      </div>
    </div>
  );
}
