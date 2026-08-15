import React, { useEffect } from 'react';
import { playTickSFX } from '../utils/audio';

export default function PanicTimer({ secondsLeft, triggerPlayer }) {
  useEffect(() => {
    if (secondsLeft > 0) {
      playTickSFX(secondsLeft <= 3);
    }
  }, [secondsLeft]);

  return (
    <div className="panic-overlay">
      <div className="panic-vignette" />
      <div className={`panic-chip ${secondsLeft <= 3 ? 'panic-urgent' : ''}`}>
        <span className="panic-countdown">{secondsLeft}</span>
        <span className="panic-text">{triggerPlayer} ya adivinó</span>
      </div>
    </div>
  );
}
