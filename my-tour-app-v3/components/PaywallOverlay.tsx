'use client';

import { Lock, MapPin, Sparkles, Zap } from 'lucide-react';

export default function PaywallOverlay({ onPayment }: { onPayment: () => void }) {
  return (
    <div className="absolute inset-0 z-[1500] bg-gradient-to-b from-black/70 via-black/50 to-transparent pointer-events-none">
      <div className="absolute top-24 left-0 right-0 p-4 pointer-events-auto">
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-5 shadow-xl mx-auto max-w-sm animate-slide-up">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
              <Lock className="text-white" size={28} />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 text-lg">Tour Guide AI</h3>
              <p className="text-sm text-gray-500">Mở khóa 24 giờ trải nghiệm</p>
            </div>
          </div>
          <div className="space-y-2 mb-5">
            <div className="flex items-center gap-2 text-sm text-gray-600"><Zap size={16} className="text-yellow-500" /><span>AI thuyết minh tự động khi đến địa điểm</span></div>
            <div className="flex items-center gap-2 text-sm text-gray-600"><MapPin size={16} className="text-blue-500" /><span>7+ địa điểm: Tràng An, Hang Múa, Bái Đính...</span></div>
            <div className="flex items-center gap-2 text-sm text-gray-600"><Sparkles size={16} className="text-purple-500" /><span>Hoạt động cả khi mất mạng (offline)</span></div>
          </div>
          <button onClick={onPayment} className="w-full py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition transform hover:scale-[1.02] active:scale-[0.98]">
            🔓 Mở khóa - Chỉ 149k / $6
          </button>
        </div>
      </div>
    </div>
  );
}
