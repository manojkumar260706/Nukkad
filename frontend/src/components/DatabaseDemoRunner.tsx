import { useRef, useState } from 'react';
import { DemoResult, runCheckoutDemo } from '../api/client';
import { DatabaseChanges } from './DatabaseChanges';
import { playPaymentAnimation } from './paymentAnimation';

const scenarios = [
  ['delivery', 'Paid home delivery'],
  ['pickup', 'Paid pickup and wrong code'],
  ['two-shoppers', 'Website vs app: last item'],
  ['race', 'Concurrent last-item race'],
  ['counter-first', 'Counter sale claims last item first'],
  ['online-first', 'Online reservation claims last item first'],
  ['cancel', 'Cancel unpaid order twice'],
  ['expire', 'Expire unpaid order twice'],
  ['invalid', 'Reject invalid delivery details'],
  ['history', 'Checkout animation and persisted order']
];

export function DatabaseDemoRunner() {
  const [scenario, setScenario] = useState('delivery');
  const [result, setResult] = useState<DemoResult>();
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const preview = useRef<HTMLDivElement>(null);

  async function run() {
    setRunning(true);
    setError('');
    setResult(undefined);
    preview.current?.replaceChildren();
    try {
      const response = await runCheckoutDemo(scenario);
      if (scenario === 'history' && preview.current) {
        await playPaymentAnimation(preview.current, '15rem', 'Demo checkout').finished;
      }
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div>
        <h3 className="font-serif text-lg font-bold">Run a checkout demo</h3>
        <p className="text-xs text-stone-600">Each run creates a dedicated demo stock row. Payments are simulated.</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold">Scenario
          <select value={scenario} disabled={running} onChange={e => setScenario(e.target.value)}
            className="rounded-lg border bg-white px-3 py-2">
            {scenarios.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <button disabled={running} onClick={run}
          className="rounded-lg bg-nukkad-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          {running ? 'Running…' : 'Run demo'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {scenario === 'history' && <div ref={preview} className="rounded-lg" hidden={!running} />}
      {result && (
        <>
          <div className="flex flex-wrap gap-4 text-sm" aria-live="polite">
            <span className="rounded-lg bg-white p-2">Available stock <strong>{result.snapshot.stock}</strong></span>
            <span className="rounded-lg bg-white p-2">Orders saved <strong>{result.snapshot.orders}</strong></span>
          </div>
          <dl className="space-y-1 text-sm">
            {result.results.map(({ action, result: outcome }) => (
              <div key={action} className="rounded-lg bg-white p-3"><dt className="font-semibold">{action}</dt><dd className="mt-1 text-stone-700">{outcome}</dd></div>
            ))}
          </dl>
          <h4 className="text-sm font-semibold">What changed in the database</h4>
          <DatabaseChanges changes={result.changes} />
        </>
      )}
    </section>
  );
}
