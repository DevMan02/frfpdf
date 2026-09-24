import { useCallback, useState } from 'react';
import type { FormField, FormValues } from '../lib/forms/types';
import { commit, createHistory, patchAll, redo, seal, undo } from '../lib/history';
import type { PlacedSignature } from '../lib/signature/types';

/** Everything the user changes on the document, as one undoable snapshot. */
export interface EditState {
  fields: FormField[];
  values: FormValues;
  signatures: PlacedSignature[];
}

export const EMPTY_EDIT: EditState = { fields: [], values: {}, signatures: [] };

/** Edit state with "Annulla" / "Ripeti" (see lib/history.ts). */
export function useEditHistory() {
  const [history, setHistory] = useState(() => createHistory(EMPTY_EDIT));

  /** A user action. Same `key` in a row (typing in one field, one drag) = one undo step. */
  const change = useCallback((update: (state: EditState) => EditState, key: string | null = null) => {
    setHistory((h) => commit(h, update(h.present), key));
  }, []);

  /** A change that is not a user action (fields found in the background, re-sorting). */
  const patch = useCallback((update: (state: EditState) => EditState) => {
    setHistory((h) => patchAll(h, update));
  }, []);

  const reset = useCallback((state: EditState) => setHistory(createHistory(state)), []);
  const undoStep = useCallback(() => setHistory((h) => undo(h)), []);
  const redoStep = useCallback(() => setHistory((h) => redo(h)), []);
  /** Closes the current gesture (field left, drag ended). */
  const endGesture = useCallback(() => setHistory((h) => seal(h)), []);

  return {
    state: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    change,
    patch,
    reset,
    undo: undoStep,
    redo: redoStep,
    endGesture,
  };
}
