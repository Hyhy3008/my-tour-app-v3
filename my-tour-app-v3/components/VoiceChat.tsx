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
  const memoryRef = useRef(memory);
  const onMemoryUpdateRef = useRef(onMemoryUpdate);
  const isStartedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freeTalkActiveRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Free talk guards
  const ftSentRef = useRef(false);          // da gui lan nay chua — guard tuyet doi chong double-send
  const isPlayingRef = useRef(false);

  // Web Audio interrupt detection
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const interruptRafRef = useRef<number | null>(null);

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
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    isPlayingRef.current = false;
  }, []);

  // ── Web Audio interrupt: dung AudioContext analyser de phat hien tieng noi
  // khi AI dang phat, khong can SpeechRecognition thu 2
  const stopInterruptDetect = useCallback(() => {
    if (interruptRafRef.current) { cancelAnimationFrame(interruptRafRef.current); interruptRafRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    analyserRef.current = null;
  }, []);

  const startInterruptDetect = useCallback((onInterrupt: () => void) => {
    stopInterruptDetect();
    navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
      if (!isPlayingRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);

      // Cho 600ms dau de tranh nghe echo tu loa
      let warmup = true;
      setTimeout(() => { warmup = false; }, 600);

      const THRESHOLD = 30; // nguong RMS phat hien tieng noi
      let consecutiveFrames = 0;

      const check = () => {
        if (!isPlayingRef.current) { stopInterruptDetect(); return; }
        analyser.getByteTimeDomainData(data);
        // Tinh RMS
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128); sum += v * v; }
        const rms = Math.sqrt(sum / data.length);
        if (!warmup && rms > THRESHOLD) {
          consecutiveFrames++;
          if (consecutiveFrames >= 3) { // 3 frame lien tiep (~50ms) moi tinh la co noi
            stopInterruptDetect();
            onInterrupt();
            return;
          }
        } else {
          consecutiveFrames = 0;
        }
        interruptRafRef.current = requestAnimationFrame(check);
      };
      interruptRafRef.current = requestAnimationFrame(check);
    }).catch(() => {}); // neu bi deny thi thoi, khong bat buoc
  }, [stopInterruptDetect]);

  const speakText = useCallback(async (text: string, onDone?: () => void) => {
    if (isMutedRef.current) { onDone?.(); return; }
    try {
      stopAudio();
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: languageRef.current }),
      });
      if (!res.ok) { onDone?.(); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      isPlayingRef.current = true;

      const cleanup = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        isPlayingRef.current = false;
        stopInterruptDetect();
      };

      audio.onended = () => { cleanup(); onDone?.(); };
      audio.onerror = () => { cleanup(); onDone?.(); };
      await audio.play();
    } catch { onDone?.(); }
  }, [stopAudio, stopInterruptDetect]);

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
        stopPageAudio();
        // Free talk: bat interrupt detect truoc khi phat audio
        if (isFreeChat && freeTalkActiveRef.current) {
          isPlayingRef.current = true;
          startInterruptDetect(() => {
            stopAudio();
            // recognition dang chay se tu onend -> restart
            // neu recognition chua chay -> startFreeTalkListening se duoc goi tu audio.onended
          });
        }
        await new Promise<void>(resolve => speakText(data.reply, resolve));
      }
    } catch (e) { console.error('AI error:', e); }
    finally {
      setIsThinking(false);
      isPlayingRef.current = false;
      onDone?.();
    }
  }, [speakText, stopPageAudio, startInterruptDetect, stopAudio]);

  // ══════════════════════════════════════
  // ASK MODE
  // ══════════════════════════════════════
  const startAskListening = useCallback(() => {
    if (isThinking || isListening) return;
    setError(''); setTranscript('');
    stopPageAudio(); stopAudio();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError(language === 'vi' ? '❌ Dùng Chrome hoặc Safari!' : '❌ Use Chrome or Safari!'); return; }

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
      if (e.error === 'not-allowed') setError(language === 'vi' ? '❌ Cần cấp quyền Mic!' : '❌ Mic permission denied!');
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

  // ══════════════════════════════════════════════════════════════
  // FREE TALK MODE
  //
  // Thiet ke:
  //  - continuous=true, chi lay FINAL results (khong dung interim de gui)
  //  - accumulatedText la bien LOCAL trong closure, KHONG phai ref
  //    -> moi session recognition co accumulated rieng, khong bi shared
  //  - ftSentRef: guard tuyet doi, set=true ngay khi quyet dinh gui
  //    -> du onresult/onend fire bao nhieu lan cung khong gui 2 lan
  //  - Khi AI phat audio: dung Web Audio analyser de detect tieng noi
  //    -> interrupt: dung audio, doi recognition hien tai den onend -> restart
  // ══════════════════════════════════════════════════════════════
  const startFreeTalkListening = useCallback(() => {
    if (!freeTalkActiveRef.current) return;
    if (isStartedRef.current) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.lang = languageRef.current === 'vi' ? 'vi-VN' : 'en-US';
    r.continuous = true;       // true de khong bi cat giua cau
    r.interimResults = false;  // FALSE - chi lay final, khong bao gio lap

    recognitionRef.current = r;
    isStartedRef.current = false;
    ftSentRef.current = false;

    // accumulated TEXT la bien local trong closure nay
    // -> moi lan startFreeTalkListening() tao 1 closure moi, accumulated = ''
    let accumulatedText = '';

    r.onstart = () => {
      isStartedRef.current = true;
      setIsListening(true);
      setTranscript('');
    };

    r.onresult = (e: any) => {
      if (ftSentRef.current) return; // guard: da gui roi thi bo qua

      // Lay tat ca final results tu event nay
      let newText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) newText += e.results[i][0].transcript;
      }
      if (!newText) return;

      accumulatedText = (accumulatedText + ' ' + newText).trim();
      setTranscript(accumulatedText);

      // Reset silence timer: 1.8s im lang sau final result -> gui
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (ftSentRef.current) return;
        const textToSend = accumulatedText.trim();
        if (textToSend.length > 1 && freeTalkActiveRef.current) {
          ftSentRef.current = true; // LOCK ngay truoc moi thu
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          setTranscript('');
          setIsListening(false);
          isStartedRef.current = false;
          try { r.stop(); } catch {}

          // Goi AI, khi xong moi restart lang nghe
          askAI(textToSend, true, () => {
            if (freeTalkActiveRef.current) {
              setTimeout(() => {
                if (freeTalkActiveRef.current) startFreeTalkListening();
              }, 400);
            }
          });
        }
      }, 1800);
    };

    r.onerror = (e: any) => {
      isStartedRef.current = false;
      setIsListening(false);
      if (e.error === 'aborted') return;
      if (e.error === 'no-speech') {
        // Browser khong nghe thay gi -> restart
        if (freeTalkActiveRef.current && !ftSentRef.current) {
          setTimeout(() => {
            if (freeTalkActiveRef.current && !isStartedRef.current && !ftSentRef.current) {
              startFreeTalkListening();
            }
          }, 300);
        }
        return;
      }
      if (e.error === 'not-allowed') {
        setFreeTalkActive(false);
        setError(language === 'vi' ? '❌ Cần cấp quyền Mic!' : '❌ Mic permission denied!');
      }
    };

    r.onend = () => {
      isStartedRef.current = false;
      setIsListening(false);
      // Neu da gui hoac dang xu ly -> khong restart o day (askAI onDone se restart)
      if (ftSentRef.current) return;
      // Chua gui gi, free talk van on -> restart de tiep tuc lang nghe
      if (freeTalkActiveRef.current) {
        setTimeout(() => {
          if (freeTalkActiveRef.current && !isStartedRef.current && !ftSentRef.current) {
            startFreeTalkListening();
          }
        }, 300);
      }
    };

    try { r.start(); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askAI, language]);

  const toggleFreeTalk = useCallback(() => {
    if (freeTalkActive) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      ftSentRef.current = true; // ngan onend restart
      if (recognitionRef.current && isStartedRef.current) { try { recognitionRef.current.stop(); } catch {} }
      stopInterruptDetect();
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
  }, [freeTalkActive, startFreeTalkListening, stopAudio, stopInterruptDetect]);

  const handleClose = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    ftSentRef.current = true;
    if (recognitionRef.current && isStartedRef.current) { try { recognitionRef.current.stop(); } catch {} }
    stopInterruptDetect();
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
      {/* Nut mo Voice Chat */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute bottom-36 right-3 z-[1001] w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full shadow-2xl flex flex-col items-center justify-center gap-1 hover:scale-110 transition-transform active:scale-95"
        >
          <Mic size={36} />
          <span className="text-[11px] font-semibold">AI Chat</span>
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="absolute bottom-16 left-0 right-0 z-[1001] p-3">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">

            {/* Header */}
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

            {/* Messages */}
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

            {/* Transcript */}
            {(isListening || transcript) && (
              <div className="px-4 py-2 bg-purple-50 border-t border-purple-100">
                <p className="text-xs text-purple-600 flex items-center gap-1.5">
                  {isListening && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block shrink-0" />}
                  <span className="truncate">{transcript || (language === 'vi' ? 'Đang nghe...' : 'Listening...')}</span>
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                <p className="text-xs text-red-500">{error}</p>
              </div>
            )}

            {/* Controls */}
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
                    className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
                      freeTalkActive
                        ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white'
                        : isThinking ? 'bg-gray-200 text-gray-400'
                        : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                    }`}
                  >
                    {isThinking ? (
                      <Loader2 size={36} className="animate-spin" />
                    ) : freeTalkActive ? (
                      isListening
                        ? <Mic size={36} className="animate-pulse" />
                        : <Radio size={36} className="animate-pulse" />
                    ) : (
                      <Radio size={36} />
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
