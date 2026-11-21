import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const fields = [
  ['name', 'Your name', 'text'], ['email', 'Email', 'email'], ['password', 'Password', 'password'],
  ['store', 'Store name', 'text'], ['locality', 'Locality', 'text'], ['city', 'City', 'text'],
  ['address', 'Street address', 'text'], ['pin', 'Six-digit PIN', 'text']
];

export function MerchantSignup() {
  const navigate = useNavigate();
  const { registerShopkeeper } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const get = (field: string) => String(data.get(field) || '').trim();
    setError('');
    setBusy(true);
    try {
      const latitude = get('latitude');
      const longitude = get('longitude');
      if (Boolean(latitude) !== Boolean(longitude)) throw new Error('Enter both coordinates or leave both blank.');
      await registerShopkeeper({
        name: get('name'), email: get('email'), password: String(data.get('password') || ''),
        store: { name: get('store'), locality: get('locality'), city: get('city'), address: get('address'),
          pin: get('pin'), location: latitude ? { latitude: Number(latitude), longitude: Number(longitude) } : undefined }
      });
      navigate('/store/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the store.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-xl space-y-4 p-5">
    <Link to="/store/login" className="underline">Merchant sign in</Link>
    <h1 className="font-serif text-3xl font-bold">Create your store</h1>
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2">
      {fields.map(([name, label, type]) => <label key={name} className="grid gap-1 text-sm">
        {label}<input className="min-w-0 rounded border p-2" required name={name} type={type}
          minLength={name === 'password' ? 6 : undefined}
          pattern={name === 'pin' ? '[1-9][0-9]{5}' : undefined} inputMode={name === 'pin' ? 'numeric' : undefined} />
      </label>)}
      <label className="grid gap-1 text-sm">Latitude (optional)<input className="rounded border p-2" name="latitude" type="number" step="any" min="-90" max="90" /></label>
      <label className="grid gap-1 text-sm">Longitude (optional)<input className="rounded border p-2" name="longitude" type="number" step="any" min="-180" max="180" /></label>
      {error && <p role="alert" className="text-red-700 sm:col-span-2">{error}</p>}
      <button disabled={busy} className="rounded bg-nukkad-900 p-2 text-white sm:col-span-2">{busy ? 'Creating store…' : 'Create store'}</button>
    </form>
  </main>;
}
