import { Mic, Square } from 'lucide-react';

export function ListeningPopup({ onStop }: { onStop: () => void }) {
  return (
    <div className="flex w-max max-w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-lg">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-700" aria-hidden="true">
        <Mic size={17} className="motion-safe:animate-pulse" />
      </span>
      <span role="status" className="text-sm font-semibold text-nukkad-950">Listening…</span>
      <button type="button" onClick={onStop} aria-label="Stop listening"
        className="flex items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-200">
        <Square size={12} aria-hidden="true" /> Stop
      </button>
    </div>
  );
}
