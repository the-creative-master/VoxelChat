import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { soundEngine } from '../../utils/soundEngine';

const ACTIVITY_LEVELS = [
  { label: 'Sedentary', desc: 'Little or no exercise, desk job', mult: 1.2 },
  { label: 'Lightly Active', desc: 'Light exercise 1–3 days/week', mult: 1.375 },
  { label: 'Moderately Active', desc: 'Moderate exercise 3–5 days/week', mult: 1.55 },
  { label: 'Very Active', desc: 'Hard training 6–7 days/week', mult: 1.725 },
  { label: 'Extra Active', desc: 'Very intense exercise or physical job', mult: 1.9 },
];

function getBmiCategory(bmi: number): { label: string; color: string; bg: string } {
  if (bmi < 18.5) return { label: 'Underweight', color: '#1D4ED8', bg: '#DBEAFE' };
  if (bmi < 25) return { label: 'Normal Weight', color: '#15803D', bg: '#DCFCE7' };
  if (bmi < 30) return { label: 'Overweight', color: '#B45309', bg: '#FEF3C7' };
  return { label: 'Obesity', color: '#B91C1C', bg: '#FEE2E2' };
}

export default function BodyCalculatorTool() {
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [age, setAge] = useState('28');

  // Metric inputs
  const [weightKg, setWeightKg] = useState('72');
  const [heightCm, setHeightCm] = useState('176');
  const [neckCm, setNeckCm] = useState('38');
  const [waistCm, setWaistCm] = useState('82');
  const [hipCm, setHipCm] = useState('96');

  // Imperial inputs
  const [weightLbs, setWeightLbs] = useState('158.7');
  const [heightFt, setHeightFt] = useState('5');
  const [heightIn, setHeightIn] = useState('9.3');
  const [neckIn, setNeckIn] = useState('15');
  const [waistIn, setWaistIn] = useState('32.3');
  const [hipIn, setHipIn] = useState('37.8');

  const switchUnit = (next: 'metric' | 'imperial') => {
    if (next === unit) return;
    soundEngine.playPop(1.06);
    if (next === 'imperial') {
      const kg = Number.parseFloat(weightKg) || 70;
      const cm = Number.parseFloat(heightCm) || 175;
      const totalIn = cm / 2.54;
      const ft = Math.floor(totalIn / 12);
      const remIn = totalIn - ft * 12;
      setWeightLbs((kg * 2.20462262).toFixed(1));
      setHeightFt(String(ft));
      setHeightIn(remIn.toFixed(1));
      setNeckIn(((Number.parseFloat(neckCm) || 38) / 2.54).toFixed(1));
      setWaistIn(((Number.parseFloat(waistCm) || 82) / 2.54).toFixed(1));
      setHipIn(((Number.parseFloat(hipCm) || 96) / 2.54).toFixed(1));
    } else {
      const lbs = Number.parseFloat(weightLbs) || 154;
      const totalIn = (Number.parseFloat(heightFt) || 5) * 12 + (Number.parseFloat(heightIn) || 9);
      setWeightKg((lbs / 2.20462262).toFixed(1));
      setHeightCm((totalIn * 2.54).toFixed(1));
      setNeckCm(((Number.parseFloat(neckIn) || 15) * 2.54).toFixed(1));
      setWaistCm(((Number.parseFloat(waistIn) || 32) * 2.54).toFixed(1));
      setHipCm(((Number.parseFloat(hipIn) || 38) * 2.54).toFixed(1));
    }
    setUnit(next);
  };

  const metrics = useMemo(() => {
    const a = Math.max(10, Math.min(120, Number.parseFloat(age) || 28));
    const kg =
      unit === 'metric'
        ? Number.parseFloat(weightKg)
        : Number.parseFloat(weightLbs) / 2.20462262;
    const cm =
      unit === 'metric'
        ? Number.parseFloat(heightCm)
        : ((Number.parseFloat(heightFt) || 0) * 12 + (Number.parseFloat(heightIn) || 0)) * 2.54;
    const neck =
      unit === 'metric' ? Number.parseFloat(neckCm) : Number.parseFloat(neckIn) * 2.54;
    const waist =
      unit === 'metric' ? Number.parseFloat(waistCm) : Number.parseFloat(waistIn) * 2.54;
    const hip =
      unit === 'metric' ? Number.parseFloat(hipCm) : Number.parseFloat(hipIn) * 2.54;

    if (!(kg > 0 && cm > 50)) return null;

    const hMeters = cm / 100;
    const totalInches = cm / 2.54;

    // 1. BMI
    const bmi = kg / (hMeters * hMeters);

    // 2. BMR (Mifflin-St Jeor equation)
    const bmr = 10 * kg + 6.25 * cm - 5 * a + (sex === 'male' ? 5 : -161);

    // 3. Body Fat % (Standard U.S. Navy circumference formula using cm & log10)
    let bodyFat: number | null = null;
    if (sex === 'male' && waist > neck && neck > 0) {
      const bf =
        495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(cm)) - 450;
      if (Number.isFinite(bf) && bf > 1 && bf < 75) bodyFat = bf;
    } else if (sex === 'female' && waist + hip > neck && neck > 0) {
      const bf =
        495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.221 * Math.log10(cm)) - 450;
      if (Number.isFinite(bf) && bf > 2 && bf < 80) bodyFat = bf;
    }

    // 4. Ideal Weight: Devine (1974) & Robinson (1983) formulas
    const inchesOver5Ft = Math.max(0, totalInches - 60);
    const devineKg = (sex === 'male' ? 50 : 45.5) + 2.3 * inchesOver5Ft;
    const robinsonKg =
      sex === 'male' ? 52 + 1.9 * inchesOver5Ft : 49 + 1.7 * inchesOver5Ft;
    const healthyMinKg = 18.5 * hMeters * hMeters;
    const healthyMaxKg = 24.9 * hMeters * hMeters;

    return {
      bmi,
      bmiCat: getBmiCategory(bmi),
      bmr,
      bodyFat,
      fatMassKg: bodyFat !== null ? kg * (bodyFat / 100) : null,
      leanMassKg: bodyFat !== null ? kg * (1 - bodyFat / 100) : null,
      devineKg,
      robinsonKg,
      healthyMinKg,
      healthyMaxKg,
    };
  }, [
    unit,
    sex,
    age,
    weightKg,
    heightCm,
    neckCm,
    waistCm,
    hipCm,
    weightLbs,
    heightFt,
    heightIn,
    neckIn,
    waistIn,
    hipIn,
  ]);

  const fmtWeight = (kg: number) =>
    unit === 'metric' ? `${kg.toFixed(1)} kg` : `${(kg * 2.20462262).toFixed(1)} lbs`;

  // Position BMI needle on [14..40] scale
  const bmiPct = metrics ? Math.min(98, Math.max(2, ((metrics.bmi - 14) / (40 - 14)) * 100)) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Inputs Panel */}
        <div className="lg:col-span-5 toy-panel p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Unit Toggle */}
            <div className="inline-flex rounded-xl bg-[#F3DFC1] p-1 border border-[#D4AA78]">
              {(['metric', 'imperial'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => switchUnit(u)}
                  className={`px-3 py-1 rounded-lg font-display font-bold text-xs capitalize cursor-pointer ${
                    unit === u ? 'bg-[#EF4444] text-white' : 'text-[#6E4928]'
                  }`}
                >
                  {u === 'metric' ? 'Metric (kg / cm)' : 'Imperial (lbs / ft-in)'}
                </button>
              ))}
            </div>

            {/* Sex Toggle */}
            <div className="inline-flex rounded-xl bg-[#F3DFC1] p-1 border border-[#D4AA78]">
              {(['male', 'female'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setSex(s);
                  }}
                  className={`px-3 py-1 rounded-lg font-display font-bold text-xs capitalize cursor-pointer ${
                    sex === s ? 'bg-[#3B2314] text-white' : 'text-[#6E4928]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6E4928] mb-1">Age (years)</label>
              <input
                type="number"
                min="10"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="toy-input py-2 font-mono font-bold text-sm"
              />
            </div>

            {unit === 'metric' ? (
              <div>
                <label className="block text-xs font-bold text-[#6E4928] mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="toy-input py-2 font-mono font-bold text-sm"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-[#6E4928] mb-1">Weight (lbs)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightLbs}
                  onChange={(e) => setWeightLbs(e.target.value)}
                  className="toy-input py-2 font-mono font-bold text-sm"
                />
              </div>
            )}
          </div>

          {unit === 'metric' ? (
            <div>
              <label className="block text-xs font-bold text-[#6E4928] mb-1">Height (cm)</label>
              <input
                type="number"
                step="0.1"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="toy-input py-2 font-mono font-bold text-sm"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#6E4928] mb-1">Height (ft)</label>
                <input
                  type="number"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                  className="toy-input py-2 font-mono font-bold text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#6E4928] mb-1">Height (in)</label>
                <input
                  type="number"
                  step="0.1"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  className="toy-input py-2 font-mono font-bold text-sm"
                />
              </div>
            </div>
          )}

          {/* U.S. Navy Circumference Measurements */}
          <div className="pt-2 border-t border-[#E6C79C]">
            <div className="text-xs font-display font-bold text-[#3B2314] mb-2">
              Circumferences for U.S. Navy Body Fat ({unit === 'metric' ? 'cm' : 'in'})
            </div>
            <div className={`grid ${sex === 'female' ? 'grid-cols-3' : 'grid-cols-2'} gap-2.5`}>
              <div>
                <label className="block text-[11px] font-semibold text-[#7A5433] mb-1">Neck</label>
                <input
                  type="number"
                  step="0.1"
                  value={unit === 'metric' ? neckCm : neckIn}
                  onChange={(e) =>
                    unit === 'metric' ? setNeckCm(e.target.value) : setNeckIn(e.target.value)
                  }
                  className="toy-input py-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#7A5433] mb-1">Waist</label>
                <input
                  type="number"
                  step="0.1"
                  value={unit === 'metric' ? waistCm : waistIn}
                  onChange={(e) =>
                    unit === 'metric' ? setWaistCm(e.target.value) : setWaistIn(e.target.value)
                  }
                  className="toy-input py-1.5 font-mono text-sm"
                />
              </div>
              {sex === 'female' && (
                <div>
                  <label className="block text-[11px] font-semibold text-[#7A5433] mb-1">Hip</label>
                  <input
                    type="number"
                    step="0.1"
                    value={unit === 'metric' ? hipCm : hipIn}
                    onChange={(e) =>
                      unit === 'metric' ? setHipCm(e.target.value) : setHipIn(e.target.value)
                    }
                    className="toy-input py-1.5 font-mono text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Computed Metrics Dashboard */}
        <div className="lg:col-span-7 space-y-4">
          {!metrics ? (
            <div className="toy-panel p-6 text-sm text-[#7A5433]">
              Enter positive height and weight values to compute body metrics.
            </div>
          ) : (
            <>
              {/* BMI Card with Visual Category Scale */}
              <div className="toy-card p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <div className="text-xs font-bold text-[#7A5433]">Body Mass Index (BMI)</div>
                    <div className="font-mono font-bold text-3xl text-[#3B2314]">
                      {metrics.bmi.toFixed(1)}{' '}
                      <span className="text-xs font-normal text-[#8B5A2B]">kg/m²</span>
                    </div>
                  </div>
                  <span
                    className="px-3.5 py-1.5 rounded-full font-display font-bold text-xs border-2"
                    style={{
                      backgroundColor: metrics.bmiCat.bg,
                      color: metrics.bmiCat.color,
                      borderColor: metrics.bmiCat.color,
                    }}
                  >
                    {metrics.bmiCat.label}
                  </span>
                </div>

                {/* Color-coded BMI scale [14 .. 40] */}
                <div className="relative pt-2 pb-1">
                  <div className="h-4 rounded-full overflow-hidden flex border-2 border-[#6B3A19]">
                    <div className="bg-[#60A5FA]" style={{ width: '17.3%' }} title="Underweight <18.5" />
                    <div className="bg-[#4ADE80]" style={{ width: '25%' }} title="Normal 18.5-24.9" />
                    <div className="bg-[#FBBF24]" style={{ width: '19.2%' }} title="Overweight 25-29.9" />
                    <div className="bg-[#F87171] flex-1" title="Obesity ≥30" />
                  </div>
                  <div
                    className="absolute top-0.5 -translate-x-1/2 w-3.5 h-7 rounded-full bg-[#3B2314] border-2 border-white shadow transition-all"
                    style={{ left: `${bmiPct}%` }}
                  />
                  <div className="flex justify-between text-[10px] font-mono text-[#7A5433] mt-1.5">
                    <span>14</span>
                    <span>18.5</span>
                    <span>25</span>
                    <span>30</span>
                    <span>40+</span>
                  </div>
                </div>
              </div>

              {/* BMR, U.S. Navy Body Fat %, and Ideal Weight Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="toy-card p-4">
                  <div className="text-[11px] font-bold text-[#7A5433]">
                    BMR (Mifflin-St Jeor)
                  </div>
                  <div className="font-mono font-bold text-2xl text-[#DC2626] mt-1">
                    {Math.round(metrics.bmr).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#6E4928]">kcal / day at rest</div>
                </div>

                <div className="toy-card p-4">
                  <div className="text-[11px] font-bold text-[#7A5433]">U.S. Navy Body Fat</div>
                  <div className="font-mono font-bold text-2xl text-[#B45309] mt-1">
                    {metrics.bodyFat !== null ? `${metrics.bodyFat.toFixed(1)}%` : '—'}
                  </div>
                  <div className="text-[11px] text-[#6E4928]">
                    {metrics.leanMassKg !== null && metrics.fatMassKg !== null
                      ? `Lean ${fmtWeight(metrics.leanMassKg)} • Fat ${fmtWeight(metrics.fatMassKg)}`
                      : 'Check neck/waist inputs'}
                  </div>
                </div>

                <div className="toy-card p-4">
                  <div className="text-[11px] font-bold text-[#7A5433]">Ideal Weight Range</div>
                  <div className="font-mono text-xs font-bold text-[#3B2314] mt-1 space-y-0.5">
                    <div>Devine: {fmtWeight(metrics.devineKg)}</div>
                    <div>Robinson: {fmtWeight(metrics.robinsonKg)}</div>
                    <div className="text-[#15803D]">
                      BMI 18.5–24.9: {fmtWeight(metrics.healthyMinKg)}–{fmtWeight(metrics.healthyMaxKg)}
                    </div>
                  </div>
                </div>
              </div>

              {/* TDEE Across 5 Activity Levels */}
              <div className="toy-card p-4">
                <h4 className="font-display font-bold text-sm text-[#3B2314] mb-2.5">
                  Daily Energy Expenditure (TDEE — 5 Activity Levels)
                </h4>
                <div className="space-y-1.5">
                  {ACTIVITY_LEVELS.map((lvl) => {
                    const kcal = Math.round(metrics.bmr * lvl.mult);
                    return (
                      <div
                        key={lvl.label}
                        className="flex items-center justify-between gap-2 rounded-xl bg-[#FFF8EB] border border-[#E6C79C] px-3 py-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-[#3B2314]">{lvl.label}</span>{' '}
                          <span className="text-[#8B5A2B] hidden sm:inline">— {lvl.desc}</span>
                        </div>
                        <span className="font-mono font-bold text-sm text-[#3B2314] shrink-0">
                          {kcal.toLocaleString()} kcal/day
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mandatory General-Information Disclaimer */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-[#FFF8EB] border-2 border-[#E2C6A2] px-4 py-3 text-xs text-[#6E4928]">
        <Info className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
        <p>
          <strong>General Information Disclaimer:</strong> BMI, Mifflin–St Jeor BMR/TDEE, U.S. Navy
          body fat, and Devine/Robinson ideal weight formulas provide statistical estimates for
          educational and general informational purposes only. They do not account for individual
          muscle mass, bone density, or medical conditions and are not a substitute for professional
          medical advice.
        </p>
      </div>
    </div>
  );
}
