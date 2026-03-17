'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, X, MessageCircle, Radio, Square } from 'lucide-react';

interface ConversationMemory {
  summary: string;
  recentMessages: { role: string; content: string }[];
  messageCount: number;
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

function getRecognitionLang(language: 'vi' | 'en' | 'ko' | 'zh') {
  switch (language) {
    case 'en':
      return 'en-US';
    case 'ko':
      return 'ko-KR';
    case 'zh':
      return 'zh-CN';
    case 'vi':
    default:
      return 'vi-VN';
  }
}

const uiText = {
  vi: {
    ask: 'Hỏi đáp',
    freeTalk: 'Trò chuyện',
    useChrome: '❌ Dùng Chrome hoặc Safari!',
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
    useChrome: '❌ Use Chrome or Safari!',
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
    useChrome: '❌ Chrome 또는 Safari를 사용하세요!',
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
    useChrome: '❌ 请使用 Chrome 或 Safari！',
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

  const ftSentRef = useRef(false);
  const isPlayingRef = useRef(false);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { locationIdRef.current = locationId; }, [locationId]);
  useEffect(() => { freeTalkActiveRef.current = freeTalkActive; }, [freeTalkActive]);
  useEffect(() => { memoryRef.current = memory; }, [memory]);
  useEffect(() => { onMemoryUpdateRef.current = onMemoryUpdate; }, [onMemoryUpdate]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const text = uiText[language];

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

  const speakText = useCallback(async (textToSpeak: string, onDone?: () => void) => {
    if (isMutedRef.current) {
      onDone?.();
      return;
    }

    try {
      stopAudio();

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak, language: languageRef.current }),
      });

      if (!res.ok) {
        onDone?.();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

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

  const startAskListening = useCallback(() => {
    stopPageAudio();
    stopAudio();

    if (isThinking) return;
    if (isListening) return;

    setError('');
    setTranscript('');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError(text.useChrome);
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
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        isStartedRef.current = false;
        setIsListening(false);
        r.stop();
        askAI(final.trim());
        return;
      }

      if (interim !== lastInterim) {
        lastInterim = interim;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (isStartedRef.current && interim.trim().length > 1 && !hasSent) {
            hasSent = true;
            isStartedRef.current = false;
            setIsListening(false);
            r.stop();
            askAI(interim.trim());
          }
        }, 1500);
      }
    };

    r.onerror = (e: any) => {
      isStartedRef.current = false;
      setIsListening(false);

      if (e.error === 'aborted') return;
      if (e.error === 'not-allowed') {
        setError(text.micDenied);
      } else if (e.error !== 'no-speech') {
        setError(`Error: ${e.error}`);
      }
    };

    r.onend = () => {
      isStartedRef.current = false;
      setIsListening(false);
    };

