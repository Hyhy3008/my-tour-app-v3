'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import BackgroundTracker from '@/components/BackgroundTracker';
import { Navigation, MapPin, Volume2, VolumeX, CheckCircle, X } from 'lucide-react';

const MapContainer = dynamic(() => import('@/components/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-200 animate-pulse flex items-center justify-center">
      <p className="text-gray-500">Đang tải bản đồ...</p>
    </div>
  ),
});

interface Message {
  role: 'ai' | 'system';
  content: string;
  time: string;
}

export default function Home() {
  const [isTracking, setIsTracking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaid] = useState(true); // ⭐ DEV MODE - Tắt thanh toán
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visitedCount, setVisitedCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Routing states
  const [routeInfo, setRouteInfo] = useState<{distance: string, time: number} | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  // Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Lắng nghe events từ Map (Routing)
  useEffect(() => {
    const handleNavigateTo = (e: any) => {
      const destination = e.detail;
      setNavigatingTo(destination.name);
      setRouteInfo(null);
      // Chỉ thông báo 1 lần trong chat
      handleNewMessage(`🗺️ Bắt đầu chỉ đường đến ${destination.name}`, false);
    };

    const handleRouteFound = (e: any) => {
      // Chỉ cập nhật banner, KHÔNG spam chat
      setRouteInfo(e.detail);
    };

    window.addEventListener('navigate-to', handleNavigateTo);
    window.addEventListener('route-found', handleRouteFound);

    return () => {
      window.removeEventListener('navigate-to', handleNavigateTo);
      window.removeEventListener('route-found', handleRouteFound);
    };
  }, []);

  const handleNewMessage = (msg: string, isAi: boolean) => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: isAi ? 'ai' : 'system', content: msg, time }]);
  };

  const handleStartTour = () => {
    if (!isTracking) {
      handleNewMessage('🔍 Đang xác định vị trí...', false);
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setIsTracking(true);
          setLocation({ lat: latitude, lng: longitude });
          handleNewMessage(`✅ Đã xác định vị trí!\n📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, false);
          handleNewMessage('🚀 Bắt đầu tour! Di chuyển đến các địa điểm để nghe thuyết minh.', false);
        },
        (error) => {
          let errorMsg = '❌ Lỗi GPS: ';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMsg += 'Bạn chưa cấp quyền vị trí.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg += 'Không thể xác định vị trí.';
              break;
            case error.TIMEOUT:
              errorMsg += 'Hết thời gian chờ.';
              break;
            default:
              errorMsg += error.message;
          }
          handleNewMessage(errorMsg, false);
          alert(errorMsg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setIsTracking(false);
      setNavigatingTo(null);
      setRouteInfo(null);
      handleNewMessage('⏹️ Đã dừng tour.', false);
    }
  };

  const handleCancelNavigation = () => {
    setNavigatingTo(null);
    setRouteInfo(null);
    handleNewMessage('❌ Đã hủy chỉ đường', false);
    // Dispatch event để Map xóa route
    window.dispatchEvent(new CustomEvent('cancel-navigation'));
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) window.speechSynthesis?.cancel();
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-100 overflow-hidden relative">
      {/* Background Tracker */}
      <BackgroundTracker
        isTracking={isTracking}
        isMuted={isMuted}
        onLocationUpdate={setLocation}
        onNewMessage={handleNewMessage}
        onLocationVisited={() => setVisitedCount(prev => prev + 1)}
      />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-3">
        <div className="bg-white/95 backdrop-blur-md shadow-lg rounded-2xl p-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <MapPin className="text-white" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-gray-800">Ninh Bình Tour</h1>
                {isPaid && (
                  <span className="flex items-center gap-1 text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                    <CheckCircle size={12} /> DEV
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                <p className={`text-xs ${isTracking ? 'text-green-600' : 'text-gray-400'}`}>
                  {isTracking ? 'Đang dẫn đường' : 'Chờ kích hoạt'}
                </p>
                {visitedCount > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                    {visitedCount} điểm
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={toggleMute} 
              className={`p-3 rounded-full transition-all ${isMuted ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-700'}`}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              onClick={handleStartTour}
              className={`p-3 rounded-full shadow-lg transition-all ${
                isTracking
                  ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white'
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
              }`}
            >
              <Navigation size={22} className={isTracking ? 'animate-pulse' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Route Info Banner */}
      {navigatingTo && routeInfo && (
        <div className="absolute top-20 left-0 right-0 z-[999] p-3">
          <div className="bg-blue-500/95 backdrop-blur text-white rounded-2xl p-3 max-w-sm mx-auto shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-90">Đang dẫn đường đến</p>
                <p className="font-bold">{navigatingTo}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm">📏 {routeInfo.distance}km</span>
                  <span className="text-sm">⏱️ {routeInfo.time} phút</span>
                </div>
              </div>
              <button
                onClick={handleCancelNavigation}
                className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="flex-grow z-0">
        <MapContainer location={location} />
      </div>

      {/* Chat */}
      <div className="h-[32vh] bg-white rounded-t-3xl shadow-2xl z-[1000] flex flex-col">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex-grow overflow-y-auto px-4 pb-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Navigation className="text-blue-500 mb-3" size={32} />
              <p className="text-gray-500 text-sm">Bấm Navigation để bắt đầu!</p>
              <p className="text-xs text-gray-400 mt-2">🔧 DEV MODE - Đã tắt thanh toán</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'ai' ? 'justify-start' : 'justify-center'}`}>
              <div className={`max-w-[90%] p-3 rounded-2xl text-sm ${
                m.role === 'ai' 
                  ? 'bg-blue-50 text-gray-800 border border-blue-100' 
                  : 'bg-gray-100 text-gray-500 text-xs'
              }`}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === 'ai' && (
                  <p className="text-xs text-gray-400 mt-2 text-right">{m.time}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
}
