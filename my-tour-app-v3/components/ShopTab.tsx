'use client';

import { useState } from 'react';
import { ShoppingCart, Clock, MapPin, Plus, Minus, X, Check, Store, ArrowLeft } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  nameEn: string;
  price: number;
  image: string;
  description: string;
  descriptionEn: string;
  city: 'ninh-binh' | 'hanoi' | 'both';
}

interface CartItem extends Product {
  quantity: number;
}

interface ShopTabProps {
  selectedCity: 'ninh-binh' | 'hanoi';
  language: 'vi' | 'en' | 'ko' | 'zh';
}

const products: Product[] = [
  // Ninh Bình
  { id: 'com-chay', name: 'Cơm cháy Ninh Bình', nameEn: 'Ninh Binh Crispy Rice', price: 80000, image: '🍚', description: 'Cơm cháy giòn tan đặc sản', descriptionEn: 'Crispy rice specialty', city: 'ninh-binh' },
  { id: 'thit-de', name: 'Thịt dê tái chanh', nameEn: 'Goat meat with lime', price: 150000, image: '🥩', description: 'Thịt dê núi đá tươi ngon', descriptionEn: 'Fresh mountain goat meat', city: 'ninh-binh' },
  { id: 'nem-chua', name: 'Nem chua Yên Mạc', nameEn: 'Fermented Pork Roll', price: 60000, image: '🥟', description: 'Nem chua truyền thống', descriptionEn: 'Traditional fermented pork', city: 'ninh-binh' },
  { id: 'ruou-kim-son', name: 'Rượu Kim Sơn', nameEn: 'Kim Son Rice Wine', price: 120000, image: '🍶', description: 'Rượu nếp thơm nồng', descriptionEn: 'Fragrant rice wine', city: 'ninh-binh' },
  { id: 'theu-van-lam', name: 'Thêu Văn Lâm', nameEn: 'Van Lam Embroidery', price: 250000, image: '🧵', description: 'Tranh thêu tay tinh xảo', descriptionEn: 'Handmade embroidery art', city: 'ninh-binh' },

  // Hà Nội
  { id: 'pho', name: 'Phở Hà Nội', nameEn: 'Hanoi Pho', price: 50000, image: '🍜', description: 'Phở bò truyền thống', descriptionEn: 'Traditional beef noodle soup', city: 'hanoi' },
  { id: 'bun-cha', name: 'Bún chả Hà Nội', nameEn: 'Hanoi Grilled Pork Noodles', price: 60000, image: '🥢', description: 'Bún chả thơm ngon', descriptionEn: 'Grilled pork with noodles', city: 'hanoi' },
  { id: 'egg-coffee', name: 'Cà phê trứng', nameEn: 'Egg Coffee', price: 35000, image: '☕', description: 'Cà phê trứng Giảng', descriptionEn: 'Famous Giang egg coffee', city: 'hanoi' },
  { id: 'banh-com', name: 'Bánh cốm', nameEn: 'Green Rice Cake', price: 80000, image: '🍡', description: 'Bánh cốm Hàng Than', descriptionEn: 'Traditional green rice cake', city: 'hanoi' },
  { id: 'cha-ca', name: 'Chả cá Lã Vọng', nameEn: 'La Vong Fish', price: 180000, image: '🐟', description: 'Chả cá đặc sản phố cổ', descriptionEn: 'Famous La Vong grilled fish', city: 'hanoi' },
  { id: 'ao-dai', name: 'Áo dài lụa', nameEn: 'Silk Ao Dai', price: 1500000, image: '👘', description: 'Áo dài lụa Hà Đông', descriptionEn: 'Ha Dong silk Ao Dai', city: 'hanoi' },
];

const pickupLocations = {
  'ninh-binh': [
    { id: 'trang-an', name: 'Bến thuyền Tràng An', nameEn: 'Trang An Boat Station' },
    { id: 'tam-coc', name: 'Bến thuyền Tam Cốc', nameEn: 'Tam Coc Boat Station' },
    { id: 'bai-dinh', name: 'Cổng chùa Bái Đính', nameEn: 'Bai Dinh Pagoda Gate' },
  ],
  'hanoi': [
    { id: 'hoan-kiem', name: 'Hồ Hoàn Kiếm', nameEn: 'Hoan Kiem Lake' },
    { id: 'old-quarter', name: 'Phố cổ - Hàng Bạc', nameEn: 'Old Quarter - Hang Bac St' },
    { id: 'temple-lit', name: 'Văn Miếu', nameEn: 'Temple of Literature' },
  ]
};

