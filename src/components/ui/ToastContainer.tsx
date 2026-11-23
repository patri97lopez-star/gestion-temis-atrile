import React from 'react';
import { CheckCircle2, Info, X, AlertCircle } from 'lucide-react';
import { useErpData } from '../../context/ErpDataContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useErpData();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2.5 px-4 py-3 bg-white border border-[#ECEEEB] shadow-lg rounded-md text-xs text-[#252B28]"
        >
          {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#1E6B47] shrink-0 mt-0.5" />}
          {t.type === 'error' && <AlertCircle className="w-4 h-4 text-[#B42318] shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info className="w-4 h-4 text-[#315348] shrink-0 mt-0.5" />}
          <span className="flex-1 leading-relaxed">{t.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Descartar aviso"
            className="text-[#252B28]/50 hover:text-[#252B28]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
