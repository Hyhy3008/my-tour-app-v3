'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, X, MessageCircle, Radio } from 'lucide-react';

interface ConversationMemory {
  summary: string;
  recentMessages: { role: string; content: string }[];
  messageCount: number;
}

interface Props {
  language: 'vi' | 'en';
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

export default function VoiceChat({ language, isMuted, locationId, memory, onMemoryUpdate }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>('ask');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');
  const [freeTalkActive, setFreeTalkActive] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedRef = useRef(isMuted);
  const languageRef = useRef(language);
  const locationIdRef = useRef(locationId);
  // FIX BUG 3: memory ref luon up-to-date, tranh stale closure
  const memoryRef = useRef(memory);
  const onMemoryUpdateRef = useRef(onMemoryUpdate);
  const isStartedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freeTalkActiveRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // FIX BUG 1: Flag phan biet r.stop() de xu ly (khong restart) vs loi (can restart)
  const stoppedForProcessingRef = useRef(false);
  // Flag biet AI dang phat audio, user noi -> dung audio ngay
  const isPlayingRef = useRef(false);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { locationIdRef.current = locationId; }, [locationId]);
  useEffect(() => { freeTalkActiveRef.current = freeTalkActive; }, [freeTalkActive]);
  useEffect(() => { memoryRef.current = memory; }, [memory]);
  useEffect(() => { onMemoryUpdateRef.current = onMemoryUpdate; }, [onMemoryUpdate]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const stopPageAudio = useCallback(() => {
    window.dispatchEvent(new CustomEvent('voice-chat-speaking'));
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    isPlayingRef.current = false;
  }, []);

  const speakText = useCallback(async (text: string) => {
    if (isMutedRef.current) return;
    try {
      stopAudio();
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
      isPlayingRef.current = true;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        isPlayingRef.current = false;
        // FIX BUG 2: Chi restart listener sau khi AI noi XONG
        // va khong co recognition dang chay roi
        if (freeTalkActiveRef.current && !isStartedRef.current) {
          setTimeout(() => {
            if (freeTalkActiveRef.current && !isStartedRef.current) {
              startFreeTalkListening();
            }
          }, 400);
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        isPlayingRef.current = false;
      };
      await audio.play();
    } catch (e) { console.error('TTS error:', e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopAudio]);

  // FIX BUG 3: askAI dung memoryRef thay vi prop memory de luon fresh
  const askAI = useCallback(async (userText: string, isFreeChat = false) => {
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
        // FIX BUG 3: Dung ref de goi callback, khong bi stale
        if (data.memoryUpdate && onMemoryUpdateRef.current) {
          onMemoryUpdateRef.current(data.memoryUpdate);
          memoryRef.current = data.memoryUpdate;
        }
        stopPageAudio();
        await speakText(data.reply);
      }
    } catch (e) { console.error('AI error:', e); }
    finally { setIsThinking(false); }
  }, [speakText, stopPageAudio]);

  // ====================================================
  // ASK MODE: Giu de noi, nha de gui
  // ====================================================
  const startAskListening = useCallback(() => {
    if (isThinking || isListening) return;
    setError(''); setTranscript('');
    stopPageAudio();
    stopAudio();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError(language === 'vi' ? 'Dung Chrome hoac Safari!' : 'Use Chrome or Safari!'); return; }

    const r = new SR();
    r.lang = languageRef.current === 'vi' ? 'vi-VN' : 'en-US';
    r.continuous = false;
    r.interimResults = true;
    recognitionRef.current = r;
    isStartedRef.current = false;
    let lastInterim = '';
    let hasSent = false;

    r.onstart = () => { isStartedRef.current = true; setIsListening(true); };
    r.onresult = (e: any) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      setTranscript(final || interim);
      if (final && !hasSent) {
        hasSent = true;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        isStartedRef.current = false; setIsListening(false);
        r.stop(); askAI(final.trim());
        return;
      }
      if (interim !== lastInterim) {
        lastInterim = interim;
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (isStartedRef.current && interim.trim().length > 1 && !hasSent) {
            hasSent = true;
            isStartedRef.current = false; setIsListening(false);
            r.stop(); askAI(interim.trim());
          }
        }, 1500);
      }
    };
    r.onerror = (e: any) => {
      isStartedRef.current = false; setIsListening(false);
      if (e.error === 'aborted') return;
      if (e.error === 'not-allowed') setError(language === 'vi' ? 'Can cap quyen Mic!' : 'Mic permission denied!');
      else if (e.error !== 'no-speech') setError(`Error: ${e.error}`);
    };
    r.onend = () => { isStartedRef.current = false; setIsListening(false); };
    r.start();
  }, [isThinking, isListening, askAI, stopPageAudio, stopAudio, language]);

  const stopAskListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current && isStartedRef.current) recognitionRef.current.stop();
    setIsListening(false);
  }, []);

  // ====================================================
  // FREE TALK MODE
  // ====================================================
  const startFreeTalkListening = useCallback(() => {
    if (!freeTalkActiveRef.current || isStartedRef.current) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.lang = languageRef.current === 'vi' ? 'vi-VN' : 'en-US';
    r.continuous = true;
    r.interimResults = true;
    recognitionRef.current = r;
    isStartedRef.current = false;
    stoppedForProcessingRef.current = false;

    let accumulatedText = '';
    let hasSentThisSession = false;

    r.onstart = () => {
      isStartedRef.current = true;
      setIsListening(true);
      setTranscript('');
    };

    r.onresult = (e: any) => {
      if (hasSentThisSession) return;

      // FIX BUG 2: Neu AI dang phat audio -> dung ngay khi user noi
      if (isPlayingRef.current) {
        stopAudio();
      }

      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) accumulatedText += t + ' ';
        else interim = t;
      }
      setTranscript((accumulatedText + interim).trim());

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (hasSentThisSession) return;
        const textToSend = accumulatedText.trim() || interim.trim();
        if (textToSend.length > 1 && freeTalkActiveRef.current) {
          hasSentThisSession = true;
          // FIX BUG 1: Danh dau dung de xu ly -> onend se KHONG restart
          stoppedForProcessingRef.current = true;
          r.stop();
          setIsListening(false);
          isStartedRef.current = false;
          setTranscript('');
          askAI(textToSend, true);
        }
      }, 2000);
    };

    r.onerror = (e: any) => {
      isStartedRef.current = false;
      setIsListening(false);
      if (e.error === 'aborted') return;
      if (e.error === 'no-speech') {
        if (freeTalkActiveRef.current && !stoppedForProcessingRef.current) {
          setTimeout(() => {
            if (freeTalkActiveRef.current && !isStartedRef.current) startFreeTalkListening();
          }, 500);
        }
        return;
      }
      if (e.error === 'not-allowed') {
        setFreeTalkActive(false);
        setError(language === 'vi' ? 'Can cap quyen Mic!' : 'Mic permission denied!');
      }
    };

    r.onend = () => {
      isStartedRef.current = false;
      setIsListening(false);
      // FIX BUG 1: Neu dung de xu ly -> KHONG restart o day
      // Restart se do speakText.onended xu ly sau khi AI noi xong
      if (stoppedForProcessingRef.current) {
        stoppedForProcessingRef.current = false;
        return;
      }
      if (freeTalkActiveRef.current) {
        setTimeout(() => {
          if (freeTalkActiveRef.current && !isStartedRef.current) startFreeTalkListening();
        }, 500);
      }
    };

    try { r.start(); } catch { }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askAI, stopAudio, language]);

  const toggleFreeTalk = useCallback(() => {
    if (freeTalkActive) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      stoppedForProcessingRef.current = true;
      if (recognitionRef.current && isStartedRef.current) recognitionRef.current.stop();
      stopAudio();
      setFreeTalkActive(false);
      setIsListening(false);
      setTranscript('');
    } else {
      stoppedForProcessingRef.current = false;
      setFreeTalkActive(true);
      setError('');
      setTimeout(() => startFreeTalkListening(), 100);
    }
  }, [freeTalkActive, startFreeTalkListening, stopAudio]);

  const handleClose = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    stoppedForProcessingRef.current = true;
    if (recognitionRef.current && isStartedRef.current) recognitionRef.current.stop();
    stopAudio();
    setFreeTalkActive(false);
    setIsOpen(false);
    setMessages([]);
    setTranscript('');
    setError('');
    isStartedRef.current = false;
  };

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
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">📍 {locationId}</span>
                  )}
                </div>
                <button onClick={handleClose} className="text-white/80 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setMode('ask'); if (freeTalkActive) toggleFreeTalk(); }}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    mode === 'ask' ? 'bg-white text-purple-600' : 'bg-white/20 text-white'
                  }`}
                >
                  <MessageCircle size={14} />
                  {language === 'vi' ? 'Hỏi đáp' : 'Ask'}
                </button>
                <button
                  onClick={() => setMode('freetalk')}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    mode === 'freetalk' ? 'bg-white text-purple-600' : 'bg-white/20 text-white'
                  }`}
                >
                  <Radio size={14} />
                  {language === 'vi' ? 'Trò chuyện' : 'Free Talk'}
                </button>
              </div>
            </div>

            <div className="h-44 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                  {mode === 'ask' ? (
                    <>
                      <MessageCircle size={28} className="text-purple-300" />
                      <p className="text-gray-400 text-xs">
                        {language === 'vi' ? 'Giữ nút mic để hỏi' : 'Hold mic to ask'}
                      </p>
                    </>
                  ) : (
                    <>
                      <Radio size={28} className="text-purple-300" />
                      <p className="text-gray-400 text-xs">
                        {language === 'vi'
                          ? 'Bấm Start để bắt đầu trò chuyện\nNói tự nhiên, dừng 2s AI sẽ trả lời'
                          : 'Tap Start to begin\nSpeak naturally, pause 2s and AI replies'}
                      </p>
                    </>
                  )}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                    m.role === 'user'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}>{m.content}</div>
                </div>
              ))}
              {isThinking && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 px-3 py-2 rounded-2xl flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-purple-500" />
                    <span className="text-xs text-gray-500">
                      {language === 'vi' ? 'Đang suy nghĩ...' : 'Thinking...'}
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {(isListening || transcript) && (
              <div className="px-4 py-2 bg-purple-50 border-t border-purple-100">
                <p className="text-xs text-purple-600 flex items-center gap-1.5">
                  {isListening && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block shrink-0" />}
                  <span className="truncate">{transcript || (language === 'vi' ? 'Đang nghe...' : 'Listening...')}</span>
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
                      isListening ? 'bg-red-500 text-white scale-110 animate-pulse'
                      : isThinking ? 'bg-gray-200 text-gray-400'
                      : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                    }`}
                  >
                    {isThinking ? <Loader2 size={36} className="animate-spin" />
                      : isListening ? <MicOff size={36} />
                      : <Mic size={36} />}
                  </button>
                  <p className="text-xs text-gray-400">
                    {isListening ? (language === 'vi' ? '🔴 Nhả để gửi' : '🔴 Release to send')
                      : isThinking ? (language === 'vi' ? 'AI đang trả lời...' : 'AI thinking...')
                      : (language === 'vi' ? 'Giữ để nói' : 'Hold to speak')}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={toggleFreeTalk}
                    disabled={isThinking}
                    className={`w-24 h-24 rounded-full flex flex-col items-center justify-center gap-1 shadow-lg transition-all active:scale-95 ${
                      freeTalkActive
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white scale-105'
                        : isThinking ? 'bg-gray-200 text-gray-400'
                        : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                    }`}
                  >
                    {isThinking ? (
                      <Loader2 size={32} className="animate-spin" />
                    ) : freeTalkActive ? (
                      <>
                        {isListening
                          ? <Mic size={32} className="animate-pulse" />
                          : <Radio size={32} className="animate-pulse" />}
                      </>
                    ) : (
                      <Radio size={32} />
                    )}
                  </button>
                  <p className="text-xs text-center font-medium">
                    {isThinking ? (
                      <span className="text-gray-400">{language === 'vi' ? 'AI đang trả lời...' : 'AI thinking...'}</span>
                    ) : freeTalkActive ? (
                      <span className="text-green-600">
                        {isListening
                          ? (language === 'vi' ? '🔴 Đang nghe... (dừng 2s để gửi)' : '🔴 Listening... (pause 2s to send)')
                          : (language === 'vi' ? '⏳ Chờ bạn nói...' : '⏳ Waiting for you...')}
                      </span>
                    ) : (
                      <span className="text-gray-400">{language === 'vi' ? 'Bấm để bắt đầu trò chuyện' : 'Tap to start talking'}</span>
                    )}
                  </p>
                  {freeTalkActive && (
                    <p className="text-xs text-gray-400">
                      {language === 'vi' ? 'Bấm lại để dừng' : 'Tap again to stop'}
                    </p>
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
