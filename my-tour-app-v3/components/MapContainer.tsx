'use client';

import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';

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
  { id: "trang-an", name: "Tràng An", lat: 20.2541, lng: 105.9149, radius: 100, prompt: "Khách vừa đến Tràng An - Di sản UNESCO. Giới thiệu về đi thuyền xuyên hang." },
  { id: "hang-mua", name: "Hang Múa", lat: 20.2316, lng: 105.9189, radius: 50, prompt: "Khách đến Hang Múa. Kể về 486 bậc đá." },
  { id: "bai-dinh", name: "Chùa Bái Đính", lat: 20.2686, lng: 105.8481, radius: 150, prompt: "Khách đến chùa Bái Đính lớn nhất Đông Nam Á." },
  { id: "tam-coc", name: "Tam Cốc", lat: 20.2153, lng: 105.9218, radius: 80, prompt: "Khách đến Tam Cốc. Giới thiệu ba hang." },
  { id: "hoa-lu", name: "Cố đô Hoa Lư", lat: 20.2589, lng: 105.9256, radius: 40, prompt: "Khách đến Cố đô Hoa Lư, kinh đô cổ." },
  { id: "thien-ha", name: "Động Thiên Hà", lat: 20.2083, lng: 105.8944, radius: 30, prompt: "Khách đến Động Thiên Hà lung linh." },
  { id: "sen", name: "Cánh đồng Sen", lat: 20.2200, lng: 105.9100, radius: 120, prompt: "Khách ở cánh đồng sen đẹp." },
];

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Component nội bộ để update marker mà không re-render toàn bộ map
function GPSTracker({ isTracking }: { isTracking: boolean }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const visitedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isTracking) {
      // Cleanup
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    // Tạo marker 1 lần
    if (!markerRef.current) {
      markerRef.current = L.marker([0, 0], { icon: userIcon }).addTo(map);
      markerRef.current.bindPopup('🧭 Vị trí của bạn');
    }

    const handlePosition = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      
      // Cập nhật marker trực tiếp (không qua React state)
      markerRef.current?.setLatLng([latitude, longitude]);

      // Chỉ pan map nếu di chuyển > 30m
      if (lastPositionRef.current) {
        const dist = calculateDistance(
          lastPositionRef.current.lat,
          lastPositionRef.current.lng,
          latitude,
          longitude
        );
        if (dist > 30) {
          map.panTo([latitude, longitude]);
          lastPositionRef.current = { lat: latitude, lng: longitude };
        }
      } else {
        map.setView([latitude, longitude], 15);
        lastPositionRef.current = { lat: latitude, lng: longitude };
      }

      // Check proximity
      for (const loc of locations) {
        const dist = calculateDistance(latitude, longitude, loc.lat, loc.lng);
        if (dist < loc.radius && !visitedRef.current.has(loc.id)) {
          visitedRef.current.add(loc.id);
          // Dispatch event thay vì gọi callback
          window.dispatchEvent(new CustomEvent('location-arrived', { 
            detail: { name: loc.name, prompt: loc.prompt } 
          }));
          break;
        }
      }
    };

    // Lấy vị trí ban đầu
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
    );

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      () => {},
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTracking, map]);

  return null;
}

// Component routing
function RoutingControl() {
  const map = useMap();
  const polylineRef = useRef<L.Polyline | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const handleCancel = () => {
      setSelectedId(null);
      polylineRef.current?.remove();
      polylineRef.current = null;
      window.dispatchEvent(new CustomEvent('navigation-cancelled'));
    };

    const handleStop = () => {
      handleCancel();
    };

    window.addEventListener('cancel-navigation', handleCancel);
    window.addEventListener('stop-tracking', handleStop);

    return () => {
      window.removeEventListener('cancel-navigation', handleCancel);
      window.removeEventListener('stop-tracking', handleStop);
    };
  }, []);

  const handleSelectDestination = async (loc: any) => {
    if (selectedId === loc.id) {
      // Cancel
      setSelectedId(null);
      polylineRef.current?.remove();
      polylineRef.current = null;
      window.dispatchEvent(new CustomEvent('navigation-cancelled'));
      return;
    }

    setSelectedId(loc.id);
    window.dispatchEvent(new CustomEvent('navigate-to', { detail: loc }));

    // Lấy vị trí hiện tại và vẽ route
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${pos.coords.longitude},${pos.coords.latitude};${loc.lng},${loc.lat}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();
          
          if (data.routes?.[0]) {
            const route = data.routes[0];
            const coords = route.geometry.coordinates.map(
              (c: number[]) => [c[1], c[0]] as L.LatLngTuple
            );

            // Xóa polyline cũ
            polylineRef.current?.remove();
            
            // Vẽ polyline mới
            polylineRef.current = L.polyline(coords, {
              color: '#3b82f6',
              weight: 5,
              opacity: 0.8
            }).addTo(map);

            window.dispatchEvent(new CustomEvent('route-found', {
              detail: {
                distance: (route.distance / 1000).toFixed(1),
                time: Math.round(route.duration / 60)
              }
            }));
          }
        } catch (e) {
          console.error(e);
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000 }
    );
  };

  return (
    <>
      {locations.map((loc) => (
        <div key={loc.id}>
          <Circle 
            center={[loc.lat, loc.lng]} 
            radius={loc.radius} 
            pathOptions={{ 
              color: selectedId === loc.id ? '#ef4444' : '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
            }} 
          />
          <Marker position={[loc.lat, loc.lng]} icon={locationIcon}>
            <Popup>
              <div className="text-center p-1">
                <p className="font-bold">📍 {loc.name}</p>
                <button
                  onClick={() => handleSelectDestination(loc)}
                  className={`mt-2 px-3 py-1.5 text-white text-xs rounded-lg ${
                    selectedId === loc.id ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                >
                  {selectedId === loc.id ? '❌ Hủy' : '🗺️ Chỉ đường'}
                </button>
              </div>
            </Popup>
          </Marker>
        </div>
      ))}
    </>
  );
}

interface MapProps {
  isTracking: boolean;
}

export default function MapComponent({ isTracking }: MapProps) {
  return (
    <MapContainer 
      center={[20.2506, 105.9745]} 
      zoom={13} 
      style={{ height: '100%', width: '100%' }} 
      zoomControl={false}
    >
      <TileLayer 
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />
      
      <RoutingControl />
      <GPSTracker isTracking={isTracking} />
    </MapContainer>
  );
}
