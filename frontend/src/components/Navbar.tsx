import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShoppingBag, User as UserIcon, LogOut, Zap, MapPin } from 'lucide-react';

interface NavbarProps {
  location?: string;
  cartCount: number;
  cartTotal: number;
  onOpenCart: () => void;
  onOpenRaceTest?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  location,
  cartCount,
  cartTotal,
  onOpenCart,
  onOpenRaceTest
}) => {
  const { customer, logoutCustomer } = useAuth();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 transition-all">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 min-h-16 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        {/* Brand & Clean Location */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img src="/nukkad-192.png" alt="" width="36" height="36" className="rounded-xl" />
            <div>
              <div className="font-serif font-bold text-xl text-nukkad-950 tracking-tight leading-none">
                Nukkad
              </div>
              <div className="hidden sm:block text-[10px] text-stone-500 font-sans tracking-tight mt-0.5">
                Every shelf, live online.
              </div>
            </div>
          </Link>

          {/* Clean minimal location tag */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream border border-stone-200/80 text-[11px] font-medium text-stone-700">
            <MapPin className="w-3.5 h-3.5 text-nukkad-700 shrink-0" />
            <span>{location || 'Selected store'}</span>
            <span className="w-1 h-1 rounded-full bg-stone-300 mx-0.5"></span>
            <span className="text-emerald-700 font-semibold">Local delivery</span>
          </div>
        </div>

        {/* Right CTA - Race test, User auth, Cart */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Subtle Race Condition test pill */}
          {onOpenRaceTest && (
          <button
            onClick={onOpenRaceTest}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/80 text-amber-900 text-xs font-medium hover:bg-amber-100 transition-all"
            title="Demonstrate PostgreSQL row-level locks preventing overselling"
          >
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>Anti-Oversell Demo</span>
          </button>
          )}

          {customer && <Link to="/orders" className="shrink-0 text-xs font-semibold text-nukkad-800 hover:underline">My orders</Link>}
          {/* User Account Button */}
          {customer ? (
            <div className="relative">
              <button
                aria-label="Account menu"
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-stone-200 hover:border-stone-300 bg-white text-xs font-medium text-stone-800 transition-all shadow-2xs"
              >
                <div className="w-5 h-5 rounded-full bg-nukkad-100 text-nukkad-900 flex items-center justify-center text-[10px] font-bold">
                  {customer.name.charAt(0)}
                </div>
                <span className="hidden sm:inline max-w-[100px] truncate">{customer.name.split(' ')[0]}</span>
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-stone-200 py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150 text-xs">
                  <div className="px-3 py-2 border-b border-stone-100">
                    <div className="font-semibold text-stone-900">{customer.name}</div>
                    <div className="text-[11px] text-stone-500 truncate">{customer.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      logoutCustomer();
                      setUserDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-stone-700 hover:bg-stone-50 flex items-center gap-2 text-red-600"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-xs font-semibold text-stone-700 transition-all shadow-2xs"
            >
              <UserIcon className="w-3.5 h-3.5 text-stone-500" />
              <span>Shopper sign in</span>
            </Link>
          )}

          {/* Cart Pill button matching Deck */}
          <button
            onClick={onOpenCart}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-nukkad-800 hover:bg-nukkad-900 text-white text-xs font-semibold shadow-xs transition-all active:scale-95"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-300" />
            <span>Cart</span>
            {cartCount > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-white/40"></span>
                <span className="bg-emerald-500/30 text-emerald-200 px-1.5 py-0.2 rounded-full font-mono text-[11px]">
                  {cartCount}
                </span>
                <span className="hidden sm:inline font-bold text-white">₹{cartTotal}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
