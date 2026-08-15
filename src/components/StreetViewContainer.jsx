import React, { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { AlertTriangle, Key } from 'lucide-react';

let optionsSet = false;

export default function StreetViewContainer({ apiKey, currentCoord, viewMode = 'libre', panoHeading = null, isHidden = false, onPanoramaLoaded, onOpenKeyModal }) {
  const containerRef = useRef(null);
  const panoramaRef = useRef(null);
  const googleRef = useRef(null);
  const viewModeRef = useRef(viewMode);
  const panoHeadingRef = useRef(panoHeading);
  const [loadingStatus, setLoadingStatus] = useState('Iniciando...');
  const [errorMessage, setErrorMessage] = useState(null);

  viewModeRef.current = viewMode;
  panoHeadingRef.current = panoHeading;

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;

    let isMounted = true;
    setErrorMessage(null);

    async function init() {
      try {
        if (!optionsSet) {
          setOptions({
            apiKey: apiKey,
            version: 'weekly',
          });
          optionsSet = true;
        }

        if (!googleRef.current) {
          setLoadingStatus('Cargando API de Google Maps...');
          const streetViewLib = await importLibrary('streetView');
          if (!isMounted) return;
          googleRef.current = streetViewLib;
        }

        const { StreetViewPanorama, StreetViewService, StreetViewStatus } = googleRef.current;

        if (!panoramaRef.current) {
          setLoadingStatus('Inicializando visor de Street View...');

          const panorama = new StreetViewPanorama(containerRef.current, {
            showRoadName: false,
            showRoadLabels: false,
            compassControl: false,
            zoomControl: false,
            panControl: false,
            fullscreenControl: false,
            addressControl: false,
            enableCloseButton: false,
            motionTrackingControl: false,
            linksControl: false,
            clickToGo: false,
            imageDateControl: false,
            scrollwheel: true,
            pov: {
              heading: Math.floor(Math.random() * 360),
              pitch: 0,
            },
            zoom: 1,
          });

          panoramaRef.current = panorama;

          panorama.addListener('status_changed', () => {
            const status = panorama.getStatus();
            if (status === StreetViewStatus.OK) {
              setLoadingStatus('Ubicación lista');
              setErrorMessage(null);
              if (onPanoramaLoaded) onPanoramaLoaded(panorama);
            } else if (status === 'ZERO_RESULTS') {
              setLoadingStatus('Error: Sin cobertura');
              setErrorMessage('No se encontró cobertura de Street View en esta coordenada.');
            } else {
              setLoadingStatus(`Error: ${status}`);
            }
          });

          panorama.addListener('pov_changed', () => {
            if (viewModeRef.current !== 'estatico') return;
            const heading = Number(panoHeadingRef.current) || 0;
            const pov = panorama.getPov();
            if (Math.abs(pov.heading - heading) > 0.1 || Math.abs(pov.pitch) > 0.1) {
              panorama.setPov({ heading, pitch: 0 });
            }
          });

          panorama.addListener('zoom_changed', () => {
            if (viewModeRef.current === 'estatico' && panorama.getZoom() !== 1) panorama.setZoom(1);
          });
        }

        setLoadingStatus('Cargando panorama...');
        const panorama = panoramaRef.current;

        if (currentCoord?.pano_id) {
           panorama.setPano(currentCoord.pano_id);
           panorama.setPov({
             heading: ['estatico', 'temporal'].includes(viewMode) && panoHeading != null ? Number(panoHeading) : Math.floor(Math.random() * 360),
             pitch: 0,
           });
        } else {
          const svService = new StreetViewService();
          const latLng = { lat: Number(currentCoord.lat), lng: Number(currentCoord.lng) };

          svService.getPanorama({ location: latLng, radius: 100 }, (data, status) => {
            if (!isMounted) return;
            if (status === StreetViewStatus.OK && data?.location?.pano) {
              panorama.setPano(data.location.pano);
            } else {
              panorama.setPosition(latLng);
            }
             panorama.setPov({
               heading: ['estatico', 'temporal'].includes(viewMode) && panoHeading != null ? Number(panoHeading) : Math.floor(Math.random() * 360),
               pitch: 0,
             });
          });
        }
      } catch (err) {
        console.error('Error al cargar Google Maps API:', err);
        if (!isMounted) return;
        setLoadingStatus('Error de API Key');
        setErrorMessage(
          'Error al cargar la API de Google Maps. Verifica que tu API Key sea válida y que la Street View API esté habilitada en Google Cloud Console.'
        );
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [apiKey, currentCoord, viewMode, panoHeading]);

  return (
    <div className={`street-view-container ${isHidden ? 'street-view-hidden' : ''}`}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {errorMessage && (
        <div className="api-error-banner">
          <AlertTriangle size={36} className="icon-danger" />
          <div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '6px', color: '#fff' }}>
              Problema con Google Street View
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              {errorMessage}
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={onOpenKeyModal}
            style={{ borderRadius: '12px', padding: '10px 18px', fontSize: '0.9rem' }}
          >
            <Key size={16} />
            <span>Configurar / Cambiar API Key</span>
          </button>
        </div>
      )}
    </div>
  );
}
