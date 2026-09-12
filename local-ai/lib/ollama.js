// Thin Ollama client. Non-streaming /api/chat with JSON-mode output.

export class OllamaError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'timeout' | 'aborted' | 'unreachable' | 'http' | 'parse'
  }
}

/**
 * @param {object} o
 * @param {string} o.baseUrl
 * @param {string} o.model
 * @param {Array<{role:string, content:string, images?:string[]}>} o.messages
 * @param {number} o.timeoutMs
 * @param {number} [o.temperature]
 * @param {number} [o.numPredict]
 * @param {AbortSignal} [o.signal]  aborts generation when the client hangs up
 * @returns {Promise<{raw: string, parsed: any, evalCount: number}>}
 */
export async function chatJson({
  baseUrl,
  model,
  messages,
  timeoutMs,
  temperature = 0.2,
  numPredict = 512,
  signal,
}) {
  if (signal?.aborted) throw new OllamaError('aborted', 'client disconnected');

  const ac = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, timeoutMs);
  // Propagate an external abort (client disconnect) into this fetch so Ollama
  // stops generating instead of finishing work nobody will read.
  const onExternalAbort = () => ac.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  const cleanup = () => {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  };

  const abortKind = () => (timedOut ? 'timeout' : 'aborted');
  const abortMessage = () =>
    timedOut ? 'ollama request timed out' : 'client disconnected mid-generation';

  let res;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: 'json',
        keep_alive: -1, // keep weights resident in VRAM between requests
        options: {
          temperature,
          num_predict: numPredict,
        },
      }),
    });
  } catch (err) {
    cleanup();
    if (err?.name === 'AbortError') throw new OllamaError(abortKind(), abortMessage());
    throw new OllamaError('unreachable', `ollama unreachable: ${err?.message || err}`);
  }

  if (!res.ok) {
    cleanup();
    const body = await res.text().catch(() => '');
    throw new OllamaError('http', `ollama HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  // The response body is still streaming in; keep the timeout/abort armed until
  // it is fully read, otherwise a stalled read escapes both caps.
  let envelope;
  try {
    envelope = await res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new OllamaError(abortKind(), abortMessage());
    throw new OllamaError('parse', `ollama response unreadable: ${err?.message || err}`);
  } finally {
    cleanup();
  }

  const raw = envelope?.message?.content ?? '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON mode occasionally emits trailing prose; salvage the outermost object.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(raw.slice(start, end + 1));
      } catch {
        throw new OllamaError('parse', 'model did not return JSON');
      }
    } else {
      throw new OllamaError('parse', 'model did not return JSON');
    }
  }
  return { raw, parsed, evalCount: envelope?.eval_count ?? 0 };
}

/**
 * Load the model into VRAM without generating anything. Ollama treats a chat
 * request with no messages as a pure load. Without this the FIRST real request
 * pays the ~45 s weight-load cost, which on a cold box runs close to the
 * identify timeout.
 * @returns {Promise<{ok: boolean, ms: number, error?: string}>}
 */
export async function warmModel({ baseUrl, model, timeoutMs = 180_000 }) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify({ model, messages: [], keep_alive: -1 }),
    });
    if (!res.ok) {
      return { ok: false, ms: Date.now() - t0, error: `HTTP ${res.status}` };
    }
    await res.json().catch(() => null);
    return { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: err?.name === 'AbortError' ? 'timeout' : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{reachable: boolean, modelPresent: boolean, models: string[]}>}
 */
export async function checkOllama({ baseUrl, model, timeoutMs = 3000 }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: ac.signal });
    if (!res.ok) return { reachable: false, modelPresent: false, models: [] };
    const body = await res.json();
    const models = (body?.models || []).map((m) => m.name).filter(Boolean);
    const want = model.includes(':') ? model : `${model}:latest`;
    const modelPresent = models.some(
      (n) => n === model || n === want || n.replace(/:latest$/, '') === model.replace(/:latest$/, '')
    );
    return { reachable: true, modelPresent, models };
  } catch {
    return { reachable: false, modelPresent: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}
