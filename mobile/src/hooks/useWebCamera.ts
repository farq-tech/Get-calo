import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type WebCameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

type UseWebCameraReturn = {
  status: WebCameraStatus;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  start: () => Promise<boolean>;
  stop: () => void;
  /** @deprecated prefer captureAsync — kept for sync callers */
  capture: () => string | null;
  captureAsync: () => Promise<string | null>;
  bindVideo: (node: HTMLVideoElement | null) => void;
};

const CAPTURE_MAX_EDGE = 1280;
const CAPTURE_JPEG_QUALITY = 0.84;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Crop the video frame the same way CSS object-fit: cover crops the preview,
 * so the snapshot matches what the user framed on screen.
 */
function coverCropSource(
  videoW: number,
  videoH: number,
  viewW: number,
  viewH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const videoRatio = videoW / Math.max(videoH, 1);
  const viewRatio = viewW / Math.max(viewH, 1);

  if (videoRatio > viewRatio) {
    // Video wider than view — crop left/right
    const sw = Math.round(videoH * viewRatio);
    const sx = Math.round((videoW - sw) / 2);
    return { sx, sy: 0, sw: Math.max(1, sw), sh: videoH };
  }

  // Video taller than view — crop top/bottom
  const sh = Math.round(videoW / viewRatio);
  const sy = Math.round((videoH - sh) / 2);
  return { sx: 0, sy, sw: videoW, sh: Math.max(1, sh) };
}

/**
 * Browser camera via getUserMedia — permission, live preview, snapshot capture.
 * Hardened for iOS Safari (playsInline, re-attach, play-before-capture).
 */
export function useWebCamera(): UseWebCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<WebCameraStatus>('idle');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const bindToVideo = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    for (let attempt = 0; attempt < 8; attempt++) {
      const video = videoRef.current;
      if (video) {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('muted', 'true');
        try {
          await video.play();
        } catch {
          // Will retry on user gesture (shutter).
        }
        if (video.videoWidth > 0 || video.readyState >= 2) {
          setStatus('ready');
          return true;
        }
      }
      await wait(80);
    }
    // Stream exists even if dimensions not ready yet — mark ready so UI unlocks.
    if (streamRef.current) {
      setStatus('ready');
      return true;
    }
    return false;
  }, []);

  const start = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
      setStatus('unavailable');
      return false;
    }
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setStatus('unavailable');
      return false;
    }

    // Already running
    if (streamRef.current && streamRef.current.getTracks().some((t) => t.readyState === 'live')) {
      await bindToVideo(streamRef.current);
      return true;
    }

    setStatus('requesting');
    stop();

    const attempts: MediaStreamConstraints[] = [
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      { audio: false, video: { facingMode: 'environment' } },
      { audio: false, video: true },
    ];

    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        const stream = await media.getUserMedia(constraints);
        return await bindToVideo(stream);
      } catch (err) {
        lastError = err;
      }
    }

    const name =
      lastError && typeof lastError === 'object' && 'name' in lastError
        ? String((lastError as { name?: string }).name)
        : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      setStatus('denied');
    } else {
      setStatus('unavailable');
    }
    console.warn('[get-calo/web-camera] getUserMedia failed', lastError);
    return false;
  }, [bindToVideo, stop]);

  const drawCoverFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || typeof document === 'undefined') return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw <= 0 || vh <= 0) return null;

    const rect = video.getBoundingClientRect();
    const viewW = Math.max(1, rect.width || window.innerWidth || vw);
    const viewH = Math.max(1, rect.height || window.innerHeight || vh);
    const { sx, sy, sw, sh } = coverCropSource(vw, vh, viewW, viewH);

    const scale = Math.min(1, CAPTURE_MAX_EDGE / Math.max(sw, sh));
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    return canvas;
  }, []);

  const capture = useCallback(() => {
    try {
      const canvas = drawCoverFrame();
      if (!canvas) return null;
      return canvas.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY);
    } catch (err) {
      console.warn('[get-calo/web-camera] capture failed', err);
      return null;
    }
  }, [drawCoverFrame]);

  const captureAsync = useCallback(async () => {
    try {
      const canvas = drawCoverFrame();
      if (!canvas) return null;

      // Prefer blob: URLs — smaller memory path than giant data: URLs on mobile Safari.
      if (typeof canvas.toBlob === 'function') {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', CAPTURE_JPEG_QUALITY);
        });
        if (blob && blob.size >= 64) {
          return URL.createObjectURL(blob);
        }
      }
      return canvas.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY);
    } catch (err) {
      console.warn('[get-calo/web-camera] captureAsync failed', err);
      return null;
    }
  }, [drawCoverFrame]);

  const bindVideo = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (node && streamRef.current) {
        void bindToVideo(streamRef.current);
      }
    },
    [bindToVideo],
  );

  useEffect(() => {
    // Auto-resume if browser already granted camera permission.
    let cancelled = false;
    async function probe() {
      if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
      try {
        const perms = navigator.permissions;
        if (!perms?.query) return;
        // Some browsers reject camera permission query.
        const result = await perms.query({ name: 'camera' as PermissionName });
        if (!cancelled && result.state === 'granted') {
          await start();
        }
      } catch {
        // Ignore — user will tap Enable camera.
      }
    }
    void probe();
    return () => {
      cancelled = true;
      stop();
    };
  }, [start, stop]);

  return { status, videoRef, start, stop, capture, captureAsync, bindVideo };
}
