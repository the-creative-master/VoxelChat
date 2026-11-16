import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, KeyRound, Lock, Pause, Play, RotateCcw, Unlock, Volume2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, StatChip, EmptyHint } from '../coding/shared';
import { GhostButton, Slider } from './shared';

/* =========================================================================
   Cipher / Morse / Caesar Translator
   Morse with real WebAudio playback, Caesar with a live brute-force table,
   ROT13, Atbash, A1Z26, binary, hex and base64 — all bidirectional.
   ========================================================================= */

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....',
  '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', '(': '-.--.',
  ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-',
  _: '..--.-', '"': '.-..-.', $: '...-..-', '@': '.--.-.',
};
const MORSE_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE).map(([k, v]) => [v, k])
);

const toMorse = (text: string) =>
  text
    .toUpperCase()
    .split(/\s+/)
    .map((word) =>
      Array.from(word)
        .map((c) => MORSE[c] ?? '')
        .filter(Boolean)
        .join(' ')
    )
    .join(' / ');

const fromMorse = (text: string) => {
  const unknown: string[] = [];
  const words = text.trim().split(/\s*\/\s*/);
  const out = words.map((word) =>
    word
      .trim()
      .split(/\s+/)
      .map((code) => {
        if (!code) return '';
        const ch = MORSE_REVERSE[code];
        if (!ch) {
          unknown.push(code);
          return '?';
        }
        return ch;
      })
      .join('')
  );
  return { text: out.join(' '), unknown };
};

const caesar = (text: string, shift: number): string => {
  const s = ((shift % 26) + 26) % 26;
  return Array.from(text)
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + s) % 26) + 65);
      if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + s) % 26) + 97);
      return c;
    })
    .join('');
};

const atbash = (text: string) =>
  Array.from(text)
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCharCode(90 - (code - 65));
      if (code >= 97 && code <= 122) return String.fromCharCode(122 - (code - 97));
      return c;
    })
    .join('');

const rot13 = (text: string) => caesar(text, 13);

const toA1Z26 = (text: string) =>
  text
    .toLowerCase()
    .split(/\s+/)
    .map((w) =>
      Array.from(w)
        .filter((c) => c >= 'a' && c <= 'z')
        .map((c) => c.charCodeAt(0) - 96)
        .join('-')
    )
    .filter(Boolean)
    .join(' ');

const fromA1Z26 = (text: string) => {
  const words = text.trim().split(/\s+/);
  return words
    .map((w) =>
      w
        .split(/[-,.]/)
        .map((n) => {
          const v = parseInt(n, 10);
          return v >= 1 && v <= 26 ? String.fromCharCode(96 + v) : '';
        })
        .join('')
    )
    .join(' ');
};

const toBinary = (text: string) =>
  Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(2).padStart(8, '0'))
    .join(' ');

const fromBinary = (text: string) => {
  const bits = text.replace(/[^01]/g, '');
  if (bits.length % 8 !== 0) {
    const padded = bits.padStart(Math.ceil(bits.length / 8) * 8, '0');
    const bytes = new Uint8Array(padded.match(/.{8}/g)?.map((b) => parseInt(b, 2)) ?? []);
    return new TextDecoder().decode(bytes);
  }
  const bytes = new Uint8Array(bits.match(/.{8}/g)?.map((b) => parseInt(b, 2)) ?? []);
  return new TextDecoder().decode(bytes);
};

const toHex = (text: string) =>
  Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');

const fromHex = (text: string) => {
  const clean = text.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) return 'Hex needs an even number of digits';
  const bytes = new Uint8Array(clean.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? []);
  return new TextDecoder().decode(bytes);
};

const toBase64 = (text: string) => {
  try {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  } catch {
    return 'Could not encode that text';
  }
};

