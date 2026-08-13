import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { PlayerAuthProvider } from './auth/AuthProvider';
import { ConfigurationErrorScreen } from './components/ConfigurationErrorScreen';
import { ConfigurationError, loadWebConfig } from './config/environment';
import './styles/tokens.css';
import './styles/global.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Wits Quest could not find its application root.');
}

const root = createRoot(rootElement);

try {
  const config = loadWebConfig(import.meta.env);
  root.render(
    <StrictMode>
      <PlayerAuthProvider config={config.auth}>
        <App
          apiBaseUrl={config.apiBaseUrl}
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
