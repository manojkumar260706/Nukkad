import { type CSSProperties, type MouseEvent, useEffect, useRef, useState } from 'react';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function RevealText({ text, delay = 0 }: { text: string; delay?: number }) {
  let index = 0;
  return <span aria-hidden="true">
    {text.split(' ').map((word, wordIndex) => (
      <span key={wordIndex}>
        {wordIndex > 0 && ' '}
        <span className="inline-block whitespace-nowrap">
          {Array.from(word, (letter, letterIndex) => (
            <span key={letterIndex} className="landing-letter"
              style={{ '--letter-delay': `${delay + index++ * 24}ms` } as CSSProperties}>{letter}</span>
          ))}
        </span>
      </span>
    ))}
  </span>;
}

export function LandingPage() {
  const [params] = useSearchParams();
  const { customer } = useAuth();
  const navigate = useNavigate();
  const hero = useRef<HTMLImageElement>(null);
  const entering = useRef(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (window.location.protocol !== 'nukkad:') return;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!theme) return;
    theme.content = '#f8f5ed';
    return () => { theme.content = '#ffffff'; };
  }, []);

  function browseMarket(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (entering.current) return;
    entering.current = true;
    setOpening(true);

    const bounds = hero.current?.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'market-transition';
    overlay.setAttribute('aria-hidden', 'true');
    if (bounds?.width && bounds.height && hero.current) {
      const photo = document.createElement('img');
      photo.src = hero.current.currentSrc || hero.current.src;
      photo.alt = '';
      const scale = Math.max(window.innerWidth / bounds.width, window.innerHeight / bounds.height) * 1.12;
      const x = (window.innerWidth - bounds.width) / 2 - bounds.left;
      const y = (window.innerHeight - bounds.height) / 2 - bounds.top;
      Object.assign(photo.style, {
        left: `${bounds.left}px`, top: `${bounds.top}px`,
        width: `${bounds.width}px`, height: `${bounds.height}px`
      });
      photo.style.setProperty('--market-zoom', `translate(${x}px, ${y}px) scale(${scale})`);
      overlay.append(photo);
    }
    document.body.append(overlay);

    window.setTimeout(() => {
      window.scrollTo(0, 0);
      navigate('/shop', { flushSync: true });
      overlay.classList.add('market-transition-exit');
      window.setTimeout(() => overlay.remove(), 830);
    }, 600);
  }
  if (params.get('chat') === 'open') return <Navigate to="/shop?chat=open" replace />;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden overscroll-none bg-[#f8f5ed] text-nukkad-950">
      <header className="mx-auto flex w-full max-w-6xl shrink-0 flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-8 sm:py-5">
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

      <main className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col px-5 pb-3 sm:px-8 sm:pb-5">
        <section className="landing-hero grid min-h-0 flex-1 items-center gap-4 py-2 lg:gap-10">
          <div className="text-center lg:text-left">
            <h1 aria-label="Your everyday shop, around the corner." className="mx-auto max-w-xl font-serif lg:mx-0 text-[clamp(1.875rem,min(7.8vw,10.5dvh),5.75rem)] font-medium leading-[0.94] tracking-[-0.05em]">
              <span className="block"><RevealText text="Your everyday shop," /></span>
              <em className="block font-normal text-nukkad-700"><RevealText text="around the corner." delay={410} /></em>
            </h1>
            <p className="mx-auto mt-2 max-w-md sm:mt-4 lg:mx-0 text-sm leading-snug text-stone-700 sm:text-base">
              See what’s in stock at neighborhood stores, compare baskets, and order for pickup or local delivery where available.
            </p>
            <div className="mt-3 flex sm:mt-5 flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link to="/shop" onClick={browseMarket} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-nukkad-900 px-5 py-3 text-sm font-semibold text-white hover:bg-nukkad-800">
                {opening ? 'Opening market…' : 'Browse store'} <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link to="/shop?chat=open" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-nukkad-900/25 px-5 py-3 text-sm font-semibold hover:bg-white">
                <MessageCircle size={17} aria-hidden="true" /> Ask Nukkad
              </Link>
            </div>
          </div>
          <figure className="landing-hero-photo mx-auto h-full min-h-0 w-full self-center overflow-hidden rounded-[1.5rem] bg-nukkad-100 shadow-md">
            <img ref={hero} src="/nukkad-shopfront.jpg" alt="Neighborhood grocery shop with baskets of fresh produce by the entrance" width="1120" height="840" fetchPriority="high" className="h-full w-full object-cover" />
          </figure>
        </section>

        <footer className="landing-footer shrink-0 border-t border-nukkad-900/15 pt-3 text-xs text-stone-700">
          <span>Every shelf, live online.</span>
        </footer>
      </main>
    </div>
  );
}
