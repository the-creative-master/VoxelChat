import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

interface UnitDef {
  id: string;
  name: string;
  symbol: string;
  toBase: (v: number) => number;
  fromBase: (b: number) => number;
}

interface CategoryDef {
  id: string;
  label: string;
  defaultFrom: string;
  defaultTo: string;
  units: UnitDef[];
}

const lin = (id: string, name: string, symbol: string, factor: number): UnitDef => ({
  id,
  name,
  symbol,
  toBase: (v) => v * factor,
  fromBase: (b) => b / factor,
});

const CATEGORIES: CategoryDef[] = [
  {
    id: 'length',
    label: 'Length',
    defaultFrom: 'm',
    defaultTo: 'ft',
    units: [
      lin('nm', 'Nanometer', 'nm', 1e-9),
      lin('um', 'Micrometer', 'µm', 1e-6),
      lin('mm', 'Millimeter', 'mm', 0.001),
      lin('cm', 'Centimeter', 'cm', 0.01),
      lin('m', 'Meter', 'm', 1),
      lin('km', 'Kilometer', 'km', 1000),
      lin('in', 'Inch', 'in', 0.0254),
      lin('ft', 'Foot', 'ft', 0.3048),
      lin('yd', 'Yard', 'yd', 0.9144),
      lin('mi', 'Mile', 'mi', 1609.344),
      lin('nmi', 'Nautical Mile', 'nmi', 1852),
    ],
  },
  {
    id: 'mass',
    label: 'Mass / Weight',
    defaultFrom: 'kg',
    defaultTo: 'lb',
    units: [
      lin('mg', 'Milligram', 'mg', 1e-6),
      lin('g', 'Gram', 'g', 0.001),
      lin('kg', 'Kilogram', 'kg', 1),
      lin('t', 'Metric Tonne', 't', 1000),
      lin('oz', 'Ounce', 'oz', 0.028349523125),
      lin('lb', 'Pound', 'lb', 0.45359237),
      lin('st', 'Stone', 'st', 6.35029318),
      lin('uston', 'US Short Ton', 'ton', 907.18474),
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    defaultFrom: 'c',
    defaultTo: 'f',
    units: [
      { id: 'c', name: 'Celsius', symbol: '°C', toBase: (v) => v + 273.15, fromBase: (b) => b - 273.15 },
      {
        id: 'f',
        name: 'Fahrenheit',
        symbol: '°F',
        toBase: (v) => ((v - 32) * 5) / 9 + 273.15,
        fromBase: (b) => ((b - 273.15) * 9) / 5 + 32,
      },
      { id: 'k', name: 'Kelvin', symbol: 'K', toBase: (v) => v, fromBase: (b) => b },
      {
        id: 'r',
        name: 'Rankine',
        symbol: '°R',
        toBase: (v) => (v * 5) / 9,
        fromBase: (b) => (b * 9) / 5,
      },
    ],
  },
  {
    id: 'area',
    label: 'Area',
    defaultFrom: 'm2',
    defaultTo: 'ft2',
    units: [
      lin('mm2', 'Square Millimeter', 'mm²', 1e-6),
      lin('cm2', 'Square Centimeter', 'cm²', 1e-4),
      lin('m2', 'Square Meter', 'm²', 1),
      lin('ha', 'Hectare', 'ha', 10_000),
      lin('km2', 'Square Kilometer', 'km²', 1_000_000),
      lin('in2', 'Square Inch', 'in²', 0.00064516),
      lin('ft2', 'Square Foot', 'ft²', 0.09290304),
      lin('yd2', 'Square Yard', 'yd²', 0.83612736),
      lin('ac', 'Acre', 'ac', 4046.8564224),
      lin('mi2', 'Square Mile', 'mi²', 2_589_988.110336),
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    defaultFrom: 'l',
    defaultTo: 'gal',
    units: [
      lin('ml', 'Milliliter', 'mL', 0.001),
      lin('l', 'Liter', 'L', 1),
      lin('m3', 'Cubic Meter', 'm³', 1000),
      lin('tsp', 'US Teaspoon', 'tsp', 0.00492892159375),
      lin('tbsp', 'US Tablespoon', 'tbsp', 0.01478676478125),
      lin('floz', 'US Fluid Ounce', 'fl oz', 0.0295735295625),
      lin('cup', 'US Cup', 'cup', 0.2365882365),
      lin('pt', 'US Pint', 'pt', 0.473176473),
      lin('qt', 'US Quart', 'qt', 0.946352946),
      lin('gal', 'US Gallon', 'gal', 3.785411784),
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    defaultFrom: 'kmh',
    defaultTo: 'mph',
    units: [
      lin('ms', 'Meters / Second', 'm/s', 1),
      lin('kmh', 'Kilometers / Hour', 'km/h', 1 / 3.6),
      lin('mph', 'Miles / Hour', 'mph', 0.44704),
      lin('kn', 'Knot', 'kn', 1852 / 3600),
      lin('fts', 'Feet / Second', 'ft/s', 0.3048),
      lin('mach', 'Mach (sea level)', 'Ma', 340.29),
    ],
  },
  {
    id: 'pressure',
    label: 'Pressure',
    defaultFrom: 'atm',
    defaultTo: 'psi',
    units: [
      lin('pa', 'Pascal', 'Pa', 1),
      lin('hpa', 'Hectopascal', 'hPa', 100),
      lin('kpa', 'Kilopascal', 'kPa', 1000),
      lin('mpa', 'Megapascal', 'MPa', 1_000_000),
      lin('bar', 'Bar', 'bar', 100_000),
      lin('atm', 'Standard Atmosphere', 'atm', 101_325),
      lin('psi', 'Pounds / in²', 'psi', 6894.757293168),
      lin('torr', 'Torr / mmHg', 'mmHg', 133.322368421),
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    defaultFrom: 'kwh',
    defaultTo: 'kj',
    units: [
      lin('j', 'Joule', 'J', 1),
      lin('kj', 'Kilojoule', 'kJ', 1000),
      lin('mj', 'Megajoule', 'MJ', 1_000_000),
      lin('cal', 'Gram Calorie', 'cal', 4.184),
      lin('kcal', 'Kilocalorie (food)', 'kcal', 4184),
      lin('wh', 'Watt-hour', 'Wh', 3600),
      lin('kwh', 'Kilowatt-hour', 'kWh', 3_600_000),
      lin('btu', 'British Thermal Unit', 'BTU', 1055.05585262),
      lin('ev', 'Electronvolt', 'eV', 1.602176634e-19),
    ],
  },
  {
    id: 'data',
    label: 'Digital Data',
    defaultFrom: 'gb',
    defaultTo: 'gib',
    units: [
      lin('bit', 'Bit', 'b', 0.125),
      lin('B', 'Byte', 'B', 1),
      lin('kb', 'Kilobyte (SI 10³)', 'KB', 1e3),
      lin('mb', 'Megabyte (SI 10⁶)', 'MB', 1e6),
      lin('gb', 'Gigabyte (SI 10⁹)', 'GB', 1e9),
      lin('tb', 'Terabyte (SI 10¹²)', 'TB', 1e12),
      lin('pb', 'Petabyte (SI 10¹⁵)', 'PB', 1e15),
      lin('kib', 'Kibibyte (IEC 2¹⁰)', 'KiB', 1024),
      lin('mib', 'Mebibyte (IEC 2²⁰)', 'MiB', 1024 ** 2),
      lin('gib', 'Gibibyte (IEC 2³⁰)', 'GiB', 1024 ** 3),
      lin('tib', 'Tebibyte (IEC 2⁴⁰)', 'TiB', 1024 ** 4),
      lin('pib', 'Pebibyte (IEC 2⁵⁰)', 'PiB', 1024 ** 5),
    ],
  },
];

function formatUnitValue(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12 || abs < 1e-6) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Number.parseFloat(n.toPrecision(10)));
}

export default function UnitConverterTool() {
  const [catId, setCatId] = useState('length');
  const category = useMemo(
    () => CATEGORIES.find((c) => c.id === catId) ?? CATEGORIES[0],
    [catId]
  );
  const [fromId, setFromId] = useState(category.defaultFrom);
  const [toId, setToId] = useState(category.defaultTo);
  const [leftVal, setLeftVal] = useState('1');
  const [rightVal, setRightVal] = useState(() => {
    const f = category.units.find((u) => u.id === category.defaultFrom)!;
    const t = category.units.find((u) => u.id === category.defaultTo)!;
    return formatUnitValue(t.fromBase(f.toBase(1)));
  });

  const fromUnit = category.units.find((u) => u.id === fromId) ?? category.units[0];
  const toUnit = category.units.find((u) => u.id === toId) ?? category.units[1];

  const selectCategory = (c: CategoryDef) => {
    soundEngine.playPop(1.06);
    setCatId(c.id);
    setFromId(c.defaultFrom);
    setToId(c.defaultTo);
    const f = c.units.find((u) => u.id === c.defaultFrom)!;
    const t = c.units.find((u) => u.id === c.defaultTo)!;
    const num = Number.parseFloat(leftVal);
    const seed = Number.isFinite(num) ? num : 1;
    setLeftVal(String(seed));
    setRightVal(formatUnitValue(t.fromBase(f.toBase(seed))));
  };

  const updateFromLeft = (raw: string, fUnit = fromUnit, tUnit = toUnit) => {
    setLeftVal(raw);
    const num = Number.parseFloat(raw);
    if (!Number.isFinite(num)) {
      setRightVal('');
      return;
    }
    setRightVal(formatUnitValue(tUnit.fromBase(fUnit.toBase(num))));
  };

  const updateFromRight = (raw: string) => {
    setRightVal(raw);
    const num = Number.parseFloat(raw);
    if (!Number.isFinite(num)) {
      setLeftVal('');
      return;
    }
    setLeftVal(formatUnitValue(fromUnit.fromBase(toUnit.toBase(num))));
  };

  const handleSwap = () => {
    soundEngine.playPop(1.1);
    const nextFrom = toUnit;
    const nextTo = fromUnit;
    setFromId(nextFrom.id);
    setToId(nextTo.id);
    updateFromLeft(leftVal, nextFrom, nextTo);
  };

  const baseNumber = useMemo(() => {
    const num = Number.parseFloat(leftVal);
    return Number.isFinite(num) ? fromUnit.toBase(num) : null;
  }, [leftVal, fromUnit]);

  return (
    <div className="space-y-5">
      {/* 9 Category Selector Pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => selectCategory(c)}
            className={`toy-btn px-3.5 py-2 text-xs sm:text-sm ${
              c.id === catId ? 'toy-btn-primary' : 'toy-btn-cream'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Bidirectional Converter Stage */}
      <div className="grid grid-cols-1 md:grid-cols-11 gap-3.5 items-center toy-panel p-5">
        <div className="md:col-span-5 space-y-2.5">
          <label className="block text-xs font-bold text-[#7A5433]">From</label>
          <select
            value={fromUnit.id}
            onChange={(e) => {
              const u = category.units.find((x) => x.id === e.target.value)!;
              setFromId(u.id);
              updateFromLeft(leftVal, u, toUnit);
            }}
            className="toy-input py-2.5 font-semibold text-sm"
          >
            {category.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.symbol})
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            value={leftVal}
            onChange={(e) => updateFromLeft(e.target.value)}
            className="toy-input font-mono font-bold text-2xl py-3"
          />
        </div>

        <div className="md:col-span-1 flex justify-center pt-2">
          <button
            type="button"
            onClick={handleSwap}
            className="toy-btn-gold p-3 rounded-2xl"
            title="Swap units"
            aria-label="Swap units"
          >
            <ArrowLeftRight className="w-5 h-5" />
          </button>
        </div>

        <div className="md:col-span-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-[#7A5433]">To</label>
            {rightVal && <CopyButton text={`${rightVal} ${toUnit.symbol}`} />}
          </div>
          <select
            value={toUnit.id}
            onChange={(e) => {
              const u = category.units.find((x) => x.id === e.target.value)!;
              setToId(u.id);
              updateFromLeft(leftVal, fromUnit, u);
            }}
            className="toy-input py-2.5 font-semibold text-sm"
          >
            {category.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.symbol})
              </option>
            ))}
          </select>
          <input
            type="number"
            step="any"
            value={rightVal}
            onChange={(e) => updateFromRight(e.target.value)}
            className="toy-input font-mono font-bold text-2xl py-3 text-[#DC2626]"
          />
        </div>
      </div>

      {/* All Equivalent Units Table */}
      {baseNumber !== null && (
        <div className="toy-panel p-4">
          <h3 className="font-display font-bold text-sm text-[#3B2314] mb-3">
            All {category.label} Equivalents for {leftVal} {fromUnit.symbol}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {category.units.map((u) => {
              const converted = formatUnitValue(u.fromBase(baseNumber));
              return (
                <div
                  key={u.id}
                  onClick={() => {
                    soundEngine.playClick();
                    setToId(u.id);
                    setRightVal(converted);
                  }}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 border cursor-pointer transition-colors ${
                    u.id === toUnit.id
                      ? 'bg-[#FEF3C7] border-[#D97706]'
                      : 'bg-[#FFFDF9] border-[#E6C79C] hover:bg-[#FFF6E5]'
                  }`}
                >
                  <span className="text-xs font-semibold text-[#6E4928] truncate">{u.name}</span>
                  <span className="font-mono text-xs sm:text-sm font-bold text-[#3B2314] shrink-0">
                    {converted} <span className="text-[#9A6B3E]">{u.symbol}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
