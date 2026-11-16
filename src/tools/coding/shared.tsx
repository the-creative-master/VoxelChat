import type { ReactNode } from 'react';

/** Shared tactile UI primitives for the Coding & Developing cupboard tools. */

export const Panel: React.FC<{ title?: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; tone?: 'cream' | 'dark' }> = ({
  title,
  icon,
  actions,
  children,
  className = '',
  tone = 'cream',
}) => (
  <section
    className={`rounded-xl border-2 border-b-[5px] overflow-hidden ${
      tone === 'cream' ? 'bg-[#FFFDF8] border-[#D9B68C]' : 'bg-[#1F150E] border-[#3A2A1A]'
    } ${className}`}
  >
    {(title || actions) && (
      <header
        className={`flex items-center gap-2 px-3 py-2 border-b-2 ${
          tone === 'cream' ? 'bg-[#F7EAD5] border-[#E2C6A2]' : 'bg-[#2A1C12] border-[#3A2A1A]'
        }`}
      >
        {icon && <span className={tone === 'cream' ? 'text-[#8B5A2B]' : 'text-[#FDE68A]'}>{icon}</span>}
        {title && (
          <h3 className={`text-xs font-display font-bold ${tone === 'cream' ? 'text-[#3B2314]' : 'text-[#FDF3E1]'}`}>{title}</h3>
        )}
        <div className="flex-1" />
        {actions}
      </header>
    )}
    <div className="p-3">{children}</div>
  </section>
);

export const Segmented: React.FC<{
  options: { id: string; label: string; icon?: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ options, value, onChange, className = '' }) => (
  <div className={`inline-flex rounded-lg border-2 border-[#D9B68C] bg-[#F7EAD5] p-0.5 gap-0.5 ${className}`} role="tablist">
    {options.map((opt) => (
      <button
        key={opt.id}
        type="button"
        role="tab"
        aria-selected={value === opt.id}
        onClick={() => onChange(opt.id)}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
          value === opt.id ? 'bg-white text-[#3B2314] shadow-toy-sm' : 'text-[#8A6748] hover:text-[#3B2314]'
        }`}
      >
        {opt.icon}
        {opt.label}
      </button>
    ))}
  </div>
);

export const Field: React.FC<{ label: string; hint?: string; children: ReactNode; className?: string }> = ({ label, hint, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="block text-[11px] font-bold text-[#6B4423] mb-1">
      {label}
      {hint && <span className="ml-1 font-normal text-[#A98768]">{hint}</span>}
    </span>
    {children}
  </label>
);

export const StatChip: React.FC<{ label: string; value: ReactNode; tone?: 'mint' | 'gold' | 'red' | 'cream' }> = ({ label, value, tone = 'cream' }) => {
  const tones: Record<string, string> = {
    mint: 'bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]',
    gold: 'bg-[#FFFBEB] border-[#FDE68A] text-[#78350F]',
    red: 'bg-[#FEF2F2] border-[#FCA5A5] text-[#7F1D1D]',
    cream: 'bg-[#FFF8EB] border-[#E6C79C] text-[#6B4423]',
  };
  return (
    <span className={`toy-pill ${tones[tone]} whitespace-nowrap`}>
      <span className="opacity-70 font-medium">{label}</span>
      <span className="font-mono font-bold">{value}</span>
    </span>
  );
};

export const ErrorBanner: React.FC<{ message: string; onDismiss?: () => void }> = ({ message, onDismiss }) => (
  <div className="flex items-start gap-2 rounded-lg border-2 border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-2 text-[11px] text-[#7F1D1D]">
    <span className="font-bold">Error</span>
    <span className="flex-1 font-mono break-words">{message}</span>
    {onDismiss && (
      <button type="button" onClick={onDismiss} className="font-bold text-[#B91C1C]" aria-label="Dismiss error">
        ×
      </button>
    )}
  </div>
);

export const EmptyHint: React.FC<{ children: ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-[#A98768] italic leading-relaxed">{children}</p>
);
