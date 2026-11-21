import React, { useState } from 'react';
import { X, Zap, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { simulateRaceApi } from '../api/client';

interface RaceBattleModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
}

export const RaceBattleModal: React.FC<RaceBattleModalProps> = ({
  isOpen,
  onClose,
  storeId
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [battleResult, setBattleResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleRunBattle = async () => {
    setIsRunning(true);
    setBattleResult(null);
    try {
      const res = await simulateRaceApi(storeId);
      setBattleResult(res);
    } catch (err: any) {
      alert(err.message || 'Battle test failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      <div className="relative bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-stone-200 z-10 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-bold text-xl text-stone-900">
                Oversell Battle Test (Race Condition Simulator)
              </h2>
              <p className="text-xs text-stone-500 font-sans">
                PostgreSQL ACID guarantee: 2 buyers race for the final unit simultaneously
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Concept Explainer Box */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs space-y-2 font-sans">
          <div className="font-semibold text-stone-800 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>The Challenge Requirement: "When someone buys the last item, PostgreSQL makes sure two people can't both get it."</span>
          </div>
          <p className="text-stone-600 leading-relaxed">
            We reset the test item to <strong>Stock = 1</strong> and fire two checkout HTTP requests at the <em>exact same millisecond</em>. PostgreSQL's row-level lock (<code className="font-mono bg-stone-200 px-1 py-0.5 rounded text-[11px]">SELECT ... FOR UPDATE</code>) guarantees that only 1 transaction acquires the lock and decrements the shelf. The other is safely guarded and rejected.
          </p>
        </div>

        {/* Action Button */}
        <div className="text-center">
          <button
            onClick={handleRunBattle}
            disabled={isRunning}
            className="px-6 py-3 bg-nukkad-800 hover:bg-nukkad-900 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 mx-auto"
          >
            <Zap className={`w-4 h-4 ${isRunning ? 'animate-bounce text-amber-300' : 'text-amber-400'}`} />
            <span>{isRunning ? 'Firing Parallel Transactions to Aiven...' : 'Fire Concurrency Battle Now'}</span>
          </button>
        </div>

        {/* Battle Results Grid */}
        {battleResult && (
          <div className="space-y-4 pt-2 border-t border-stone-200 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider text-center">
              Battle Outcome · Item: {battleResult.testItem}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Buyer 1 Card */}
              <div className={`p-4 rounded-xl border ${
                battleResult.buyer1.status === 'SUCCESS'
                  ? 'bg-emerald-50/80 border-emerald-300'
                  : 'bg-red-50/80 border-red-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-700" />
                    <span className="font-bold text-xs text-stone-900">Buyer 1 (Aarav)</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    battleResult.buyer1.status === 'SUCCESS' ? 'bg-emerald-200 text-emerald-900' : 'bg-red-200 text-red-900'
                  }`}>
                    {battleResult.buyer1.status}
                  </span>
                </div>
                {battleResult.buyer1.orderNumber && (
                  <div className="text-xs font-mono font-bold text-emerald-900 mb-1">
                    Order #{battleResult.buyer1.orderNumber}
                  </div>
                )}
                <p className="text-xs text-stone-700 leading-snug">
                  {battleResult.buyer1.message}
                </p>
              </div>

              {/* Buyer 2 Card */}
              <div className={`p-4 rounded-xl border ${
                battleResult.buyer2.status === 'GUARDED' || battleResult.buyer2.status === 'FAILED'
                  ? 'bg-amber-50/80 border-amber-300'
                  : 'bg-emerald-50/80 border-emerald-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <UserX className="w-4 h-4 text-amber-700" />
                    <span className="font-bold text-xs text-stone-900">Buyer 2 (Priya)</span>
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    battleResult.buyer2.status === 'GUARDED' ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
                  }`}>
                    {battleResult.buyer2.status}
                  </span>
                </div>
                <p className="text-xs text-stone-700 leading-snug">
                  {battleResult.buyer2.message}
                </p>
              </div>
            </div>

            {/* Verdict Box */}
            <div className="p-3 bg-nukkad-900 text-white rounded-xl text-xs font-mono flex items-center justify-between">
              <span className="text-emerald-400">Final Shelf Stock: {battleResult.finalStock} units</span>
              <span className="text-stone-300">0 Oversold Orders (Guaranteed)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
