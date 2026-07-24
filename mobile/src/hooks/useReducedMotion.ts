import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Respects OS Reduce Motion / prefers-reduced-motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(Boolean(value));
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduced(Boolean(value));
    });

    let mq: MediaQueryList | null = null;
    const onMq = (event: MediaQueryListEvent) => setReduced(event.matches);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.matches) setReduced(true);
      mq.addEventListener?.('change', onMq);
    }

    return () => {
      mounted = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anySub = sub as any;
      if (typeof anySub?.remove === 'function') anySub.remove();
      mq?.removeEventListener?.('change', onMq);
    };
  }, []);

  return reduced;
}
