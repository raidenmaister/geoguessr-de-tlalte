import React from 'react';
import { Monitor, Tablet } from 'lucide-react';

export default function DesktopOnlyNotice() {
  return (
    <div className="desktop-only-notice">
      <div className="desktop-only-card">
        <div className="device-icons" aria-hidden="true">
          <Monitor size={42} />
          <Tablet size={30} />
        </div>
        <h1>Sitio disponible en PC y tablets</h1>
        <p>Abre GeoGuessr Explorer desde una computadora o tablet para jugar.</p>
      </div>
    </div>
  );
}
