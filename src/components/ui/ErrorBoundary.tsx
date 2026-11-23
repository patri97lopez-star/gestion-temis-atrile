import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Error inesperado en la aplicación.' };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed.error) {
          friendly = `Operación (${parsed.operationType || 'lectura'}) en "${parsed.path || 'base de datos'}": ${parsed.error}`;
        }
      } catch {
        // Keep plain message
      }

      return (
        <div className="min-h-screen bg-[#F8F8F5] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#ECEEEB] rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#203C35]">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <h2 className="text-lg font-semibold">Se ha producido una incidencia de acceso o datos</h2>
            </div>
            <p className="text-sm text-[#252B28]/80 leading-relaxed break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#203C35] text-[#F8F8F5] rounded-md hover:bg-[#315348] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Recargar plataforma
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
