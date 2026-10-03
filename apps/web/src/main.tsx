import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { initializeAccessibilityPreferences } from './accessibility/preferences';
import { PlayerAuthProvider } from './auth/AuthProvider';
import { ConfigurationErrorScreen } from './components/ConfigurationErrorScreen';
import { ConfigurationError, loadWebConfig } from './config/environment';
import {
  locationClaimProvider,
  locationObservationProvider,
  mapFactory,
} from './runtime-boundaries';
import './styles/tokens.css';
import './styles/global.css';
import './styles/selection-controls.css';
import './styles/states.css';
import './styles/accessibility.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Wits World could not find its application root.');
}

const root = createRoot(rootElement);
initializeAccessibilityPreferences();

try {
  const config = loadWebConfig(import.meta.env);
  root.render(
    <StrictMode>
      <PlayerAuthProvider config={config.auth}>
        <App
          apiBaseUrl={config.apiBaseUrl}
          locationClaimProvider={locationClaimProvider}
          locationObservationProvider={locationObservationProvider}
          mapFactory={mapFactory}
          mapboxAccessToken={config.mapboxAccessToken}
        />
      </PlayerAuthProvider>
    </StrictMode>,
  );
} catch (error) {
  if (error instanceof ConfigurationError) {
    root.render(
      <StrictMode>
        <ConfigurationErrorScreen message={error.message} />
      </StrictMode>,
    );
  } else {
    throw error;
  }
}
