import React from 'react';
import { getSocketId } from '../services/client';

export default function DuelsHUD({ players }) {
  if (!players || players.length !== 2) return null;

  const myId = getSocketId();
  let leftPlayer, rightPlayer;
  
  if (players[0].id === myId || !players.find(p => p.id === myId)) {
    leftPlayer = players[0];
    rightPlayer = players[1];
  } else {
    leftPlayer = players[1];
    rightPlayer = players[0];
  }

  return (
    <div className="duels-hud">
      {/* Player 1 (Left) */}
      <div className="duels-player left">
        <div className="duels-info">
          <span className="duels-name">{leftPlayer.nombre}</span>
          <span className="duels-hp-text">{leftPlayer.hp} HP</span>
        </div>
        <div className="duels-bar-container">
          <div 
            className="duels-bar-fill" 
            style={{ 
              width: `${Math.max(0, (leftPlayer.hp / 5000) * 100)}%`,
              backgroundColor: leftPlayer.color?.hex || '#c56b49' 
            }}
          />
        </div>
      </div>

      <div className="duels-vs">VS</div>

      {/* Player 2 (Right) */}
      <div className="duels-player right">
        <div className="duels-info">
          <span className="duels-hp-text">{rightPlayer.hp} HP</span>
          <span className="duels-name">{rightPlayer.nombre}</span>
        </div>
        <div className="duels-bar-container right-align">
          <div 
            className="duels-bar-fill right-fill" 
            style={{ 
              width: `${Math.max(0, (rightPlayer.hp / 5000) * 100)}%`,
              backgroundColor: rightPlayer.color?.hex || '#8fb6b2'
            }}
          />
        </div>
      </div>
    </div>
  );
}
