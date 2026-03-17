'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Navigation, MapPin, Volume2, VolumeX, X, Map, ShoppingBag, Globe } from 'lucide-react';
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

interface ConversationMemory {
  summary: string;
  recentMessages: { role: string; content: string }[];
  messageCount: number;
}

interface StoredConversationMemory {
  expiresAt: number;
  data: ConversationMemory;
}

const MEMORY_KEY_PREFIX = 'tour_conversation_memory';
const LEGACY_MEMORY_KEY = 'tour_conversation_memory';
const MEMORY_TTL_MS = 48 * 60 * 60 * 1000;

const emptyMemory = (): ConversationMemory => ({
  summary: '',
  recentMessages: [],
  messageCount: 0,
});

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
    gpsError: '❌ Cần cấp quyền GPS. Vào Cài đặt → Quyền → Vị trí.',
    loadError: '⚠️ Không thể tải thông tin',
    arrivedAt: '📍 Đã đến',
    navigateTo: '🗺️ Chỉ đường đến',
    sound: 'Âm thanh',
    muted: 'Tắt',
    gpsDeniedAlert: 'GPS bị từ chối. Vào Cài đặt → Chrome/Safari → Vị trí → Cho phép',
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
    sound: 'Sound',
    muted: 'Muted',
    gpsDeniedAlert: 'GPS denied. Go to Settings → Chrome/Safari → Location → Allow',
  },
  ko: {
    tour: '투어',
    shop: '쇼핑',
    tracking: '추적 중',
    waiting: '대기 중',
    points: '장소',
    navigatingTo: '길 안내 중',
    km: 'km',
    min: '분',
    welcome: '환영합니다!',
    tapToStart: '내비게이션 버튼을 눌러 투어를 시작하세요',
    startTour: '🚀 투어 시작! 장소로 이동하면 자동 설명이 나옵니다.',
    stopTour: '⏹️ 투어가 종료되었습니다.',
    cancelNav: '❌ 길안내가 취소되었습니다',
    gpsError: '❌ GPS 권한이 필요합니다. 설정 → 위치 권한을 확인하세요.',
    loadError: '⚠️ 정보를 불러올 수 없습니다',
    arrivedAt: '📍 도착:',
    navigateTo: '🗺️ 길안내:',
    sound: '소리',
    muted: '음소거',
    gpsDeniedAlert: 'GPS 권한이 거부되었습니다. 설정 → Chrome/Safari → 위치 → 허용',
  },
  zh: {
    tour: '导览',
    shop: '购物',
    tracking: '正在定位',
    waiting: '等待启动',
    points: '地点',
    navigatingTo: '正在导航前往',
    km: '公里',
    min: '分钟',
    welcome: '欢迎！',
    tapToStart: '点击导航按钮开始导览',
    startTour: '🚀 导览开始！移动到景点后将自动讲解。',
    stopTour: '⏹️ 导览已停止。',
    cancelNav: '❌ 已取消导航',
    gpsError: '❌ 需要开启 GPS 权限。请到设置 → 定位权限中开启。',
    loadError: '⚠️ 无法加载信息',
    arrivedAt: '📍 已到达',
    navigateTo: '🗺️ 导航到',
    sound: '声音',
    muted: '静音',
    gpsDeniedAlert: 'GPS 权限被拒绝。请前往 设置 → Chrome/Safari → 定位 → 允许',
  },
};

type Language = 'vi' | 'en' | 'ko' | 'zh';
type CityType = 'ninh-binh' | 'hanoi';
type TabType = 'tour' | 'shop';

