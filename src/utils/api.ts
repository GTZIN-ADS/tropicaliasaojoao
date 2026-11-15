import { handleStandaloneRequest, subscribeLocalSync } from './standaloneApi';

type BackendMode = 'unknown' | 'server' | 'standalone';

let backendMode: BackendMode = 'unknown';

export function isStandaloneMode(): boolean {
  return backendMode === 'standalone';
}

export { subscribeLocalSync };

async function probeServerMode(): Promise<BackendMode> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const data = await res.json();
      if (data && data.ok) {
        backendMode = 'server';
        return 'server';
      }
    }
    if (!ct.includes('application/json') && (res.ok || res.status === 404 || res.status === 405)) {
      backendMode = 'standalone';
      return 'standalone';
    }
  } catch {
    if (backendMode === 'server') return 'server';
  }
  return backendMode;
}

export async function apiRequest(url: string, init?: RequestInit): Promise<Response> {
  if (backendMode === 'standalone') {
    return handleStandaloneRequest(url, init);
  }

  try {
    const res = await fetch(url, init);
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (isJson) {
      backendMode = 'server';
      return res;
    }

    // If server was already confirmed, never silently downgrade to localStorage on 502/503/HTML errors
    if (backendMode === 'server') {
      return res;
    }

    // First-time static-host detection (returns index.html 200 text/html or 404/405 without JSON)
    if (res.ok || res.status === 404 || res.status === 405) {
      const detected = await probeServerMode();
      if (detected === 'standalone') {
        return handleStandaloneRequest(url, init);
      }
    }

    return res;
  } catch (err) {
    // If server was already confirmed, propagate network error so checkout shows real failure
    if (backendMode === 'server') {
      throw err;
    }

    const detected = await probeServerMode();
    if (detected === 'standalone') {
      return handleStandaloneRequest(url, init);
    }
    throw err;
  }
}
