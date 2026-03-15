'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useTourLogic } from '@/hooks/useTourLogic';

const locations = [
  { id: "trang-an", name: "Tràng An", lat: 20.2541, lng: 105.9149, radius: 100, prompt: "Khách vừa đến Tràng An - Di sản UNESCO. Giới thiệu ngắn gọn về trải nghiệm đi thuyền xuyên hang động." },
  { id: "hang-mua", name: "Hang Múa", lat: 20.2316, lng: 105.9189, radius: 50, prompt: "Khách đến Hang Múa. Kể về 486 bậc đá và view tuyệt đẹp trên đỉnh." },
  { id: "bai-dinh", name: "Chùa Bái Đính", lat: 20.2686, lng: 105.8481, radius: 150, prompt: "Khách đến chùa Bái Đính - chùa lớn nhất Đông Nam Á. Giới thiệu các kỷ lục." },
  { id: "tam-coc", name: "Tam Cốc", lat: 20.2153, lng: 105.9218, radius: 80, prompt: "Khách đến Tam Cốc. Giới thiệu về ba hang và mùa lúa chín." },
  { id: "hoa-lu", name: "Cố đô Hoa Lư", lat: 20.2589, lng: 105.9256, radius: 40, prompt: "Khách đến Cố đô Hoa Lư. Kể về vua Đinh và lịch sử kinh đô." },
  { id: "thien-ha", name: "Động Thiên Hà", lat: 20.2083, lng: 105.8944, radius: 30, prompt: "Khách đến Động Thiên Hà. Mô tả vẻ đẹp thạch nhũ lung linh." },
  { id: "sen", name: "Cánh đồng Sen", lat: 20.2200, lng: 105.9100, radius: 120, prompt: "Khách ở cánh đồng sen. Gợi ý thời điểm và góc chụp ảnh đẹp." },
];

interface Props {
  isTracking: boolean;
  isMuted: boolean;
  onLocationUpdate: (loc: { lat: number; lng: number }) => void;
  onNewMessage: (msg: string, isAi: boolean) => void;
  onLocationVisited?: () => void;
}

const UPDATE_THRESHOLD = 10;

export default function BackgroundTracker({ isTracking, isMuted, onLocationUpdate, onNewMessage, onLocationVisited }: Props) {
  const watchIdRef = useRef<number | null>(null);
  const visitedRef = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);
  const lastUpdateRef = useRef<{ lat: number; lng: number } | null>(null);
  const hasGPSRef = useRef(false);
  const useHighAccuracyRef = useRef(true);
  const { calculateDistance } = useTourLogic();

  const speakText = useCallback((text: string) => {
    if (isMuted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }, [isMuted]);

  const checkProximity = useCallback(async (lat: number, lng: number) => {
    if (processingRef.current) return;

    for (const loc of locations) {
      const dist = calculateDistance(lat, lng, loc.lat, loc.lng);
      if (dist < loc.radius && !visitedRef.current.has(loc.id)) {
        visitedRef.current.add(loc.id);
        processingRef.current = true;

        try {
          onNewMessage(`📍 Đã đến ${loc.name}!`, false);
          onLocationVisited?.();

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contextPrompt: loc.prompt }),
          });

          if (res.ok) {
            const data = await res.json();
            onNewMessage(data.reply, true);
            speakText(data.reply);
          }
        } catch {
          onNewMessage('❌ Lỗi kết nối AI', false);
        } finally {
          processingRef.current = false;
        }
        break;
      }
    }
  }, [calculateDistance, onNewMessage, onLocationVisited, speakText]);

  const handlePosition = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;
    
    // Đánh dấu đã có GPS
    if (!hasGPSRef.current) {
      hasGPSRef.current = true;
      const accuracyText = accuracy < 50 ? 'chính xác' : accuracy < 100 ? 'khá tốt' : 'đủ dùng';
      onNewMessage(`✅ GPS hoạt động (±${Math.round(accuracy)}m - ${accuracyText})`, false);
    }
    
    checkProximity(latitude, longitude);

    if (lastUpdateRef.current) {
      const distance = calculateDistance(
        lastUpdateRef.current.lat,
        lastUpdateRef.current.lng,
        latitude,
        longitude
      );
      
      if (distance < UPDATE_THRESHOLD) return;
    }

    lastUpdateRef.current = { lat: latitude, lng: longitude };
    onLocationUpdate({ lat: latitude, lng: longitude });
  }, [calculateDistance, checkProximity, onLocationUpdate, onNewMessage]);

  const handleError = useCallback((error: GeolocationPositionError) => {
    // Chỉ log, KHÔNG hiện thông báo lỗi
    console.log('GPS error:', error.code, error.message);
    
    // Nếu timeout với high accuracy, thử lại với low accuracy
    if (error.code === error.TIMEOUT && useHighAccuracyRef.current) {
      console.log('Chuyển sang chế độ low accuracy...');
      useHighAccuracyRef.current = false;
      
      // Không cần thông báo user, tự động fallback
    }
  }, []);

  const startWatching = useCallback(() => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    const options: PositionOptions = {
      enableHighAccuracy: useHighAccuracyRef.current,
      timeout: Infinity, // Không giới hạn timeout
      maximumAge: 10000 // Chấp nhận vị trí cũ 10s
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      options
    );
  }, [handlePosition, handleError]);

  useEffect(() => {
    if (isTracking && 'geolocation' in navigator) {
      lastUpdateRef.current = null;
      hasGPSRef.current = false;
      useHighAccuracyRef.current = true;
      
      onNewMessage('🔍 Đang tìm vị trí...', false);

      // Lấy vị trí đầu tiên nhanh (network location)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handlePosition(pos);
        },
        (err) => {
          console.log('Initial position error:', err);
          onNewMessage('⏳ Đang tìm GPS... (có thể mất vài giây)', false);
        },
        { 
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 30000
        }
      );

      // Bắt đầu watch với high accuracy
      startWatching();

      // Nếu sau 15s vẫn không có GPS, fallback sang low accuracy
      const fallbackTimer = setTimeout(() => {
        if (!hasGPSRef.current) {
          console.log('Fallback to low accuracy after 15s');
          useHighAccuracyRef.current = false;
          startWatching();
          onNewMessage('📡 Đang dùng vị trí network (độ chính xác thấp hơn)', false);
        }
      }, 15000);

      return () => {
        clearTimeout(fallbackTimer);
        if (watchIdRef.current) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        window.speechSynthesis?.cancel();
      };
    } else {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      window.speechSynthesis?.cancel();
    }
  }, [isTracking, handlePosition, startWatching, onNewMessage]);

  return null;
}