const getMemoryKey = (city: CityType) => `${MEMORY_KEY_PREFIX}_${city}`;

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('tour');
  const [selectedCity, setSelectedCity] = useState<CityType>('ninh-binh');
  const [language, setLanguage] = useState<Language>('vi');
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visitedCount, setVisitedCount] = useState(0);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; time: number } | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [currentLocationId, setCurrentLocationId] = useState<string | null>(null);
  const [memory, setMemory] = useState<ConversationMemory>(emptyMemory());

  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const isMutedRef = useRef(isMuted);
  const languageRef = useRef(language);
  const memoryRef = useRef(memory);
  const selectedCityRef = useRef<CityType>(selectedCity);
  const isTrackingStateRef = useRef(isTracking);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { memoryRef.current = memory; }, [memory]);
  useEffect(() => { selectedCityRef.current = selectedCity; }, [selectedCity]);
  useEffect(() => { isTrackingStateRef.current = isTracking; }, [isTracking]);

  const t = translations[language];

  const writeMemoryToStorage = useCallback((city: CityType, value: ConversationMemory) => {
    try {
      const wrapped: StoredConversationMemory = {
        expiresAt: Date.now() + MEMORY_TTL_MS,
        data: value,
      };
      localStorage.setItem(getMemoryKey(city), JSON.stringify(wrapped));
    } catch {}
  }, []);

  const readMemoryFromStorage = useCallback((city: CityType): ConversationMemory => {
    try {
      const cityKey = getMemoryKey(city);
      const raw = localStorage.getItem(cityKey);

      if (raw) {
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === 'object' && 'expiresAt' in parsed && 'data' in parsed) {
          const wrapped = parsed as StoredConversationMemory;

          if (Date.now() > wrapped.expiresAt) {
            localStorage.removeItem(cityKey);
            return emptyMemory();
          }

          return wrapped.data || emptyMemory();
        }

        if (
          parsed &&
          typeof parsed === 'object' &&
          'summary' in parsed &&
          'recentMessages' in parsed &&
          'messageCount' in parsed
        ) {
          const legacy = parsed as ConversationMemory;
          writeMemoryToStorage(city, legacy);
          return legacy;
        }
      }

      const legacyRaw = localStorage.getItem(LEGACY_MEMORY_KEY);
      if (legacyRaw) {
        const parsedLegacy = JSON.parse(legacyRaw);
        if (
          parsedLegacy &&
          typeof parsedLegacy === 'object' &&
          'summary' in parsedLegacy &&
          'recentMessages' in parsedLegacy &&
          'messageCount' in parsedLegacy
        ) {
          const legacyMemory = parsedLegacy as ConversationMemory;
          writeMemoryToStorage(city, legacyMemory);
          localStorage.removeItem(LEGACY_MEMORY_KEY);
          return legacyMemory;
        }
      }
    } catch {}

    return emptyMemory();
  }, [writeMemoryToStorage]);

  const loadMemoryForCity = useCallback((city: CityType) => {
    const loaded = readMemoryFromStorage(city);
    setMemory(loaded);
    memoryRef.current = loaded;
  }, [readMemoryFromStorage]);

  const saveMemory = useCallback((m: ConversationMemory) => {
    setMemory(m);
    memoryRef.current = m;
    writeMemoryToStorage(selectedCityRef.current, m);
  }, [writeMemoryToStorage]);

  useEffect(() => {
    loadMemoryForCity(selectedCity);
  }, [loadMemoryForCity, selectedCity]);

  useEffect(() => {
    if (!('permissions' in navigator)) return;

    navigator.permissions.query({ name: 'geolocation' }).then(r => {
      setGpsOk(r.state === 'granted');
      r.onchange = () => setGpsOk(r.state === 'granted');
    }).catch(() => {});

    navigator.permissions.query({ name: 'microphone' as PermissionName }).then(r => {
      setMicOk(r.state === 'granted');
      r.onchange = () => setMicOk(r.state === 'granted');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsOk(true);
        window.dispatchEvent(new CustomEvent('gps-warmed', {
          detail: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        }));
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Prefetch map chunk sớm hơn
  useEffect(() => {
    const id = setTimeout(() => {
      import('@/components/MapContainer');
    }, 300);

    return () => clearTimeout(id);
  }, []);

  const requestGPS = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsOk(true);
        window.dispatchEvent(new CustomEvent('gps-warmed', {
          detail: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        }));
      },
      (err) => {
        setGpsOk(false);
        if (err.code === 1) {
          alert(t.gpsDeniedAlert);
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    );
  };

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicOk(true);
    } catch {
      setMicOk(false);
    }
  };

  const speakText = useCallback(async (text: string) => {
    if (isMutedRef.current) return;

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: languageRef.current }),
      });

      if (!res.ok) return;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
    } catch (e) {
      console.error('speakText error:', e);
    }
  }, []);

  useEffect(() => {
    if (isTrackingStateRef.current) {
      setIsTracking(false);
      window.dispatchEvent(new CustomEvent('stop-tracking'));
    }

    setMessages([]);
    setVisitedCount(0);
    setRouteInfo(null);
    setNavigatingTo(null);
    setCurrentLocationId(null);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    loadMemoryForCity(selectedCity);
  }, [selectedCity, loadMemoryForCity]);

  const addMessage = useCallback((msg: string, isAi: boolean) => {
    const time = new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setMessages(prev => [
      ...prev,
      { role: isAi ? 'ai' : 'system', content: msg, time }
    ]);
  }, []);

  const fetchAI = useCallback(async (prompt: string, locationId?: string | null) => {
    const lang = languageRef.current;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextPrompt: prompt,
          locationId: locationId || null,
          language: lang,
          conversationMemory: memoryRef.current,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        addMessage(data.reply, true);
        speakText(data.reply);

        if (data.memoryUpdate) {
          saveMemory(data.memoryUpdate);
        }
      } else {
        addMessage(translations[lang].loadError, false);
      }
    } catch {
      addMessage(translations[lang].loadError, false);
    }
  }, [addMessage, speakText, saveMemory]);

  useEffect(() => {
    const onNavigateTo = (e: CustomEvent) => {
      setNavigatingTo(e.detail.name);
      setRouteInfo(null);
      addMessage(`${translations[languageRef.current].navigateTo} ${e.detail.name}`, false);
    };

    const onRouteFound = (e: CustomEvent) => {
      setRouteInfo(e.detail);
    };

    const onCancelNav = () => {
      setNavigatingTo(null);
      setRouteInfo(null);
    };

    const onArrived = (e: CustomEvent) => {
      const { name, prompt, locationId } = e.detail;
      setCurrentLocationId(locationId || null);
      setVisitedCount(prev => prev + 1);
      addMessage(`${translations[languageRef.current].arrivedAt} ${name}`, false);
      fetchAI(prompt, locationId);
    };

    const onVoiceSpeak = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };

    window.addEventListener('navigate-to', onNavigateTo as EventListener);
    window.addEventListener('route-found', onRouteFound as EventListener);
    window.addEventListener('navigation-cancelled', onCancelNav);
    window.addEventListener('location-arrived', onArrived as EventListener);
    window.addEventListener('voice-chat-speaking', onVoiceSpeak);

    return () => {
      window.removeEventListener('navigate-to', onNavigateTo as EventListener);
      window.removeEventListener('route-found', onRouteFound as EventListener);
      window.removeEventListener('navigation-cancelled', onCancelNav);
      window.removeEventListener('location-arrived', onArrived as EventListener);
      window.removeEventListener('voice-chat-speaking', onVoiceSpeak);
    };
  }, [addMessage, fetchAI]);

  const handleStartTour = () => {
    if (!isTracking) {
      if (!('geolocation' in navigator)) {
        addMessage(t.gpsError, false);
        return;
      }

      navigator.permissions?.query({ name: 'geolocation' }).then(r => {
        if (r.state === 'denied') {
          addMessage(t.gpsError, false);
          return;
        }
        setIsTracking(true);
        addMessage(t.startTour, false);
      }).catch(() => {
        setIsTracking(true);
        addMessage(t.startTour, false);
      });
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
      if (!prev && audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return !prev;
    });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-100 overflow-hidden relative">
      {activeTab === 'tour' && (
        <>
          {/* HEADER */}
          <div className="absolute top-0 left-0 right-0 z-[1000] p-3">
            <div className="bg-white/95 backdrop-blur-md shadow-lg rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 pt-3 pb-3">
                <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shrink-0">
                  <MapPin className="text-white" size={22} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="font-bold text-gray-800 text-base leading-tight">
                      {selectedCity === 'ninh-binh' ? 'Ninh Bình' : 'Hà Nội'} Tour
                    </h1>
                    {memory.messageCount > 0 && (
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full shrink-0">
                        💬{memory.messageCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isTracking ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                    <span className={`text-xs truncate ${isTracking ? 'text-green-600' : 'text-gray-400'}`}>
                      {isTracking ? t.tracking : t.waiting}
                      {visitedCount > 0 && ` · ${visitedCount} ${t.points}`}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleStartTour}
                  className={`w-14 h-14 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center shrink-0 ${
                    isTracking
                      ? 'bg-gradient-to-br from-red-500 to-pink-500 text-white'
                      : 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white'
                  }`}
                >
                  <Navigation size={26} className={isTracking ? 'animate-pulse' : ''} />
                </button>

                <button
                  onClick={() => setHeaderCollapsed(prev => !prev)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    style={{
                      transform: headerCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s'
                    }}
                  >
                    <path d="M18 15l-6-6-6 6" />
                  </svg>
                </button>
              </div>

              {!headerCollapsed && (
                <>
                  <div className="flex gap-2 px-4 pb-2">
                    <button
                      onClick={() => setSelectedCity('ninh-binh')}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                        selectedCity === 'ninh-binh' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      🏞️ Ninh Bình
                    </button>
                    <button
                      onClick={() => setSelectedCity('hanoi')}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                        selectedCity === 'hanoi' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      🏛️ Hà Nội
                    </button>
                  </div>

                  <div className="flex items-center gap-2 px-4 pb-3 border-t border-gray-100 pt-2">
                    <button
                      onClick={requestGPS}
                      className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-all active:scale-95 ${
                        gpsOk === true ? 'bg-green-50 text-green-600'
                        : gpsOk === false ? 'bg-red-50 text-red-500 animate-pulse'
                        : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                      </svg>
                      GPS {gpsOk === true ? '✓' : gpsOk === false ? '✗' : '?'}
                    </button>

                    <button
                      onClick={requestMic}
                      className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-all active:scale-95 ${
                        micOk === true ? 'bg-green-50 text-green-600'
                        : micOk === false ? 'bg-red-50 text-red-500 animate-pulse'
                        : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="9" y="2" width="6" height="11" rx="3" />
                        <path d="M5 10a7 7 0 0 0 14 0M12 19v3M9 22h6" />
                      </svg>
                      Mic {micOk === true ? '✓' : micOk === false ? '✗' : '?'}
                    </button>

                    <button
                      onClick={toggleMute}
                      className={`flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-all active:scale-95 ${
                        isMuted ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      {isMuted ? t.muted : t.sound}
                    </button>

                    <div className="relative">
                      <button
                        onClick={() => setShowLangMenu(!showLangMenu)}
                        className="h-10 px-3 rounded-xl bg-gray-100 text-gray-500 flex items-center gap-1 text-xs font-medium active:scale-95 transition-all"
                      >
                        <Globe size={14} />
                        {language.toUpperCase()}
                      </button>

                      {showLangMenu && (
                        <div className="absolute right-0 bottom-12 bg-white rounded-xl shadow-xl overflow-hidden z-10 w-40">
                          <button
                            onClick={() => { setLanguage('vi'); setShowLangMenu(false); }}
                            className={`w-full px-4 py-3 text-left text-sm ${language === 'vi' ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-gray-50'}`}
                          >
                            🇻🇳 Tiếng Việt
                          </button>
                          <button
                            onClick={() => { setLanguage('en'); setShowLangMenu(false); }}
                            className={`w-full px-4 py-3 text-left text-sm ${language === 'en' ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-gray-50'}`}
                          >
                            🇬🇧 English
                          </button>
                          <button
                            onClick={() => { setLanguage('ko'); setShowLangMenu(false); }}
                            className={`w-full px-4 py-3 text-left text-sm ${language === 'ko' ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-gray-50'}`}
                          >
                            🇰🇷 한국어
                          </button>
                          <button
                            onClick={() => { setLanguage('zh'); setShowLangMenu(false); }}
                            className={`w-full px-4 py-3 text-left text-sm ${language === 'zh' ? 'bg-blue-50 text-blue-600 font-medium' : 'hover:bg-gray-50'}`}
                          >
                            🇨🇳 中文
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Route mini pill */}
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

            {memory.summary && (
              <div className="px-4 pb-1">
                <div className="bg-purple-50 rounded-xl px-3 py-1.5 flex items-start gap-1.5">
                  <span className="text-purple-400 text-xs mt-0.5">🧠</span>
                  <p className="text-xs text-purple-600 line-clamp-1">{memory.summary}</p>
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
                    {m.role === 'ai' && (
                      <p className="text-xs text-gray-400 mt-2 text-right">{m.time}</p>
                    )}
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
