import React, { useState } from 'react';
import { CartItem } from '../types';
import { X, Plus, Minus, ShoppingBag, Truck, Store as StoreIcon, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onClearCart: () => void;
  onPlaceOrder: (orderData: {
    customerName: string;
    customerPhone: string;
    deliveryType: 'delivery' | 'pickup';
  }) => Promise<{ orderNumber: string }>;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onClearCart,
  onPlaceOrder
}) => {
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [customerName, setCustomerName] = useState('Rahul Verma');
  const [customerPhone, setCustomerPhone] = useState('+91 98450 12345');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<string | null>(null);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryFee = 0; // Free promo
  const total = subtotal + deliveryFee;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setIsSubmitting(true);
    try {
      const res = await onPlaceOrder({
        customerName,
        customerPhone,
        deliveryType
      });

      setPlacedOrder(res.orderNumber);
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (err: any) {
      alert(err.message || 'Checkout failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
            <div>
              <h2 className="font-serif font-bold text-lg text-stone-900">
                Your cart · {items.reduce((s, i) => s + i.quantity, 0)} items
              </h2>
              <p className="text-xs text-stone-500 font-sans">
                Real-time stock verified against PostgreSQL
              </p>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  onClick={onClearCart}
                  className="text-xs text-stone-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-stone-100"
                >
                  Clear
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Success Screen after order placed */}
          {placedOrder ? (
            <div className="p-8 text-center flex-1 flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <span className="text-xs uppercase font-mono font-bold tracking-widest text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                Order #{placedOrder} Placed
              </span>
              <h3 className="font-serif text-2xl font-bold text-stone-900">
                Thank you for your order!
              </h3>
              <p className="text-sm text-stone-600 max-w-xs font-sans">
                PostgreSQL committed your order atomically. Kafka event was published and consumed to update stock & search in real-time.
              </p>
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono text-left w-full space-y-1">
                <div className="text-emerald-700 font-bold">● order.placed → Kafka topic</div>
                <div className="text-emerald-700 font-bold">● inventory.changed → Projections</div>
                <div className="text-emerald-700 font-bold">● search.synced → OpenSearch</div>
              </div>
              <button
                onClick={() => {
                  setPlacedOrder(null);
                  onClose();
                }}
                className="w-full py-3 bg-nukkad-800 text-white rounded-xl font-semibold text-sm hover:bg-nukkad-900 transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          ) : (
            <>
              {/* Items List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {items.length === 0 ? (
                  <div className="text-center py-12 text-stone-400 space-y-2">
                    <ShoppingBag className="w-12 h-12 mx-auto stroke-1" />
                    <p className="text-sm font-medium">Your cart is empty.</p>
                    <p className="text-xs">Browse the shelves to add fresh groceries or electronics.</p>
                  </div>
                ) : (
                  items.map(({ product, quantity }) => (
                    <div
                      key={product.product_id}
                      className="flex items-center gap-3.5 p-3 rounded-xl border border-stone-100 hover:border-stone-200 bg-stone-50/50 transition-colors"
                    >
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-12 h-12 object-contain rounded-lg bg-white p-1 border border-stone-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-stone-900 truncate">
                          {product.name}
                        </h4>
                        <div className="text-[11px] text-stone-500 font-mono">
                          {product.unit} · ₹{product.price}
                        </div>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-lg px-2 py-1">
                        <button
                          onClick={() => onUpdateQuantity(product.product_id, quantity - 1)}
                          className="text-stone-500 hover:text-stone-900"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-mono font-bold w-4 text-center">
                          {quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(product.product_id, quantity + 1)}
                          disabled={quantity >= product.stock}
                          className="text-stone-500 hover:text-stone-900 disabled:opacity-30"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-xs font-bold text-stone-900 font-sans w-14 text-right">
                        ₹{product.price * quantity}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Checkout Form & Summary */}
              {items.length > 0 && (
                <div className="p-6 border-t border-stone-200 bg-stone-50/60 space-y-4">
                  {/* Delivery / Pickup Toggle (Deck Slide 7) */}
                  <div>
                    <label className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block mb-1.5">
                      Receive as
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-stone-200/60 p-1 rounded-xl">
                      <button
                        onClick={() => setDeliveryType('delivery')}
                        className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                          deliveryType === 'delivery'
                            ? 'bg-nukkad-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-900'
                        }`}
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Delivery</span>
                      </button>
                      <button
                        onClick={() => setDeliveryType('pickup')}
                        className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${
                          deliveryType === 'pickup'
                            ? 'bg-nukkad-800 text-white shadow-xs'
                            : 'text-stone-700 hover:text-stone-900'
                        }`}
                      >
                        <StoreIcon className="w-3.5 h-3.5" />
                        <span>Pickup</span>
                      </button>
                    </div>
                  </div>

                  {/* Customer Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-stone-500 font-medium block mb-1">Customer Name</label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-stone-500 font-medium block mb-1">Phone</label>
                      <input
                        type="text"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Pricing Breakdown */}
                  <div className="space-y-1.5 text-xs pt-2 border-t border-stone-200 font-sans">
                    <div className="flex justify-between text-stone-600">
                      <span>Subtotal</span>
                      <span className="font-mono">₹{subtotal}</span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Delivery</span>
                      <span className="text-emerald-700 font-medium">Free</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-stone-900 pt-1 border-t border-stone-200">
                      <span>Total</span>
                      <span className="font-mono">₹{total}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-stone-500 text-center italic">
                    Pay by UPI, card or cash on delivery
                  </p>

                  {/* Place Order CTA */}
                  <button
                    onClick={handleCheckout}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-nukkad-800 hover:bg-nukkad-900 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <span>Reserving stock & committing outbox...</span>
                    ) : (
                      <span>Place order · ₹{total}</span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
