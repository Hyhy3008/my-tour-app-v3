'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Location {
  id: string; name: string; lat: number; lng: number; radius: number; prompt: string;
}

const locations: Location[] = [
  { id: "trang-an", name: "Tràng An", lat: 20.2541, lng: 105.9149, radius: 100, prompt: "Giới thiệu Tràng An - Di sản UNESCO. Trả lời ngắn gọn 3-4 câu, thêm emoji." },
  { id: "hang-mua", name: "Hang Múa", lat: 20.2316, lng: 105.9189, radius: 50, prompt: "Giới thiệu Hang Múa - 486 bậc đá, view Tam Cốc. Trả lời ngắn gọn 3-4 câu, thêm emoji." },
  { id: "bai-dinh", name: "Chùa Bái Đính", lat: 20.2686, lng: 105.8481, radius: 150, prompt: "Giới thiệu chùa Bái Đính lớn nhất Đông Nam Á. Trả lời ngắn gọn 3-4 câu, thêm emoji." },
  { id: "tam-coc", name: "Tam Cốc", lat: 20.2153, lng: 105.9218, radius: 80, prompt: "Giới thiệu Tam Cốc - Bích Động, 3 hang động. Trả lời ngắn gọn 3-4 câu, thêm emoji." },
  { id: "hoa-lu", name: "Cố đô Hoa Lư", lat: 20.2589, lng: 105.9256, radius: 40, prompt: "Giới thiệu Cố đô Hoa Lư - kinh đô đầu tiên Việt Nam. Trả lời ngắn gọn 3-4 câu, thêm emoji." },
  { id: "thien-ha", name: "Động Thiên Hà", lat: 20.2083, lng: 105.8944, radius: 30, prompt: "Giới thiệu Động Thiên Hà - thạch nhũ ngân hà. Trả lời ngắn gọn 3-4 câu, thêm emoji." },
  { id: "sen", name: "Cánh đồng Sen", lat: 20.2200, lng: 105.9100, radius: 120, prompt: "Giới thiệu cánh đồng sen Ninh Bình. Trả lời ngắn gọn 3-4 câu, thêm emoji." },
];

interface Props {
  isTracking: boolean;
  isMuted: boolean;
  onLocationUpdate: (loc: { lat: number; lng: number }) => void;
  onNewMessage: (msg: string, isAi: boolean) => void;
  onLocationVisited?: () => void;
}

export default function BackgroundTracker({ isTracking, isMuted, onLocationUpdate, onNewMessage, onLocationVisited }: Props) {
  const watchIdRef = useRef<number | null>(null);
  const visitedLocations = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const speakText = useCallback((text: string) => {
    if (isMuted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, [isMuted]);

  const checkProximity = useCallback(async (lat: number, lng: number) => {
    if (processingRef.current) return;
    for (const loc of locations) {
      const distance = calculateDistance(lat, lng, loc.lat, loc.lng);
      if (distance < loc.radius && !visitedLocations.current.has(loc.id)) {
        visitedLocations.current.add(loc.id);
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
          onNewMessage('❌ Lỗi kết nối', false);
        } finally {
          processingRef.current = false;
        }
        break;
      }
    }
  }, [onNewMessage, onLocationVisited, speakText]);

  useEffect(() => {
    if (isTracking) {
      if ('geolocation' in navigator) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            onLocationUpdate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            checkProximity(pos.coords.latitude, pos.coords.longitude);
          },
          (err) => onNewMessage(`⚠️ GPS: ${err.message}`, false),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
      }
    } else {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
      window.speechSynthesis?.cancel();
    }
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isTracking, onLocationUpdate, checkProximity, onNewMessage]);

  return null;
}