    r.start();
  }, [isThinking, isListening, askAI, stopPageAudio, stopAudio, text.useChrome, text.micDenied]);

  const stopAskListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current && isStartedRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const startFreeTalkListening = useCallback(() => {
    if (!freeTalkActiveRef.current) return;
    if (isStartedRef.current) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.lang = getRecognitionLang(languageRef.current);
    r.continuous = true;
    r.interimResults = false;

    recognitionRef.current = r;
    isStartedRef.current = false;
    ftSentRef.current = false;

    let accumulatedText = '';

    r.onstart = () => {
      isStartedRef.current = true;
      setIsListening(true);
      setTranscript('');
    };

    r.onresult = (e: any) => {
      if (ftSentRef.current) return;

      let newText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          newText += e.results[i][0].transcript;
        }
      }

      if (!newText.trim()) return;

      if (isPlayingRef.current) {
        stopAudio();
        accumulatedText = newText.trim();
        setTranscript(accumulatedText);

        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => sendAccumulated(), 1800);
        return;
      }

      accumulatedText = (accumulatedText + ' ' + newText).trim();
      setTranscript(accumulatedText);

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => sendAccumulated(), 1800);
    };

    const sendAccumulated = () => {
      if (ftSentRef.current) return;

      const textToSend = accumulatedText.trim();
      if (textToSend.length < 2 || !freeTalkActiveRef.current) return;

      ftSentRef.current = true;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      setTranscript('');
      accumulatedText = '';

      askAI(textToSend, true, () => {
        ftSentRef.current = false;
      });
    };

    r.onerror = (e: any) => {
      isStartedRef.current = false;
      setIsListening(false);

      if (e.error === 'aborted') return;

      if (e.error === 'no-speech') {
        if (freeTalkActiveRef.current && !ftSentRef.current) {
          setTimeout(() => {
            if (freeTalkActiveRef.current && !isStartedRef.current) {
              startFreeTalkListening();
            }
          }, 200);
        }
        return;
      }

      if (e.error === 'not-allowed') {
        setFreeTalkActive(false);
        setError(text.micDenied);
      }
    };

    r.onend = () => {
      isStartedRef.current = false;
      setIsListening(false);

      if (freeTalkActiveRef.current && !ftSentRef.current) {
        setTimeout(() => {
          if (freeTalkActiveRef.current && !isStartedRef.current) {
            startFreeTalkListening();
          }
        }, 200);
      }
    };

    try { r.start(); } catch {}
  }, [askAI, stopAudio, text.micDenied]);

  const toggleFreeTalk = useCallback(() => {
    if (freeTalkActive) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      ftSentRef.current = true;
      if (recognitionRef.current && isStartedRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      stopAudio();
      setFreeTalkActive(false);
      setIsListening(false);
      setTranscript('');
    } else {
      ftSentRef.current = false;
      setFreeTalkActive(true);
      setError('');
      setTimeout(() => startFreeTalkListening(), 100);
    }
  }, [freeTalkActive, startFreeTalkListening, stopAudio]);

  const handleClose = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    ftSentRef.current = true;
    if (recognitionRef.current && isStartedRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    stopAudio();
    setFreeTalkActive(false);
    setIsOpen(false);
    setMessages([]);
    setTranscript('');
    setError('');
    isStartedRef.current = false;
  };

  const getButtonState = () => {
    if (isListening) return 'listening';
    if (isThinking) return 'thinking';
    if (isSpeaking) return 'speaking';
    return 'idle';
  };

  const buttonState = getButtonState();

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute bottom-36 right-3 z-[1001] w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full shadow-2xl flex flex-col items-center justify-center gap-1 hover:scale-110 transition-transform active:scale-95"
        >
          <Mic size={36} />
          <span className="text-[11px] font-semibold">AI Chat</span>
        </button>
      )}

      {isOpen && (
        <div className="absolute bottom-16 left-0 right-0 z-[1001] p-3">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-white">
                  <Mic size={18} />
                  <span className="font-semibold">AI Voice Chat</span>
                  {locationId && (
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      📍 {locationId}
                    </span>
                  )}
                </div>
                <button onClick={handleClose} className="text-white/80 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMode('ask');
                    if (freeTalkActive) toggleFreeTalk();
                  }}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    mode === 'ask' ? 'bg-white text-purple-600' : 'bg-white/20 text-white'
                  }`}
                >
                  <MessageCircle size={14} />
                  {text.ask}
                </button>
                <button
                  onClick={() => setMode('freetalk')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    mode === 'freetalk' ? 'bg-white text-purple-600' : 'bg-white/20 text-white'
                  }`}
                >
                  <Radio size={14} />
                  {text.freeTalk}
                </button>
              </div>
            </div>

            <div className="h-44 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                  {mode === 'ask' ? (
                    <>
                      <MessageCircle size={28} className="text-purple-300" />
                      <p className="text-gray-400 text-xs">{text.holdToAsk}</p>
                    </>
                  ) : (
                    <>
                      <Radio size={28} className="text-purple-300" />
                      <p className="text-gray-400 text-xs whitespace-pre-line">{text.freeTalkHint}</p>
                    </>
                  )}
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                      m.role === 'user'
                        ? 'bg-purple-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-800'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 px-3 py-2 rounded-2xl flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-purple-500" />
                    <span className="text-xs text-gray-500">{text.thinking}</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {(isListening || transcript) && (
              <div className="px-4 py-2 bg-purple-50 border-t border-purple-100">
                <p className="text-xs text-purple-600 flex items-center gap-1.5">
                  {isListening && (
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block shrink-0" />
                  )}
                  <span className="truncate">{transcript || text.listening}</span>
                </p>
              </div>
            )}

            {error && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                <p className="text-xs text-red-500">{error}</p>
              </div>
            )}

            <div className="px-4 py-4 border-t border-gray-100 bg-white">
              {mode === 'ask' ? (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onPointerDown={startAskListening}
                    onPointerUp={stopAskListening}
                    onPointerLeave={stopAskListening}
                    disabled={isThinking}
                    className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 select-none touch-none ${
                      buttonState === 'listening'
                        ? 'bg-red-500 text-white scale-110 animate-pulse'
                        : buttonState === 'thinking'
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : buttonState === 'speaking'
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white'
                        : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                    }`}
                  >
                    {buttonState === 'thinking' ? (
                      <Loader2 size={36} className="animate-spin" />
                    ) : buttonState === 'listening' ? (
                      <MicOff size={36} />
                    ) : buttonState === 'speaking' ? (
                      <Square size={36} />
                    ) : (
                      <Mic size={36} />
                    )}
                  </button>

                  <p className="text-xs text-gray-400 text-center">
                    {buttonState === 'listening' ? (
                      <span className="text-red-500 font-medium">{text.releaseToSend}</span>
                    ) : buttonState === 'thinking' ? (
                      <span>{text.processing}</span>
                    ) : buttonState === 'speaking' ? (
                      <span className="text-green-600 font-medium">{text.holdToInterrupt}</span>
                    ) : (
                      <span>{text.holdToSpeak}</span>
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={toggleFreeTalk}
                    disabled={isThinking}
                    className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                      freeTalkActive
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white'
                        : isThinking
                        ? 'bg-gray-200 text-gray-400'
                        : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                    }`}
                  >
                    {isThinking ? (
                      <Loader2 size={36} className="animate-spin" />
                    ) : freeTalkActive ? (
                      isListening ? (
                        <Mic size={36} className="animate-pulse" />
                      ) : isSpeaking ? (
                        <Square size={36} className="animate-pulse" />
                      ) : (
                        <Radio size={36} className="animate-pulse" />
                      )
                    ) : (
                      <Radio size={36} />
                    )}
                  </button>

                  <p className="text-xs text-center font-medium">
                    {isThinking ? (
                      <span className="text-gray-400">{text.aiThinking}</span>
                    ) : freeTalkActive ? (
                      <span className="text-green-600">
                        {isSpeaking
                          ? text.aiSpeakingInterrupt
                          : isListening
                          ? text.listeningPause
                          : text.waitingForYou}
                      </span>
                    ) : (
                      <span className="text-gray-400">{text.startTalking}</span>
                    )}
                  </p>

                  {freeTalkActive && (
                    <p className="text-xs text-gray-400">{text.tapAgainToStop}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
