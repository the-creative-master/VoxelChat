import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../../utils/storage';
import { soundEngine } from '../../utils/soundEngine';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  size?: 'xs' | 'sm';
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label = 'Copy',
  className = '',
  size = 'xs',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      soundEngine.playPop(1.18);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`toy-btn ${
        copied
          ? 'bg-[#DCFCE7] border-[#15803D] text-[#14532D]'
          : 'bg-[#FFFDF8] hover:bg-[#FEF3C7] border-[#D4AA78] text-[#4A2506]'
      } ${size === 'xs' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'} ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied!' : label}</span>
    </button>
  );
};
