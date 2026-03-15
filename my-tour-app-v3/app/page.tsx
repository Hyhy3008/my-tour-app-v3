'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Navigation, MapPin, Volume2, VolumeX, CheckCircle, X, Map, ShoppingBag, Globe } from 'lucide-react';
import ShopTab from '@/components/ShopTab';
import VoiceChat from '@/components/VoiceChat';

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

const translations = {
  vi: {
    tour: 'Tour',
    shop: 'Mua sắm',
    tracking: 'Đang theo dõi',
    waiting: 'Chờ kích hoạt',
    points: 'điểm',
    navigatingTo: 'Đang dẫn đường đến',
    km: 'km',
    min: 'phút',
    welcome: 'Chào mừng!',
    tapToStart: 'Bấm Navigation để bắt đầu tour',
    startTour: '🚀 Bắt đầu tour! Di chuyển đến các địa điểm để nghe thuyết minh.',
    stopTour: '⏹️ Đã dừng tour.',
    cancelNav: '❌ Đã hủy chỉ đường',
    gpsError: '❌ Bạn cần cấp quyền GPS. Vào Cài đặt → Quyền → Vị trí.',
    loadError: '⚠️ Không thể tải thông tin',
    arrivedAt: '📍 Đã đến',
    navigateTo: '🗺️ Chỉ đường đến',
  },
  en: {
    tour: 'Tour',
    shop: 'Shop',
    tracking: 'Tracking',
    waiting: 'Ready',
    points: 'spots',
    navigatingTo: 'Navigating to',
    km: 'km',
    min: 'min',
    welcome: 'Welcome!',
    tapToStart: 'Tap Navigation to start tour',
    startTour: '🚀 Tour started! Move to locations to hear the guide.',
    stopTour: '⏹️ Tour stopped.',
    cancelNav: '❌ Navigation cancelled',
    gpsError: '❌ Please enable GPS in Settings → Permissions → Location.',
    loadError: '⚠️ Cannot load information',
    arrivedAt: '📍 Arrived at',
    navigateTo: '🗺️ Navigate to',
  },
};

