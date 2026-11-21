import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Coordinates, findNearbyStores, findShoppingPlans, NearbyStore, reserveBaskets, ShoppingPlan } from '../api/client';
import { useAuth } from '../context/AuthContext';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

function requestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
    if (!customer || busy) return;
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
      {plan.baskets.map(({ store, items }) => <section key={store.id} className="rounded bg-stone-50 p-3">
        <h4 className="font-semibold">{store.name}</h4>
        <p className="text-xs text-stone-600">{store.address}</p>
        <ul className="mt-1 text-sm">{items.map(item => <li key={item.productId}>
          {item.quantity} × {item.name} ({item.unit}) · {money(item.expectedPrice)} each
        </li>)}</ul>
      </section>)}
      {plan.missing.length > 0 && <p className="text-sm text-amber-900">Missing: {plan.missing.map(item => `${item.quantity} × ${item.name}`).join(', ')}</p>}
      {plan.units > 0 && (customer
        ? <button onClick={() => reserve(plan)} disabled={busy} className="rounded bg-nukkad-900 px-4 py-2 text-sm text-white">
          {plan.missing.length ? 'Reserve available items' : 'Reserve and pay at pickup'}
        </button>
        : <Link to="/login" state={{ returnTo: '/plan' }} className="text-sm underline">Sign in to reserve</Link>)}
    </article>;
  }

  return <main className="mx-auto max-w-5xl space-y-5 p-5">
    <Link to="/" className="text-sm underline">Back to shop</Link>
    <h1 className="font-serif text-3xl font-bold">Plan a shopping list</h1>
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
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    {nearby && <section>
      <h2 className="font-serif text-xl font-bold">Nearby stores</h2>
      {!nearby.length ? <p>No matches. Try a locality, city, address or PIN.</p> : <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {nearby.map(store => <li key={store.id} className="rounded border bg-white p-3">
          <Link className="font-semibold underline" to={`/?store=${encodeURIComponent(store.id)}`}>{store.name}</Link>
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
