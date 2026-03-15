'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Loader2, X } from 'lucide-react';

interface Props {
  language: 'vi' | 'en';
  isMuted: boolean;
}

interface Message {
  role: 'user' | 'ai';
  content: string;
}

// Khai báo Web Speech API types
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function VoiceChat({ language, isMuted }: Props) {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { languageRef.current = language; }, [language]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Khởi tạo Web Speech API
  const initRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(language === 'vi'
        ? 'Trình duyệt không hỗ trợ nhận diện giọng nói. Dùng Chrome!'
        : 'Browser does not support speech recognition. Use Chrome!');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'vi' ? 'vi-VN' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true; // Hiện text real-time khi đang nói
    recognition.maxAlternatives = 1;

    return recognition;
  }, [language]);

  // Phát audio TTS
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
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
    } catch (e) {
      console.error('TTS error:', e);
    }
  }, []);

  // Gọi AI
  const askAI = useCallback(async (userText: string) => {
    setIsThinking(true);
    setMessages(prev => [...prev, { role: 'user', content: userText }]);

    const lang = languageRef.current;
    const prompt = lang === 'vi'
      ? `Người dùng đang hỏi về địa điểm du lịch: "${userText}". Trả lời ngắn gọn 2-3 câu, thân thiện, có emoji.`
      : `Tourist is asking: "${userText}". Reply in 2-3 short sentences, friendly, with emojis.`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextPrompt: prompt, language: lang }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, { role: 'ai', content: data.reply }]);
        await speakText(data.reply);
      }
    } catch (e) {
      console.error('AI error:', e);
    } finally {
      setIsThinking(false);
    }
  }, [speakText]);

  // Bắt đầu nghe
  const startListening = useCallback(() => {
    setError('');
    setTranscript('');

    // Dừng audio đang phát nếu có
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const recognition = initRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      // Hiện text real-time
      setTranscript(finalText || interimText);

      // Nếu có final text → gửi AI
      if (finalText) {
        setIsListening(false);
        recognition.stop();
        askAI(finalText.trim());
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === 'no-speech') {
        setError(language === 'vi' ? 'Không nghe thấy gì. Thử lại!' : 'No speech detected. Try again!');
      } else if (event.error === 'not-allowed') {
        setError(language === 'vi' ? 'Cần cấp quyền microphone!' : 'Microphone permission required!');
      } else {
        setError(`Error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  }, [initRecognition, askAI, language]);

  // Dừng nghe
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Đóng panel
  const handleClose = () => {
    stopListening();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsOpen(false);
    setMessages([]);
    setTranscript('');
    setError('');
  };

  const placeholder = language === 'vi'
    ? 'Hỏi tôi về địa điểm, ẩm thực...'
    : 'Ask me about locations, food...';

  return (
    <>
      {/* Nút mở Voice Chat - nổi góc phải */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="absolute bottom-36 right-4 z-[1001] w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95"
        >
          <Mic size={26} />
        </button>
      )}

      {/* Panel Voice Chat */}
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
              </div>
              <button onClick={handleClose} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div className="h-40 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
              {messages.length === 0 && (
                <p className="text-gray-400 text-xs text-center pt-4">{placeholder}</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                    m.role === 'user'
                      ? 'bg-purple-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-800'
                  }`}>
                    {m.content}
                  </div>
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

            {/* Transcript real-time */}
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
                <p className="text-xs text-red-500">{error}</p>
              </div>
            )}

            {/* Nút Mic */}
            <div className="px-4 py-3 flex items-center justify-center border-t border-gray-100 bg-white">
              <button
                onPointerDown={startListening}
                onPointerUp={stopListening}
                disabled={isThinking}
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 select-none ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse scale-110'
                    : isThinking
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:scale-105'
                }`}
              >
                {isThinking ? <Loader2 size={28} className="animate-spin" /> : <Mic size={28} />}
              </button>
              <p className="absolute text-xs text-gray-400 mt-20">
                {isListening
                  ? (language === 'vi' ? 'Đang nghe... nhả để gửi' : 'Listening... release to send')
                  : (language === 'vi' ? 'Giữ để nói' : 'Hold to speak')}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
