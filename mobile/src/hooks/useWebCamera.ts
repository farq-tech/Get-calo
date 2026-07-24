import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type WebCameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

type UseWebCameraReturn = {
  status: WebCameraStatus;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  start: () => Promise<boolean>;
  stop: () => void;
  capture: () => string | null;
  bindVideo: (node: HTMLVideoElement | null) => void;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    console.warn('[calora/web-camera] getUserMedia failed', lastError);
    return false;
  }, [bindToVideo, stop]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || typeof document === 'undefined') return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w <= 0 || h <= 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    try {
      return canvas.toDataURL('image/jpeg', 0.88);
    } catch (err) {
      console.warn('[calora/web-camera] capture failed', err);
      return null;
    }
  }, []);

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

  return { status, videoRef, start, stop, capture, bindVideo };
}
