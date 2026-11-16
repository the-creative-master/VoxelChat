import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Clock, KeyRound, ShieldCheck, ShieldX, Timer, Trash2 } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { Panel, ErrorBanner, EmptyHint, StatChip } from './shared';

interface JwtParts {
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  signature: string;
  rawHeader: string;
  rawPayload: string;
  error?: string;
}

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ikxpbm5lYSBXb2xmIiwiaWF0IjoxNzAwMDAwMDAwLCJuYmYiOjE3MDAwMDAwMDAsImV4cCI6MjA0MjAwMDAwMCwiaXNzIjoiaHR0cHM6Ly9iaXRlc2l6ZWR1dGlsaXRpZXMuZGV2IiwiYXVkIjoiY29saWJyYXRlLWNsaWVudCIsInJvbGVzIjpbImRldmVsb3BlciIsImFkbWluIl19.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

function base64UrlDecode(input: string): string {
  const cleaned = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function parseJwt(token: string): JwtParts {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return {
      header: null, payload: null, signature: '', rawHeader: '', rawPayload: '',
      error: `A JWT must have exactly 3 dot-separated segments — this one has ${parts.length}.`,
    };
  }
  try {
    const rawHeader = base64UrlDecode(parts[0]);
    const rawPayload = base64UrlDecode(parts[1]);
    const header = JSON.parse(rawHeader) as Record<string, unknown>;
    const payload = JSON.parse(rawPayload) as Record<string, unknown>;
    return { header, payload, signature: parts[2], rawHeader, rawPayload };
  } catch (err) {
    return { header: null, payload: null, signature: '', rawHeader: '', rawPayload: '', error: err instanceof Error ? err.message : String(err) };
  }
}

