const LEAD_REFERENCE_KEY = "mrc.leadReference";
const SESSION_ID_KEY = "mrc.sessionId";

function safeSessionGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The funnel still works when storage is unavailable; only attribution is reduced.
  }
}

function safeSessionRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Sem armazenamento, nao existe identificador a remover.
  }
}

export function getOrCreateSessionId() {
  const existing = safeSessionGet(SESSION_ID_KEY);
  if (existing) return existing;

  const value =
    globalThis.crypto?.randomUUID?.() ??
    `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  safeSessionSet(SESSION_ID_KEY, value);
  return value;
}

export function clearSessionId() {
  safeSessionRemove(SESSION_ID_KEY);
}

export function saveLeadReference(reference) {
  safeSessionSet(LEAD_REFERENCE_KEY, reference);
}

export function getLeadReference() {
  return safeSessionGet(LEAD_REFERENCE_KEY);
}
