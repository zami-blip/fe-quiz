import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppB from './AppB';
import AppTerms from './AppTerms';
// 模擬試験は通常画面の読込みを重くしないよう、/mock を開いたときだけ読み込む
const AppMock = lazy(() => import('./AppMock'));
const MockHome = lazy(() => import('./mock/MockHome'));
const AppMock2 = lazy(() => import('./mock/r2/AppMock2'));
const AppMock3 = lazy(() => import('./mock/r3/AppMock3'));
function MockEntry() {
  const [round, setRound] = React.useState(null);
  if (round === 1) return <AppMock />;
  if (round === 2) return <AppMock2 onBack={() => setRound(null)} />;
  if (round === 3) return <AppMock3 onBack={() => setRound(null)} />;
  return <MockHome onFirst={() => setRound(1)} onSecond={() => setRound(2)} onThird={() => setRound(3)} />;
}
const root = ReactDOM.createRoot(document.getElementById('root'));
const path = window.location.pathname.replace(/\/+$/,'').toLowerCase();
const page = path === '/b' ? <AppB /> : path === '/terms' ? <AppTerms /> : path === '/mock' ? <Suspense fallback={<div style={{padding:20}}>読み込み中…</div>}><MockEntry /></Suspense> : <App />;
root.render(page);
