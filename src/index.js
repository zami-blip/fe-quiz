import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppB from './AppB';
const root = ReactDOM.createRoot(document.getElementById('root'));
const isB = window.location.pathname.replace(/\/+$/,'').toLowerCase() === '/b';
root.render(isB ? <AppB /> : <App />);
