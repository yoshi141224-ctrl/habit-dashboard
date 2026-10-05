import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Global error capture — catches errors that escape React's boundary
// (event handlers, setTimeout callbacks, DOM exceptions from WKWebView)
window.addEventListener('error', (e) => {
  console.error('[GlobalError]', e.message, e.filename, e.lineno, e.colno, e.error);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[UnhandledRejection]', e.reason);
});

// ── 新しいバージョンの検知 ──
// GitHub Pages は index.html を一定時間キャッシュするうえ、スマホはタブ（ホーム画面の
// アプリ）を何日も開いたままにするので、放っておくと古い版が動き続ける。
// 起動時は自動で最新版に読み直し、開いている途中で気づいた場合は入力中の内容を
// 失わないよう「更新」ボタンを出すだけにする。
const UPDATE_TRIED = 'hd_update_tried';

function reloadToLatest() {
  window.location.replace(`${window.location.pathname}?v=${Date.now()}${window.location.hash}`);
}

function showUpdateBar() {
  if (document.getElementById('hd-update-bar')) return;
  const bar = document.createElement('button');
  bar.id = 'hd-update-bar';
  bar.type = 'button';
  bar.textContent = '新しいバージョンがあります — タップして更新';
  bar.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:1000;'
    + 'padding:10px 16px;border:none;border-radius:999px;background:#1C1410;color:#FDFBF8;'
    + 'font-family:inherit;font-size:12.5px;font-weight:600;box-shadow:0 4px 20px rgba(23,18,11,0.25);cursor:pointer;white-space:nowrap;';
  bar.addEventListener('click', reloadToLatest);
  document.body.appendChild(bar);
}

async function checkForUpdate(atStartup: boolean) {
  if (!import.meta.env.PROD) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}index.html?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const latest = (await res.text()).match(/assets\/index-[\w-]+\.js/)?.[0];
    if (!latest || import.meta.url.includes(latest)) return;
    // 同じ版への読み直しは1回だけ（反映待ちの間にリロードを繰り返さない）
    if (atStartup && sessionStorage.getItem(UPDATE_TRIED) !== latest) {
      sessionStorage.setItem(UPDATE_TRIED, latest);
      reloadToLatest();
    } else {
      showUpdateBar();
    }
  } catch { /* オフライン時は何もしない */ }
}

if (new URLSearchParams(window.location.search).has('v')) {
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
}
checkForUpdate(true);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate(false);
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
