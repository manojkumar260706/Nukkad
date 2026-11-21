import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Lock, Mail, User, Phone, AlertCircle, Sparkles } from 'lucide-react';

export const CustomerLoginPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const demoUnavailable = error?.startsWith('The demo account is disabled.');

  const { loginCustomer, registerCustomer } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!name.trim()) throw new Error('Please enter your full name.');
        await registerCustomer({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined
        });
      } else {
        await loginCustomer(email.trim(), password);
      }
      navigate(state?.returnTo === '/?chat=open' || state?.returnTo === '/plan' ? '/?chat=open' : '/');
    } catch (err: any) {
      setError(err.message || (isSignUp ? 'Registration failed' : 'Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoFill = () => {
    setIsSignUp(false);
    setEmail('shopper@nukkad.in');
    setPassword('shopper123');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-chalk flex flex-col pt-6 pb-8 sm:justify-center sm:py-12 sm:px-6 lg:px-8 font-sans">
      <div className="px-4 sm:mx-auto sm:w-full sm:max-w-md sm:px-0">
        <Link 
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 mb-6 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Storefront</span>
        </Link>

        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-nukkad-800 flex items-center justify-center text-white font-bold text-xl shadow-xs">
            N
          </div>
          <div>
            <h1 className="font-serif font-bold text-2xl text-stone-900 tracking-tight">
              Nukkad
            </h1>
            <p className="text-xs text-stone-500">
              Customer Account
            </p>
          </div>
        </div>

        {/* Tab Toggle: Sign In vs Sign Up */}
        <div className="mt-6 flex bg-stone-200/70 p-1 rounded-xl max-w-xs mx-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-all text-center ${
              !isSignUp ? 'bg-white text-nukkad-950 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-all text-center ${
              isSignUp ? 'bg-white text-nukkad-950 shadow-xs' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Create Account
          </button>
        </div>
      </div>

      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-md rounded-2xl border border-stone-200 sm:px-10 space-y-5">
          {/* Quick Demo Credentials Info Box */}
          {!isSignUp && import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true' && (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-xs space-y-2">
              <div className="flex items-center justify-between text-emerald-900 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                  Pre-configured Demo Account:
                </span>
                <button
                  type="button"
                  onClick={handleDemoFill}
                  className="px-2 py-0.5 rounded bg-emerald-700 text-white hover:bg-emerald-800 text-[11px] font-bold transition-all shadow-2xs"
                >
                  Auto-fill
                </button>
              </div>
              <div className="font-mono text-[11px] text-emerald-950 space-y-0.5 bg-white/70 p-2 rounded-lg border border-emerald-100">
                <div>Email: <span className="font-bold">shopper@nukkad.in</span></div>
                <div>Password: <span className="font-bold">shopper123</span></div>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <div>
                <p>{demoUnavailable ? 'Demo sign-in is unavailable on the hosted app. Use your own shopper account or create one.' : error}</p>
                {demoUnavailable && (
                  <button type="button" className="mt-2 font-semibold underline" onClick={() => {
                    setIsSignUp(true);
                    setEmail('');
                    setPassword('');
                    setError(null);
                  }}>Create a shopper account</button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Full Name
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
                    placeholder="e.g. Sanath Rao"
                    className="w-full pl-9 pr-3 py-2.5 bg-chalk border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-chalk border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
                />
              </div>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Phone Number (Optional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-9 pr-3 py-2.5 bg-chalk border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
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
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-3 py-2.5 bg-chalk border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-nukkad-700/20 focus:border-nukkad-700 transition-all font-sans"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-nukkad-800 hover:bg-nukkad-900 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-[0.99] disabled:opacity-50"
            >
              {isLoading
                ? (isSignUp ? 'Creating account...' : 'Signing in...')
                : (isSignUp ? 'Create Shopper Account' : 'Sign In')}
            </button>
          </form>

          <div className="text-center text-xs text-stone-500 pt-2 border-t border-stone-100">
            {isSignUp ? (
              <span>Already have an account? <button onClick={() => setIsSignUp(false)} className="text-nukkad-800 font-bold underline">Sign In</button></span>
            ) : (
              <span>Don't have an account yet? <button onClick={() => setIsSignUp(true)} className="text-nukkad-800 font-bold underline">Create one</button></span>
            )}
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-stone-500">
          <span>Are you a physical retail partner? </span>
          <Link to="/store/login" className="font-semibold text-nukkad-800 hover:underline">
            Go to Merchant Portal
          </Link>
        </div>
      </div>
    </div>
  );
};
