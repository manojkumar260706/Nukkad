import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DatabaseChanges } from './DatabaseChanges';
import { useAuth } from '../context/AuthContext';
import { cancelPickup, checkPayment, createEventSource, CustomerOrder, fetchCustomerOrders } from '../api/client';

export function CustomerOrders() {
  const { customer, customerToken } = useAuth();
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    const updated = await fetchCustomerOrders();
    setOrders(updated);
    setLoadError('');
  }, []);

  useEffect(() => {
    if (!customer) return;
    const poll = () => refresh().catch(() => setLoadError('Could not load your orders. Retrying…'));
    poll();
    const timer = window.setInterval(poll, 5000);
    const stream = createEventSource();
    stream.onmessage = event => {
      if (JSON.parse(event.data).type === 'database.changed') poll();
    };
    return () => { window.clearInterval(timer); stream.close(); };
  }, [customer, refresh]);

  async function updatePayment(id: string, cancel = false, pickup = false) {
    setBusy(id);
    setError('');
    try {
      if (pickup) await cancelPickup(id);
      else await checkPayment(id, cancel);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-5 py-6">
      <Link to="/shop" className="mb-5 inline-block text-sm font-medium text-nukkad-800 hover:underline">← Back to shop</Link>
      <h1 className="font-serif text-3xl font-bold mb-4">My orders</h1>
      {!customer && !customerToken && <Link to="/login" className="underline">Sign in to see your orders</Link>}
      {loadError && <p role="alert" className="mb-2 text-sm text-red-700">{loadError}</p>}
      {customerToken && orders === null && !loadError && <p role="status">Loading orders…</p>}
      {error && <p role="alert" className="text-sm text-red-700 mb-2">{error}</p>}
      {customer && orders?.length === 0 && <p className="text-sm text-stone-600">Your orders will appear here.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {customer && orders?.map(order => (
          <article key={order.id} className="rounded-xl border border-stone-200 bg-white p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <strong>#{order.orderNumber.slice(0, 8).toUpperCase()}</strong>
              <span>₹{order.total}</span>
            </div>
            <p className="capitalize">{order.deliveryType} · {order.status.replace(/_/g, ' ')}</p>
            {order.storeName && <p className="font-semibold">{order.storeName}</p>}
            {order.items && <ul className="text-sm">{order.items.map((item, index) =>
              <li key={index}>{item.quantity} × {item.name} ({item.unit})</li>)}</ul>}
            {order.paymentStatus === 'pay_at_pickup' && <>
              <p>Pay at pickup</p>
              {['requested', 'confirmed', 'ready_for_pickup'].includes(order.status) &&
                <button disabled={busy === order.id} onClick={() => updatePayment(order.id, true, true)} className="underline">Cancel reservation</button>}
            </>}
            {order.paymentStatus === 'paid_at_pickup' && <p className="text-emerald-800">Paid at pickup</p>}
            {order.paymentStatus === 'paid' && <p className="text-emerald-800">Paid</p>}
            {order.paymentStatus === 'refund_pending' && <p>Refund pending</p>}
            {order.deliveryType === 'pickup' && order.storeAddress && <p>{order.storeAddress}</p>}
            {order.pickupCode && ['confirmed', 'preparing', 'ready_for_pickup'].includes(order.status) &&
              <p>Pickup code <strong>{order.pickupCode}</strong></p>}
            {order.status === 'ready_for_pickup' && order.pickupUntil &&
              <p>Collect by {new Date(order.pickupUntil).toLocaleString()}</p>}
            <details className="pt-1">
              <summary className="cursor-pointer text-xs font-semibold text-nukkad-800">Database history</summary>
              <div className="pt-2"><DatabaseChanges changes={order.changes ?? []} /></div>
            </details>
            {order.paymentStatus === 'awaiting_payment' && (
              <div className="flex flex-wrap gap-3 items-center">
                {order.holdUntil && <p className="w-full">Pay by {new Date(order.holdUntil).toLocaleTimeString()}</p>}
                {order.paymentUrl && <a href={order.paymentUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg bg-nukkad-800 text-white px-3 py-2">Open Razorpay</a>}
                <button disabled={busy === order.id} className="underline" onClick={() => updatePayment(order.id)}>
                  Check payment
                </button>
                <button disabled={busy === order.id} className="underline" onClick={() => updatePayment(order.id, true)}>
                  Cancel checkout
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
