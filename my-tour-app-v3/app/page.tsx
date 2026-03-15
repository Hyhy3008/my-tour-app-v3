'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Navigation, MapPin, Volume2, VolumeX, CheckCircle, X } from 'lucide-react';

const MapContainer = dynamic(() => import('@/components/MapContainer'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-gray-200" />,
});

interface Message {
  role: 'ai' | 'system';
  content: string;
  time: string;
}

export default function Home() {
  const [isTracking, setIsTracking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visitedCount, setVisitedCount] = useState(0);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; time: number } | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  
  // ⭐ KHÔNG dùng useState cho location - tránh re-render
  const [mapKey, setMapKey] = useState(0); // Chỉ để force update map khi cần
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Lắng nghe events
  useEffect(() => {
    const handleNavigateTo = (e: any) => {
      setNavigatingTo(e.detail.name);
      setRouteInfo(null);
      addMessage(`🗺️ Chỉ đường đến ${e.detail.name}`, false);
    };

    const handleRouteFound = (e: any) => {
      setRouteInfo(e.detail);
    };

    const handleCancelNav = () => {
      setNavigatingTo(null);
      setRouteInfo(null);
    };

    const handleLocationArrived = (e: any) => {
      setVisitedCount(prev => prev + 1);
      addMessage(`📍 ${e.detail.name}`, false);
      
      // Gọi AI
      fetchAI(e.detail.prompt);
    };

    window.addEventListener('navigate-to', handleNavigateTo);
    window.addEventListener('route-found', handleRouteFound);
    window.addEventListener('navigation-cancelled', handleCancelNav);
    window.addEventListener('location-arrived', handleLocationArrived);

    return () => {
      window.removeEventListener('navigate-to', handleNavigateTo);
      window.removeEventListener('route-found', handleRouteFound);
      window.removeEventListener('navigation-cancelled', handleCancelNav);
      window.removeEventListener('location-arrived', handleLocationArrived);
    };
  }, []);

  const addMessage = useCallback((msg: string, isAi: boolean) => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: isAi ? 'ai' : 'system', content: msg, time }]);
  }, []);

  const fetchAI = async (prompt: string) => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextPrompt: prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        addMessage(data.reply, true);
        
        // TTS
        if (!isMuted && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(data.reply);
          u.lang = 'vi-VN';
          u.rate = 0.9;
          window.speechSynthesis.speak(u);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartTour = () => {
    if (!isTracking) {
      addMessage('🚀 Bắt đầu tour!', false);
      setIsTracking(true);
      setMapKey(prev => prev + 1); // Force update map
    } else {
      setIsTracking(false);
      setNavigatingTo(null);
      setRouteInfo(null);
      addMessage('⏹️ Đã dừng.', false);
      window.dispatchEvent(new CustomEvent('stop-tracking'));
    }
  };

  const handleCancelNavigation = () => {
    setNavigatingTo(null);
    setRouteInfo(null);
    addMessage('❌ Đã hủy', false);
    window.dispatchEvent(new CustomEvent('cancel-navigation'));
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-100 overflow-hidden relative">
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
                <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle size={12} /> DEV
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-green-500' : 'bg-gray-300'}`} />
                <p className={`text-xs ${isTracking ? 'text-green-600' : 'text-gray-400'}`}>
                  {isTracking ? 'Đang theo dõi' : 'Chờ'}
                </p>
                {visitedCount > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                    {visitedCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className={`p-3 rounded-full ${isMuted ? 'bg-gray-200' : 'bg-gray-100'}`}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              onClick={handleStartTour}
              className={`p-3 rounded-full shadow-lg ${
                isTracking
                  ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white'
                  : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
              }`}
            >
              <Navigation size={22} />
            </button>
          </div>
        </div>
      </div>

      {/* Route Banner */}
      {navigatingTo && routeInfo && (
        <div className="absolute top-20 left-0 right-0 z-[999] p-3">
          <div className="bg-blue-500/95 text-white rounded-2xl p-3 max-w-sm mx-auto shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">Đang dẫn đường</p>
                <p className="font-bold">{navigatingTo}</p>
                <div className="flex gap-3 mt-1 text-sm">
                  <span>📏 {routeInfo.distance}km</span>
                  <span>⏱️ {routeInfo.time}p</span>
                </div>
              </div>
              <button onClick={handleCancelNavigation} className="p-2 bg-white/20 rounded-lg">
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map - Tự quản lý GPS bên trong */}
      <div className="flex-grow z-0">
        <MapContainer key={mapKey} isTracking={isTracking} />
      </div>

      {/* Chat */}
      <div className="h-[32vh] bg-white rounded-t-3xl shadow-2xl z-[1000] flex flex-col">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex-grow overflow-y-auto px-4 pb-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full">
              <Navigation className="text-blue-500 mb-2" size={32} />
              <p className="text-gray-500 text-sm">Bấm Navigation!</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'ai' ? 'justify-start' : 'justify-center'}`}>
              <div className={`max-w-[90%] p-3 rounded-2xl text-sm ${
                m.role === 'ai' ? 'bg-blue-50 border border-blue-100' : 'bg-gray-100 text-gray-500 text-xs'
              }`}>
                <p className="whitespace-pre-wrap">{m.content}</p>
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
