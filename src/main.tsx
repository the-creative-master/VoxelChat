import React from 'react';
import ReactDOM from 'react-dom/client';

// Offline-bundled tactile display, UI, and coding fonts
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/400-italic.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import 'katex/dist/katex.min.css';

import './index.css';
import App from './App';
import { applyStoredSettingsAtBoot } from './utils/uiPrefs';

// Paint the saved palette + potato mode before the first frame so there is no flash.
applyStoredSettingsAtBoot();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