const fromBase64 = (text: string) => {
  try {
    const bin = atob(text.replace(/\s+/g, ''));
    const bytes = new Uint8Array(Array.from(bin, (c) => c.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
  } catch {
    return 'That is not valid Base64';
  }
};

const URL_SAFE = (text: string) => {
  try {
    return encodeURIComponent(text);
  } catch {
    return 'Could not encode';
  }
};
const URL_UNSAFE = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return 'That is not valid percent-encoding';
  }
};

type CipherId = 'morse' | 'caesar' | 'rot13' | 'atbash' | 'a1z26' | 'binary' | 'hex' | 'base64' | 'url';

const CIPHERS: { id: CipherId; label: string; sample: string; bidirectional: boolean; note: string }[] = [
  { id: 'morse', label: 'Morse code', sample: '.... . .-.. .-.. ---', bidirectional: true, note: 'Dots, dashes and / between words' },
  { id: 'caesar', label: 'Caesar shift', sample: 'KHOOR', bidirectional: true, note: 'Shift the alphabet by N places' },
  { id: 'rot13', label: 'ROT13', sample: 'Uryyb', bidirectional: true, note: 'The classic 13-place self-inverse' },
  { id: 'atbash', label: 'Atbash', sample: 'Svool', bidirectional: true, note: 'A↔Z mirror alphabet' },
  { id: 'a1z26', label: 'A1Z26', sample: '8-5-12-12-15', bidirectional: true, note: 'Letters as numbers 1–26' },
  { id: 'binary', label: 'Binary (UTF-8)', sample: '01001000 01101001', bidirectional: true, note: '8-bit bytes of the UTF-8 encoding' },
  { id: 'hex', label: 'Hex bytes', sample: '48 69', bidirectional: true, note: 'UTF-8 bytes in hexadecimal' },
  { id: 'base64', label: 'Base64', sample: 'SGVsbG8=', bidirectional: true, note: 'Unicode-safe Base64' },
  { id: 'url', label: 'URL encode', sample: 'Hello%20world', bidirectional: false, note: 'Percent-encoding for links' },
];

const SAMPLE = 'Hello, friend';

