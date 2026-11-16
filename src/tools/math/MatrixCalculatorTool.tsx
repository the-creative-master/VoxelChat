import React, { useState } from 'react';
import { ArrowLeftRight, Shuffle } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';

type MatSize = 2 | 3 | 4;
type Mat = number[][];

function makeIdentity(n: MatSize): Mat {
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (r === c ? 1 : 0))
  );
}

function resizeMat(m: string[][], n: MatSize, fallback: (r: number, c: number) => string): string[][] {
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => m[r]?.[c] ?? fallback(r, c))
  );
}

function parseMat(raw: string[][]): Mat {
  return raw.map((row) => row.map((v) => Number.parseFloat(v) || 0));
}

function transpose(a: Mat): Mat {
  const n = a.length;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => a[c][r]));
}

function multiply(a: Mat, b: Mat): Mat {
  const n = a.length;
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => {
      let s = 0;
      for (let k = 0; k < n; k++) s += a[r][k] * b[k][c];
      return Math.abs(s) < 1e-12 ? 0 : s;
    })
  );
}

/** Gauss-Jordan elimination returning determinant & inverse (null if singular) */
function detAndInverse(a: Mat): { det: number; inv: Mat | null } {
  const n = a.length;
  const aug = a.map((row, r) => [
    ...row.map((v) => v),
    ...makeIdentity(n as MatSize)[r],
  ]);

  let det = 1;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(aug[pivotRow][col]) < 1e-12) {
      return { det: 0, inv: null };
    }
    if (pivotRow !== col) {
      [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
      det = -det;
    }
    const pivot = aug[col][col];
    det *= pivot;
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let j = 0; j < 2 * n; j++) {
        aug[r][j] -= factor * aug[col][j];
      }
    }
  }

  const inv = aug.map((row) =>
    row.slice(n).map((v) => (Math.abs(v) < 1e-12 ? 0 : v))
  );
  return { det: Math.abs(det) < 1e-12 ? 0 : det, inv };
}

function fmtCell(v: number): string {
  if (Math.abs(v) < 1e-12) return '0';
  return String(Number.parseFloat(v.toFixed(5)));
}

