/**
 * Undo / redo as a pure reducer over snapshots of the edit state.
 *
 * Consecutive commits with the same `key` (typing in one field, dragging one
 * signature) are merged into a single step, so "Annulla" undoes the whole
 * gesture, not one character or one pixel at a time.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Key of the last commit, for merging. */
  lastKey: string | null;
}

/** Oldest steps are dropped beyond this limit. */
export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null };
}

export function commit<T>(history: History<T>, next: T, key: string | null = null): History<T> {
  if (next === history.present) return history;
  if (key !== null && key === history.lastKey) {
    return { ...history, present: next, future: [] };
  }
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastKey: key,
  };
}

export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1]!,
    future: [history.present, ...history.future],
    lastKey: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return {
    past: [...history.past, history.present],
    present: history.future[0]!,
    future: history.future.slice(1),
    lastKey: null,
  };
}

/** Changes every snapshot without adding a step (e.g. fields found in the background). */
export function patchAll<T>(history: History<T>, change: (state: T) => T): History<T> {
  return {
    past: history.past.map(change),
    present: change(history.present),
    future: history.future.map(change),
    lastKey: history.lastKey,
  };
}

/** Ends the current merge: the next commit starts a new step even with the same key. */
export function seal<T>(history: History<T>): History<T> {
  return history.lastKey === null ? history : { ...history, lastKey: null };
}
