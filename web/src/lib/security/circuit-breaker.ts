type CircuitState = {
  failures: number;
  openedUntil: number;
  halfOpenProbe: boolean;
};

type CircuitBreakerOptions = {
  key: string;
  failureThreshold?: number;
  cooldownMs?: number;
  timeoutMs?: number;
  isFailureResponse?: (response: Response) => boolean;
};

const circuits = new Map<string, CircuitState>();

export class CircuitOpenError extends Error {
  constructor(key: string, retryAfterMs: number) {
    super(`Circuit breaker is open for ${key}. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = "CircuitOpenError";
  }
}

function getCircuit(key: string) {
  const existing = circuits.get(key);
  if (existing) return existing;

  const state = { failures: 0, openedUntil: 0, halfOpenProbe: false };
  circuits.set(key, state);
  return state;
}

function markSuccess(state: CircuitState) {
  state.failures = 0;
  state.openedUntil = 0;
  state.halfOpenProbe = false;
}

function markFailure(state: CircuitState, threshold: number, cooldownMs: number) {
  state.failures += 1;
  state.halfOpenProbe = false;
  if (state.failures >= threshold) {
    state.openedUntil = Date.now() + cooldownMs;
  }
}

export async function fetchWithCircuitBreaker(
  input: string | URL | Request,
  init: RequestInit,
  options: CircuitBreakerOptions
) {
  const {
    key,
    failureThreshold = 5,
    cooldownMs = 30_000,
    timeoutMs = 15_000,
    isFailureResponse = (response) => response.status === 429 || response.status >= 500,
  } = options;

  const state = getCircuit(key);
  const now = Date.now();

  if (state.openedUntil > now) {
    throw new CircuitOpenError(key, state.openedUntil - now);
  }

  if (state.openedUntil && state.openedUntil <= now) {
    if (state.halfOpenProbe) throw new CircuitOpenError(key, cooldownMs);
    state.halfOpenProbe = true;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });

    if (isFailureResponse(response)) {
      markFailure(state, failureThreshold, cooldownMs);
    } else {
      markSuccess(state);
    }

    return response;
  } catch (error) {
    markFailure(state, failureThreshold, cooldownMs);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
