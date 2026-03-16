'use client';

import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState, useCallback } from 'react';

// ✅ Share vị trí GPS - tránh gọi getCurrentPosition thêm lần nữa khi routing
const sharedPositionRef = { current: null as { lat: number; lng: number } | null };

// Lắng nghe GPS warm up từ page.tsx
if (typeof window !== 'undefined') {
  window.addEventListener('gps-warmed', (e: any) => {
    if (!sharedPositionRef.current) {
      sharedPositionRef.current = e.detail;
      console.log('SharedPosition set from warm up');
    }
  });
}

// Icons - GIỮ NGUYÊN
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

// ============================================
// THÊM: Locations theo city
// ============================================
const locationsData = {
  'ninh-binh': [
    { id: "trang-an", name: "Tràng An", lat: 20.2541, lng: 105.9149, radius: 100, prompt: "Khách vừa đến Tràng An - Di sản UNESCO. Giới thiệu ngắn gọn về trải nghiệm đi thuyền xuyên hang động." },
    { id: "hang-mua", name: "Hang Múa", lat: 20.2316, lng: 105.9189, radius: 50, prompt: "Khách đến Hang Múa. Kể về 486 bậc đá và view tuyệt đẹp trên đỉnh." },
    { id: "bai-dinh", name: "Chùa Bái Đính", lat: 20.2686, lng: 105.8481, radius: 150, prompt: "Khách đến chùa Bái Đính - chùa lớn nhất Đông Nam Á. Giới thiệu các kỷ lục." },
    { id: "tam-coc", name: "Tam Cốc", lat: 20.2153, lng: 105.9218, radius: 80, prompt: "Khách đến Tam Cốc. Giới thiệu về ba hang và mùa lúa chín." },
    { id: "hoa-lu", name: "Cố đô Hoa Lư", lat: 20.2589, lng: 105.9256, radius: 40, prompt: "Khách đến Cố đô Hoa Lư. Kể về vua Đinh và lịch sử kinh đô." },
    { id: "thien-ha", name: "Động Thiên Hà", lat: 20.2083, lng: 105.8944, radius: 30, prompt: "Khách đến Động Thiên Hà. Mô tả vẻ đẹp thạch nhũ lung linh." },
    { id: "sen", name: "Cánh đồng Sen", lat: 20.2200, lng: 105.9100, radius: 120, prompt: "Khách ở cánh đồng sen. Gợi ý thời điểm và góc chụp ảnh đẹp." },
  ],
  'hanoi': [
    { id: "hoan-kiem", name: "Hồ Hoàn Kiếm", lat: 21.0285, lng: 105.8542, radius: 150, prompt: "Khách đến Hồ Hoàn Kiếm - trái tim Hà Nội. Kể về Tháp Rùa, đền Ngọc Sơn và truyền thuyết vua Lê trả gươm." },
    { id: "old-quarter", name: "Phố Cổ Hà Nội", lat: 21.0340, lng: 105.8500, radius: 200, prompt: "Khách đang ở Phố Cổ Hà Nội. Giới thiệu 36 phố phường, mỗi phố một nghề truyền thống." },
    { id: "temple-lit", name: "Văn Miếu Quốc Tử Giám", lat: 21.0294, lng: 105.8354, radius: 100, prompt: "Khách đến Văn Miếu - trường đại học đầu tiên của Việt Nam từ năm 1070. Giới thiệu 5 sân và 82 bia tiến sĩ." },
    { id: "ho-chi-minh", name: "Lăng Chủ tịch Hồ Chí Minh", lat: 21.0369, lng: 105.8350, radius: 150, prompt: "Khách đến Lăng Bác. Giới thiệu về Chủ tịch Hồ Chí Minh và quần thể di tích." },
    { id: "one-pillar", name: "Chùa Một Cột", lat: 21.0359, lng: 105.8337, radius: 30, prompt: "Khách đến Chùa Một Cột. Giải thích kiến trúc hình hoa sen độc đáo." },
    { id: "citadel", name: "Hoàng Thành Thăng Long", lat: 21.0340, lng: 105.8400, radius: 200, prompt: "Khách đến Hoàng Thành Thăng Long - Di sản UNESCO. Giới thiệu 1000 năm lịch sử." },
    { id: "hoa-lo", name: "Nhà tù Hỏa Lò", lat: 21.0257, lng: 105.8468, radius: 50, prompt: "Khách đến Nhà tù Hỏa Lò. Kể về lịch sử từ thời Pháp thuộc đến chiến tranh Việt Nam." },
    { id: "dong-xuan", name: "Chợ Đồng Xuân", lat: 21.0383, lng: 105.8498, radius: 80, prompt: "Khách đến Chợ Đồng Xuân - chợ lớn nhất Hà Nội. Gợi ý mua sắm và đặc sản." },
    { id: "west-lake", name: "Hồ Tây", lat: 21.0545, lng: 105.8234, radius: 300, prompt: "Khách đến Hồ Tây - hồ lớn nhất Hà Nội. Giới thiệu chùa Trấn Quốc và điểm ngắm hoàng hôn." },
    { id: "train-street", name: "Phố Tàu", lat: 21.0291, lng: 105.8515, radius: 40, prompt: "Khách đến Phố Tàu nổi tiếng. Giải thích trải nghiệm độc đáo và giờ tàu chạy." },
    { id: "st-joseph", name: "Nhà thờ Lớn Hà Nội", lat: 21.0288, lng: 105.8490, radius: 50, prompt: "Khách đến Nhà thờ Lớn - kiến trúc Gothic từ 1886. Giới thiệu khu vực Nhà Thờ với nhiều quán cafe." },
    { id: "opera", name: "Nhà hát Lớn Hà Nội", lat: 21.0245, lng: 105.8573, radius: 60, prompt: "Khách đến Nhà hát Lớn - kiệt tác kiến trúc Pháp từ 1911. Mô tả vẻ đẹp và ý nghĩa văn hóa." },
  ]
};