type Language = 'vi' | 'en';
type CityType = 'ninh-binh' | 'hanoi';
type TabType = 'tour' | 'shop';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('tour');
  const [selectedCity, setSelectedCity] = useState<CityType>('ninh-binh');
  const [language, setLanguage] = useState<Language>('vi');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visitedCount, setVisitedCount] = useState(0);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; time: number } | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Refs để tránh stale closure
  const isMutedRef = useRef(isMuted);
  const languageRef = useRef(language);
  // Ref giữ audio đang phát
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { languageRef.current = language; }, [language]);

  const t = translations[language];

  // ============================================
  // Edge TTS: gọi /api/tts → nhận MP3 → play
  // Không dùng browser speechSynthesis nữa
  // Hoạt động tốt trên iOS, Android, Desktop
  // ============================================
  const speakText = useCallback(async (text: string) => {
    if (isMutedRef.current) return;

    try {
      // Dừng audio đang phát nếu có
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: languageRef.current }),
      });

      if (!res.ok) throw new Error(`TTS API error: ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      audio.onerror = (e) => {
        console.error('Audio play error:', e);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
    } catch (e) {
      console.error('speakText error:', e);
    }
  }, []); // dependency rỗng vì chỉ dùng refs

  // Reset khi đổi city
  useEffect(() => {
    if (isTracking) {
      setIsTracking(false);
      window.dispatchEvent(new CustomEvent('stop-tracking'));
    }
    setMessages([]);
    setVisitedCount(0);
    setRouteInfo(null);
    setNavigatingTo(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [selectedCity]);

  const addMessage = useCallback((msg: string, isAi: boolean) => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: isAi ? 'ai' : 'system', content: msg, time }]);
  }, []);

  // fetchAI dùng languageRef để không bao giờ stale
  const fetchAI = useCallback(async (prompt: string) => {
    const lang = languageRef.current;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextPrompt: prompt, language: lang }),
      });
      if (res.ok) {
        const data = await res.json();
        addMessage(data.reply, true);
        speakText(data.reply);
      } else {
        addMessage(translations[lang].loadError, false);
      }
    } catch {
      addMessage(translations[lang].loadError, false);
    }
  }, [addMessage, speakText]);

  // Event listeners
  useEffect(() => {
    const handleNavigateTo = (e: CustomEvent) => {
      setNavigatingTo(e.detail.name);
      setRouteInfo(null);
      addMessage(`${translations[languageRef.current].navigateTo} ${e.detail.name}`, false);
    };
    const handleRouteFound = (e: CustomEvent) => {
      setRouteInfo(e.detail);
    };
    const handleCancelNav = () => {
      setNavigatingTo(null);
      setRouteInfo(null);
    };
    const handleLocationArrived = (e: CustomEvent) => {
      setVisitedCount(prev => prev + 1);
      addMessage(`${translations[languageRef.current].arrivedAt} ${e.detail.name}`, false);
      fetchAI(e.detail.prompt);
    };

    window.addEventListener('navigate-to', handleNavigateTo as EventListener);
    window.addEventListener('route-found', handleRouteFound as EventListener);
    window.addEventListener('navigation-cancelled', handleCancelNav);
    window.addEventListener('location-arrived', handleLocationArrived as EventListener);

    return () => {
      window.removeEventListener('navigate-to', handleNavigateTo as EventListener);
      window.removeEventListener('route-found', handleRouteFound as EventListener);
      window.removeEventListener('navigation-cancelled', handleCancelNav);
      window.removeEventListener('location-arrived', handleLocationArrived as EventListener);
    };
  }, [addMessage, fetchAI]);

  const handleStartTour = () => {
    if (!isTracking) {
      navigator.geolocation.getCurrentPosition(
        () => {
          setIsTracking(true);
          addMessage(t.startTour, false);
          // Edge TTS dùng Audio element → không cần unlock iOS như browser TTS
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            addMessage(t.gpsError, false);
          }
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    } else {
      setIsTracking(false);
      setNavigatingTo(null);
      setRouteInfo(null);
      addMessage(t.stopTour, false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.dispatchEvent(new CustomEvent('stop-tracking'));
    }
  };

  const handleCancelNavigation = () => {
    setNavigatingTo(null);
    setRouteInfo(null);
    addMessage(t.cancelNav, false);
    window.dispatchEvent(new CustomEvent('cancel-navigation'));
  };

  const toggleMute = () => {
    setIsMuted(prev => {
      if (!prev) {
        // Đang bật → tắt tiếng: dừng audio đang phát
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      }
      return !prev;
    });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-100 overflow-hidden relative">

      {/* Language Selector */}
      <div className="absolute top-4 right-4 z-[1002]">
        <button
          onClick={() => setShowLangMenu(!showLangMenu)}
          className="bg-white/95 backdrop-blur-md shadow-lg rounded-full p-2 flex items-center gap-1"
        >
          <Globe size={18} className="text-gray-600" />
          <span className="text-sm font-medium">{language.toUpperCase()}</span>
        </button>
        {showLangMenu && (
          <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg overflow-hidden">
            <button
              onClick={() => { setLanguage('vi'); setShowLangMenu(false); }}
              className={`w-full px-4 py-2 text-left text-sm ${language === 'vi' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}
            >
              🇻🇳 Tiếng Việt
            </button>
            <button
              onClick={() => { setLanguage('en'); setShowLangMenu(false); }}
              className={`w-full px-4 py-2 text-left text-sm ${language === 'en' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}
            >
              🇬🇧 English
            </button>
          </div>
        )}
      </div>

      {activeTab === 'tour' && (
        <>
          {/* City Selector */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1001]">
            <div className="bg-white/95 backdrop-blur-md rounded-full p-1 shadow-lg flex gap-1">
              <button
                onClick={() => setSelectedCity('ninh-binh')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedCity === 'ninh-binh' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                🏞️ Ninh Bình
              </button>
              <button
                onClick={() => setSelectedCity('hanoi')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedCity === 'hanoi' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                🏛️ Hà Nội
              </button>
            </div>
          </div>

          {/* Header */}
          <div className="absolute top-0 left-0 right-20 z-[1000] p-3">
            <div className="bg-white/95 backdrop-blur-md shadow-lg rounded-2xl p-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <MapPin className="text-white" size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-bold text-gray-800">
                      {selectedCity === 'ninh-binh' ? 'Ninh Bình' : 'Hà Nội'} Tour
                    </h1>
                    <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle size={12} /> {language.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                    <p className={`text-xs ${isTracking ? 'text-green-600' : 'text-gray-400'}`}>
                      {isTracking ? t.tracking : t.waiting}
                    </p>
                    {visitedCount > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                        {visitedCount} {t.points}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-600'}`}
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

          {/* Route Banner */}
          {navigatingTo && routeInfo && (
            <div className="absolute top-28 left-0 right-0 z-[999] p-3">
              <div className="bg-blue-500/95 backdrop-blur text-white rounded-2xl p-3 max-w-sm mx-auto shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs opacity-80">{t.navigatingTo}</p>
                    <p className="font-bold">{navigatingTo}</p>
                    <div className="flex gap-3 mt-1 text-sm">
                      <span>📏 {routeInfo.distance} {t.km}</span>
                      <span>⏱️ {routeInfo.time} {t.min}</span>
                    </div>
                  </div>
                  <button onClick={handleCancelNavigation} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg">
                    <X size={20} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Map */}
          <div className="flex-grow z-0">
            <MapContainer isTracking={isTracking} selectedCity={selectedCity} language={language} />
          </div>

          {/* THÊM MỚI: Voice Chat nổi góc phải, phía trên chat panel */}
          <VoiceChat language={language} isMuted={isMuted} />

          {/* Chat Panel */}
          <div className="h-[28vh] bg-white rounded-t-3xl shadow-2xl z-[1000] flex flex-col">
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex-grow overflow-y-auto px-4 pb-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Navigation className="text-blue-500 mb-3" size={40} />
                  <p className="text-gray-600 font-medium">{t.welcome}</p>
                  <p className="text-gray-400 text-sm mt-1">{t.tapToStart}</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'ai' ? 'justify-start' : 'justify-center'}`}>
                  <div className={`max-w-[90%] p-3 rounded-2xl text-sm ${
                    m.role === 'ai'
                      ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100'
                      : 'bg-gray-100 text-gray-500 text-xs'
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    {m.role === 'ai' && <p className="text-xs text-gray-400 mt-2 text-right">{m.time}</p>}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </div>
        </>
      )}

      {activeTab === 'shop' && (
        <ShopTab selectedCity={selectedCity} language={language} />
      )}

      {/* Bottom Tab Bar */}
      <div className="bg-white border-t border-gray-200 z-[1002]">
        <div className="flex justify-around items-center py-2 px-4 max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('tour')}
            className={`flex flex-col items-center py-2 px-6 rounded-xl transition-all ${
              activeTab === 'tour' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'
            }`}
          >
            <Map size={24} />
            <span className="text-xs mt-1 font-medium">{t.tour}</span>
          </button>
          <button
            onClick={() => setActiveTab('shop')}
            className={`flex flex-col items-center py-2 px-6 rounded-xl transition-all ${
              activeTab === 'shop' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'
            }`}
          >
            <ShoppingBag size={24} />
            <span className="text-xs mt-1 font-medium">{t.shop}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
