import { Mic, Square } from 'lucide-react';

interface ListeningPopupProps {
  open: boolean;
  onStop: () => void;
  placement?: 'above' | 'below';
}

export function ListeningPopup({ open, onStop, placement = 'above' }: ListeningPopupProps) {
  if (!open) return null;

  const position = placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2';
  return (
    <div className={`absolute right-0 z-20 flex w-max max-w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-xl ${position}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-nukkad-900" aria-hidden="true">
        <Mic size={19} className="motion-safe:animate-pulse" />
      </span>
      <div role="status" className="min-w-0">
        <p className="text-sm font-semibold text-nukkad-950">Listening…</p>
        <p className="text-xs text-stone-600">Speak now</p>
      </div>
      <button type="button" onClick={onStop} aria-label="Stop listening"
        className="ml-1 flex shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 px-2.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100">
        <Square size={12} aria-hidden="true" /> Stop
      </button>
    </div>
  );
}
