import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

import { playPaymentAnimation } from './components/paymentAnimation';

async function start() {
  const splash = document.getElementById('startup');
  try {
    if (splash && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await playPaymentAnimation(splash, '100dvh', 'Opening Nukkad…').finished;
    }
  } catch (error) {
    console.warn('Startup animation was interrupted:', error);
  } finally {
    splash?.remove();
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode><App /></React.StrictMode>
    );
  }
}

void start();
