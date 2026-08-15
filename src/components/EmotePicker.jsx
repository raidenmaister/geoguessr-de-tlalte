import React, { useState } from 'react';
import { Smile } from 'lucide-react';
import { enviarEmote } from '../services/client';

const EMOTES = ['👍', '😱', '😭', '🔥', '🎯', '👏', '🤡'];

export default function EmotePicker({ roomCode }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSend = (emote) => {
    if (roomCode) {
      enviarEmote(roomCode, emote);
    }
    setIsOpen(false);
  };

  return (
    <div className="emote-picker-wrapper">
      {isOpen && (
        <div className="emote-popover">
          {EMOTES.map((emoji) => (
            <button
              key={emoji}
              className="emote-btn"
              onClick={() => handleSend(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <button
        className="btn-emote-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Enviar emote en vivo"
      >
        <Smile size={20} />
      </button>
    </div>
  );
}