export default function MatrixCalculatorTool() {
  const [size, setSize] = useState<MatSize>(3);
  const [matA, setMatA] = useState<string[][]>([
    ['2', '1', '0'],
    ['1', '3', '1'],
    ['0', '2', '5'],
  ]);
  const [matB, setMatB] = useState<string[][]>([
    ['4', '-1', '2'],
    ['0', '3', '1'],
    ['5', '2', '-1'],
  ]);
  const [scalar, setScalar] = useState('3');
  const [result, setResult] = useState<{
    title: string;
    matrix?: Mat;
    scalarValue?: number;
    error?: string;
  }>(() => {
    const a = [
      [2, 1, 0],
      [1, 3, 1],
      [0, 2, 5],
    ];
    const b = [
      [4, -1, 2],
      [0, 3, 1],
      [5, 2, -1],
    ];
    return { title: 'Matrix Multiplication (A × B)', matrix: multiply(a, b) };
  });

  const handleSizeChange = (n: MatSize) => {
    soundEngine.playPop(1.06);
    setSize(n);
    setMatA((prev) => resizeMat(prev, n, (r, c) => (r === c ? '1' : '0')));
    setMatB((prev) => resizeMat(prev, n, (r, c) => (r === c ? '1' : '0')));
  };

  const runOp = (op: 'add' | 'sub' | 'mul' | 'scalar' | 'transA' | 'detA' | 'invA' | 'detB' | 'invB') => {
    soundEngine.playPop(1.08);
    const A = parseMat(matA);
    const B = parseMat(matB);
    const k = Number.parseFloat(scalar) || 0;

    if (op === 'add') {
      setResult({
        title: 'Addition (A + B)',
        matrix: A.map((row, r) => row.map((v, c) => v + B[r][c])),
      });
    } else if (op === 'sub') {
      setResult({
        title: 'Subtraction (A − B)',
        matrix: A.map((row, r) => row.map((v, c) => v - B[r][c])),
      });
    } else if (op === 'scalar') {
      setResult({
        title: `Scalar Multiplication (${k} · A)`,
        matrix: A.map((row) => row.map((v) => v * k)),
      });
    } else if (op === 'mul') {
      setResult({ title: 'Matrix Multiplication (A × B)', matrix: multiply(A, B) });
    } else if (op === 'transA') {
      setResult({ title: 'Transpose (Aᵀ)', matrix: transpose(A) });
    } else if (op === 'detA' || op === 'detB') {
      const target = op === 'detA' ? A : B;
      const { det } = detAndInverse(target);
      setResult({
        title: `Determinant det(${op === 'detA' ? 'A' : 'B'})`,
        scalarValue: det,
      });
    } else if (op === 'invA' || op === 'invB') {
      const label = op === 'invA' ? 'A' : 'B';
      const { det, inv } = detAndInverse(op === 'invA' ? A : B);
      if (!inv) {
        setResult({
          title: `Inverse (${label}⁻¹)`,
          error: `Matrix ${label} is singular (det(${label}) = 0) and has no inverse.`,
        });
      } else {
        setResult({
          title: `Inverse (${label}⁻¹)  [det(${label}) = ${fmtCell(det)}]`,
          matrix: inv,
        });
      }
    }
  };

  const renderGridEditor = (
    label: string,
    grid: string[][],
    setGrid: React.Dispatch<React.SetStateAction<string[][]>>
  ) => (
    <div className="toy-panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-base text-[#3B2314]">
          Matrix {label} ({size}×{size})
        </h3>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setGrid(makeIdentity(size).map((r) => r.map(String)));
            }}
            className="px-2 py-1 rounded-lg bg-[#FFFDF9] border border-[#D4AA78] text-[11px] font-bold text-[#5C3415] cursor-pointer"
          >
            Identity
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setGrid(
                Array.from({ length: size }, () =>
                  Array.from({ length: size }, () => String(Math.floor(Math.random() * 11) - 4))
                )
              );
            }}
            className="px-2 py-1 rounded-lg bg-[#FFFDF9] border border-[#D4AA78] text-[11px] font-bold text-[#5C3415] inline-flex items-center gap-1 cursor-pointer"
          >
            <Shuffle className="w-3 h-3" /> Random
          </button>
        </div>
      </div>

      <div
        className="grid gap-2 p-3 rounded-xl bg-[#FFFDF9] border-x-4 border-[#3B2314]"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <input
              key={`${r}-${c}`}
              type="number"
              step="any"
              value={cell}
              onChange={(e) =>
                setGrid((prev) =>
                  prev.map((pr, ri) =>
                    ri === r ? pr.map((pc, ci) => (ci === c ? e.target.value : pc)) : pr
                  )
                )
              }
              aria-label={`Matrix ${label} row ${r + 1} column ${c + 1}`}
              className="toy-input px-2 py-2 text-center font-mono font-bold text-sm"
            />
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Dimension Selector & Swap */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-[#F6E6CC] p-1 border-2 border-[#DEC098]">
          {([2, 3, 4] as MatSize[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleSizeChange(n)}
              className={`px-4 py-1.5 rounded-lg font-mono font-bold text-xs sm:text-sm cursor-pointer ${
                size === n ? 'bg-[#EF4444] text-white' : 'text-[#6E4928]'
              }`}
            >
              {n} × {n}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            soundEngine.playPop(1.05);
            setMatA(matB);
            setMatB(matA);
          }}
          className="toy-btn-cream px-3.5 py-2 text-xs"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" /> Swap A ↔ B
        </button>
      </div>

      {/* Matrix A & Matrix B Editors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {renderGridEditor('A', matA, setMatA)}
        {renderGridEditor('B', matB, setMatB)}
      </div>

      {/* Operations Deck */}
      <div className="toy-panel p-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => runOp('add')} className="toy-btn-primary px-3.5 py-2 text-xs">
          A + B
        </button>
        <button type="button" onClick={() => runOp('sub')} className="toy-btn-primary px-3.5 py-2 text-xs">
          A − B
        </button>
        <button type="button" onClick={() => runOp('mul')} className="toy-btn-primary px-3.5 py-2 text-xs">
          A × B
        </button>
        <div className="inline-flex items-center gap-1 bg-[#FFFDF9] rounded-xl border border-[#D4AA78] px-2 py-1">
          <span className="font-mono text-xs font-bold text-[#7A5433]">k=</span>
          <input
            type="number"
            step="any"
            value={scalar}
            onChange={(e) => setScalar(e.target.value)}
            className="w-14 font-mono font-bold text-xs text-center bg-[#FFF8EB] rounded border border-[#DEC098] py-1"
          />
          <button type="button" onClick={() => runOp('scalar')} className="toy-btn-gold px-2.5 py-1 text-xs">
            k · A
          </button>
        </div>
        <button type="button" onClick={() => runOp('transA')} className="toy-btn-cream px-3.5 py-2 text-xs font-mono">
          Aᵀ
        </button>
        <button type="button" onClick={() => runOp('detA')} className="toy-btn-cream px-3.5 py-2 text-xs font-mono">
          det(A)
        </button>
        <button type="button" onClick={() => runOp('invA')} className="toy-btn-cream px-3.5 py-2 text-xs font-mono">
          A⁻¹
        </button>
        <button type="button" onClick={() => runOp('detB')} className="toy-btn-cream px-3.5 py-2 text-xs font-mono">
          det(B)
        </button>
        <button type="button" onClick={() => runOp('invB')} className="toy-btn-cream px-3.5 py-2 text-xs font-mono">
          B⁻¹
        </button>
      </div>

      {/* Result Showcase */}
      <div className="toy-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-bold text-lg text-[#3B2314]">{result.title}</h3>
          <div className="flex items-center gap-2">
            {result.matrix && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setMatA(result.matrix!.map((r) => r.map(fmtCell)));
                  }}
                  className="toy-btn-cream px-2.5 py-1 text-xs"
                >
                  Send to A
                </button>
                <CopyButton
                  text={result.matrix.map((r) => r.map(fmtCell).join('\t')).join('\n')}
                  label="Copy Matrix"
                />
              </>
            )}
            {result.scalarValue !== undefined && (
              <CopyButton text={fmtCell(result.scalarValue)} />
            )}
          </div>
        </div>

        {result.error ? (
          <div className="rounded-xl bg-[#FEE2E2] border border-[#EF4444] p-3.5 text-sm font-semibold text-[#991B1B]">
            {result.error}
          </div>
        ) : result.scalarValue !== undefined ? (
          <div className="font-mono font-bold text-3xl text-[#DC2626]">
            {fmtCell(result.scalarValue)}
          </div>
        ) : (
          result.matrix && (
            <div
              className="grid gap-2.5 max-w-md p-4 rounded-xl bg-[#FFF8EB] border-x-4 border-[#DC2626]"
              style={{ gridTemplateColumns: `repeat(${result.matrix.length}, minmax(0, 1fr))` }}
            >
              {result.matrix.map((row, r) =>
                row.map((val, c) => (
                  <div
                    key={`${r}-${c}`}
                    className="rounded-lg bg-[#FFFDF9] border border-[#DEC098] py-2.5 px-2 text-center font-mono font-bold text-sm text-[#3B2314]"
                  >
                    {fmtCell(val)}
                  </div>
                ))
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
