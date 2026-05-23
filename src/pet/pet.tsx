import React from 'react';
import ReactDOM from 'react-dom/client';
import PetWindow from './PetWindow';
import { useAuthStore } from '@shared/store/authStore';
import '../styles/index.css';

// The pet window has no React app shell that would normally call init(),
// so kick off the Firebase auth listener here. Firebase persists the user
// in IndexedDB shared with the main window's origin, so this listener fires
// with the same user as the main window.
useAuthStore.getState().init();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PetWindow />
  </React.StrictMode>,
);