const t = {
  vi: {
    title: 'Đặc sản địa phương',
    products: 'sản phẩm',
    cart: 'Giỏ hàng',
    emptyCart: 'Giỏ hàng trống',
    total: 'Tổng cộng',
    checkout: 'Đặt hàng',
    pickupDetails: 'Thông tin nhận hàng',
    yourName: 'Họ tên',
    phone: 'Số điện thoại',
    pickupLocation: 'Địa điểm nhận',
    pickupTime: 'Thời gian nhận',
    selectLocation: 'Chọn địa điểm',
    selectTime: 'Chọn thời gian',
    orderSummary: 'Tóm tắt đơn hàng',
    confirmOrder: 'Xác nhận đặt hàng',
    orderSuccess: 'Đặt hàng thành công!',
    orderSuccessMsg: 'Chúng tôi sẽ chuẩn bị đơn hàng. Hẹn gặp bạn!',
    fillAll: 'Vui lòng điền đầy đủ thông tin',
  },
  en: {
    title: 'Local Specialties',
    products: 'products',
    cart: 'Cart',
    emptyCart: 'Cart is empty',
    total: 'Total',
    checkout: 'Checkout',
    pickupDetails: 'Pickup Details',
    yourName: 'Your Name',
    phone: 'Phone Number',
    pickupLocation: 'Pickup Location',
    pickupTime: 'Pickup Time',
    selectLocation: 'Select location',
    selectTime: 'Select time',
    orderSummary: 'Order Summary',
    confirmOrder: 'Confirm Order',
    orderSuccess: 'Order Confirmed!',
    orderSuccessMsg: 'We will prepare your order. See you soon!',
    fillAll: 'Please fill all fields',
  },
  ko: {
    title: '지역 특산품',
    products: '상품',
    cart: '장바구니',
    emptyCart: '장바구니가 비어 있습니다',
    total: '총합',
    checkout: '주문하기',
    pickupDetails: '수령 정보',
    yourName: '이름',
    phone: '전화번호',
    pickupLocation: '수령 장소',
    pickupTime: '수령 시간',
    selectLocation: '장소 선택',
    selectTime: '시간 선택',
    orderSummary: '주문 요약',
    confirmOrder: '주문 확인',
    orderSuccess: '주문이 완료되었습니다!',
    orderSuccessMsg: '주문을 준비하겠습니다. 곧 만나겠습니다!',
    fillAll: '모든 정보를 입력해 주세요',
  },
  zh: {
    title: '当地特产',
    products: '件商品',
    cart: '购物车',
    emptyCart: '购物车为空',
    total: '总计',
    checkout: '下单',
    pickupDetails: '取货信息',
    yourName: '姓名',
    phone: '电话号码',
    pickupLocation: '取货地点',
    pickupTime: '取货时间',
    selectLocation: '选择地点',
    selectTime: '选择时间',
    orderSummary: '订单摘要',
    confirmOrder: '确认下单',
    orderSuccess: '下单成功！',
    orderSuccessMsg: '我们会为您准备订单，稍后见！',
    fillAll: '请填写完整信息',
  }
};