const cityCenter = {
  'ninh-binh': { lat: 20.2506, lng: 105.9745, zoom: 13 },
  'hanoi': { lat: 21.0285, lng: 105.8542, zoom: 14 }
};

// GIỮ NGUYÊN: Hàm tính khoảng cách
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================
// THÊM: Component xử lý chuyển city
// ============================================
function CityChangeHandler({ selectedCity }: { selectedCity: 'ninh-binh' | 'hanoi' }) {
  const map = useMap();
  const prevCityRef = useRef(selectedCity);

  useEffect(() => {
    if (prevCityRef.current !== selectedCity) {
      const center = cityCenter[selectedCity];
      map.flyTo([center.lat, center.lng], center.zoom, { duration: 1.5 });
      prevCityRef.current = selectedCity;
    }
  }, [selectedCity, map]);

  return null;
}

// ============================================
// GIỮ NGUYÊN: GPSTracker (chỉ thêm prop selectedCity)
// ============================================
function GPSTracker({ isTracking, selectedCity }: { isTracking: boolean; selectedCity: 'ninh-binh' | 'hanoi' }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastPanRef = useRef<{ lat: number; lng: number } | null>(null);
  const visitedRef = useRef<Set<string>>(new Set());
  const isFirstPositionRef = useRef(true);

  // Reset visited khi đổi city
  useEffect(() => {
    visitedRef.current.clear();
  }, [selectedCity]);

  useEffect(() => {
    if (!isTracking) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }
      isFirstPositionRef.current = true;
      return;
    }

    if (!markerRef.current) {
      markerRef.current = L.marker([0, 0], { icon: userIcon })
        .addTo(map)
        .bindPopup('🧭 Vị trí của bạn');
    }

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle([0, 0], {
        radius: 0,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        weight: 1,
      }).addTo(map);
    }

    const locations = locationsData[selectedCity];

    const handlePosition = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      // ✅ Lưu vị trí mới nhất để RoutingControl dùng ngay không cần hỏi lại
      sharedPositionRef.current = { lat: latitude, lng: longitude };

      markerRef.current?.setLatLng([latitude, longitude]);
      accuracyCircleRef.current?.setLatLng([latitude, longitude]);
      accuracyCircleRef.current?.setRadius(Math.min(accuracy, 100));

      if (isFirstPositionRef.current) {
        map.setView([latitude, longitude], 16);
        lastPanRef.current = { lat: latitude, lng: longitude };
        isFirstPositionRef.current = false;
      } else if (lastPanRef.current) {
        const dist = calculateDistance(
          lastPanRef.current.lat,
          lastPanRef.current.lng,
          latitude,
          longitude
        );
        if (dist > 50) {
          map.panTo([latitude, longitude]);
          lastPanRef.current = { lat: latitude, lng: longitude };
        }
      }

      for (const loc of locations) {
        const dist = calculateDistance(latitude, longitude, loc.lat, loc.lng);
        if (dist < loc.radius && !visitedRef.current.has(loc.id)) {
          visitedRef.current.add(loc.id);
          window.dispatchEvent(new CustomEvent('location-arrived', {
            detail: { name: loc.name, prompt: loc.prompt, locationId: loc.id }
          }));
          break;
        }
      }
    };

    navigator.geolocation.getCurrentPosition(
      handlePosition,
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      () => {},
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTracking, map, selectedCity]);

  useEffect(() => {
    const handleStop = () => {
      visitedRef.current.clear();
    };
    window.addEventListener('stop-tracking', handleStop);
    return () => window.removeEventListener('stop-tracking', handleStop);
  }, []);

  return null;
}

