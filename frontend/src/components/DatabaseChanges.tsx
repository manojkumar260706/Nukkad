import { DatabaseChange } from '../api/client';

const fieldLabels: Record<string, string> = {
  stock: 'Available stock',
  status: 'Order status',
  payment_status: 'Payment status'
};

function displayValue(value: string | number | undefined) {
  if (value === undefined) return '—';
  if (typeof value === 'number') return `${value} ${value === 1 ? 'unit' : 'units'}`;
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function DatabaseChanges({ changes }: { changes: DatabaseChange[] }) {
  if (!changes.length) return <p className="text-sm text-stone-600">No changes recorded yet.</p>;

  return (
    <ol className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
      {changes.map(change => {
        const isOrder = change.source_table === 'orders';
        const title = isOrder
          ? `Order #${(change.label || change.row_id.replace(/-/g, '')).slice(0, 8).toUpperCase()}`
          : change.label || 'Product stock';
        return (
          <li key={change.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-stone-900">{title}</strong>
              <time className="text-xs text-stone-600" dateTime={change.changed_at}>{new Date(change.changed_at).toLocaleTimeString()}</time>
            </div>
            <dl className="space-y-2">
              {Object.entries(change.after_state).filter(([field, value]) => change.before_state?.[field] !== value)
                .map(([field, value]) => (
                  <div key={field} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <dt className="font-medium text-stone-700">{fieldLabels[field] || field}</dt>
                    {change.before_state && <>
                      <dd className="text-stone-500">{displayValue(change.before_state[field])}</dd>
                      <span aria-hidden="true">→</span>
                    </>}
                    <dd className="rounded bg-emerald-100 px-2 py-1 font-semibold text-emerald-950">{displayValue(value)}</dd>
                  </div>
                ))}
            </dl>
            <details className="text-xs text-stone-500">
              <summary className="cursor-pointer">Database details</summary>
              <p className="mt-1 break-all font-mono">{change.source_table} / {change.row_id}</p>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
