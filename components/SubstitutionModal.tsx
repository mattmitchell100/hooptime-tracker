
import React, { useEffect, useState } from 'react';
import { Player } from '../types';

interface SubstitutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCourt: Player[];
  onBench: Player[];
  onConfirm: (outgoingIds: string[], incomingIds: string[]) => void;
}

export const SubstitutionModal: React.FC<SubstitutionModalProps> = ({ 
  isOpen, 
  onClose, 
  onCourt, 
  onBench, 
  onConfirm 
}) => {
  const [outgoingIds, setOutgoingIds] = useState<string[]>([]);
  const [incomingIds, setIncomingIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      setOutgoingIds([]);
      setIncomingIds([]);
    }
  }, [isOpen]);

  const canConfirm = outgoingIds.length > 0 && outgoingIds.length === incomingIds.length;

  const handleToggleOutgoing = (id: string) => {
    setOutgoingIds(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const handleToggleIncoming = (id: string) => {
    setIncomingIds(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm(outgoingIds, incomingIds);
    setOutgoingIds([]);
    setIncomingIds([]);
    onClose();
  };

  const handleClose = () => {
    setOutgoingIds([]);
    setIncomingIds([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl p-8 shadow-2xl">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-3xl font-oswald text-white">Substitution</h2>
            <p className="text-sm text-slate-400">Select matching counts to swap multiple players.</p>
          </div>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {outgoingIds.length} Out · {incomingIds.length} In
          </div>
        </div>
        
        <div className="space-y-8">
          <div>
            <label className="block text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Outgoing Player (Off Court)</label>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {onCourt.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleToggleOutgoing(p.id)}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    outgoingIds.includes(p.id) 
                    ? 'border-orange-500 bg-orange-500/10 text-orange-500' 
                    : 'border-slate-800 bg-slate-800/50 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="font-bold">#{p.number} {p.name}</span>
                  {outgoingIds.includes(p.id) && <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_orange]" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Incoming Player (From Bench)</label>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {onBench.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleToggleIncoming(p.id)}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    incomingIds.includes(p.id) 
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500' 
                    : 'border-slate-800 bg-slate-800/50 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="font-bold">#{p.number} {p.name}</span>
                  {incomingIds.includes(p.id) && <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_emerald]" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex gap-4">
          <button
            onClick={handleClose}
            className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`flex-1 py-4 font-bold rounded-xl transition-all ${
              canConfirm
              ? 'bg-orange-600 hover:bg-orange-500 text-white' 
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            CONFIRM SUBS
          </button>
        </div>
      </div>
    </div>
  );
};
