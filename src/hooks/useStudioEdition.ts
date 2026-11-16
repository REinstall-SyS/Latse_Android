import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { HikeTrack, ReceiptConfig } from "@/types/trek.types";
import type { UnitSystem } from "@/domain/units";
import {
  loadStudioConfig,
  saveStudioConfig,
} from "@/services/studio-edition.service";
import { loadStudioCover } from "@/services/studio-cover.service";
export function useStudioEdition(track: HikeTrack, units: UnitSystem) {
  // A track's saved edition is loaded only when its identity changes.
  const initial = useMemo(() => loadStudioConfig(track, units), [track.id]);
  const [edition, setEdition] = useState(() => ({
    id: track.id,
    config: initial,
  }));
  const [editionError, setEditionError] = useState("");
  const [coverError, setCoverError] = useState("");
  const config = useMemo(
    () => ({ ...(edition.id === track.id ? edition.config : initial), units }),
    [edition, initial, track.id, units],
  );
  const setConfig: Dispatch<SetStateAction<ReceiptConfig>> = useCallback(
    (next) => {
      setEdition((previous) => {
        const current = previous.id === track.id ? previous.config : initial;
        return {
          id: track.id,
          config: typeof next === "function" ? next(current) : next,
        };
      });
    },
    [track.id, initial],
  );
  const coverLoading = !!config.coverPhotoId && !config.backgroundPhotoUrl;
  useEffect(() => {
    setCoverError("");
    if (!coverLoading || !config.coverPhotoId) return;
    let cancelled = false;
    const key = config.coverPhotoId;
    loadStudioCover(key)
      .then((photo) => {
        if (cancelled) return;
        if (!photo)
          throw new Error(
            "Your cover photo is unavailable. Choose it again from Cover.",
          );
        setConfig((current) =>
          current.coverPhotoId === key
            ? { ...current, backgroundPhotoUrl: photo }
            : current,
        );
      })
      .catch((error) => {
        if (!cancelled) setCoverError((error as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [coverLoading, config.coverPhotoId, setConfig]);
  useEffect(() => {
    try {
      saveStudioConfig(track.id, config);
      setEditionError("");
    } catch {
      setEditionError(
        "Your edition is open, but device storage could not save these finishing touches.",
      );
    }
  }, [track.id, config]);
  return {
    config,
    setConfig,
    editionError,
    coverError,
    coverLoading: coverLoading && !coverError,
  };
}
