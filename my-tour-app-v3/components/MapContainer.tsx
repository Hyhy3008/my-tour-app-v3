'use client';

import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState, useRef, memo } from 'react';

const userIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], 
  iconAnchor: [12, 41],
});

const locationIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], 
  iconAnchor: [12, 41],
});

const locations = [
  { id: "trang-an", name: "Tràng An", lat: 20.2541, lng: 105.9149, radius: 100 },
  { id: "hang-mua", name: "Hang Múa", lat: 20.2316, lng: 105.9189, radius: 50 },
  { id: "bai-dinh", name: "Chùa Bái Đính", lat: 20.2686, lng: 105.8481, radius: 150 },
  { id: "tam-coc", name: "Tam Cốc", lat: 20.2153, lng: 105.9218, radius: 80 },
  { id: "hoa-lu", name: "Cố đô Hoa Lư", lat: 20.2589, lng: 105.9256, radius: 40 },
  { id: "thien-ha", name: "Động Thiên Hà", lat: 20.2083, lng: 105.8944, radius: 30 },
  { id: "sen", name: "Cánh đồng Sen", lat: 20.2200, lng: 105.9100, radius: 120 },
];

const RECENTER_THRESHOLD = 30; // Tăng lên 30m
const ROUTE_THRESHOLD = 100; // Tăng lên 100m

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Memo component để không re-render khi không cần
const SmartRecenter = memo(function SmartRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (lastCenterRef.current) {
      const distance = calculateDistance(
        lastCenterRef.current.lat,
        lastCenterRef.current.lng,
        lat,
        lng
      );
      
      if (distance < RECENTER_THRESHOLD) return;
    }

    lastCenterRef.current = { lat, lng };
    // Tắt animation để tăng hiệu suất
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);

  return null;
});

interface MapProps {
  location: { lat: number; lng: number } | null;
}

function MapComponent({ location }: MapProps) {
  const [selectedDestination, setSelectedDestination] = useState<any>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const lastRouteLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const fetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup khi unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const handleCancel = () => {
      setSelectedDestination(null);
      setRouteCoords([]);
      lastRouteLocationRef.current = null;
      abortControllerRef.current?.abort();
    };

    window.addEventListener('cancel-navigation', handleCancel);
    return () => window.removeEventListener('cancel-navigation', handleCancel);
  }, []);

  useEffect(() => {
    if (!location || !selectedDestination) {
      setRouteCoords([]);
      lastRouteLocationRef.current = null;
      abortControllerRef.current?.abort();
      return;
    }

    // Check threshold
    if (lastRouteLocationRef.current) {
      const distance = calculateDistance(
        lastRouteLocationRef.current.lat,
        lastRouteLocationRef.current.lng,
        location.lat,
        location.lng
      );
      
      if (distance < ROUTE_THRESHOLD) return;
    }

    if (fetchingRef.current) return;

    fetchingRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${location.lng},${location.lat};${selectedDestination.lng},${selectedDestination.lat}?overview=full&geometries=geojson`;
        
        const response = await fetch(url, { 
          signal: abortControllerRef.current?.signal 
        });
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(
            (coord: number[]) => [coord[1], coord[0]] as [number, number]
          );
          setRouteCoords(coords);
          lastRouteLocationRef.current = { lat: location.lat, lng: location.lng };
          
          window.dispatchEvent(new CustomEvent('route-found', { 
            detail: {
              distance: (route.distance / 1000).toFixed(1),
              time: Math.round(route.duration / 60)
            }
          }));
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Routing error:', error);
        }
      } finally {
        fetchingRef.current = false;
      }
    };

    fetchRoute();
  }, [location?.lat, location?.lng, selectedDestination?.id]);

  const handleSelectDestination = (loc: any) => {
    if (selectedDestination?.id === loc.id) {
      setSelectedDestination(null);
      setRouteCoords([]);
      lastRouteLocationRef.current = null;
      window.dispatchEvent(new CustomEvent('navigation-cancelled'));
    } else {
      setSelectedDestination(loc);
      window.dispatchEvent(new CustomEvent('navigate-to', { detail: loc }));
    }
  };

  return (
    <MapContainer 
      center={[20.2506, 105.9745]} 
      zoom={13} 
      style={{ height: '100%', width: '100%' }} 
      zoomControl={false}
      preferCanvas={true} // Dùng Canvas thay vì SVG để tăng hiệu suất
    >
      <TileLayer 
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={20}
        updateWhenIdle={true} // Chỉ update khi map idle
        keepBuffer={2}
      />

      {routeCoords.length > 0 && (
        <Polyline 
          positions={routeCoords} 
          color="#3b82f6" 
          weight={5} 
          opacity={0.8}
        />
      )}

      {locations.map((loc) => (
        <div key={loc.id}>
          <Circle 
            center={[loc.lat, loc.lng]} 
            radius={loc.radius} 
            pathOptions={{ 
              color: selectedDestination?.id === loc.id ? '#ef4444' : '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
            }} 
          />
          <Marker position={[loc.lat, loc.lng]} icon={locationIcon}>
            <Popup>
              <div className="text-center p-1">
                <p className="font-bold text-gray-800">📍 {loc.name}</p>
                <p className="text-xs text-gray-500 mt-1">Bán kính: {loc.radius}m</p>
                {location && (
                  <button
                    onClick={() => handleSelectDestination(loc)}
                    className={`mt-2 px-3 py-1.5 text-white text-xs rounded-lg font-medium ${
                      selectedDestination?.id === loc.id ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                  >
                    {selectedDestination?.id === loc.id ? '❌ Hủy' : '🗺️ Chỉ đường'}
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        </div>
      ))}

      {location && (
        <>
          <Marker position={[location.lat, location.lng]} icon={userIcon}>
            <Popup><p className="font-bold text-center">🧭 Vị trí của bạn</p></Popup>
          </Marker>
          <SmartRecenter lat={location.lat} lng={location.lng} />
        </>
      )}
    </MapContainer>
  );
}

// Export với memo để tránh re-render không cần thiết
export default memo(MapComponent);
