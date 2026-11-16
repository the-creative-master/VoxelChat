import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Users } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

function fmt(n: number, decimals = 4): string {
  if (!Number.isFinite(n)) return '—';
  return Number.parseFloat(n.toFixed(decimals)).toLocaleString('en-US', {
    maximumFractionDigits: decimals,
  });
}

export default function PercentageCalculatorTool() {
  // Card 1: What is X% of Y?
  const [c1Pct, setC1Pct] = useState('15');
  const [c1Val, setC1Val] = useState('240');

  // Card 2: X is what % of Y?
  const [c2Part, setC2Part] = useState('45');
  const [c2Whole, setC2Whole] = useState('180');

  // Card 3: Percentage increase / decrease from X to Y
  const [c3From, setC3From] = useState('80');
  const [c3To, setC3To] = useState('108');

  // Card 4: Bill Tip & Split Calculator
  const [bill, setBill] = useState('86.50');
  const [tipPct, setTipPct] = useState('18');
  const [people, setPeople] = useState('3');

  const r1 = (Number.parseFloat(c1Pct) / 100) * Number.parseFloat(c1Val);
  const r2Whole = Number.parseFloat(c2Whole);
  const r2 = r2Whole !== 0 ? (Number.parseFloat(c2Part) / r2Whole) * 100 : Number.NaN;

  const fromVal = Number.parseFloat(c3From);
  const toVal = Number.parseFloat(c3To);
  const diff = toVal - fromVal;
  const r3 = fromVal !== 0 ? (diff / Math.abs(fromVal)) * 100 : Number.NaN;

  const billNum = Math.max(0, Number.parseFloat(bill) || 0);
  const tipNum = Math.max(0, Number.parseFloat(tipPct) || 0);
  const peopleNum = Math.max(1, Math.floor(Number.parseFloat(people) || 1));
  const tipTotal = billNum * (tipNum / 100);
  const grandTotal = billNum + tipTotal;
  const tipPerPerson = tipTotal / peopleNum;
  const totalPerPerson = grandTotal / peopleNum;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* CARD 1: What is X% of Y? */}
      <div className="toy-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="toy-pill bg-[#FEE2E2] border-[#EF4444] text-[#991B1B]">
            1 • Percentage of a Value
          </span>
          {Number.isFinite(r1) && <CopyButton text={String(Number(r1.toFixed(6)))} />}
        </div>

        <h3 className="font-display font-bold text-lg text-[#3B2314]">What is X% of Y?</h3>

        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#5C3A1E]">
          <span>What is</span>
          <div className="relative w-24">
            <input
              type="number"
              value={c1Pct}
              onChange={(e) => setC1Pct(e.target.value)}
              className="toy-input pr-6 py-2 font-mono font-bold text-sm"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#9A7B5C]">
              %
            </span>
          </div>
          <span>of</span>
          <input
            type="number"
            value={c1Val}
            onChange={(e) => setC1Val(e.target.value)}
            className="toy-input w-32 py-2 font-mono font-bold text-sm"
          />
          <span>?</span>
        </div>

        <div className="waffle-recess rounded-xl p-4 flex items-baseline justify-between">
          <span className="text-xs font-mono text-[#7A5433]">({c1Pct || 0} ÷ 100) × {c1Val || 0}</span>
          <span className="font-mono font-bold text-2xl sm:text-3xl text-[#DC2626]">{fmt(r1)}</span>
        </div>
      </div>

      {/* CARD 2: X is what % of Y? */}
      <div className="toy-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="toy-pill bg-[#DBEAFE] border-[#3B82F6] text-[#1E3A8A]">
            2 • Part-to-Whole Ratio
          </span>
          {Number.isFinite(r2) && <CopyButton text={`${Number(r2.toFixed(4))}%`} />}
        </div>

        <h3 className="font-display font-bold text-lg text-[#3B2314]">X is what % of Y?</h3>

        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#5C3A1E]">
          <input
            type="number"
            value={c2Part}
            onChange={(e) => setC2Part(e.target.value)}
            className="toy-input w-28 py-2 font-mono font-bold text-sm"
          />
          <span>is what % of</span>
          <input
            type="number"
            value={c2Whole}
            onChange={(e) => setC2Whole(e.target.value)}
            className="toy-input w-28 py-2 font-mono font-bold text-sm"
          />
          <span>?</span>
        </div>

        <div className="waffle-recess rounded-xl p-4 flex items-baseline justify-between">
          <span className="text-xs font-mono text-[#7A5433]">
            ({c2Part || 0} ÷ {c2Whole || 0}) × 100
          </span>
          <span className="font-mono font-bold text-2xl sm:text-3xl text-[#1D4ED8]">
            {Number.isFinite(r2) ? `${fmt(r2)}%` : '—'}
          </span>
        </div>
      </div>

      {/* CARD 3: Percentage Increase / Decrease from X to Y */}
      <div className="toy-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="toy-pill bg-[#DCFCE7] border-[#22C55E] text-[#14532D]">
            3 • Percent Change
          </span>
          {Number.isFinite(r3) && <CopyButton text={`${r3 >= 0 ? '+' : ''}${Number(r3.toFixed(4))}%`} />}
        </div>

        <h3 className="font-display font-bold text-lg text-[#3B2314]">
          Percentage Increase / Decrease
        </h3>

        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#5C3A1E]">
          <span>From</span>
          <input
            type="number"
            value={c3From}
            onChange={(e) => setC3From(e.target.value)}
            className="toy-input w-28 py-2 font-mono font-bold text-sm"
          />
          <span>to</span>
          <input
            type="number"
            value={c3To}
            onChange={(e) => setC3To(e.target.value)}
            className="toy-input w-28 py-2 font-mono font-bold text-sm"
          />
        </div>

        <div className="waffle-recess rounded-xl p-4 flex items-center justify-between gap-2">
          <div className="text-xs font-mono text-[#7A5433]">
            <div>
              Δ = {Number.isFinite(diff) ? `${diff >= 0 ? '+' : ''}${fmt(diff)}` : '—'}
            </div>
            <div>
              {Number.isFinite(r3)
                ? r3 > 0
                  ? 'Increase'
                  : r3 < 0
                  ? 'Decrease'
                  : 'No change'
                : 'Enter non-zero start'}
            </div>
          </div>
          <div
            className={`inline-flex items-center gap-1 font-mono font-bold text-2xl sm:text-3xl ${
              !Number.isFinite(r3)
                ? 'text-[#7A5433]'
                : r3 >= 0
                ? 'text-[#15803D]'
                : 'text-[#DC2626]'
            }`}
          >
            {Number.isFinite(r3) &&
              (r3 >= 0 ? (
                <ArrowUpRight className="w-6 h-6" />
              ) : (
                <ArrowDownRight className="w-6 h-6" />
              ))}
            <span>{Number.isFinite(r3) ? `${r3 > 0 ? '+' : ''}${fmt(r3)}%` : '—'}</span>
          </div>
        </div>
      </div>

      {/* CARD 4: Bill Tip & Split Calculator */}
      <div className="toy-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="toy-pill bg-[#FEF3C7] border-[#F59E0B] text-[#78350F]">
            4 • Bill Tip &amp; Split
          </span>
          <CopyButton text={totalPerPerson.toFixed(2)} label="Copy / Person" />
        </div>

        <h3 className="font-display font-bold text-lg text-[#3B2314]">Bill Tip &amp; Split</h3>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className="block text-[11px] font-bold text-[#7A5433] mb-1">Bill ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={bill}
              onChange={(e) => setBill(e.target.value)}
              className="toy-input py-2 font-mono font-bold text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#7A5433] mb-1">Tip (%)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={tipPct}
              onChange={(e) => setTipPct(e.target.value)}
              className="toy-input py-2 font-mono font-bold text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#7A5433] mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> Split
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              className="toy-input py-2 font-mono font-bold text-sm"
            />
          </div>
        </div>

        {/* Quick Tip Preset Pills */}
        <div className="flex flex-wrap gap-1.5">
          {['10', '15', '18', '20', '25'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setTipPct(p);
              }}
              className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border cursor-pointer transition-colors ${
                tipPct === p
                  ? 'bg-[#F59E0B] text-white border-[#92400E]'
                  : 'bg-[#FFF8EB] text-[#5C3415] border-[#DEC098] hover:bg-[#FEF3C7]'
              }`}
            >
              {p}%
            </button>
          ))}
        </div>

        <div className="waffle-recess rounded-xl p-3.5 grid grid-cols-2 gap-3 font-mono">
          <div>
            <div className="text-[10.5px] font-sans font-semibold text-[#7A5433]">
              Total Tip / Grand Total
            </div>
            <div className="text-sm font-bold text-[#5C3415]">
              ${tipTotal.toFixed(2)} • ${grandTotal.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-sans font-semibold text-[#7A5433]">
              Each Pays (tip ${tipPerPerson.toFixed(2)})
            </div>
            <div className="text-xl font-bold text-[#B45309]">${totalPerPerson.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
