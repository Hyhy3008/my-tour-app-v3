'use client';

import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState, useRef, useMemo } from 'react';

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

// Thresholds
const RECENTER_THRESHOLD = 20; // Chỉ recenter khi di chuyển > 20m
const ROUTE_THRESHOLD = 50; // Chỉ tính lại route khi di chuyển > 50m

// Hàm tính khoảng cách
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Component recenter - chỉ recenter khi di chuyển > threshold
function SmartRecenter({ lat, lng }: { lat: number; lng: number }) {
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
      
      // Chỉ recenter khi di chuyển > threshold
      if (distance < RECENTER_THRESHOLD) {
        return;
      }
    }

    lastCenterRef.current = { lat, lng };
    map.flyTo([lat, lng], map.getZoom(), { animate: true, duration: 0.5 });
  }, [lat, lng, map]);

  return null;
}

interface MapProps {
  location: { lat: number; lng: number } | null;
}

export default function MapComponent({ location }: MapProps) {
  const [selectedDestination, setSelectedDestination] = useState<any>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const lastRouteLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const hasNotifiedRef = useRef(false);
  const fetchingRef = useRef(false);

  // Lắng nghe event hủy navigation
  useEffect(() => {
    const handleCancel = () => {
      setSelectedDestination(null);
      setRouteCoords([]);
      lastRouteLocationRef.current = null;
      window.dispatchEvent(new CustomEvent('navigation-cancelled'));
    };

    window.addEventListener('cancel-navigation', handleCancel);
    return () => window.removeEventListener('cancel-navigation', handleCancel);
  }, []);

  // Fetch route - chỉ khi di chuyển > threshold
  useEffect(() => {
    if (!location || !selectedDestination) {
      setRouteCoords([]);
      lastRouteLocationRef.current = null;
      return;
    }

    // Check xem có cần tính lại route không
    if (lastRouteLocationRef.current) {
      const distance = calculateDistance(
        lastRouteLocationRef.current.lat,
        lastRouteLocationRef.current.lng,
        location.lat,
        location.lng
      );
      
      // Chưa di chuyển đủ xa -> không tính lại
      if (distance < ROUTE_THRESHOLD) {
        return;
      }
    }

    // Tránh fetch nhiều lần cùng lúc
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const fetchRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${location.lng},${location.lat};${selectedDestination.lng},${selectedDestination.lat}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const coords = route.geometry.coordinates.map(
            (coord: number[]) => [coord[1], coord[0]] as [number, number]
          );
          setRouteCoords(coords);
          lastRouteLocationRef.current = { lat: location.lat, lng: location.lng };
          
          // Cập nhật thông tin route
          window.dispatchEvent(new CustomEvent('route-found', { 
            detail: {
              distance: (route.distance / 1000).toFixed(1),
              time: Math.round(route.duration / 60)
            }
          }));
        }
      } catch (error) {
        console.error('Routing error:', error);
      } finally {
        fetchingRef.current = false;
      }
    };

    fetchRoute();
  }, [location, selectedDestination]);

  // Reset khi đổi destination
  useEffect(() => {
    hasNotifiedRef.current = false;
    lastRouteLocationRef.current = null;
  }, [selectedDestination?.id]);

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
    >
      <TileLayer 
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        maxZoom={20}
      />

      {/* Vẽ đường đi */}
      {routeCoords.length > 0 && (
        <>
          <Polyline positions={routeCoords} color="#1e40af" weight={8} opacity={0.4} />
          <Polyline positions={routeCoords} color="#3b82f6" weight={5} opacity={0.9} />
        </>
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

      {/* Vị trí người dùng */}
      {location && (
        <>
          <Marker position={[location.lat, location.lng]} icon={userIcon}>
            <Popup>
              <p className="font-bold text-center">🧭 Vị trí của bạn</p>
            </Popup>
          </Marker>
          <SmartRecenter lat={location.lat} lng={location.lng} />
        </>
      )}
    </MapContainer>
  );
}
