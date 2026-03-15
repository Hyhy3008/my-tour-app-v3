'use client';

import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState, useRef } from 'react';

// Helper function tính khoảng cách
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

// Component vẽ đường đi
function RoutingMachine({ start, end }: { start: any, end: any }) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const hasNotifiedRef = useRef(false);
  const lastEndRef = useRef<string | null>(null);

  useEffect(() => {
    if (!start || !end) {
      setRouteCoords([]);
      return;
    }

    // Reset khi đổi destination
    if (lastEndRef.current !== end.id) {
      hasNotifiedRef.current = false;
      lastEndRef.current = end.id;
    }

    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(
            (coord: number[]) => [coord[1], coord[0]] as [number, number]
          );
          setRouteCoords(coords);
          
          // Chỉ thông báo 1 lần
          if (!hasNotifiedRef.current) {
            hasNotifiedRef.current = true;
            window.dispatchEvent(new CustomEvent('route-found', { 
              detail: {
                distance: (route.distance / 1000).toFixed(1),
                time: Math.round(route.duration / 60)
              }
            }));
          }
        }
      } catch (error) {
        console.error('Routing error:', error);
      }
    };

    fetchRoute();
  }, [start?.lat, start?.lng, end?.id]);

  if (routeCoords.length === 0) return null;

  return (
    <>
      {/* Viền đường */}
      <Polyline 
        positions={routeCoords} 
        color="#1e40af" 
        weight={8} 
        opacity={0.4} 
      />
      {/* Đường chính */}
      <Polyline 
        positions={routeCoords} 
        color="#3b82f6" 
        weight={5} 
        opacity={0.9} 
      />
    </>
  );
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { animate: true, duration: 1 });
  }, [lat, lng, map]);
  return null;
}

interface MapProps {
  location: { lat: number; lng: number } | null;
}

export default function MapComponent({ location }: MapProps) {
  const [selectedDestination, setSelectedDestination] = useState<any>(null);

  // Lắng nghe event hủy navigation
  useEffect(() => {
    const handleCancelNavigation = () => {
      setSelectedDestination(null);
    };

    window.addEventListener('cancel-navigation', handleCancelNavigation);
    return () => {
      window.removeEventListener('cancel-navigation', handleCancelNavigation);
    };
  }, []);

  const handleSelectDestination = (loc: any) => {
    if (selectedDestination?.id === loc.id) {
      // Bấm lại thì hủy
      setSelectedDestination(null);
      window.dispatchEvent(new CustomEvent('cancel-navigation'));
    } else {
      // Chọn destination mới
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
    >
      {/* Bản đồ Carto Voyager */}
      <TileLayer 
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        maxZoom={20}
      />

      {/* Vẽ đường đi */}
      {location && selectedDestination && (
        <RoutingMachine 
          start={location} 
          end={selectedDestination}
        />
      )}

      {/* Các địa điểm */}
      {locations.map((loc) => (
        <div key={loc.id}>
          <Circle 
            center={[loc.lat, loc.lng]} 
            radius={loc.radius} 
            pathOptions={{ 
              color: selectedDestination?.id === loc.id ? '#ef4444' : '#3b82f6',
              fillColor: selectedDestination?.id === loc.id ? '#ef4444' : '#3b82f6',
              fillOpacity: 0.15,
              weight: 2,
              dashArray: '5, 5'
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
                    className={`mt-2 px-3 py-1.5 text-white text-xs rounded-lg font-medium transition ${
                      selectedDestination?.id === loc.id 
                        ? 'bg-red-500 hover:bg-red-600' 
                        : 'bg-blue-500 hover:bg-blue-600'
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

      {/* Vị trí người dùng */}
      {location && (
        <>
          <Marker position={[location.lat, location.lng]} icon={userIcon}>
            <Popup>
              <div className="text-center">
                <p className="font-bold">🧭 Vị trí của bạn</p>
                <p className="text-xs text-gray-500">
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
              </div>
            </Popup>
          </Marker>
          <RecenterMap lat={location.lat} lng={location.lng} />
        </>
      )}
    </MapContainer>
  );
}
