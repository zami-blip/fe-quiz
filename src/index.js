import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppB from './AppB';
import AppTerms from './AppTerms';
const root = ReactDOM.createRoot(document.getElementById('root'));
const path = window.location.pathname.replace(/\/+$/,'').toLowerCase();
const page = path === '/b' ? <AppB /> : path === '/terms' ? <AppTerms /> : <App />;
root.render(page);
