import { useEffect, useRef } from 'react';
import { startMenuMusic, stopMenuMusic, resumeMenuMusic } from '../utils/menuMusic';

export default function MenuMusic() {
  const startedRef = useRef(false);

  useEffect(() => {
    const start = () => {
      if (startedRef.current) {
        resumeMenuMusic();
        return;
      }
      startedRef.current = true;
      startMenuMusic();
    };
    start();
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      stopMenuMusic();
    };
  }, []);

  return null;
}
