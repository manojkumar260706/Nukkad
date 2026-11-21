import { ArrowRight, MessageCircle, Store } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function LandingPage() {
  const [params] = useSearchParams();
  const { customer } = useAuth();
  if (params.get('chat') === 'open') return <Navigate to="/shop?chat=open" replace />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f8f5ed] text-nukkad-950">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-3">
          <img src="/nukkad-192.png" alt="" width="44" height="44" className="rounded-[13px]" />
          <span className="font-serif text-3xl font-bold leading-none tracking-tight">Nukkad</span>
        </Link>
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-2 text-xs font-semibold sm:gap-3 sm:text-sm">
          <Link to={customer ? '/orders' : '/login'} className="rounded-full border border-nukkad-900/25 px-4 py-2 hover:bg-white">
            {customer ? 'My orders' : 'Shopper sign in'}
          </Link>
          <Link to="/store/login" className="rounded-full bg-nukkad-900 px-4 py-2 text-white hover:bg-nukkad-800">
            Shopkeeper sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-6 pt-4 sm:px-8 lg:pt-0">
        <section className="grid flex-1 items-center content-center gap-8 py-6 lg:grid-cols-2 lg:gap-12">
          <div className="py-3 text-center lg:text-left">
            <h1 className="mx-auto max-w-xl font-serif lg:mx-0 text-[clamp(3.25rem,7vw,6.2rem)] font-medium leading-[0.94] tracking-[-0.05em]">
              Your everyday shop, <em className="font-normal text-nukkad-700">around the corner.</em>
            </h1>
            <p className="mx-auto mt-5 max-w-md lg:mx-0 text-base leading-relaxed text-stone-700 sm:text-lg">
              See what’s in stock at neighborhood stores, compare baskets, and order for pickup or local delivery where available.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link to="/shop" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-nukkad-900 px-5 py-3 text-sm font-semibold text-white hover:bg-nukkad-800">
                Browse the shop <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link to="/shop?chat=open" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-nukkad-900/25 px-5 py-3 text-sm font-semibold hover:bg-white">
                <MessageCircle size={17} aria-hidden="true" /> Ask Nukkad
              </Link>
            </div>
          </div>
          <figure className="mx-auto w-full max-w-xl overflow-hidden rounded-[2rem] bg-nukkad-100 shadow-lg">
            <img src="/nukkad-shopfront.jpg" alt="Neighborhood grocery shop with baskets of fresh produce by the entrance" width="960" height="760" fetchPriority="high" className="aspect-[4/3] w-full object-cover" />
          </figure>
        </section>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-nukkad-900/15 pt-5 text-sm text-stone-700">
          <span>Every shelf, live online.</span>
          <Link to="/store/login" className="inline-flex items-center gap-2 font-semibold text-nukkad-900 hover:underline">
            <Store size={16} aria-hidden="true" /> Shopkeeper portal
          </Link>
        </footer>
      </main>
    </div>
  );
}
