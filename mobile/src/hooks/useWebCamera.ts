import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type WebCameraStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable';

type UseWebCameraReturn = {
  status: WebCameraStatus;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  start: () => Promise<boolean>;
  stop: () => void;
  capture: () => string | null;
};

/**
 * Browser camera via getUserMedia — permission, live preview, snapshot capture.
 */
export function useWebCamera(): UseWebCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<WebCameraStatus>('idle');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const attachStream = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return false;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    try {
      await video.play();
    } catch {
      // Autoplay can fail until a gesture; stream is still attached.
    }
    setStatus('ready');
    return true;
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
      {
        audio: false,
        video: { facingMode: 'environment' },
      },
      {
        audio: false,
        video: true,
      },
    ];

    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        const stream = await media.getUserMedia(constraints);
        await attachStream(stream);
        return true;
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
  }, [attachStream, stop]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // Mirror-correct for front cameras; environment is usually unmirrored.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      return canvas.toDataURL('image/jpeg', 0.88);
    } catch (err) {
      console.warn('[calora/web-camera] capture failed', err);
      return null;
    }
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { status, videoRef, start, stop, capture };
}
