import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ToolErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="toy-panel p-8 text-center max-w-lg mx-auto my-10">
          <div className="w-14 h-14 rounded-2xl bg-[#FEE2E2] border-2 border-[#EF4444] flex items-center justify-center mx-auto mb-4 text-[#B91C1C]">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="font-display text-xl font-bold text-[#3B2314] mb-2">
            Oops — Something Spilled on the Cutting Board!
          </h3>
          <p className="text-sm text-[#6B4423] mb-5 font-mono bg-[#FFF3E0] rounded-xl p-3 border border-[#E6C79C] break-words">
            {this.state.error.message}
          </p>
          <button onClick={this.handleReset} className="toy-btn-primary px-5 py-2.5 text-sm">
            <RotateCcw className="w-4 h-4" />
            Reset Tool
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const WaffleLoader: React.FC<{ label?: string }> = ({ label = 'Warming up tool...' }) => (
  <div className="flex flex-col items-center justify-center py-20 gap-4">
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FCD34D] to-[#F59E0B] border-2 border-b-[5px] border-[#92400E] grid grid-cols-2 gap-1.5 p-2.5 animate-bounce shadow-toy">
      <span className="rounded bg-[#C2640A]/75" />
      <span className="rounded bg-[#C2640A]/75" />
      <span className="rounded bg-[#C2640A]/75" />
      <span className="rounded bg-[#C2640A]/75" />
    </div>
    <p className="font-display font-semibold text-[#78350F] text-base">{label}</p>
  </div>
);
