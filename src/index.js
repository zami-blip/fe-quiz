import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppB from './AppB';
import AppTerms from './AppTerms';
// 模擬試験は通常画面の読込みを重くしないよう、/mock を開いたときだけ読み込む
const AppMock = lazy(() => import('./AppMock'));
const MockHome = lazy(() => import('./mock/MockHome'));
function MockEntry() {
  const [first, setFirst] = React.useState(false);
  return first ? <AppMock /> : <MockHome onFirst={() => setFirst(true)} />;
}
const root = ReactDOM.createRoot(document.getElementById('root'));
const path = window.location.pathname.replace(/\/+$/,'').toLowerCase();
const page = path === '/b' ? <AppB /> : path === '/terms' ? <AppTerms /> : path === '/mock' ? <Suspense fallback={<div style={{padding:20}}>読み込み中…</div>}><MockEntry /></Suspense> : <App />;
root.render(page);
