'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, X, MessageCircle, Radio, Square } from 'lucide-react';

interface ConversationMemory {
  summary: string;
  recentMessages: { role: string; content: string }[];
  messageCount: number;
  summaryLang?: 'vi' | 'en' | 'ko' | 'zh';
}

interface Props {
  language: 'vi' | 'en' | 'ko' | 'zh';
  isMuted: boolean;
  locationId?: string | null;
  memory?: ConversationMemory;
  onMemoryUpdate?: (memory: ConversationMemory) => void;
}

interface Message {
  role: 'user' | 'ai';
  content: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type ChatMode = 'ask' | 'freetalk';

function getRecognitionLang(lang: 'vi' | 'en' | 'ko' | 'zh') {
  if (lang === 'vi') return 'vi-VN';
  if (lang === 'en') return 'en-US';
  if (lang === 'ko') return 'ko-KR';
  return 'zh-CN';
}

const textMap = {
  vi: {
    ask: 'Hỏi đáp',
    freeTalk: 'Trò chuyện',
    useBrowser: '❌ Dùng Chrome hoặc Safari!',
    micDenied: '❌ Cần cấp quyền Mic!',
    holdToAsk: 'Giữ nút mic để hỏi',
    freeTalkHint: 'Bấm Start để bắt đầu trò chuyện\nNói tự nhiên, dừng 2s AI sẽ trả lời',
    thinking: 'Đang suy nghĩ...',
    listening: 'Đang nghe...',
    releaseToSend: '🔴 Nhả để gửi',
    processing: '⏳ Đang xử lý...',
    holdToInterrupt: '🔊 Giữ để ngắt & hỏi tiếp',
    holdToSpeak: 'Giữ để nói',
    startTalking: 'Bấm để bắt đầu trò chuyện',
    aiThinking: 'AI đang trả lời...',
    aiSpeakingInterrupt: '🔊 AI đang nói... (nói để ngắt)',
    listeningPause: '🔴 Đang nghe... (dừng 2s để gửi)',
    waitingForYou: '⏳ Chờ bạn nói...',
    tapAgainToStop: 'Bấm lại để dừng',
  },
  en: {
    ask: 'Ask',
    freeTalk: 'Free Talk',
    useBrowser: '❌ Use Chrome or Safari!',
    micDenied: '❌ Mic permission denied!',
    holdToAsk: 'Hold mic to ask',
    freeTalkHint: 'Tap Start to begin\nSpeak naturally, pause 2s and AI replies',
    thinking: 'Thinking...',
    listening: 'Listening...',
    releaseToSend: '🔴 Release to send',
    processing: '⏳ Processing...',
    holdToInterrupt: '🔊 Hold to interrupt & ask',
    holdToSpeak: 'Hold to speak',
    startTalking: 'Tap to start talking',
    aiThinking: 'AI thinking...',
    aiSpeakingInterrupt: '🔊 AI speaking... (speak to interrupt)',
    listeningPause: '🔴 Listening... (pause 2s to send)',
    waitingForYou: '⏳ Waiting for you...',
    tapAgainToStop: 'Tap again to stop',
  },
  ko: {
    ask: '질문하기',
    freeTalk: '자유 대화',
    useBrowser: '❌ Chrome 또는 Safari를 사용하세요!',
    micDenied: '❌ 마이크 권한이 필요합니다!',
    holdToAsk: '마이크 버튼을 길게 눌러 질문하세요',
    freeTalkHint: '시작 버튼을 눌러 대화를 시작하세요\n자연스럽게 말하고 2초 멈추면 AI가 답합니다',
    thinking: '생각 중...',
    listening: '듣는 중...',
    releaseToSend: '🔴 손을 떼면 전송',
    processing: '⏳ 처리 중...',
    holdToInterrupt: '🔊 길게 눌러 끊고 다시 질문',
    holdToSpeak: '길게 눌러 말하기',
    startTalking: '눌러서 대화 시작',
    aiThinking: 'AI가 답변 중...',
    aiSpeakingInterrupt: '🔊 AI가 말하는 중... (말하면 중단)',
    listeningPause: '🔴 듣는 중... (2초 멈추면 전송)',
    waitingForYou: '⏳ 말씀을 기다리는 중...',
    tapAgainToStop: '다시 눌러 중지',
  },
  zh: {
    ask: '问答',
    freeTalk: '自由对话',
    useBrowser: '❌ 请使用 Chrome 或 Safari！',
    micDenied: '❌ 需要麦克风权限！',
    holdToAsk: '按住麦克风提问',
    freeTalkHint: '点击开始进行对话\n自然说话，停顿 2 秒后 AI 会回答',
    thinking: '正在思考...',
    listening: '正在聆听...',
    releaseToSend: '🔴 松开发送',
    processing: '⏳ 处理中...',
    holdToInterrupt: '🔊 按住可打断并继续提问',
    holdToSpeak: '按住说话',
    startTalking: '点击开始对话',
    aiThinking: 'AI 正在回答...',
    aiSpeakingInterrupt: '🔊 AI 正在说话...（你说话可打断）',
    listeningPause: '🔴 正在聆听...（停顿 2 秒发送）',
    waitingForYou: '⏳ 等你说话...',
    tapAgainToStop: '再次点击可停止',
  },
};

export default function VoiceChat({ language, isMuted, locationId, memory, onMemoryUpdate }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>('ask');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [freeTalkActive, setFreeTalkActive] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedRef = useRef(isMuted);
  const languageRef = useRef(language);
  const locationIdRef = useRef(locationId);
  const memoryRef = useRef(memory);
  const onMemoryUpdateRef = useRef(onMemoryUpdate);
  const isStartedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freeTalkActiveRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Free talk guards
  const ftSentRef = useRef(false);
  const isPlayingRef = useRef(false);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { locationIdRef.current = locationId; }, [locationId]);
  useEffect(() => { freeTalkActiveRef.current = freeTalkActive; }, [freeTalkActive]);
  useEffect(() => { memoryRef.current = memory; }, [memory]);
  useEffect(() => { onMemoryUpdateRef.current = onMemoryUpdate; }, [onMemoryUpdate]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const text = textMap[language];

  const stopPageAudio = useCallback(() => {
    window.dispatchEvent(new CustomEvent('voice-chat-speaking'));
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    isPlayingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback(async (text: string, onDone?: () => void) => {
    if (isMutedRef.current) {
      onDone?.();
      return;
    }

    try {
      stopAudio();

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: languageRef.current }),
      });

      if (!res.ok) {
        onDone?.();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      // ✅ TĂNG TỐC ĐỌC 1.2x
      audio.playbackRate = 1.2;

      isPlayingRef.current = true;
      setIsSpeaking(true);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        isPlayingRef.current = false;
        setIsSpeaking(false);
        onDone?.();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        isPlayingRef.current = false;
        setIsSpeaking(false);
        onDone?.();
      };

      await audio.play();
    } catch (e) {
      console.error('TTS error:', e);
      isPlayingRef.current = false;
      setIsSpeaking(false);
      onDone?.();
    }
  }, [stopAudio]);

  const askAI = useCallback(async (userText: string, isFreeChat = false, onDone?: () => void) => {
    setIsThinking(true);
    setMessages(prev => [...prev, { role: 'user', content: userText }]);

    const lang = languageRef.current;
    const locId = locationIdRef.current;
    const currentMemory = memoryRef.current || { summary: '', recentMessages: [], messageCount: 0 };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userQuestion: userText,
          locationId: locId || null,
          language: lang,
          conversationMemory: currentMemory,
          freeChat: isFreeChat,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'ai', content: data.reply }]);

        if (data.memoryUpdate && onMemoryUpdateRef.current) {
          onMemoryUpdateRef.current(data.memoryUpdate);
          memoryRef.current = data.memoryUpdate;
        }

        setIsThinking(false);
        stopPageAudio();

        await new Promise<void>(resolve => speakText(data.reply, resolve));
      } else {
        setIsThinking(false);
      }
    } catch (e) {
      console.error('AI error:', e);
      setIsThinking(false);
    } finally {
      onDone?.();
    }
  }, [speakText, stopPageAudio]);

  // ASK MODE
  const startAskListening = useCallback(() => {
    stopPageAudio();
    stopAudio();

    if (isThinking) return;
    if (isListening) return;

    setError('');
    setTranscript('');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError(text.useBrowser);
      return;
    }

    const r = new SR();
    r.lang = getRecognitionLang(languageRef.current);
    r.continuous = false;
    r.interimResults = true;
    recognitionRef.current = r;
    isStartedRef.current = false;

    let lastInterim = '';
    let hasSent = false;

    r.onstart = () => {
      isStartedRef.current = true;
      setIsListening(true);
    };

    r.onresult = (e: any) => {
      let interim = '';
      let final = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }

      setTranscript(final || interim);

      if (final && !hasSent) {
        hasSent = true;
