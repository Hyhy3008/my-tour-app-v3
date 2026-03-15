'use client';

import { useState } from 'react';
import { X, CreditCard, QrCode, Loader2, Shield } from 'lucide-react';

interface Props { isOpen: boolean; onClose: () => void; }

export default function PaymentModal({ isOpen, onClose }: Props) {
  const [method, setMethod] = useState<'stripe' | 'vietqr'>('vietqr');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handlePayment = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, email, phone }),
      });
      const data = await res.json();
      if (data.url) {
        if (data.userId) localStorage.setItem('tour_user_id', data.userId);
        window.location.href = data.url;
      }
    } catch {
      alert('Lỗi thanh toán. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full animate-slide-up overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-white">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full"><X size={20} /></button>
          <div className="text-center">
            <h2 className="text-xl font-bold">🎫 Mua Tour 24h</h2>
            <p className="text-blue-100 text-sm mt-1">Chọn phương thức thanh toán</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMethod('vietqr')} className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition ${method === 'vietqr' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
              <QrCode size={20} /><span className="font-medium">VietQR</span>
            </button>
            <button onClick={() => setMethod('stripe')} className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition ${method === 'stripe' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
              <CreditCard size={20} /><span className="font-medium">Visa/Master</span>
            </button>
          </div>
          <div className="text-center py-4 bg-gray-50 rounded-2xl">
            <div className="flex items-baseline justify-center gap-1">
              {method === 'vietqr' ? (
                <><span className="text-3xl font-bold text-gray-800">149.000</span><span className="text-gray-500">VND</span></>
              ) : (
                <><span className="text-3xl font-bold text-gray-800">$6</span><span className="text-gray-500">.00 USD</span></>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">Sử dụng trong 24 giờ</p>
          </div>
          <div className="space-y-3">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (để nhận biên lai)" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            {method === 'vietqr' && (
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Số điện thoại" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            )}
          </div>
          <button onClick={handlePayment} disabled={loading} className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 hover:shadow-lg transition disabled:opacity-70">
            {loading ? <><Loader2 size={20} className="animate-spin" /> Đang xử lý...</> : method === 'vietqr' ? <><QrCode size={20} /> Tạo mã QR</> : <><CreditCard size={20} /> Thanh toán</>}
          </button>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Shield size={14} /><span>Thanh toán bảo mật qua {method === 'vietqr' ? 'PayOS' : 'Stripe'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
