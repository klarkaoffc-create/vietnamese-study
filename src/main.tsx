import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { applyTheme, readStoredTheme } from './learning/theme';
import './styles/global.css';

// Before the first paint: a learner who chose light must not see a dark flash.
// Dark needs nothing done — it is what the stylesheet declares by default.
applyTheme(readStoredTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
