import { ArrowLeft, ArrowUp, MapPin, MessageCircle, Mic, Sparkles, Square, Volume2, X } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { askShoppingAssistant, checkPayment, Coordinates, createOrderApi, findShoppingPlans, PickupBasket, reserveBaskets, ShoppingItem, ShoppingPlan } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ListeningPopup } from './ListeningPopup';
import { useChatSpeech } from './useChatSpeech';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface PendingPurchase {
  basketKey: string;
  orderId: string;
  storeName: string;
  url: string;
}

const basketKey = (basket: PickupBasket) => JSON.stringify([
  basket.store.id, basket.items.map(item => [item.productId, item.quantity]).sort()
]);

export function ShoppingPlanner({ cartVisible, cartOpen, storefrontLocation, localities }: {
  cartVisible: boolean; cartOpen: boolean; storefrontLocation?: Coordinates; localities: string[]
}) {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(params.get('chat') === 'open');
  const [view, setView] = useState<'chat' | 'compare'>('chat');
  const launcher = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const [location, setLocation] = useState('');
  const [deviceLocation, setDeviceLocation] = useState<Coordinates>();
  const gps = location.trim() ? undefined : deviceLocation ?? storefrontLocation;
  const expanded = open && !cartOpen;
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof findShoppingPlans>>>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { customer } = useAuth();
  const navigate = useNavigate();

  const [message, setMessage] = useState('');
  const speech = useChatSpeech(transcript => {
    setMessage(current => [current.trimEnd(), transcript].filter(Boolean).join(' ').slice(0, 1000));
  });
  const [language, setLanguage] = useState('auto');
  const [assistantItems, setAssistantItems] = useState<ShoppingItem[]>([]);
  const [chat, setChat] = useState<{ request: string; reply: string; language: string }[]>([]);
  const [selectedBasket, setSelectedBasket] = useState<PickupBasket>();
  const [phone, setPhone] = useState('');
  const [paid, setPaid] = useState<string[]>([]);
  const pendingKey = customer ? `nukkad-plan-payment:${customer.id}` : null;
  const [pendingByCustomer, setPendingByCustomer] = useState<Record<string, PendingPurchase | null>>({});
  const pending: PendingPurchase | null = pendingKey
    ? pendingByCustomer[pendingKey] === undefined
      ? JSON.parse(sessionStorage.getItem(pendingKey) || 'null')
      : pendingByCustomer[pendingKey]
    : null;

  useEffect(() => {
    if (expanded) heading.current?.focus();
  }, [expanded, view]);

  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [chat, busy, expanded, view]);

  function closeChat() {
    if (speech.listening) speech.toggleDictation(language);
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }

  function rememberPurchase(value: PendingPurchase | null) {
    if (!pendingKey) return;
    if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value));
    else sessionStorage.removeItem(pendingKey);
    setPendingByCustomer(current => ({ ...current, [pendingKey]: value }));
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || speech.listening || !message.trim()) return;
    setError('');
    if (!gps && !location.trim()) {
      setError('Enter your location below or use GPS before asking for a plan.');
      return;
    }
    setBusy(true);
    try {
      const reply = await askShoppingAssistant({ message, language, previous: assistantItems, lastTurn: chat[chat.length - 1], location, gps });
      setChat(current => [...current, { request: message, reply: reply.replyText, language: reply.replyLanguage }]);
      setAssistantItems(reply.items);
      setMessage('');
      setSelectedBasket(undefined);
      setPlans(reply.plans ?? undefined);
      if (reply.plans) setView('compare');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a plan.');
    } finally {
      setBusy(false);
    }
  }

  async function retryLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = location.trim();
    if (busy || !typed || !assistantItems.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const list = assistantItems.map(item => `${item.quantity} ${item.name}`).join(', ');
      setPlans(await findShoppingPlans({ list, location: typed }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compare baskets for that location.');
    } finally {
      setBusy(false);
    }
  }

  async function buy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !selectedBasket || pending || busy) return;
    const basket = selectedBasket;
    setBusy(true);
    setError('');
    const paymentTab = window.open('about:blank', '_blank');
    if (paymentTab) paymentTab.opener = null;
    try {
      const { order } = await createOrderApi({
        storeId: basket.store.id, customerName: customer.name, customerPhone: phone,
        deliveryType: 'pickup', items: basket.items.map(({ productId, quantity, expectedPrice }) =>
          ({ productId, quantity, expectedPrice }))
      });
      if (!order.paymentUrl) throw new Error('The payment link was unavailable. Check My orders.');
      rememberPurchase({ basketKey: basketKey(basket), orderId: order.id, storeName: basket.store.name, url: order.paymentUrl });
      setSelectedBasket(undefined);
      if (paymentTab && !paymentTab.closed) paymentTab.location.replace(order.paymentUrl);
    } catch (err) {
      paymentTab?.close();
      setError(err instanceof Error ? err.message : 'Could not start payment.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyPurchase(cancel = false) {
    if (!pending || busy) return;
    setBusy(true);
    setError('');
    try {
      const order = await checkPayment(pending.orderId, cancel);
      if (order.paymentStatus === 'awaiting_payment') {
        setNotice('Payment is still pending. Complete it in Razorpay, then check again.');
        return;
      }
      if (order.paymentStatus === 'paid' || order.paymentStatus === 'refund_pending') {
        setPaid(current => [...current, pending.basketKey]);
        setNotice(`Payment recorded for ${pending.storeName}. You can move to the next store in your plan.`);
      } else {
        setNotice(`Checkout ended for ${pending.storeName}. You can start another checkout.`);
      }
      rememberPurchase(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify payment.');
    } finally {
      setBusy(false);
    }
  }

  function locate() {

    setNotice('Getting your location…');
    if (!navigator.geolocation) {
      setNotice('GPS is unavailable. Enter a locality, address or PIN.');
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocation('');
      setDeviceLocation({ latitude: coords.latitude, longitude: coords.longitude });
      setNotice('Using your current location.');
    }, () => setNotice('GPS is unavailable. Enter a locality, address or PIN.'), { timeout: 8000 });
  }

  async function reserve(plan: ShoppingPlan) {
    if (!customer || busy || pending || plan.baskets.some(basket => paid.includes(basketKey(basket)))) return;
    setBusy(true);
    setError('');
    try {
      const basket = plan.baskets.map(({ store, items }) =>
        [store.id, items.map(({ productId, quantity, expectedPrice }) => [productId, quantity, expectedPrice])]);
      const key = `nukkad-pickup:${customer.id}:${JSON.stringify(basket)}`;
      const id = localStorage.getItem(key) || requestId();
      localStorage.setItem(key, id);
      await reserveBaskets(id, plan.baskets);
      localStorage.removeItem(key);
      navigate('/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reserve. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function planCard(plan: ShoppingPlan, title: string) {
    const isSplit = plan.baskets.length > 1;
    const checkoutBlocked = busy || Boolean(pending);
    const reserveBlocked = checkoutBlocked || plan.baskets.some(basket => paid.includes(basketKey(basket)));
    const reserveAction = plan.units > 0 && (customer
      ? <button type="button" onClick={() => reserve(plan)} disabled={reserveBlocked}
        className="rounded-xl border border-nukkad-800 px-3 py-2 text-sm font-semibold text-nukkad-900 hover:bg-nukkad-50 disabled:opacity-50">
        Reserve for pickup
      </button>
      : <Link to="/login" state={{ returnTo: '/?chat=open' }} className="text-sm underline">Sign in to reserve</Link>);

    return <article className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <header>
        <h3 className="break-words font-serif text-xl font-bold text-nukkad-950">{title}</h3>
        {!isSplit && <p className="break-words text-xs text-stone-600">{plan.baskets[0]?.store.address}</p>}
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-stone-600">
          <strong className="text-lg tabular-nums text-nukkad-950">{money(plan.basketPrice)}</strong>
          <span>{plan.units} {plan.units === 1 ? 'unit' : 'units'}</span>
          {plan.distance !== null && <span>{plan.distance.toFixed(1)} km estimated</span>}
        </p>
      </header>
      <div className={isSplit ? 'grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2' : 'grow'}>
        {plan.baskets.map(basket => {
          const { store, items } = basket;
          const purchased = paid.includes(basketKey(basket));
          return <section key={store.id} className={isSplit ? 'flex min-w-0 flex-col rounded-xl bg-stone-50 p-3' : 'flex h-full flex-col border-t border-stone-100 pt-2'}>
            {isSplit && <header>
              <h4 className="break-words text-sm font-semibold">{store.name}</h4>
              <p className="break-words text-xs text-stone-600">{store.address}</p>
            </header>}
            <ul className="grow divide-y divide-stone-100 text-sm">
              {items.map(item => <li key={item.productId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                <span className="min-w-0 break-words">{item.quantity} × {item.name} <span className="text-xs text-stone-600">({item.unit})</span></span>
                <span className="whitespace-nowrap text-xs tabular-nums text-stone-600">{money(item.expectedPrice)} each</span>
              </li>)}
            </ul>
            {!isSplit && plan.missing.length > 0 && <p className="my-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              <strong>Missing</strong> · {plan.missing.map(item => `${item.quantity} × ${item.name}`).join(', ')}
            </p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isSplit && <strong className="mr-auto text-sm tabular-nums">{money(items.reduce((total, item) => total + item.quantity * item.expectedPrice, 0))}</strong>}
              {customer ? <button type="button" disabled={checkoutBlocked || purchased} onClick={() => {
                setPhone(customer.phone || '');
                setError('');
                setSelectedBasket(basket);
              }} aria-label={purchased ? undefined : `Buy from ${store.name}`}
                className="rounded-xl bg-nukkad-900 px-3 py-2 text-sm font-semibold text-white hover:bg-nukkad-800 disabled:opacity-50">
                {purchased ? 'Paid' : 'Buy now'}
              </button> : <Link to="/login" state={{ returnTo: '/?chat=open' }} className="text-sm underline">Sign in to buy</Link>}
              {!isSplit && reserveAction}
            </div>
          </section>;
        })}
      </div>
      {isSplit && <div>{reserveAction}</div>}
    </article>;
  }

  return <div className="fixed right-3 z-40 sm:right-6" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + ' + (cartVisible ? '5.25rem' : '1rem') + ')' }}>
    {!expanded && !cartOpen && <button ref={launcher} type="button" aria-label="Open shopping assistant"
      aria-expanded={false} onClick={() => setOpen(true)}
      className="grid h-14 w-14 place-items-center rounded-full bg-nukkad-900 text-white shadow-xl ring-1 ring-black/10 transition hover:bg-nukkad-800 focus-visible:outline focus-visible:outline-offset-4">
      <MessageCircle size={25} aria-hidden="true" />
    </button>}
    {expanded && <section role="dialog" aria-labelledby="shopping-assistant-heading"
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeChat(); } }}
      className={`flex h-[min(39rem,calc(100dvh-7rem))] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-3xl border border-nukkad-900/10 bg-[#f8faf7] shadow-[0_22px_70px_rgba(13,35,23,0.24)] ${view === 'chat' ? 'w-[25rem]' : 'w-[45rem]'}`}>
      <header className="flex shrink-0 items-center gap-3 bg-nukkad-900 px-4 py-3 text-white">
        {view === 'compare' ? <button type="button" aria-label="Back to chat" onClick={() => { setView('chat'); setSelectedBasket(undefined); }} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/20"><ArrowLeft size={19} /></button>
          : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-200"><Sparkles size={20} aria-hidden="true" /></span>}
        <h2 id="shopping-assistant-heading" tabIndex={-1} ref={heading} className="flex-1 text-base font-semibold outline-none">
          {view === 'chat' ? 'Nukkad Assistant' : 'Compare baskets'}
        </h2>
        <button type="button" aria-label="Close shopping assistant" onClick={closeChat}
          className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/15"><X size={21} /></button>
      </header>
      {view === 'chat' ? customer ? <>
        <div className="flex shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
          <MapPin size={16} className="shrink-0 text-nukkad-800" aria-hidden="true" />
          <input aria-label="Shopping location" value={location} onChange={event => setLocation(event.target.value)}
            placeholder={gps ? 'Current location' : 'Locality, city or PIN'}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-stone-800 placeholder:text-stone-500 focus-visible:outline-nukkad-600" />
          <button type="button" onClick={locate} className="shrink-0 rounded-lg bg-nukkad-50 px-2.5 py-2 text-xs font-semibold text-nukkad-900">Use GPS</button>
        </div>
        <div ref={transcript} role="log" aria-label="Conversation" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <p className="mr-7 w-fit rounded-2xl rounded-tl-sm border border-stone-200 bg-white px-4 py-3 text-sm leading-relaxed text-stone-800">
            What are you shopping for? I’ll compare baskets from nearby stores.
          </p>
          {!chat.length && !message && <button type="button" onClick={() => setMessage('I need two cartons of milk and a loaf of bread')}
            className="rounded-full border border-nukkad-200 bg-white px-3 py-2 text-xs font-medium text-nukkad-900 hover:bg-nukkad-50">Try milk and bread</button>}
          {chat.map((turn, index) => <div key={index} className="space-y-2">
            <p className="ml-auto max-w-[88%] w-fit break-words rounded-2xl rounded-tr-sm bg-nukkad-900 px-4 py-3 text-sm leading-relaxed text-white">{turn.request}</p>
            <div className="mr-7 w-fit max-w-full break-words rounded-2xl rounded-tl-sm border border-stone-200 bg-white px-4 py-3 text-sm leading-relaxed text-stone-800">
              <p lang={turn.language}>{turn.reply}</p>
              {speech.canSpeak && <button type="button" onClick={() => speech.toggleReadAloud(index, turn.reply, turn.language)}
                disabled={speech.listening} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-nukkad-800 disabled:opacity-50">
                <Volume2 size={15} aria-hidden="true" /> {speech.speaking === index ? 'Stop reading' : 'Read aloud'}
              </button>}
            </div>
          </div>)}
          {busy && <p className="w-fit animate-pulse rounded-2xl bg-nukkad-50 px-4 py-3 text-sm text-nukkad-900">Checking your request…</p>}
          {(plans || pending) && <button type="button" onClick={() => { setView('compare'); setError(''); }} className="rounded-xl bg-nukkad-100 px-3 py-2 text-sm font-semibold text-nukkad-900">{plans ? 'View basket comparison' : 'View pending checkout'}</button>}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </div>
        <form onSubmit={ask} className="relative shrink-0 space-y-2 border-t border-stone-200 bg-white px-3 py-3">
          <ListeningPopup open={speech.listening} onStop={() => speech.toggleDictation(language)} />
          <div className="flex items-end gap-1.5 rounded-2xl border border-stone-200 bg-stone-50 p-1.5 focus-within:border-nukkad-600">
            <textarea aria-label="Message Nukkad" rows={2} required maxLength={1000} value={message}
              onChange={event => setMessage(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!busy && !speech.listening && message.trim()) event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="What do you need?" className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none sm:text-sm" />
            {speech.canDictate && <button type="button" disabled={busy || speech.speaking !== undefined} onClick={() => speech.toggleDictation(language)}
              aria-label={speech.listening ? 'Stop dictation' : 'Use microphone'} title={speech.listening ? 'Stop dictation' : 'Use microphone'}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl disabled:opacity-40 ${speech.listening ? 'bg-red-100 text-red-800' : 'text-nukkad-900 hover:bg-nukkad-100'}`}>
                {speech.listening ? <Square size={16} /> : <Mic size={17} />}
            </button>}
            <button type="submit" aria-label="Send message" title="Send message" disabled={busy || speech.listening || !message.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-nukkad-900 text-white disabled:opacity-40"><ArrowUp size={20} /></button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <select aria-label="Message language" disabled={speech.listening} value={language} onChange={event => setLanguage(event.target.value)}
              className="max-w-[11rem] bg-white text-xs font-medium text-stone-700">
              <option value="auto">Auto · English mic</option><option value="en-IN">English</option>
              <option value="hi-IN">Hindi</option><option value="kn-IN">Kannada</option>
              <option value="ta-IN">Tamil</option><option value="te-IN">Telugu</option><option value="ml-IN">Malayalam</option>
            </select>
            <span className="text-xs text-stone-500">Gemini · Sarvam AI</span>
          </div>
          {!speech.listening && (speech.voiceStatus || notice) && <p role="status" className="text-xs text-stone-600">{speech.voiceStatus || notice}</p>}
        </form>
      </> : <div className="grid flex-1 place-content-center gap-3 p-6 text-center">
        <p className="text-sm text-stone-700">Sign in to compare nearby baskets with Nukkad Assistant.</p>
        <Link to="/login" state={{ returnTo: '/?chat=open' }} className="mx-auto rounded-xl bg-nukkad-900 px-4 py-2 text-sm font-semibold text-white">Sign in</Link>
      </div> : <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
    {pending && <section className="space-y-2 rounded-xl border bg-white p-4">
      <h2 className="font-semibold">Checkout in progress · {pending.storeName}</h2>
      <p className="text-sm">Finish or cancel this checkout before buying from another store.</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <a href={pending.url} target="_blank" rel="noreferrer" className="underline">Open Razorpay</a>
        <button disabled={busy} onClick={() => verifyPurchase()} className="underline">Check payment</button>
        <button disabled={busy} onClick={() => verifyPurchase(true)} className="underline">Cancel checkout</button>
      </div>
    </section>}
    {selectedBasket && !pending && customer && <form onSubmit={buy} className="space-y-3 rounded-xl border border-nukkad-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Buy from {selectedBasket.store.name}</h2>
      <p className="text-sm">Pay {money(selectedBasket.items.reduce((total, item) => total + item.quantity * item.expectedPrice, 0))} online and pick up at the store.</p>
      <label className="grid gap-1 text-sm">Phone number
        <input type="tel" autoComplete="tel" required value={phone} onChange={event => setPhone(event.target.value)} className="rounded border p-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      <div className="flex gap-3 text-sm">
        <button disabled={busy} className="rounded bg-nukkad-900 px-4 py-2 text-white disabled:opacity-50">Continue to Razorpay</button>
        <button type="button" disabled={busy} onClick={() => setSelectedBasket(undefined)} className="underline">Back to plan</button>
      </div>
    </form>}
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-stone-700">{notice}</p>}
    {plans && !plans.stores.length && <form onSubmit={retryLocation} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <h3 className="font-semibold text-nukkad-950">No stores matched that location</h3>
      <p className="text-sm text-stone-600">Try a locality, city or PIN to compare the same basket in another area.</p>
      <label className="grid gap-1 text-sm font-medium">Shopping location
        <input value={location} onChange={event => setLocation(event.target.value)} list="assistant-store-localities"
          placeholder="Enter a locality, city or PIN" required maxLength={250}
          className="rounded-xl border border-stone-300 px-3 py-2 text-base" />
      </label>
      <datalist id="assistant-store-localities">{localities.map(area => <option key={area} value={area} />)}</datalist>
      {localities.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-stone-600">Areas with stores</span>
        {localities.slice(0, 4).map(area => <button key={area} type="button" onClick={() => setLocation(area)}
          className="rounded-full border border-nukkad-200 px-3 py-1.5 text-nukkad-900">{area}</button>)}
      </div>}
      <button type="submit" disabled={busy || !location.trim()}
        className="rounded-xl bg-nukkad-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Comparing…' : 'Compare baskets'}
      </button>
    </form>}
    {plans && plans.stores.length > 0 ? <>
      {plans.unmatched.length > 0 && <p className="rounded bg-amber-50 p-3 text-sm">No nearby listing matches: {plans.unmatched.map(item => item.name).join(', ')}</p>}
      {plans.split && <section className="space-y-3">
        <h2 className="font-serif text-xl font-bold">Split pickup</h2>
        {planCard(plans.split, 'Recommended split')}
      </section>}
      <section className="space-y-3">
        <h2 className="font-serif text-xl font-bold">Single-store options</h2>
        <p className="text-sm text-stone-600">We rank fewer missing items first, then more units filled, then lower basket price plus ₹8 per estimated kilometre. Unknown distances are excluded from the estimate.</p>
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
          {plans.singles.map(plan => <div key={plan.baskets[0].store.id}>{planCard(plan, plan.baskets[0].store.name)}</div>)}
        </div>
      </section>
    </> : null}
      </div>}
    </section>}
  </div>;
}
