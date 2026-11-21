import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { askShoppingAssistant, checkPayment, Coordinates, createOrderApi, findNearbyStores, findShoppingPlans, NearbyStore, PickupBasket, reserveBaskets, ShoppingItem, ShoppingPlan } from '../api/client';
import { useAuth } from '../context/AuthContext';

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

export function ShoppingPlanner() {
  const [list, setList] = useState('');
  const [location, setLocation] = useState('');
  const [gps, setGps] = useState<Coordinates>();
  const [nearby, setNearby] = useState<NearbyStore[]>();
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof findShoppingPlans>>>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { customer } = useAuth();
  const navigate = useNavigate();

  const [message, setMessage] = useState('');
  const [language, setLanguage] = useState('auto');
  const [assistantItems, setAssistantItems] = useState<ShoppingItem[]>([]);
  const [chat, setChat] = useState<{ request: string; reply: string }[]>([]);
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

  function rememberPurchase(value: PendingPurchase | null) {
    if (!pendingKey) return;
    if (value) sessionStorage.setItem(pendingKey, JSON.stringify(value));
    else sessionStorage.removeItem(pendingKey);
    setPendingByCustomer(current => ({ ...current, [pendingKey]: value }));
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !message.trim()) return;
    setError('');
    if (!gps && !location.trim()) {
      setError('Enter your location below or use GPS before asking for a plan.');
      return;
    }
    setBusy(true);
    try {
      const reply = await askShoppingAssistant({ message, language, previous: assistantItems, lastTurn: chat[chat.length - 1], location, gps });
      const parsed = reply.items.map(item => `${item.quantity} ${item.name}`).join(', ');
      setChat(current => [...current, { request: message, reply: reply.question || (parsed
        ? `Shopping list: ${parsed}` : 'Tell me which products you want to buy.') }]);
      setAssistantItems(reply.items);
      setMessage('');
      setSelectedBasket(undefined);
      setPlans(reply.plans ?? undefined);
      setNearby(reply.plans?.stores);
      if (reply.plans) setList(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a plan.');
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
    setGps(undefined);
    setNearby(undefined);
    setPlans(undefined);
    setNotice('Getting your location…');
    if (!navigator.geolocation) {
      setNotice('GPS is unavailable. Enter a locality, address or PIN.');
      return;
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setGps({ latitude: coords.latitude, longitude: coords.longitude });
      setNotice('GPS selected. You can enter a fallback location if there are no nearby matches.');
    }, () => setNotice('GPS is unavailable. Enter a locality, address or PIN.'), { timeout: 8000 });
  }

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setPlans(undefined);
    setNearby(undefined);
    setSelectedBasket(undefined);
    try {
      if (!gps && !location.trim()) throw new Error('Enter a location or use GPS.');
      if (list.trim()) {
        const result = await findShoppingPlans({ list, location, gps });
        setPlans(result);
        setNearby(result.stores);
      } else {
        setNearby(await findNearbyStores({ location, gps }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find stores.');
    } finally {
      setBusy(false);
    }
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
    return <article className="space-y-3 rounded-xl border bg-white p-4">
      <h3 className="font-serif text-xl font-bold">{title}</h3>
      <p className="text-sm"><strong>{money(plan.basketPrice)}</strong> basket · {plan.units} {plan.units === 1 ? 'unit' : 'units'}
        {plan.distance !== null && ` · ${plan.distance.toFixed(1)} km estimated`}</p>
      {plan.baskets.map(basket => {
        const { store, items } = basket;
        const purchased = paid.includes(basketKey(basket));
        return <section key={store.id} className="rounded bg-stone-50 p-3">
        <h4 className="font-semibold">{store.name}</h4>
        <p className="text-xs text-stone-600">{store.address}</p>
        <ul className="mt-1 text-sm">{items.map(item => <li key={item.productId}>
          {item.quantity} × {item.name} ({item.unit}) · {money(item.expectedPrice)} each
        </li>)}</ul>
        <div className="mt-2 flex items-center gap-3 text-sm">
          <strong>{money(items.reduce((total, item) => total + item.quantity * item.expectedPrice, 0))}</strong>
          {customer ? <button type="button" disabled={busy || Boolean(pending) || purchased} onClick={() => {
            setPhone(customer.phone || '');
            setError('');
            setSelectedBasket(basket);
          }} className="rounded bg-nukkad-900 px-3 py-2 text-white disabled:opacity-50">
            {purchased ? 'Paid' : `Buy from ${store.name}`}
          </button> : <Link to="/login" state={{ returnTo: '/plan' }} className="underline">Sign in to buy</Link>}
        </div>
      </section>; })}
      {plan.missing.length > 0 && <p className="text-sm text-amber-900">Missing: {plan.missing.map(item => `${item.quantity} × ${item.name}`).join(', ')}</p>}
      {plan.units > 0 && (customer
        ? <button onClick={() => reserve(plan)} disabled={busy || Boolean(pending) || plan.baskets.some(basket => paid.includes(basketKey(basket)))} className="rounded bg-nukkad-900 px-4 py-2 text-sm text-white">
          {plan.missing.length ? 'Reserve available items' : 'Reserve and pay at pickup'}
        </button>
        : <Link to="/login" state={{ returnTo: '/plan' }} className="text-sm underline">Sign in to reserve</Link>)}
    </article>;
  }

  return <main className="mx-auto max-w-5xl space-y-5 p-5">
    <Link to="/" className="text-sm underline">Back to shop</Link>
    <h1 className="font-serif text-3xl font-bold">Plan a shopping list</h1>
    <section className="space-y-3 rounded-2xl border bg-white p-4">
      <h2 className="font-serif text-xl font-bold">Shopping chatbot</h2>
      {customer ? <>
        <p className="text-sm text-stone-600">Tell us what you need, then refine the list with messages like “add 2 eggs.” Set your shopping location below. Messages are processed by Grok and, for translation, Sarvam AI.</p>
        {chat.length > 0 && <div aria-live="polite" className="max-h-64 space-y-3 overflow-auto rounded bg-stone-50 p-3 text-sm">
          {chat.map((turn, index) => <div key={index} className="space-y-1">
            <p><strong>You</strong> · {turn.request}</p>
            <p><strong>Nukkad</strong> · {turn.reply}</p>
          </div>)}
        </div>}
        <form onSubmit={ask} className="space-y-2">
          <label className="grid gap-1 text-sm">Message language
            <select className="rounded border p-2" value={language} onChange={event => setLanguage(event.target.value)}>
              <option value="auto">Detect automatically</option><option value="en-IN">English</option>
              <option value="hi-IN">Hindi</option><option value="kn-IN">Kannada</option>
              <option value="ta-IN">Tamil</option><option value="te-IN">Telugu</option><option value="ml-IN">Malayalam</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">What would you like to buy?
            <textarea required maxLength={1000} value={message} onChange={event => setMessage(event.target.value)}
              placeholder="I need two cartons of milk and a loaf of bread" className="rounded border p-2" />
          </label>
          <button disabled={busy} className="rounded bg-nukkad-900 px-4 py-2 text-sm text-white disabled:opacity-50">Send to chatbot</button>
        </form>
      </> : <Link to="/login" state={{ returnTo: '/plan' }} className="text-sm underline">Sign in to use the chatbot</Link>}
    </section>
    <form onSubmit={find} className="space-y-3 rounded-2xl border bg-white p-4">
      <label className="grid gap-1 text-sm">Shopping list
        <textarea value={list} onChange={e => setList(e.target.value)} maxLength={1500} className="rounded border p-2" placeholder="2 milk and bread" />
      </label>
      <label className="grid gap-1 text-sm">Locality, city, address or PIN
        <input value={location} onChange={e => { setLocation(e.target.value); setGps(undefined); }} className="rounded border p-2" placeholder="Demo Lane" />
      </label>
      <button type="button" onClick={locate} className="mr-3 text-sm underline">Use my location</button>
      <button disabled={busy} className="rounded bg-nukkad-900 px-4 py-2 text-sm text-white">{list.trim() ? 'Compare baskets' : 'Find stores'}</button>
      {notice && <p role="status" className="text-sm text-stone-600">{notice}</p>}
    </form>
    {pending && <section className="space-y-2 rounded-xl border bg-white p-4">
      <h2 className="font-semibold">Checkout in progress · {pending.storeName}</h2>
      <p className="text-sm">Finish or cancel this checkout before buying from another store.</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <a href={pending.url} target="_blank" rel="noreferrer" className="underline">Open Razorpay</a>
        <button disabled={busy} onClick={() => verifyPurchase()} className="underline">Check payment</button>
        <button disabled={busy} onClick={() => verifyPurchase(true)} className="underline">Cancel checkout</button>
      </div>
    </section>}
    {selectedBasket && !pending && customer && <form onSubmit={buy} className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg space-y-3 rounded-xl border bg-white p-4 shadow-xl">
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
    {nearby && <section>
      <h2 className="font-serif text-xl font-bold">Nearby stores</h2>
      {!nearby.length ? <p>No matches. Try a locality, city, address or PIN.</p> : <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {nearby.map(store => <li key={store.id} className="rounded border bg-white p-3">
          <p className="font-semibold">{store.name}</p>
          <p className="text-xs">{store.address || `${store.locality}, ${store.city}`} · {store.distance === null ? 'Distance unavailable' : `${store.distance.toFixed(1)} km estimated`}</p>
        </li>)}
      </ul>}
      <p className="mt-2 text-xs text-stone-600">Distances are straight-line estimates. Typed locations with a known store location use that store as the starting point.</p>
    </section>}
    {plans && nearby?.length ? <>
      {plans.unmatched.length > 0 && <p className="rounded bg-amber-50 p-3 text-sm">No nearby listing matches: {plans.unmatched.map(item => item.name).join(', ')}</p>}
      <section className="space-y-3">
        <h2 className="font-serif text-xl font-bold">Single-store options</h2>
        <p className="text-sm text-stone-600">We rank fewer missing items first, then more units filled, then lower basket price plus ₹8 per estimated kilometre. Unknown distances are excluded from the estimate.</p>
        {plans.singles.map(plan => <div key={plan.baskets[0].store.id}>{planCard(plan, plan.baskets[0].store.name)}</div>)}
      </section>
      <section className="space-y-3">
        <h2 className="font-serif text-xl font-bold">Split pickup</h2>
        <p className="text-sm text-stone-600">Full-list splits are ranked by basket price, ₹8 per estimated kilometre and ₹25 per extra stop. Estimated kilometres are the sum of the known straight-line distances to the shops. Only the basket price is payable.</p>
        {plans.split ? planCard(plans.split, 'Recommended split') : <p>No complete two- or three-store split found.</p>}
      </section>
    </> : null}
  </main>;
}