export const CipherTranslatorTool: React.FC = () => {
  const [cipher, setCipher] = useState<CipherId>('morse');
  const [direction, setDirection] = useState<'encode' | 'decode'>('encode');
  const [input, setInput] = useState(SAMPLE);
  const [shift, setShift] = useState(3);
  const [wpm, setWpm] = useState(18);
  const [playing, setPlaying] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef(false);
  const timeoutsRef = useRef<number[]>([]);

  const activeCipher = CIPHERS.find((c) => c.id === cipher)!;

  const output = useMemo(() => {
    const enc = direction === 'encode';
    switch (cipher) {
      case 'morse':
        return enc ? toMorse(input) : fromMorse(input).text;
      case 'caesar':
        return caesar(input, enc ? shift : -shift);
      case 'rot13':
        return rot13(input);
      case 'atbash':
        return atbash(input);
      case 'a1z26':
        return enc ? toA1Z26(input) : fromA1Z26(input);
      case 'binary':
        return enc ? toBinary(input) : fromBinary(input);
      case 'hex':
        return enc ? toHex(input) : fromHex(input);
      case 'base64':
        return enc ? toBase64(input) : fromBase64(input);
      case 'url':
        return enc ? URL_SAFE(input) : URL_UNSAFE(input);
      default:
        return input;
    }
  }, [cipher, direction, input, shift]);

  const morseWarnings = useMemo(
    () => (cipher === 'morse' && direction === 'decode' ? fromMorse(input).unknown : []),
    [cipher, direction, input]
  );

  const bruteForce = useMemo(() => {
    if (cipher !== 'caesar') return [];
    const base = direction === 'encode' ? input : caesar(input, -1);
    return Array.from({ length: 26 }, (_, i) => {
      const shiftAmount = direction === 'encode' ? -1 - i : i + 1;
      return { shift: ((shiftAmount % 26) + 26) % 26, text: caesar(base, shiftAmount) };
    });
  }, [cipher, direction, input]);

  const stopPlayback = () => {
    stopRef.current = true;
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setPlaying(false);
  };

  useEffect(() => stopPlayback, []); // eslint-disable-line react-hooks/exhaustive-deps

  const playMorse = async () => {
    const code = direction === 'encode' ? output : input;
    if (!code || playing) return;
    stopRef.current = false;
    setPlaying(true);
    soundEngine.playPop(1.1);

    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      setPlaying(false);
      return;
    }
    const ctx = new AudioCtor();
    audioCtxRef.current = ctx;
    const unit = 1.2 / Math.max(5, wpm); // seconds per dot

    let t = ctx.currentTime + 0.08;
    const schedule = (start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 620;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.008);
      gain.gain.setValueAtTime(0.22, start + dur - 0.008);
      gain.gain.linearRampToValueAtTime(0, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.01);
    };

    for (const ch of code) {
      if (ch === '.') {
        schedule(t, unit);
        t += unit * 2;
      } else if (ch === '-') {
        schedule(t, unit * 3);
        t += unit * 4;
      } else if (ch === ' ') {
        t += unit * 2;
      } else if (ch === '/') {
        t += unit * 4;
      }
    }

    const totalMs = (t - ctx.currentTime) * 1000;
    const timer = window.setTimeout(() => {
      stopRef.current = true;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      setPlaying(false);
    }, Math.max(0, totalMs));
    timeoutsRef.current.push(timer);
  };

  return (
    <div className="space-y-3">
      <Panel
        title="Cipher"
        icon={<KeyRound className="h-4 w-4" />}
        actions={
          <button
            type="button"
            onClick={() => {
              setDirection(direction === 'encode' ? 'decode' : 'encode');
              soundEngine.playPop(1.08);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-b-[4px] border-[#1E40AF] bg-[#3B82F6] px-2.5 py-1.5 font-display text-[11px] font-bold text-white transition active:translate-y-[2px] active:border-b-2"
          >
            {direction === 'encode' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {direction === 'encode' ? 'Encoding' : 'Decoding'}
            <ArrowLeftRight className="h-3 w-3 opacity-80" />
          </button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {CIPHERS.map((c) => {
            const on = cipher === c.id;
            return (
              <button
                key={c.id}
                type="button"
                title={c.note}
                onClick={() => {
                  setCipher(c.id);
                  soundEngine.playPop(1.06);
                }}
                aria-pressed={on}
                className={`rounded-lg border-2 border-b-[4px] px-2.5 py-1.5 text-left transition active:translate-y-[2px] active:border-b-2 ${
                  on
                    ? 'border-[#1E40AF] bg-[#3B82F6] text-white'
                    : 'border-[#BFDBFE] bg-white text-[#1E3A8A] hover:border-[#3B82F6]'
                }`}
              >
                <span className="block font-display text-[11.5px] font-bold leading-tight">{c.label}</span>
                <span className={`block font-mono text-[9.5px] ${on ? 'text-white/80' : 'text-[#64748B]'}`}>
                  {c.sample}
                </span>
              </button>
            );
          })}
        </div>

        {cipher === 'caesar' && (
          <div className="mt-2.5 max-w-xs">
            <Slider
              label="Shift"
              value={shift}
              min={1}
              max={25}
              onChange={(v) => {
                setShift(v);
              }}
              hint={`A → ${caesar('A', shift)} · self-inverse when 13`}
            />
          </div>
        )}

        {cipher === 'morse' && (
          <div className="mt-2.5 max-w-xs">
            <Slider label="Playback speed" value={wpm} min={5} max={40} suffix=" wpm" onChange={setWpm} />
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title={direction === 'encode' ? 'Plain text' : 'Cipher text'}
          icon={<Lock className="h-4 w-4" />}
          actions={<StatChip label="chars" value={input.length} />}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={8}
            spellCheck={false}
            className="w-full resize-y rounded-lg border-2 border-[#BFDBFE] bg-white p-2.5 font-mono text-[12.5px] leading-relaxed text-[#1E293B] outline-none focus:border-[#3B82F6]"
            placeholder={direction === 'encode' ? 'Type the message to encode…' : 'Paste the cipher text…'}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <GhostButton onClick={() => setInput(SAMPLE)}>Sample</GhostButton>
            <GhostButton onClick={() => setInput('')} disabled={!input}>
              Clear
            </GhostButton>
            <GhostButton
              onClick={() => {
                setInput(output);
                setDirection(direction === 'encode' ? 'decode' : 'encode');
                soundEngine.playSuccess();
              }}
              disabled={!output}
              title="Swap input and output"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Swap
            </GhostButton>
            {cipher === 'morse' && (
              <button
                type="button"
                onClick={() => (playing ? stopPlayback() : void playMorse())}
                className="toy-btn-cream px-3 py-2 text-xs"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? 'Stop' : 'Play audio'}
              </button>
            )}
          </div>
          {morseWarnings.length > 0 && (
            <p className="mt-1.5 text-[10.5px] font-semibold text-[#B45309]">
              Unrecognised Morse codes: {morseWarnings.slice(0, 6).join(' · ')}
            </p>
          )}
        </Panel>

        <Panel
          title={direction === 'encode' ? 'Encoded' : 'Decoded'}
          icon={<Unlock className="h-4 w-4" />}
          actions={
            <div className="flex items-center gap-1.5">
              {cipher === 'morse' && output && (
                <span className="hidden items-center gap-1 text-[10px] font-bold text-[#64748B] sm:inline-flex">
                  <Volume2 className="h-3 w-3" /> {output.length} symbols
                </span>
              )}
              <CopyButton text={output} label="Copy" size="sm" />
            </div>
          }
        >
          <div
            className="min-h-[9rem] w-full select-all overflow-auto rounded-lg border-2 border-[#86EFAC] bg-[#F0FDF4] p-2.5 font-mono text-[13px] leading-relaxed text-[#14532D]"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {output || <span className="text-[12px] italic text-[#64748B]">Result appears here</span>}
          </div>
          <p className="mt-1.5 text-[10px] font-semibold text-[#64748B]">{activeCipher.note}</p>
        </Panel>
      </div>

      {cipher === 'caesar' && (
        <Panel
          title="Brute force — all 26 shifts"
          icon={<KeyRound className="h-4 w-4" />}
          actions={<span className="font-mono text-[10.5px] text-[#64748B]">click a row to use it</span>}
        >
          <div className="max-h-64 overflow-auto rounded-lg border border-[#DBEAFE]">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-[#EFF6FF]">
                <tr>
                  <th className="px-2 py-1 font-bold text-[#1E3A8A]">Shift</th>
                  <th className="px-2 py-1 font-bold text-[#1E3A8A]">Result</th>
                </tr>
              </thead>
              <tbody>
                {bruteForce.map((row) => (
                  <tr
                    key={row.shift}
                    onClick={() => {
                      setShift(row.shift === 0 ? 26 : row.shift);
                      soundEngine.playPop(1.04);
                    }}
                    className={`cursor-pointer border-t border-[#DBEAFE] ${
                      shift === row.shift ? 'bg-[#DBEAFE] font-bold' : 'hover:bg-[#F8FAFF]'
                    }`}
                  >
                    <td className="w-14 px-2 py-1 font-mono text-[#1E40AF]">{row.shift}</td>
                    <td className="truncate px-2 py-1 font-mono text-[#1E293B]">{row.text.slice(0, 90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <EmptyHint>
            The right shift usually jumps out as readable English — Caesar has only 25 keys, so brute force beats
            guessing.
          </EmptyHint>
        </Panel>
      )}
    </div>
  );
};

export default CipherTranslatorTool;
