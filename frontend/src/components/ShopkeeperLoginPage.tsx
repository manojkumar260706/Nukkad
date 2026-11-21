import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store as StoreIcon, Lock, Mail, User, Phone, AlertCircle, Sparkles, ArrowLeft, ShieldCheck } from 'lucide-react';

export const ShopkeeperLoginPage: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { loginShopkeeper, registerShopkeeper } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) throw new Error('Please enter Store Manager name.');
        await registerShopkeeper({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
          storeId: 'store-koramangala'
        });
      } else {
        await loginShopkeeper(email.trim(), password);
      }
      navigate('/store/dashboard');
    } catch (err: any) {
      setError(err.message || (isRegister ? 'Registration failed' : 'Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoFill = () => {
    setIsRegister(false);
    setEmail('store@nukkad.in');
    setPassword('store123');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link 
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 mb-6 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Storefront</span>
        </Link>

        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-nukkad-900 flex items-center justify-center text-emerald-400 font-bold text-xl shadow-md">
            <StoreIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif font-bold text-2xl text-stone-900 tracking-tight">
              Nukkad Merchant Center
            </h1>
            <p className="text-xs text-stone-500 font-mono">
              Store Manager & Inventory Console
            </p>
          </div>
        </div>

        {/* Tab Toggle: Sign In vs Register */}
        <div className="mt-6 flex bg-stone-200/80 p-1 rounded-xl max-w-xs mx-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-all text-center ${
              !isRegister ? 'bg-white text-nukkad-950 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Merchant Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-all text-center ${
              isRegister ? 'bg-white text-nukkad-950 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Register Store
          </button>
        </div>
      </div>

      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-lg rounded-2xl border border-stone-200 sm:px-10 space-y-5">
          {/* Pre-configured Demo Account Box */}
          {!isRegister && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-300 text-xs space-y-2">
              <div className="flex items-center justify-between text-amber-900 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  Pre-configured Demo Merchant:
                </span>
                <button
                  type="button"
                  onClick={handleDemoFill}
                  className="px-2 py-0.5 rounded bg-amber-700 text-white hover:bg-amber-800 text-[11px] font-bold transition-all shadow-2xs"
                >
                  Auto-fill
                </button>
              </div>
              <div className="font-mono text-[11px] text-amber-950 space-y-0.5 bg-white/70 p-2 rounded-lg border border-amber-200">
                <div>Email: <span className="font-bold">store@nukkad.in</span></div>
                <div>Password: <span className="font-bold">store123</span></div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Store Manager Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full pl-9 pr-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Store Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="store@nukkad.in"
                  className="w-full pl-9 pr-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
                />
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Contact Phone
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 11111"
                    className="w-full pl-9 pr-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-nukkad-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-md transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                {isLoading
                  ? (isRegister ? 'Creating store account...' : 'Verifying credentials...')
                  : (isRegister ? 'Register & Enter Console' : 'Access Store Console')}
              </span>
            </button>
          </form>

          <div className="text-center text-xs text-stone-500 pt-2 border-t border-stone-100">
            {isRegister ? (
              <span>Already a partner? <button onClick={() => setIsRegister(false)} className="text-nukkad-800 font-bold underline">Merchant Sign In</button></span>
            ) : (
              <span>New retail store? <button onClick={() => setIsRegister(true)} className="text-nukkad-800 font-bold underline">Register your store</button></span>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-stone-500">
          <span>Are you a retail customer? </span>
          <Link to="/login" className="font-semibold text-nukkad-800 hover:underline">
            Go to Shopper Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
