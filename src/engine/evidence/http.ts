/**
 * Tiny fetch-with-timeout JSON helper shared by the local evidence providers.
 * Every provider is responsible for catching errors itself; this just guarantees
 * a call never hangs past `timeoutMs` and surfaces non-2xx as a throw.
 */
export interface FetchOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
}

export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${hostOf(url)}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
