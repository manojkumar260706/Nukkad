import { FormEvent, useState } from 'react';
import { loadCatalog, saveListing } from '../api/client';
import { InventoryItem } from '../types';

type Catalog = Awaited<ReturnType<typeof loadCatalog>>;
const blank = { name: '', unit: '', price: '', stock: '0', listed: true, synonyms: '', productId: '' };

export function ListingEditor({ inventory, refresh }: { inventory: InventoryItem[]; refresh: () => Promise<void> }) {
  const [mode, setMode] = useState('');
  const [form, setForm] = useState(blank);
  const [expectedStock, setExpectedStock] = useState<number>();
  const [catalog, setCatalog] = useState<Catalog>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const edit = mode !== '' && mode !== 'new';

  function select(mode: string) {
    setMode(mode);
    setError('');
    const item = inventory.find(item => item.product_id === mode);
    setExpectedStock(item?.stock);
    setForm(item ? { ...blank, name: item.product_name, unit: item.unit, price: String(item.price),
      stock: String(item.stock), listed: item.listed } : blank);
    if (mode === 'new') loadCatalog().then(setCatalog).catch(() => setError('Could not load the shared catalog. You can still add a new product.'));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await saveListing({ ...form, productId: form.productId || undefined, stock: Number(form.stock),
        price: Number(form.price), expectedStock, synonyms: form.synonyms.split(',').map(s => s.trim()).filter(Boolean) }, edit ? mode : undefined);
      setMode('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save listing.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-3 rounded-xl border bg-stone-50 p-4">
    <label className="grid max-w-md gap-1 text-sm font-semibold">Manage listings
      <select className="rounded border bg-white p-2" value={mode} disabled={busy} onChange={e => select(e.target.value)}>
        <option value="">Choose an action</option><option value="new">Add a listing</option>
        {inventory.map(item => <option key={item.product_id} value={item.product_id}>{item.product_name}{!item.listed ? ' · Unlisted' : ''}</option>)}
      </select>
    </label>
    {mode && <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {!edit && <label className="grid gap-1 text-sm">Catalog product
        <select className="min-w-0 rounded border p-2" value={form.productId} onChange={e => {
          const product = catalog.find(item => item.id === e.target.value);
          setForm(product ? { ...blank, productId: product.id, name: product.name, unit: product.unit, price: String(product.price) } : blank);
        }}>
          <option value="">Create a new product</option>
          {catalog.filter(product => !inventory.some(item => item.product_id === product.id))
            .map(product => <option key={product.id} value={product.id}>{product.name} · {product.unit}</option>)}
        </select>
      </label>}
      {(['name', 'unit', 'price', 'stock'] as const).map((field, index) => <label key={field} className="grid gap-1 text-sm">
        {['Product name', 'Unit', 'Price (₹)', 'Available quantity'][index]}
        <input required type={index >= 2 ? 'number' : 'text'} min="0" step={field === 'price' ? '0.01' : '1'}
          className="min-w-0 rounded border p-2" value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} />
      </label>)}
      {!edit && !form.productId && <label className="grid gap-1 text-sm">Search aliases (comma separated)
        <input className="rounded border p-2" value={form.synonyms} onChange={e => setForm({ ...form, synonyms: e.target.value })} />
      </label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.listed}
        onChange={e => setForm({ ...form, listed: e.target.checked })} /> Listed for shoppers</label>
      <button disabled={busy} className="rounded bg-nukkad-900 px-4 py-2 text-sm text-white">{busy ? 'Saving…' : 'Save listing'}</button>
    </form>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
