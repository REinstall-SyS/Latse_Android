import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { Share } from "@capacitor/share";

/**
 * Trigger haptic vibration feedback.
 */
export async function vibrate(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.vibrate();
    } catch {
      // Fallback to web vibration
      navigator.vibrate?.(300);
    }
  } else {
    navigator.vibrate?.(300);
  }
}

/**
 * Play a beep using Web Audio API OscillatorNode (no external MP3 needed).
 */
export function playBeep(durationMs = 500, frequency = 880): void {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = "sine";
    gain.gain.value = 0.5;
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, durationMs);
  } catch {
    // Web Audio not available
  }
}

/**
 * Share text using Capacitor Share or clipboard fallback.
 * Returns true if successful.
 */
export async function shareText(
  text: string,
  title?: string,
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ text, title: title || "Latse SOS" });
      return true;
    } catch {
      // Fall through to clipboard
    }
  }

  // Web/clipboard fallback
  if (navigator.share) {
    try {
      await navigator.share({ text, title: title || "Latse SOS" });
      return true;
    } catch {
      // Fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open SMS app with pre-filled message body.
 */
export function openSMS(body: string): void {
  window.open(`sms:?body=${encodeURIComponent(body)}`, "_self");
}

/**
 * Toggle hardware flashlight via camera API.
 * Returns the MediaStreamTrack if torch was enabled, or null.
 */
export async function toggleTorch(
  currentTrack: MediaStreamTrack | null,
): Promise<{
  state: "hardware" | "screen" | "denied" | "off";
  track: MediaStreamTrack | null;
}> {
  // Turn off
  if (currentTrack) {
    try {
      await currentTrack.applyConstraints({
        advanced: [{ torch: false } as MediaTrackConstraintSet],
      });
    } catch {
      /* ignore */
    }
    currentTrack.stop();
    return { state: "off", track: null };
  }

  // Try to turn on
  if (!navigator.mediaDevices?.getUserMedia) {
    return { state: "screen", track: null };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1 },
        height: { ideal: 1 },
      },
    });

    const track = stream.getVideoTracks()[0];
    await new Promise((r) => setTimeout(r, 150));

    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps && (caps as Record<string, unknown>).torch) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: true } as MediaTrackConstraintSet],
        });
        return { state: "hardware", track };
      } catch {
        track.stop();
        return { state: "screen", track: null };
      }
    } else {
      track.stop();
      return { state: "screen", track: null };
    }
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
    ) {
      return { state: "denied", track: null };
    }
    return { state: "screen", track: null };
  }
}
