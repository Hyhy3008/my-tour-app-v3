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

// Memory lưu vào localStorage
interface ConversationMemory {
  summary: string;
  recentMessages: { role: string; content: string }[];
  messageCount: number;
}

const MEMORY_KEY = 'tour_conversation_memory';

const emptyMemory = (): ConversationMemory => ({
  summary: "",
  recentMessages: [],
  messageCount: 0,
});

const translations = {
  vi: {
    tour: 'Tour', shop: 'Mua sắm', tracking: 'Đang theo dõi', waiting: 'Chờ kích hoạt',
    points: 'điểm', navigatingTo: 'Đang dẫn đường đến', km: 'km', min: 'phút',
    welcome: 'Chào mừng!', tapToStart: 'Bấm Navigation để bắt đầu tour',
    startTour: '🚀 Bắt đầu tour! Di chuyển đến các địa điểm để nghe thuyết minh.',
    stopTour: '⏹️ Đã dừng tour.', cancelNav: '❌ Đã hủy chỉ đường',
    gpsError: '❌ Bạn cần cấp quyền GPS. Vào Cài đặt → Quyền → Vị trí.',
    loadError: '⚠️ Không thể tải thông tin', arrivedAt: '📍 Đã đến', navigateTo: '🗺️ Chỉ đường đến',
  },
  en: {
    tour: 'Tour', shop: 'Shop', tracking: 'Tracking', waiting: 'Ready',
    points: 'spots', navigatingTo: 'Navigating to', km: 'km', min: 'min',
    welcome: 'Welcome!', tapToStart: 'Tap Navigation to start tour',
    startTour: '🚀 Tour started! Move to locations to hear the guide.',
    stopTour: '⏹️ Tour stopped.', cancelNav: '❌ Navigation cancelled',
    gpsError: '❌ Please enable GPS in Settings → Permissions → Location.',
    loadError: '⚠️ Cannot load information', arrivedAt: '📍 Arrived at', navigateTo: '🗺️ Navigate to',
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
  const [currentLocationId, setCurrentLocationId] = useState<string | null>(null);
  const [gpsPermission, setGpsPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');

  // ✅ Memory state
  const [memory, setMemory] = useState<ConversationMemory>(emptyMemory());
  const memoryRef = useRef<ConversationMemory>(emptyMemory());

  const chatEndRef = useRef<HTMLDivElement>(null);
  const isMutedRef = useRef(isMuted);
  const languageRef = useRef(language);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { memoryRef.current = memory; }, [memory]);

  const t = translations[language];

  // ✅ Load memory từ localStorage khi khởi động
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MEMORY_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMemory(parsed);
        memoryRef.current = parsed;
        console.log(`📚 Loaded memory: ${parsed.messageCount} msgs, summary: "${parsed.summary?.substring(0, 50)}..."`);
      }
    } catch { /* ignore */ }
  }, []);

  // ✅ Lưu memory vào localStorage mỗi khi thay đổi
  const saveMemory = useCallback((newMemory: ConversationMemory) => {
    setMemory(newMemory);
    memoryRef.current = newMemory;
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(newMemory));
    } catch { /* ignore */ }
  }, []);

  const speakText = useCallback(async (text: string) => {
    if (isMutedRef.current) return;
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: languageRef.current }),
      });
      if (!res.ok) throw new Error(`TTS error: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
    } catch (e) { console.error('speakText error:', e); }
  }, []);

  // ✅ Reset city → reset memory
  useEffect(() => {
    if (isTracking) {
      setIsTracking(false);
      window.dispatchEvent(new CustomEvent('stop-tracking'));
    }
    setMessages([]);
    setVisitedCount(0);
    setRouteInfo(null);
    setNavigatingTo(null);
    setCurrentLocationId(null);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    // Reset memory khi đổi city
    saveMemory(emptyMemory());
  }, [selectedCity]);

  const addMessage = useCallback((msg: string, isAi: boolean) => {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: isAi ? 'ai' : 'system', content: msg, time }]);
  }, []);

  // ✅ fetchAI gửi kèm memory
  const fetchAI = useCallback(async (prompt: string, locationId?: string | null) => {
    const lang = languageRef.current;
    const currentMemory = memoryRef.current;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextPrompt: prompt,
          locationId: locationId || null,
          language: lang,
          conversationMemory: currentMemory, // ✅ gửi kèm memory
        }),
      });

      if (res.ok) {
        const data = await res.json();
        addMessage(data.reply, true);
        speakText(data.reply);

        // ✅ Cập nhật memory từ response
        if (data.memoryUpdate) {
          saveMemory(data.memoryUpdate);
          if (data.memoryUpdate.didSummarize) {
            console.log('🗜️ Memory summarized!');
          }
        }
      } else {
        addMessage(translations[lang].loadError, false);
      }
    } catch {
      addMessage(translations[lang].loadError, false);
    }
  }, [addMessage, speakText, saveMemory]);

  useEffect(() => {
    const handleNavigateTo = (e: CustomEvent) => {
      setNavigatingTo(e.detail.name);
      setRouteInfo(null);
      addMessage(`${translations[languageRef.current].navigateTo} ${e.detail.name}`, false);
    };
    const handleRouteFound = (e: CustomEvent) => { setRouteInfo(e.detail); };
    const handleCancelNav = () => { setNavigatingTo(null); setRouteInfo(null); };
    const handleLocationArrived = (e: CustomEvent) => {
      const { name, prompt, locationId } = e.detail;
      setCurrentLocationId(locationId || null);
      setVisitedCount(prev => prev + 1);
      addMessage(`${translations[languageRef.current].arrivedAt} ${name}`, false);
      fetchAI(prompt, locationId);
    };
    const handleVoiceChatSpeaking = () => {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    };

    window.addEventListener('navigate-to', handleNavigateTo as EventListener);
    window.addEventListener('route-found', handleRouteFound as EventListener);
    window.addEventListener('navigation-cancelled', handleCancelNav);
    window.addEventListener('location-arrived', handleLocationArrived as EventListener);
    window.addEventListener('voice-chat-speaking', handleVoiceChatSpeaking);

    return () => {
      window.removeEventListener('navigate-to', handleNavigateTo as EventListener);
      window.removeEventListener('route-found', handleRouteFound as EventListener);
      window.removeEventListener('navigation-cancelled', handleCancelNav);
      window.removeEventListener('location-arrived', handleLocationArrived as EventListener);
      window.removeEventListener('voice-chat-speaking', handleVoiceChatSpeaking);
    };
  }, [addMessage, fetchAI]);

  const handleStartTour = () => {
    if (!isTracking) {
      // ✅ Set tracking ngay lập tức - không chờ GPS response
      // GPSTracker trong MapContainer sẽ tự lấy vị trí
      // Chỉ kiểm tra permission trước
      if (!('geolocation' in navigator)) {
        addMessage(t.gpsError, false);
        return;
      }
      // Kiểm tra permission nhanh
      navigator.permissions?.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'denied') {
          addMessage(t.gpsError, false);
          return;
        }
        // Granted hoặc prompt → start ngay
        setIsTracking(true);
        addMessage(t.startTour, false);
      }).catch(() => {
        // Không support permissions API (iOS) → start luôn
        setIsTracking(true);
        addMessage(t.startTour, false);
      });
    } else {
      setIsTracking(false);
      setNavigatingTo(null);
      setRouteInfo(null);
      addMessage(t.stopTour, false);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
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
      if (!prev && audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      return !prev;
    });
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  // ✅ Check và theo dõi permission GPS + Mic
  useEffect(() => {
    if (!('permissions' in navigator)) return;
    // Check GPS
    navigator.permissions.query({ name: 'geolocation' }).then(r => {
      setGpsPermission(r.state as any);
      r.onchange = () => setGpsPermission(r.state as any);
    }).catch(() => {});
    // Check Mic
    navigator.permissions.query({ name: 'microphone' as PermissionName }).then(r => {
      setMicPermission(r.state as any);
      r.onchange = () => setMicPermission(r.state as any);
    }).catch(() => {});
  }, []);

  const requestGPS = () => {
    navigator.geolocation.getCurrentPosition(
      () => setGpsPermission('granted'),
      () => setGpsPermission('denied'),
      { timeout: 5000 }
    );
  };

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicPermission('granted');
    } catch {
      setMicPermission('denied');
    }
  };

  // ✅ Warm up GPS ngay khi load - để lần bấm Start không phải chờ
  // GPS chip cần thời gian khởi động, warm up trước giúp bấm nút là định vị ngay
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    // Silent warm up - chỉ để GPS chip hoạt động, không làm gì với kết quả
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Lưu vào sharedPositionRef của MapContainer qua event
        window.dispatchEvent(new CustomEvent('gps-warmed', {
          detail: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        }));
        console.log('GPS warmed up:', pos.coords.accuracy.toFixed(0) + 'm accuracy');
      },
      () => { /* ignore error - chỉ warm up */ },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-100 overflow-hidden relative">

      {/* Language Selector */}
      <div className="absolute top-4 right-4 z-[1002]">
        <button onClick={() => setShowLangMenu(!showLangMenu)}
          className="bg-white/95 backdrop-blur-md shadow-lg rounded-full p-2 flex items-center gap-1">
          <Globe size={18} className="text-gray-600" />
          <span className="text-sm font-medium">{language.toUpperCase()}</span>
        </button>
        {showLangMenu && (
          <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg overflow-hidden z-10">
            <button onClick={() => { setLanguage('vi'); setShowLangMenu(false); }}
              className={`w-full px-4 py-2 text-left text-sm ${language === 'vi' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}>
              🇻🇳 Tiếng Việt
            </button>
            <button onClick={() => { setLanguage('en'); setShowLangMenu(false); }}
              className={`w-full px-4 py-2 text-left text-sm ${language === 'en' ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'}`}>
              🇬🇧 English
            </button>
          </div>
        )}
      </div>

      {/* ✅ Permission indicators - nhỏ gọn, góc trái */}
      <div className="absolute top-4 left-4 z-[1002] flex gap-1.5">
        {/* GPS indicator */}
        <button
          onClick={requestGPS}
          title={gpsPermission === 'granted' ? 'GPS OK' : 'Tap để cấp quyền GPS'}
          className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${
            gpsPermission === 'granted'
              ? 'bg-green-500 text-white'
              : gpsPermission === 'denied'
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-white/95 text-gray-500'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
          </svg>
        </button>

        {/* Mic indicator */}
        <button
          onClick={requestMic}
          title={micPermission === 'granted' ? 'Mic OK' : 'Tap để cấp quyền Microphone'}
          className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${
            micPermission === 'granted'
              ? 'bg-green-500 text-white'
              : micPermission === 'denied'
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-white/95 text-gray-500'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="9" y="2" width="6" height="12" rx="3"/>
            <path d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6"/>
          </svg>
        </button>
      </div>

      {activeTab === 'tour' && (
        <>
          {/* Header + City Selector */}
          <div className="absolute top-0 left-0 right-20 z-[1000] p-3">
            <div className="bg-white/95 backdrop-blur-md shadow-lg rounded-2xl p-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                    <MapPin className="text-white" size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h1 className="font-bold text-gray-800 text-sm">
                        {selectedCity === 'ninh-binh' ? 'Ninh Bình' : 'Hà Nội'} Tour
                      </h1>
                      <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <CheckCircle size={10} /> {language.toUpperCase()}
                      </span>
                      {/* ✅ Hiện message count */}
                      {memory.messageCount > 0 && (
                        <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                          💬 {memory.messageCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                      <p className={`text-xs ${isTracking ? 'text-green-600' : 'text-gray-400'}`}>
                        {isTracking ? t.tracking : t.waiting}
                      </p>
                      {visitedCount > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                          {visitedCount} {t.points}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={toggleMute}
                    className={`p-2.5 rounded-full transition-colors ${isMuted ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-600'}`}>
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <button onClick={handleStartTour}
                    className={`p-2.5 rounded-full shadow-lg transition-all ${
                      isTracking
                        ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white'
                        : 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    }`}>
                    <Navigation size={20} className={isTracking ? 'animate-pulse' : ''} />
                  </button>
                </div>
              </div>

              {/* City Selector */}
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setSelectedCity('ninh-binh')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    selectedCity === 'ninh-binh' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  🏞️ Ninh Bình
                </button>
                <button onClick={() => setSelectedCity('hanoi')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    selectedCity === 'hanoi' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  🏛️ Hà Nội
                </button>
              </div>
            </div>
          </div>

          {/* ✅ Mini route pill - nhỏ gọn, không che màn hình */}
          {navigatingTo && (
            <div className="absolute bottom-[30vh] left-1/2 -translate-x-1/2 z-[999] pointer-events-auto">
              <div className="bg-blue-500/95 backdrop-blur text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-3 whitespace-nowrap">
                <span className="text-xs font-medium">🗺️ {navigatingTo}</span>
                {routeInfo && (
                  <>
                    <span className="text-xs opacity-80">📏 {routeInfo.distance}{t.km}</span>
                    <span className="text-xs opacity-80">⏱️ {routeInfo.time}{t.min}</span>
                  </>
                )}
                <button onClick={handleCancelNavigation} className="ml-1 hover:opacity-70">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Map */}
          <div className="flex-grow z-0">
            <MapContainer isTracking={isTracking} selectedCity={selectedCity} language={language} />
          </div>

          {/* Voice Chat */}
          <VoiceChat
            language={language}
            isMuted={isMuted}
            locationId={currentLocationId}
            memory={memory}
            onMemoryUpdate={saveMemory}
          />

          {/* Chat Panel */}
          <div className="h-[28vh] bg-white rounded-t-3xl shadow-2xl z-[1000] flex flex-col">
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            {/* ✅ Hiện summary nếu có */}
            {memory.summary && (
              <div className="px-4 pb-1">
                <div className="bg-purple-50 rounded-xl px-3 py-1.5 flex items-start gap-1.5">
                  <span className="text-purple-400 text-xs mt-0.5">🧠</span>
                  <p className="text-xs text-purple-600 line-clamp-2">{memory.summary}</p>
                </div>
              </div>
            )}
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
          <button onClick={() => setActiveTab('tour')}
            className={`flex flex-col items-center py-2 px-6 rounded-xl transition-all ${activeTab === 'tour' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'}`}>
            <Map size={24} />
            <span className="text-xs mt-1 font-medium">{t.tour}</span>
          </button>
          <button onClick={() => setActiveTab('shop')}
            className={`flex flex-col items-center py-2 px-6 rounded-xl transition-all ${activeTab === 'shop' ? 'bg-blue-50 text-blue-600' : 'text-gray-400'}`}>
            <ShoppingBag size={24} />
            <span className="text-xs mt-1 font-medium">{t.shop}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
