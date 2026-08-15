import React from 'react';

const DIRECTIONS = [
  { label: 'N', deg: 0 },
  { label: 'NE', deg: 45 },
  { label: 'E', deg: 90 },
  { label: 'SE', deg: 135 },
  { label: 'S', deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270 },
  { label: 'NW', deg: 315 },
];

// Generate tick marks every 5 degrees (72 ticks per 360°)
function generateTicks() {
  const ticks = [];
  for (let deg = 0; deg < 360; deg += 5) {
    const dir = DIRECTIONS.find((d) => d.deg === deg);
    const isMajor = deg % 45 === 0;
    const isMinor = deg % 15 === 0 && !isMajor;
    ticks.push({ deg, label: dir?.label || null, isMajor, isMinor });
  }
  return ticks;
}

const TICKS = generateTicks();
const BAR_WIDTH_PX = 440; // must match .compass-bar-viewport width in CSS
const FULL_STRIP_DEG = 360;
// We render 3x the strip (before + center + after) to allow seamless wrapping
const PX_PER_DEG = BAR_WIDTH_PX / 120; // show ~120° in view at a time
// Position the strip so the center of the middle copy aligns with the viewport center
const STRIP_LEFT_PX = -(FULL_STRIP_DEG * PX_PER_DEG - BAR_WIDTH_PX / 2);

export default function CompassBar({ heading = 0 }) {
  const normalized = ((Number(heading) % 360) + 360) % 360;

  // Calculate offset: heading 0 = center on N
  const offset = normalized * PX_PER_DEG;

  return (
    <div className="compass-bar-wrapper">
      {/* Center indicator triangle */}
      <div className="compass-center-mark" />

      <div className="compass-bar-viewport">
        <div
          className="compass-bar-strip"
          style={{
            left: `${STRIP_LEFT_PX}px`,
            transform: `translateX(${-offset}px)`,
          }}
        >
          {/* Render 3 copies of the tick strip for seamless wrapping */}
          {[0, 1, 2].map((copy) =>
            TICKS.map((tick) => {
              const x = (copy * FULL_STRIP_DEG + tick.deg) * PX_PER_DEG;
              return (
                <div
                  key={`${copy}-${tick.deg}`}
                  className="compass-tick-group"
                  style={{ left: `${x}px` }}
                >
                  <div
                    className={`compass-tick ${
                      tick.isMajor ? 'major' : tick.isMinor ? 'minor' : ''
                    }`}
                  />
                  {tick.label && (
                    <span className={`compass-label ${tick.label === 'N' ? 'north' : ''}`}>
                      {tick.label}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
