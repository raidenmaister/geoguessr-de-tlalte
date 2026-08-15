import React from 'react';

export default function EmoteOverlay({ activeEmotes = [] }) {
  if (activeEmotes.length === 0) return null;

  return (
    <div className="emote-overlay-container">
      {activeEmotes.map((e) => (
        <div key={e.id} className="floating-emote-bubble" style={{ left: `${e.x}%` }}>
          <span className="emote-emoji">{e.emote}</span>
          <span className="emote-sender" style={{ color: e.color?.hex || '#fff' }}>
            {e.nombre}
          </span>
        </div>
      ))}
    </div>
  );
}
