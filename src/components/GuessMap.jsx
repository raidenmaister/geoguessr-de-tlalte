import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import L from 'leaflet';
import { MapPin, Crosshair } from 'lucide-react';
import { playPinDropSFX } from '../utils/audio';
import { warmupAudio } from '../utils/audio';

const CENTRO_LAT = 21.782;
const CENTRO_LNG = -103.300;
const ZOOM_INICIAL = 14;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const guessIcon = L.divIcon({
  className: 'guess-marker-icon',
  html: `
    <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.164 0 0 7.164 0 16c0 10.492 14.125 24.56 14.734 25.172a1.728 1.728 0 002.532 0C17.875 40.56 32 26.492 32 16 32 7.164 24.836 0 16 0z" fill="#c56b49"/>
      <circle cx="16" cy="16" r="7" fill="white"/>
      <circle cx="16" cy="16" r="4" fill="#c56b49"/>
    </svg>
  `,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -42],
});

const GuessMap = forwardRef(function GuessMap(
  { onGuessPlaced, onGuessCleared, isExpanded, onToggleExpand, onHoverChange },
  ref
) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [guessCoords, setGuessCoords] = useState(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [CENTRO_LAT, CENTRO_LNG],
      zoom: ZOOM_INICIAL,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.control.attribution({ position: 'bottomleft', prefix: false })
      .addAttribution('© <a href="https://www.openstreetmap.org/copyright">OSM</a>')
      .addTo(map);

    map.on('click', (e) => {
      warmupAudio();
      const { lat, lng } = e.latlng;
      playPinDropSFX();

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const marker = L.marker([lat, lng], { icon: guessIcon, draggable: true }).addTo(map);
        
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const coords = { lat: pos.lat, lng: pos.lng };
          setGuessCoords(coords);
          if (onGuessPlaced) onGuessPlaced(coords);
          playPinDropSFX();
        });

        markerRef.current = marker;
      }

      const coords = { lat, lng };
      setGuessCoords(coords);
      if (onGuessPlaced) onGuessPlaced(coords);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      const timer = setTimeout(() => {
        mapRef.current.invalidateSize();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  const clearMarker = useCallback(() => {
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
      setGuessCoords(null);
      if (onGuessCleared) onGuessCleared();
    }
    if (mapRef.current) {
      mapRef.current.setView([CENTRO_LAT, CENTRO_LNG], ZOOM_INICIAL);
    }
  }, [onGuessCleared]);

  useImperativeHandle(ref, () => ({
    clearMarker,
  }));

  return (
    <div className={`guess-map-wrapper ${isExpanded ? 'expanded' : ''}`}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      <div className="guess-map-header" onClick={onToggleExpand}>
        <div className="guess-map-header-left">
          <MapPin size={16} className="icon-guess" />
          <span className="guess-map-title">Coloca tu pin</span>
        </div>
        {guessCoords && (
          <span className="guess-map-coords">
            {guessCoords.lat.toFixed(5)}, {guessCoords.lng.toFixed(5)}
          </span>
        )}
      </div>

      <div
        ref={mapContainerRef}
        className="guess-map-container"
      />

      {!guessCoords && (
        <div className="guess-map-hint">
          <Crosshair size={18} />
          <span>Haz clic en el mapa</span>
        </div>
      )}
    </div>
  );
});

export default GuessMap;
