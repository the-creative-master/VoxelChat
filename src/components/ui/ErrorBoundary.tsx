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
        <div className="mx-auto my-10 max-w-lg rounded-lg border border-dashed border-[#e1e5d6] p-8 text-center">
          <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-lg bg-[#fbeeeb] text-[#ae5a4b]">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h3 className="mb-2 font-serif text-[21px] text-[#41573f]">
            Oops — Something Spilled on the Cutting Board!
          </h3>
          <p className="mb-5 break-words rounded-lg border border-[#ecdcd5] bg-[#fdf5f2] p-3 font-mono text-[11.5px] text-[#8a5c50]">
            {this.state.error.message}
          </p>
          <button onClick={this.handleReset} className="toy-btn-primary px-5 py-2.5 text-[12.5px]">
            <RotateCcw className="w-4 h-4" />
            Reset Tool
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const WaffleLoader: React.FC<{ label?: string }> = ({ label = 'Warming up tool…' }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-20">
    <div className="grid h-11 w-11 grid-cols-2 gap-1 rounded-lg border border-[#dfe5d2] bg-[#f2f4e8] p-2">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="animate-pulse rounded-sm bg-[#b9c9a8]"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
    <p className="text-[12px] text-[#8c947e]">{label}</p>
  </div>
);