export default function ShopTab({ selectedCity, language }: ShopTabProps) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [pickupTime, setPickupTime] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(false);

  const texts = t[language];

  // ✅ Dữ liệu sản phẩm hiện chỉ có VI/EN:
  // vi -> dùng tiếng Việt
  // en / ko / zh -> dùng tiếng Anh
  const useEnglishContent = language !== 'vi';

  const filteredProducts = products.filter(
    p => p.city === selectedCity || p.city === 'both'
  );

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : item;
          }
          return item;
        })
        .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const formatPrice = (price: number) => {
    if (language === 'vi') return `${price.toLocaleString('vi-VN')}đ`;
    return `$${(price / 24000).toFixed(2)}`;
  };

  const generateTimeSlots = () => {
    const slots = [];
    const now = new Date();
    for (let h = Math.max(8, now.getHours() + 1); h <= 20; h++) {
      slots.push(`${h}:00`, `${h}:30`);
    }
    return slots;
  };

  const handleSubmitOrder = async () => {
    if (!pickupTime || !pickupLocation || !customerName || !customerPhone) {
      alert(texts.fillAll);
      return;
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          total: totalPrice,
          pickupTime,
          pickupLocation,
          customerName,
          customerPhone,
          city: selectedCity,
          language
        })
      });

      if (res.ok) {
        setOrderSuccess(true);
        setCart([]);
        setTimeout(() => {
          setOrderSuccess(false);
          setShowCheckout(false);
          setShowCart(false);
          setPickupTime('');
          setPickupLocation('');
          setCustomerName('');
          setCustomerPhone('');
        }, 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-500 rounded-xl flex items-center justify-center">
            <Store className="text-white" size={20} />
          </div>
          <div>
            <h1 className="font-bold text-gray-800">{texts.title}</h1>
            <p className="text-xs text-gray-500">
              {filteredProducts.length} {texts.products}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCart(true)}
          className="relative p-3 bg-blue-500 text-white rounded-xl"
        >
          <ShoppingCart size={22} />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>
      </div>

      {/* Products Grid */}
      <div className="flex-grow overflow-y-auto p-4 pb-20">
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map(product => (
            <div key={product.id} className="bg-white rounded-2xl p-3 shadow-sm">
              <div className="text-4xl text-center mb-2">{product.image}</div>
              <h3 className="font-bold text-sm text-gray-800 truncate">
                {useEnglishContent ? product.nameEn : product.name}
              </h3>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                {useEnglishContent ? product.descriptionEn : product.description}
              </p>
              <div className="flex items-center justify-between mt-3">
                <span className="font-bold text-blue-600 text-sm">
                  {formatPrice(product.price)}
                </span>
                <button
                  onClick={() => addToCart(product)}
                  className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Modal */}
      {showCart && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCart(false)} />
          <div className="relative bg-white rounded-t-3xl w-full max-h-[80vh] overflow-hidden animate-slide-up">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">{texts.cart} ({totalItems})</h2>
              <button onClick={() => setShowCart(false)}><X size={24} /></button>
            </div>

            {cart.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
                <p>{texts.emptyCart}</p>
              </div>
            ) : (
              <>
                <div className="overflow-y-auto max-h-[50vh] p-4 space-y-3">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                      <span className="text-2xl">{item.image}</span>
                      <div className="flex-grow">
                        <p className="font-medium text-sm">
                          {useEnglishContent ? item.nameEn : item.name}
                        </p>
                        <p className="text-blue-600 text-sm font-bold">
                          {formatPrice(item.price)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-6 text-center font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="ml-2 text-red-500"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 border-t bg-white">
                  <div className="flex justify-between mb-4">
                    <span className="text-gray-600">{texts.total}</span>
                    <span className="font-bold text-xl text-blue-600">{formatPrice(totalPrice)}</span>
                  </div>
                  <button
                    onClick={() => { setShowCart(false); setShowCheckout(true); }}
                    className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-bold rounded-xl"
                  >
                    {texts.checkout}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !orderSuccess && setShowCheckout(false)} />
          <div className="relative bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            {orderSuccess ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="text-green-500" size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">{texts.orderSuccess}</h2>
                <p className="text-gray-500">{texts.orderSuccessMsg}</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b flex items-center gap-3">
                  <button onClick={() => setShowCheckout(false)}><ArrowLeft size={24} /></button>
                  <h2 className="font-bold text-lg">{texts.pickupDetails}</h2>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{texts.yourName}</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{texts.phone}</label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <MapPin size={16} className="inline mr-1" />{texts.pickupLocation}
                    </label>
                    <select
                      value={pickupLocation}
                      onChange={(e) => setPickupLocation(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                    >
                      <option value="">{texts.selectLocation}</option>
                      {pickupLocations[selectedCity].map(loc => (
                        <option key={loc.id} value={loc.id}>
                          {useEnglishContent ? loc.nameEn : loc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <Clock size={16} className="inline mr-1" />{texts.pickupTime}
                    </label>
                    <select
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl"
                    >
                      <option value="">{texts.selectTime}</option>
                      {generateTimeSlots().map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <h3 className="font-medium mb-2">{texts.orderSummary}</h3>
                    {cart.map(item => (
                      <div key={item.id} className="flex justify-between text-sm py-1">
                        <span>{useEnglishContent ? item.nameEn : item.name} x{item.quantity}</span>
                        <span>{formatPrice(item.price * item.quantity)}</span>
                      </div>
                    ))}
                    <div className="border-t mt-2 pt-2 flex justify-between font-bold">
                      <span>{texts.total}</span>
                      <span className="text-blue-600">{formatPrice(totalPrice)}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleSubmitOrder}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl"
                  >
                    {texts.confirmOrder}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
