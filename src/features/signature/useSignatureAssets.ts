import { useCallback, useEffect, useRef, useState } from 'react';
import type { SignatureAsset } from '../../lib/signature/types';
import { deleteSavedSignature, loadSavedSignature, saveSignature } from '../../platform/signatureStore';

export interface AssetEntry {
  asset: SignatureAsset;
  /** Local blob: URL for showing the image on screen. */
  url: string;
}

const SAVED_ID = 'saved';

/**
 * Signature images created in this session, the one currently in use, and
 * the one remembered on this device (if the user chose so).
 */
export function useSignatureAssets() {
  const [assets, setAssets] = useState<Record<string, AssetEntry>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const counter = useRef(0);

  const add = useCallback((asset: SignatureAsset) => {
    const url = URL.createObjectURL(new Blob([asset.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
    setAssets((previous) => ({ ...previous, [asset.id]: { asset, url } }));
  }, []);

  // A signature remembered on this device is ready to use from the start.
  useEffect(() => {
    let active = true;
    void loadSavedSignature().then((saved) => {
      if (!active || !saved) return;
      add({ id: SAVED_ID, ...saved });
      setSavedId(SAVED_ID);
      setCurrentId((current) => current ?? SAVED_ID);
    });
    return () => {
      active = false;
    };
  }, [add]);

  /** Adds a new signature image and makes it the current one. Returns its id. */
  const create = useCallback(
    (png: Uint8Array, aspect: number, source: SignatureAsset['source'], remember: boolean): string => {
      const id = `asset-${++counter.current}`;
      add({ id, png, aspect, source });
      setCurrentId(id);
      if (remember) {
        void saveSignature({ png, aspect, source }).then((ok) => ok && setSavedId(id));
      }
      return id;
    },
    [add],
  );

  /** Deletes the remembered copy; signatures already placed stay on the page. */
  const forgetSaved = useCallback(async () => {
    const ok = await deleteSavedSignature();
    if (ok) setSavedId(null);
    return ok;
  }, []);

  return { assets, currentId, setCurrentId, savedId, create, forgetSaved };
}
