// Backend mode configuration for OmniCompile Core frontend
// Supports offline development and future remote backend integration

export type BackendMode = 'offline' | 'remote';

export interface BackendConfig {
  mode: BackendMode;
  apiBaseUrl: string | null;
  wsBaseUrl: string | null;
}

/**
 * Get the current backend configuration.
 * In production (Vercel), defaults to offline mode until backend is deployed.
 * In development, uses local backend if available.
 */
export function getBackendConfig(): BackendConfig {
  const mode = (import.meta.env.VITE_BACKEND_MODE as BackendMode) || 'offline';

  if (mode === 'offline') {
    return {
      mode: 'offline',
      apiBaseUrl: null,
      wsBaseUrl: null,
    };
  }

  // Remote mode: use configured endpoints
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL;

  if (!apiBaseUrl) {
    console.warn('VITE_BACKEND_MODE=remote but VITE_API_BASE_URL not set. Falling back to offline mode.');
    return {
      mode: 'offline',
      apiBaseUrl: null,
      wsBaseUrl: null,
    };
  }

  return {
    mode: 'remote',
    apiBaseUrl,
    wsBaseUrl: wsBaseUrl || apiBaseUrl.replace(/^http/, 'ws'),
  };
}

export const backendConfig = getBackendConfig();

/**
 * Check if backend is available (always false in offline mode)
 */
export function isBackendAvailable(): boolean {
  return backendConfig.mode === 'remote';
}
