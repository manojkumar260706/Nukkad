import React, { useState } from 'react';
import { CartItem } from '../types';
import { X, Plus, Minus, ShoppingBag, Truck, Store as StoreIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onClearCart: () => void;
  customerName: string;
  customerPhone: string;
  signedIn: boolean;
  storeAddress?: string;
  onPlaceOrder: (orderData: {
    customerName: string;
    customerPhone: string;
    deliveryType: 'delivery' | 'pickup';
    address?: string;
    postalCode?: string;
  }) => Promise<void>;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onClearCart,
  customerName: initialName,
  customerPhone: initialPhone,
  signedIn,
  storeAddress,
  onPlaceOrder
}) => {
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('pickup');
  const [customerName, setCustomerName] = useState(initialName);
  const [customerPhone, setCustomerPhone] = useState(initialPhone);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryFee = deliveryType === 'delivery' ? 30 : 0;
  const total = subtotal + deliveryFee;

  const handleCheckout = async () => {
    if (items.length === 0) return;
    setIsSubmitting(true);
    setError('');
    try {
      await onPlaceOrder({
        customerName,
        customerPhone,
        deliveryType,
        address: deliveryType === 'delivery' ? address : undefined,
        postalCode: deliveryType === 'delivery' ? postalCode : undefined
      });
    } catch (err: any) {
      setError(err.message || 'Checkout failed');
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

      <div className="fixed inset-y-0 right-0 max-w-full flex sm:pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
            <div>
              <h2 className="font-serif font-bold text-lg text-stone-900">
                Your cart · {items.reduce((s, i) => s + i.quantity, 0)} items
              </h2>
              <p className="text-xs text-stone-500 font-sans">
                Stock is held for 20 minutes while you pay
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
                        type="tel"
                        autoComplete="tel"
                        placeholder="9876543210"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {deliveryType === 'delivery' ? (
                    <div className="grid gap-2">
                      <label className="text-xs">Delivery address
                        <input value={address} onChange={(e) => setAddress(e.target.value)} className="block w-full border rounded p-2" />
                      </label>
                      <label className="text-xs">PIN code
                        <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} inputMode="numeric" maxLength={6} className="block w-full border rounded p-2" />
                      </label>
                      {storeAddress && <p className="text-xs text-stone-600">Delivery PIN code {storeAddress.match(/\b[1-9]\d{5}\b/)?.[0]}</p>}
                    </div>
                  ) : <p className="text-xs text-stone-600">Pickup at {storeAddress || 'the shop'}. Collect within 2 hours of the order being marked ready.</p>}

                  {/* Pricing Breakdown */}
                  <div className="space-y-1.5 text-xs pt-2 border-t border-stone-200 font-sans">
                    <div className="flex justify-between text-stone-600">
                      <span>Subtotal</span>
                      <span className="font-mono">₹{subtotal}</span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Delivery fee</span>
                      <span>₹{deliveryFee}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-stone-900 pt-1 border-t border-stone-200">
                      <span>Total</span>
                      <span className="font-mono">₹{total}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-stone-500 text-center italic">
                    Razorpay Test Mode
                  </p>

                  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                  {!signedIn && <Link to="/login" className="block text-sm underline">Sign in to pay</Link>}
                  {/* Place Order CTA */}
                  <button
                    onClick={handleCheckout}
                    disabled={isSubmitting || !signedIn}
                    className="w-full py-3 bg-nukkad-800 hover:bg-nukkad-900 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <ShoppingBag aria-hidden="true" className="h-4 w-4" />
                        <span role="status">Reserving stock…</span>
                      </>
                    ) : (
                      <span>Continue to payment · ₹{total.toFixed(2)}</span>
                    )}
                  </button>
                </div>
              )}
        </div>
      </div>
    </div>
  );
};
