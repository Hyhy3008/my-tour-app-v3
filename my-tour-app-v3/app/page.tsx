'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import BackgroundTracker from '@/components/BackgroundTracker';
import PaymentModal from '@/components/PaymentModal';
import PaywallOverlay from '@/components/PaywallOverlay';
import { Navigation, MapPin, Volume2, VolumeX, X } from 'lucide-react';

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
  const [isPaid, setIsPaid] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visitedCount, setVisitedCount] = useState(0);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; time: number } | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Check payment / secret bypass
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const secret = urlParams.get('secret');

    if (secret === process.env.NEXT_PUBLIC_ADMIN_SECRET) {
      setIsPaid(true);
      localStorage.setItem('tour_paid', 'true');
      window.history.replaceState({}, '', '/');
      return;
    }
    if (status === 'success') {
      setIsPaid(true);
      localStorage.setItem('tour_paid', 'true');
      window.history.replaceState({}, '', '/');
    }
    if (localStorage.getItem('tour_paid') === 'true') {
      setIsPaid(true);
    }
  }, []);

  // Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  }, []);

  // Route events
  useEffect(() => {
    const handleNavigateTo = (e: any) => {
      const destination = e.detail;
      setNavigatingTo(destination.name);
      setRouteInfo(null);
      handleNewMessage(`🗺️ Đang tìm đường đến ${destination.name}...`, false);
    };
    const handleRouteFound = (e: any) => {
      setRouteInfo(e.detail);
      handleNewMessage(`📍 Khoảng cách: ${e.detail.distance}km · Thời gian: ${e.detail.time} phút`, false);
    };
    const handleNavigateCancel = () => {
      setNavigatingTo(null);
      setRouteInfo(null);
    };
    window.addEventListener('navigate-to', handleNavigateTo);
    window.addEventListener('route-found', handleRouteFound);
    window.addEventListener('navigate-cancel', handleNavigateCancel);
    return () => {
      window.removeEventListener('navigate-to', handleNavigateTo);
      window.removeEventListener('route-found', handleRouteFound);
      window.removeEventListener('navigate-cancel', handleNavigateCancel);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewMessage = useCallback((msg: string, isAi: boolean) => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: isAi ? 'ai' : 'system', content: msg, time }]);
  }, []);

  const handleLocationVisited = useCallback(() => {
    setVisitedCount(prev => prev + 1);
  }, []);

  const handleStartTour = async () => {
    if (!isPaid) { setShowPayment(true); return; }
    if (!isTracking) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setIsTracking(true);
          handleNewMessage('🚀 Bắt đầu tour! Di chuyển đến các địa điểm để nghe thuyết minh.', false);
        },
        () => alert('Vui lòng cấp quyền GPS để sử dụng!'),
        { enableHighAccuracy: true }
      );
    } else {
      setIsTracking(false);
      handleNewMessage('⏹️ Đã tạm dừng tour.', false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) window.speechSynthesis?.cancel();
  };

  const cancelRoute = () => {
    setNavigatingTo(null);
    setRouteInfo(null);
    window.dispatchEvent(new CustomEvent('navigate-cancel'));
    handleNewMessage('❌ Đã hủy chỉ đường.', false);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-100 overflow-hidden relative">
      {!isPaid && <PaywallOverlay onPayment={() => setShowPayment(true)} />}

      <BackgroundTracker
        isTracking={isTracking && isPaid}
        isMuted={isMuted}
        onLocationUpdate={setLocation}
        onNewMessage={handleNewMessage}
        onLocationVisited={handleLocationVisited}
      />

      <PaymentModal isOpen={showPayment} onClose={() => setShowPayment(false)} />

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-3 safe-area-top">
        <div className="bg-white/95 backdrop-blur-md shadow-lg rounded-2xl p-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
              <MapPin className="text-white" size={20} />
            </div>
            <div>
              <h1 className="font-bold text-gray-800">Ninh Bình Tour</h1>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                <p className={`text-xs ${isTracking ? 'text-green-600' : 'text-gray-400'}`}>
                  {isTracking ? 'Đang dẫn đường' : 'Chờ kích hoạt'}
                </p>
                {visitedCount > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{visitedCount} điểm</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={toggleMute} className={`p-3 rounded-full transition-all ${isMuted ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-700'}`}>
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button onClick={handleStartTour} className={`p-3 rounded-full shadow-lg transition-all transform active:scale-95 ${isTracking ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white' : isPaid ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'bg-gray-300 text-gray-500'}`}>
              <Navigation size={22} className={isTracking ? 'animate-pulse' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Route Info Banner */}
      {navigatingTo && (
        <div className="absolute top-20 left-0 right-0 z-[999] px-3 animate-fadeIn">
          <div className="bg-blue-500/95 backdrop-blur text-white rounded-2xl p-3 max-w-sm mx-auto shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">Đang dẫn đường đến</p>
                <p className="font-bold">{navigatingTo}</p>
                {routeInfo ? (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm">📏 {routeInfo.distance}km</span>
                    <span className="text-sm">⏱️ {routeInfo.time} phút</span>
                  </div>
                ) : (
                  <p className="text-xs opacity-70 mt-1">Đang tính toán...</p>
                )}
              </div>
              <button onClick={cancelRoute} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition">
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

      {/* Chat Box */}
      <div className="h-[32vh] bg-white rounded-t-3xl shadow-2xl z-[1000] flex flex-col border-t border-gray-100">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex-grow overflow-y-auto px-4 pb-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-3">
                <Navigation className="text-blue-500" size={28} />
              </div>
              <p className="text-gray-500 text-sm">{isPaid ? 'Bấm Navigation để bắt đầu tour!' : 'Thanh toán để mở khóa AI Guide'}</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'ai' ? 'justify-start' : 'justify-center'} animate-fade-in`}>
              <div className={`max-w-[90%] p-3 rounded-2xl text-sm ${m.role === 'ai' ? 'bg-gradient-to-br from-blue-50 to-indigo-50 text-gray-800 border border-blue-100' : 'bg-gray-100 text-gray-500 text-xs py-2 px-4'}`}>
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.role === 'ai' && <p className="text-xs text-gray-400 mt-2 text-right">{m.time}</p>}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
}