function formatRelative(seconds: number): string {
  const abs = Math.abs(seconds);
  const units: [number, string][] = [
    [86400 * 365, 'year'],
    [86400 * 30, 'month'],
    [86400 * 7, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ];
  for (const [size, name] of units) {
    if (abs >= size) {
      const value = Math.floor(abs / size);
      return `${value} ${name}${value === 1 ? '' : 's'}`;
    }
  }
  return '0 seconds';
}

function fmtDateTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

interface TimeClaim {
  key: string;
  label: string;
  value: number;
  status: 'valid' | 'expired' | 'not-yet' | 'info';
  detail: string;
}

const useNow = (): number => {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
};

export const JwtDecoderTool: React.FC = () => {
  const [token, setToken] = useState(SAMPLE_JWT);
  const [secret, setSecret] = useState('');
  const [hmacStatus, setHmacStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const now = useNow();
  const parsed = useMemo(() => parseJwt(token), [token]);

  const timeClaims = useMemo<TimeClaim[]>(() => {
    if (!parsed.payload) return [];
    const out: TimeClaim[] = [];
    const iat = parsed.payload.iat;
    const exp = parsed.payload.exp;
    const nbf = parsed.payload.nbf;
    if (typeof iat === 'number') {
      const future = iat > now + 60;
      out.push({
        key: 'iat',
        label: 'Issued at',
        value: iat,
        status: future ? 'not-yet' : 'info',
        detail: future
          ? `Issued ${formatRelative(iat - now)} in the future — clocks may be skewed (${Math.round(iat - now)}s ahead).`
          : `Issued ${formatRelative(now - iat)} ago.`,
      });
    }
    if (typeof nbf === 'number') {
      const notBefore = nbf > now;
      out.push({
        key: 'nbf',
        label: 'Not before',
        value: nbf,
        status: notBefore ? 'not-yet' : 'valid',
        detail: notBefore ? `Token activates in ${formatRelative(nbf - now)}.` : `Became valid ${formatRelative(now - nbf)} ago.`,
      });
    }
    if (typeof exp === 'number') {
      const expired = exp < now;
      out.push({
        key: 'exp',
        label: 'Expires at',
        value: exp,
        status: expired ? 'expired' : 'valid',
        detail: expired ? `Expired ${formatRelative(now - exp)} ago.` : `Still valid for ${formatRelative(exp - now)}.`,
      });
    }
    return out;
  }, [parsed.payload, now]);

  const verifyHmac = async () => {
    if (!parsed.header || !secret) return;
    const alg = String(parsed.header.alg ?? '').toUpperCase();
    const algoMap: Record<string, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };
    const algorithm = algoMap[alg];
    if (!algorithm) {
      setHmacStatus('invalid');
      return;
    }
    setHmacStatus('checking');
    try {
      const [headerB64, payloadB64] = token.trim().replace(/^Bearer\s+/i, '').split('.');
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign']);
      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
      const bytes = new Uint8Array(signature);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const expected = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const matches = expected === parsed.signature;
      setHmacStatus(matches ? 'valid' : 'invalid');
      if (matches) soundEngine.playSuccess();
      else soundEngine.playLockedRattle?.();
    } catch {
      setHmacStatus('invalid');
    }
  };

  const headerEntries = parsed.header ? Object.entries(parsed.header) : [];
  const payloadEntries = parsed.payload ? Object.entries(parsed.payload) : [];

  return (
    <div className="space-y-3">
      <Panel
        title="Encoded token"
        icon={<KeyRound className="w-3.5 h-3.5" />}
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { soundEngine.playPop(1.12); setToken(SAMPLE_JWT); setHmacStatus('idle'); }}
              className="toy-btn-cream px-2 py-1 text-[10px]"
            >
              Sample
            </button>
            <button
              type="button"
              onClick={() => { soundEngine.playClick(); setToken(''); setSecret(''); setHmacStatus('idle'); }}
              className="toy-btn-cream px-2 py-1 text-[10px] text-[#B91C1C]"
              aria-label="Clear token"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
            <CopyButton text={token} />
          </div>
        }
      >
        <textarea
          value={token}
          onChange={(e) => { setToken(e.target.value); setHmacStatus('idle'); }}
          spellCheck={false}
          aria-label="JWT token"
          className="w-full h-24 rounded-lg bg-[#FFFDF9] border-2 border-[#DEC098] p-2.5 font-mono text-[11px] leading-relaxed break-all text-[#3B2314] focus:outline-none focus:border-[#D97706] resize-none"
          placeholder="Paste a JWT — header.payload.signature"
        />
        {token.trim() && !parsed.error && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            <span className="text-[#B91C1C] break-all">{token.split('.')[0]}</span>
            <span className="text-[#A98768]">.</span>
            <span className="text-[#1D4ED8] break-all">{token.split('.')[1]}</span>
            <span className="text-[#A98768]">.</span>
            <span className="text-[#15803D] break-all">{token.split('.')[2]}</span>
          </div>
        )}
        {parsed.error && <div className="mt-2"><ErrorBanner message={parsed.error} /></div>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {parsed.header && <StatChip label="alg" value={String(parsed.header.alg ?? '—')} tone="gold" />}
          {parsed.header && <StatChip label="typ" value={String(parsed.header.typ ?? '—')} tone="cream" />}
          {parsed.payload && <StatChip label="claims" value={payloadEntries.length} tone="mint" />}
          {parsed.signature && <StatChip label="sig" value={`${parsed.signature.length} chars`} tone="cream" />}
        </div>
      </Panel>

      {parsed.header && parsed.payload && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Panel
              title="Header"
              icon={<span className="text-[10px] font-bold">JOSE</span>}
              actions={<CopyButton text={JSON.stringify(parsed.header, null, 2)} />}
            >
              <table className="w-full text-[11px]">
                <tbody>
                  {headerEntries.map(([k, v]) => (
                    <tr key={k} className="border-b border-[#F0E2CE] last:border-0">
                      <td className="py-1 pr-2 font-mono font-bold text-[#8B5A2B] align-top whitespace-nowrap">{k}</td>
                      <td className="py-1 font-mono text-[#3B2314] break-all">{typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-[#FFF8EB] border border-[#E6C79C] p-2 font-mono text-[10.5px] text-[#6B4423]">{parsed.rawHeader}</pre>
            </Panel>

            <Panel
              title="Payload claims"
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              actions={<CopyButton text={JSON.stringify(parsed.payload, null, 2)} />}
            >
              <div className="max-h-[15rem] overflow-auto">
                <table className="w-full text-[11px]">
                  <tbody>
                    {payloadEntries.map(([k, v]) => (
                      <tr key={k} className="border-b border-[#F0E2CE] last:border-0">
                        <td className="py-1 pr-2 font-mono font-bold text-[#8B5A2B] align-top whitespace-nowrap">{k}</td>
                        <td className="py-1">
                          {typeof v === 'number' && ['iat', 'exp', 'nbf', 'auth_time'].includes(k) ? (
                            <span>
                              <span className="font-mono text-[#1D4ED8]">{v}</span>
                              <span className="ml-1 text-[10px] text-[#A98768]">({fmtDateTime(v)})</span>
                            </span>
                          ) : Array.isArray(v) ? (
                            <div className="flex flex-wrap gap-1">
                              {v.map((item, i) => (
                                <span key={i} className="toy-pill bg-[#EFF6FF] border-[#93C5FD] text-[#1E3A8A] text-[9.5px] font-mono">{String(item)}</span>
                              ))}
                            </div>
                          ) : typeof v === 'object' && v !== null ? (
                            <pre className="font-mono text-[10px] text-[#3B2314] whitespace-pre-wrap break-all">{JSON.stringify(v, null, 2)}</pre>
                          ) : (
                            <span className="font-mono text-[#3B2314] break-all">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <Panel title="Time claim countdowns" icon={<Clock className="w-3.5 h-3.5" />}>
            {timeClaims.length === 0 ? (
              <EmptyHint>This token has no iat, nbf, or exp claims.</EmptyHint>
            ) : (
              <div className="space-y-1.5">
                {timeClaims.map((claim) => (
                  <div
                    key={claim.key}
                    className={`flex flex-wrap items-center gap-2 rounded-lg border-2 px-2.5 py-1.5 ${
                      claim.status === 'expired'
                        ? 'bg-[#FEF2F2] border-[#FCA5A5]'
                        : claim.status === 'not-yet'
                          ? 'bg-[#FFFBEB] border-[#FDE68A]'
                          : 'bg-[#F0FDF4] border-[#86EFAC]'
                    }`}
                  >
                    <span className="font-mono text-[11px] font-bold text-[#3B2314] w-8">{claim.key}</span>
                    <span className="text-[10.5px] text-[#6B4423] w-20">{claim.label}</span>
                    <span className="font-mono text-[10.5px] text-[#8B5A2B]">{fmtDateTime(claim.value)}</span>
                    <div className="flex-1" />
                    <span className={`text-[10.5px] ${
                      claim.status === 'expired' ? 'text-[#B91C1C] font-bold' : claim.status === 'not-yet' ? 'text-[#B45309] font-bold' : 'text-[#15803D]'
                    }`}>
                      {claim.status === 'expired' ? <ShieldX className="w-3 h-3 inline mr-1" /> : claim.status === 'not-yet' ? <Timer className="w-3 h-3 inline mr-1" /> : <Check className="w-3 h-3 inline mr-1" />}
                      {claim.detail}
                    </span>
                  </div>
                ))}
                <p className="text-[10px] text-[#A98768] flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Live clock: {new Date(now * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}
                </p>
              </div>
            )}
          </Panel>

          <Panel title="HMAC signature check (local only)" icon={<AlertTriangle className="w-3.5 h-3.5" />}>
            {!['HS256', 'HS384', 'HS512'].includes(String(parsed.header.alg ?? '').toUpperCase()) ? (
              <EmptyHint>
                Algorithm “{String(parsed.header.alg ?? 'none')}” cannot be verified in the browser without the issuer’s public key.
                Only HS256 / HS384 / HS512 symmetric signatures can be recomputed here.
              </EmptyHint>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="password"
                    value={secret}
                    onChange={(e) => { setSecret(e.target.value); setHmacStatus('idle'); }}
                    placeholder="HMAC secret (never leaves this tab)"
                    aria-label="HMAC secret"
                    className="toy-input flex-1 font-mono text-[11px]"
                  />
                  <button type="button" onClick={() => void verifyHmac()} disabled={!secret} className="toy-btn-mint px-3 py-1.5 text-[11px]">
                    Verify signature
                  </button>
                </div>
                {hmacStatus === 'valid' && (
                  <div className="rounded-lg bg-[#F0FDF4] border-2 border-[#86EFAC] px-2.5 py-1.5 text-[11px] text-[#14532D] font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Signature matches — the token is authentic for this secret.
                  </div>
                )}
                {hmacStatus === 'invalid' && (
                  <div className="rounded-lg bg-[#FEF2F2] border-2 border-[#FCA5A5] px-2.5 py-1.5 text-[11px] text-[#7F1D1D] font-bold flex items-center gap-1.5">
                    <ShieldX className="w-3.5 h-3.5" /> Signature does not match this secret.
                  </div>
                )}
                {hmacStatus === 'checking' && <p className="text-[11px] text-[#A98768]">Computing HMAC…</p>}
                <p className="text-[10px] text-[#A98768]">
                  Uses WebCrypto subtle.sign in-memory. Decoding a JWT proves nothing about validity — only that it parses.
                </p>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
};

export default JwtDecoderTool;
