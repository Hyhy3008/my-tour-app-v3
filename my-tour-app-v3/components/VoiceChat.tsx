'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, X } from 'lucide-react';

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

export default function VoiceChat({ language, isMuted, locationId, memory, onMemoryUpdate }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState('');

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedRef = useRef(isMuted);
  const languageRef = useRef(language);
  const locationIdRef = useRef(locationId);
  const isStartedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { locationIdRef.current = locationId; }, [locationId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const stopPageAudio = useCallback(() => {
    window.dispatchEvent(new CustomEvent('voice-chat-speaking'));
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
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
    } catch (e) { console.error('TTS error:', e); }
  }, []);

  const askAI = useCallback(async (userText: string) => {
    setIsThinking(true);
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    const lang = languageRef.current;
    const locId = locationIdRef.current;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userQuestion: userText,
          locationId: locId || null,
          language: lang,
          conversationMemory: memory || { summary: '', recentMessages: [], messageCount: 0 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'ai', content: data.reply }]);
        if (data.memoryUpdate && onMemoryUpdate) onMemoryUpdate(data.memoryUpdate);
        stopPageAudio();
        await speakText(data.reply);
      }
    } catch (e) { console.error('AI error:', e); }
    finally { setIsThinking(false); }
  }, [speakText, stopPageAudio, memory, onMemoryUpdate]);

  const startListening = useCallback(() => {
    if (isThinking || isListening) return;
    setError('');
    setTranscript('');
    stopPageAudio();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError(language === 'vi'
        ? '❌ Trình duyệt không hỗ trợ. Dùng Chrome hoặc Safari!'
        : '❌ Browser not supported. Use Chrome or Safari!');
      return;
    }

    const recognition = new SR();
    recognition.lang = languageRef.current === 'vi' ? 'vi-VN' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    isStartedRef.current = false;

    recognition.onstart = () => { isStartedRef.current = true; setIsListening(true); };

    recognition.onresult = (event: any) => {
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      setTranscript(final || interim);
      if (final) {
        isStartedRef.current = false;
        setIsListening(false);
        recognition.stop();
        askAI(final.trim());
      }
    };

    recognition.onerror = (event: any) => {
      isStartedRef.current = false;
      setIsListening(false);
      if (event.error === 'aborted') return;
      if (event.error === 'not-allowed') {
        setError(language === 'vi'
          ? '❌ Cần cấp quyền Microphone!\nSettings → Chrome/Safari → Mic → Allow'
          : '❌ Mic permission denied!\nSettings → Chrome/Safari → Mic → Allow');
      } else if (event.error === 'no-speech') {
        setError(language === 'vi' ? 'Không nghe thấy. Thử lại!' : 'No speech. Try again!');
      } else {
        setError(`Error: ${event.error}`);
      }
    };

    recognition.onend = () => { isStartedRef.current = false; setIsListening(false); };
    recognition.start();
  }, [isThinking, isListening, askAI, stopPageAudio, language]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isStartedRef.current) recognitionRef.current.stop();
    setIsListening(false);
  }, []);

  const handleClose = () => {
    if (recognitionRef.current && isStartedRef.current) recognitionRef.current.stop();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setIsOpen(false);
    setMessages([]);
    setTranscript('');
    setError('');
    isStartedRef.current = false;
  };

  return (
    <>
      {/* Nút mở Voice Chat */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute bottom-36 right-3 z-[1001] w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95"
        >
          <Mic size={32} />
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="absolute bottom-16 left-0 right-0 z-[1001] p-3">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">

            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Mic size={18} />
                <span className="font-semibold text-sm">
                  {language === 'vi' ? 'Hỏi AI bằng giọng nói' : 'Voice Chat with AI'}
                </span>
                {locationId && (
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">📍 {locationId}</span>
                )}
              </div>
              <button onClick={handleClose} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="h-40 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
              {messages.length === 0 && (
                <p className="text-gray-400 text-xs text-center pt-4">
                  {language === 'vi' ? 'Giữ nút mic để nói...' : 'Hold mic button to speak...'}
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                    m.role === 'user' ? 'bg-purple-500 text-white' : 'bg-white border border-gray-200 text-gray-800'
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
                <p className="text-xs text-purple-600 flex items-center gap-1">
                  {isListening && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />}
                  {transcript || (language === 'vi' ? 'Đang nghe...' : 'Listening...')}
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-100">
                <p className="text-xs text-red-500 whitespace-pre-line">{error}</p>
              </div>
            )}

            {/* Mic Button */}
            <div className="px-4 py-3 flex flex-col items-center gap-1 border-t border-gray-100 bg-white">
              <button
                onPointerDown={startListening}
                onPointerUp={stopListening}
                onPointerLeave={stopListening}
                disabled={isThinking}
                className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 select-none touch-none ${
                  isListening ? 'bg-red-500 text-white scale-110 animate-pulse'
                  : isThinking ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:scale-105'
                }`}
              >
                {isThinking ? <Loader2 size={32} className="animate-spin" />
                  : isListening ? <MicOff size={32} />
                  : <Mic size={32} />}
              </button>
              <p className="text-xs text-gray-400 text-center mt-1">
                {isListening
                  ? (language === 'vi' ? '🔴 Đang nghe... nhả để gửi' : '🔴 Listening... release to send')
                  : isThinking
                    ? (language === 'vi' ? 'AI đang trả lời...' : 'AI thinking...')
                    : (language === 'vi' ? 'Giữ để nói' : 'Hold to speak')}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
