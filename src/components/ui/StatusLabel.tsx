import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCheck2,
  PauseCircle,
  Send,
  XCircle,
} from 'lucide-react';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_MAP: Record<Tone, string> = {
  success: 'text-[#1E6B47]',
  warning: 'text-[#9A6315]',
  danger: 'text-[#B42318]',
  info: 'text-[#315348]',
  neutral: 'text-[#252B28]/70',
};

function resolveTone(status: string): { tone: Tone; icon: React.ReactNode } {
  const s = status.toLowerCase();
  if (
    s.includes('cobrada') && !s.includes('parcial') ||
    s === 'activo' ||
    s === 'pagado' ||
    s === 'aceptado' ||
    s === 'finalizado' ||
    s === 'facturado' ||
    s === 'completada' ||
    s === 'presentado' ||
    s === 'justificante archivado' ||
    s === 'recibido por gestor'
  ) {
    return { tone: 'success', icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> };
  }
  if (
    s.includes('vencida') ||
    s.includes('rechazado') ||
    s.includes('caducado') ||
    s.includes('incompleta') ||
    s === 'inactivo' ||
    s === 'urgente' ||
    s === 'rectificada'
  ) {
    return { tone: 'danger', icon: <XCircle className="w-3.5 h-3.5 shrink-0" /> };
  }
  if (
    s.includes('pendiente') ||
    s.includes('esperando') ||
    s.includes('parcial') ||
    s.includes('preparando') ||
    s === 'potencial' ||
    s === 'alta'
  ) {
    return { tone: 'warning', icon: <Clock className="w-3.5 h-3.5 shrink-0" /> };
  }
  if (
    s.includes('enviado') ||
    s.includes('emitida') ||
    s.includes('en proceso') ||
    s.includes('en curso') ||
    s.includes('listo') ||
    s.includes('revisión') ||
    s.includes('revisado')
  ) {
    return { tone: 'info', icon: s.includes('enviado') ? <Send className="w-3.5 h-3.5 shrink-0" /> : <FileCheck2 className="w-3.5 h-3.5 shrink-0" /> };
  }
  if (s === 'borrador') {
    return { tone: 'neutral', icon: <PauseCircle className="w-3.5 h-3.5 shrink-0" /> };
  }
  return { tone: 'neutral', icon: <AlertCircle className="w-3.5 h-3.5 shrink-0" /> };
}

export const StatusLabel: React.FC<{ value: string; className?: string }> = ({
  value,
  className = '',
}) => {
  const { tone, icon } = resolveTone(value);
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${TONE_MAP[tone]} ${className}`}
    >
      {icon}
      <span>{value}</span>
    </span>
  );
};