// ============================================
// GIỮ NGUYÊN: RoutingControl (chỉ thêm prop selectedCity, language)
// ============================================
function RoutingControl({ isTracking, selectedCity, language }: { isTracking: boolean; selectedCity: 'ninh-binh' | 'hanoi'; language: string }) {
  const map = useMap();
  const polylineRef = useRef<L.Polyline | null>(null);
  const shadowPolylineRef = useRef<L.Polyline | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; time: number; name: string } | null>(null);
  const fetchingRef = useRef(false);

  const locations = locationsData[selectedCity];

  const clearRoute = useCallback(() => {
    polylineRef.current?.remove();
    polylineRef.current = null;
    shadowPolylineRef.current?.remove();
    shadowPolylineRef.current = null;
    setRouteInfo(null);
  }, []);

  // Reset khi đổi city
  useEffect(() => {
    setSelectedId(null);
    clearRoute();
  }, [selectedCity, clearRoute]);

  useEffect(() => {
    const handleCancel = () => {
      setSelectedId(null);
      clearRoute();
    };

    window.addEventListener('cancel-navigation', handleCancel);
    window.addEventListener('stop-tracking', handleCancel);

    return () => {
      window.removeEventListener('cancel-navigation', handleCancel);
      window.removeEventListener('stop-tracking', handleCancel);
    };
  }, [clearRoute]);

  const handleSelectDestination = async (loc: typeof locations[0]) => {
    if (selectedId === loc.id) {
      setSelectedId(null);
      clearRoute();
      window.dispatchEvent(new CustomEvent('navigation-cancelled'));
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setSelectedId(loc.id);
    // ✅ Dispatch ngay lập tức - không chờ route tính xong
    window.dispatchEvent(new CustomEvent('navigate-to', { detail: loc }));

    try {
      // ✅ Dùng vị trí cached từ GPSTracker - KHÔNG gọi getCurrentPosition lại (tốn 2-5s)
      let userLat: number;
      let userLng: number;

      if (sharedPositionRef.current) {
        // Có vị trí cached → dùng ngay, nhanh hơn rất nhiều
        userLat = sharedPositionRef.current.lat;
        userLng = sharedPositionRef.current.lng;
      } else {
        // Chưa có vị trí → lấy lần đầu
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 30000,
          });
        });
        userLat = position.coords.latitude;
        userLng = position.coords.longitude;
        sharedPositionRef.current = { lat: userLat, lng: userLng };
      }

      // ✅ Dùng OSRM với timeout ngắn hơn
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${loc.lng},${loc.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (data.routes?.[0]) {
        const route = data.routes[0];
        const coords: L.LatLngTuple[] = route.geometry.coordinates.map(
          (c: number[]) => [c[1], c[0]]
        );

        clearRoute();

        shadowPolylineRef.current = L.polyline(coords, {
          color: '#1e40af', weight: 8, opacity: 0.3,
        }).addTo(map);

        polylineRef.current = L.polyline(coords, {
          color: '#3b82f6', weight: 5, opacity: 0.9,
        }).addTo(map);

        map.fitBounds(polylineRef.current.getBounds(), { padding: [50, 50] });

        const routeDetail = {
          distance: (route.distance / 1000).toFixed(1),
          time: Math.round(route.duration / 60),
          name: loc.name,
        };
        setRouteInfo(routeDetail);
        window.dispatchEvent(new CustomEvent('route-found', { detail: routeDetail }));
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('Routing timeout');
      } else {
        console.error('Routing error:', error);
      }
      setSelectedId(null);
      window.dispatchEvent(new CustomEvent('navigation-cancelled'));
    } finally {
      fetchingRef.current = false;
    }
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
              fillColor: selectedId === loc.id ? '#ef4444' : '#3b82f6',
              fillOpacity: 0.1,
              weight: 2,
              dashArray: selectedId === loc.id ? undefined : '5, 5',
            }}
          />
          <Marker position={[loc.lat, loc.lng]} icon={locationIcon}>
            <Popup>
              <div className="text-center p-1 min-w-[140px]">
                <p className="font-bold text-gray-800">📍 {loc.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{loc.radius}m radius</p>
                <button
                  onClick={() => handleSelectDestination(loc)}
                  className={`mt-2 px-4 py-2 text-white text-xs rounded-lg font-medium transition-colors w-full ${
                    selectedId === loc.id
                      ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-blue-500 hover:bg-blue-600'
                  }`}
                >
                  {selectedId === loc.id
                    ? (language === 'vi' ? '❌ Hủy chỉ đường' : '❌ Cancel')
                    : (language === 'vi' ? '🗺️ Chỉ đường' : '🗺️ Navigate')
                  }
                </button>
                {/* ✅ Hiện route info ngay trong Popup - không banner che màn hình */}
                {selectedId === loc.id && routeInfo && routeInfo.name === loc.name && (
                  <div className="mt-2 bg-blue-50 rounded-lg p-2 text-xs text-blue-700">
                    <span className="mr-2">📏 {routeInfo.distance}km</span>
                    <span>⏱️ {routeInfo.time} {language === 'vi' ? 'phút' : 'min'}</span>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        </div>
      ))}
    </>
  );
}

// ============================================
// THÊM: Props mới cho MapComponent
// ============================================
interface MapProps {
  isTracking: boolean;
  selectedCity: 'ninh-binh' | 'hanoi';
  language: string;
}

export default function MapComponent({ isTracking, selectedCity, language }: MapProps) {
  const center = cityCenter[selectedCity];
  
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={center.zoom}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
        maxZoom={19}
      />

      <CityChangeHandler selectedCity={selectedCity} />
      <RoutingControl isTracking={isTracking} selectedCity={selectedCity} language={language} />
      <GPSTracker isTracking={isTracking} selectedCity={selectedCity} />
    </MapContainer>
  );
}
