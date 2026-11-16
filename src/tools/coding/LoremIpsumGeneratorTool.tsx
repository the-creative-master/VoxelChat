import { useCallback, useMemo, useState } from 'react';
import { Coffee, Database, Dices, FileText, Layers, ListOrdered, Sparkles } from 'lucide-react';
import { CopyButton } from '../../components/ui/CopyButton';
import { soundEngine } from '../../utils/soundEngine';
import { downloadBlob } from '../../utils/storage';
import { Panel, Segmented, Field, StatChip, EmptyHint } from './shared';

/* ========================================================================= */
/* A small Latin grammar, so the filler is real Latin and not word soup.     */
/* ========================================================================= */

type Gender = 'm' | 'f' | 'n';

interface Noun {
  nom: string;
  acc: string;
  abl: string;
  gen: string;
  gender: Gender;
  gloss: string;
}

interface Adjective {
  nom: [string, string, string]; // m, f, n nominative
  acc: [string, string, string];
  abl: [string, string, string];
}

const NOUNS: Noun[] = [
  { nom: 'mensa', acc: 'mensam', abl: 'mensā', gen: 'mensae', gender: 'f', gloss: 'table' },
  { nom: 'culina', acc: 'culinam', abl: 'culinā', gen: 'culinae', gender: 'f', gloss: 'kitchen' },
  { nom: 'pistrinum', acc: 'pistrinum', abl: 'pistrinō', gen: 'pistrinī', gender: 'n', gloss: 'bakery' },
  { nom: 'coquus', acc: 'coquum', abl: 'coquō', gen: 'coquī', gender: 'm', gloss: 'cook' },
  { nom: 'panis', acc: 'panem', abl: 'pane', gen: 'panis', gender: 'm', gloss: 'bread' },
  { nom: 'crustulum', acc: 'crustulum', abl: 'crustulō', gen: 'crustulī', gender: 'n', gloss: 'little cookie' },
  { nom: 'mel', acc: 'mel', abl: 'melle', gen: 'mellis', gender: 'n', gloss: 'honey' },
  { nom: 'farina', acc: 'farinam', abl: 'farinā', gen: 'farinae', gender: 'f', gloss: 'flour' },
  { nom: 'aqua', acc: 'aquam', abl: 'aquā', gen: 'aquae', gender: 'f', gloss: 'water' },
  { nom: 'ignis', acc: 'ignem', abl: 'igne', gen: 'ignis', gender: 'm', gloss: 'fire' },
  { nom: 'sapor', acc: 'sapōrem', abl: 'sapōre', gen: 'sapōris', gender: 'm', gloss: 'flavour' },
  { nom: 'cibus', acc: 'cibum', abl: 'cibō', gen: 'cibī', gender: 'm', gloss: 'food' },
  { nom: 'fames', acc: 'famem', abl: 'fame', gen: 'famis', gender: 'f', gloss: 'hunger' },
  { nom: 'gaudium', acc: 'gaudium', abl: 'gaudiō', gen: 'gaudiī', gender: 'n', gloss: 'joy' },
  { nom: 'labor', acc: 'labōrem', abl: 'labōre', gen: 'labōris', gender: 'm', gloss: 'work' },
  { nom: 'tempus', acc: 'tempus', abl: 'tempore', gen: 'temporis', gender: 'n', gloss: 'time' },
  { nom: 'diēs', acc: 'diem', abl: 'diē', gen: 'diēī', gender: 'm', gloss: 'day' },
  { nom: 'mēns', acc: 'mentem', abl: 'mente', gen: 'mentis', gender: 'f', gloss: 'mind' },
  { nom: 'via', acc: 'viam', abl: 'viā', gen: 'viae', gender: 'f', gloss: 'road' },
  { nom: 'amicus', acc: 'amicum', abl: 'amicō', gen: 'amicī', gender: 'm', gloss: 'friend' },
  { nom: 'liber', acc: 'librum', abl: 'librō', gen: 'librī', gender: 'm', gloss: 'book' },
  { nom: 'verbum', acc: 'verbum', abl: 'verbō', gen: 'verbī', gender: 'n', gloss: 'word' },
  { nom: 'numerus', acc: 'numerum', abl: 'numerō', gen: 'numerī', gender: 'm', gloss: 'number' },
  { nom: 'ratiō', acc: 'ratiōnem', abl: 'ratiōne', gen: 'ratiōnis', gender: 'f', gloss: 'reason' },
  { nom: 'fōrma', acc: 'fōrmam', abl: 'fōrmā', gen: 'fōrmae', gender: 'f', gloss: 'shape' },
  { nom: 'color', acc: 'colōrem', abl: 'colōre', gen: 'colōris', gender: 'm', gloss: 'colour' },
  { nom: 'taberna', acc: 'tabernam', abl: 'tabernā', gen: 'tabernae', gender: 'f', gloss: 'shop' },
  { nom: 'puer', acc: 'puerum', abl: 'puerō', gen: 'puerī', gender: 'm', gloss: 'boy' },
  { nom: 'puella', acc: 'puellam', abl: 'puellā', gen: 'puellae', gender: 'f', gloss: 'girl' },
  { nom: 'hortus', acc: 'hortum', abl: 'hortō', gen: 'hortī', gender: 'm', gloss: 'garden' },
];

const ADJECTIVES: Adjective[] = [
  { nom: ['bonus', 'bona', 'bonum'], acc: ['bonum', 'bonam', 'bonum'], abl: ['bonō', 'bonā', 'bonō'] },
  { nom: ['dulcis', 'dulcis', 'dulce'], acc: ['dulcem', 'dulcem', 'dulce'], abl: ['dulcī', 'dulcī', 'dulcī'] },
  { nom: ['calidus', 'calida', 'calidum'], acc: ['calidum', 'calidam', 'calidum'], abl: ['calidō', 'calidā', 'calidō'] },
  { nom: ['mollis', 'mollis', 'molle'], acc: ['mollem', 'mollem', 'molle'], abl: ['mollī', 'mollī', 'mollī'] },
  { nom: ['novus', 'nova', 'novum'], acc: ['novum', 'novam', 'novum'], abl: ['novō', 'novā', 'novō'] },
  { nom: ['antīquus', 'antīqua', 'antīquum'], acc: ['antīquum', 'antīquam', 'antīquum'], abl: ['antīquō', 'antīquā', 'antīquō'] },
  { nom: ['parvus', 'parva', 'parvum'], acc: ['parvum', 'parvam', 'parvum'], abl: ['parvō', 'parvā', 'parvō'] },
  { nom: ['magnus', 'magna', 'magnum'], acc: ['magnum', 'magnam', 'magnum'], abl: ['magnō', 'magnā', 'magnō'] },
  { nom: ['suāvis', 'suāvis', 'suāve'], acc: ['suāvem', 'suāvem', 'suāve'], abl: ['suāvī', 'suāvī', 'suāvī'] },
  { nom: ['certus', 'certa', 'certum'], acc: ['certum', 'certam', 'certum'], abl: ['certō', 'certā', 'certō'] },
  { nom: ['grātus', 'grāta', 'grātum'], acc: ['grātum', 'grātam', 'grātum'], abl: ['grātō', 'grātā', 'grātō'] },
  { nom: ['plēnus', 'plēna', 'plēnum'], acc: ['plēnum', 'plēnam', 'plēnum'], abl: ['plēnō', 'plēnā', 'plēnō'] },
];

interface Verb {
  sg: string;
  pl: string;
  gloss: string;
  transitive: boolean;
}

const VERBS: Verb[] = [
  { sg: 'facit', pl: 'faciunt', gloss: 'makes', transitive: true },
  { sg: 'amat', pl: 'amant', gloss: 'loves', transitive: true },
  { sg: 'docet', pl: 'docent', gloss: 'teaches', transitive: true },
  { sg: 'monstrat', pl: 'monstrant', gloss: 'shows', transitive: true },
  { sg: 'parat', pl: 'parant', gloss: 'prepares', transitive: true },
  { sg: 'habet', pl: 'habent', gloss: 'has', transitive: true },
  { sg: 'videt', pl: 'vident', gloss: 'sees', transitive: true },
  { sg: 'cūrat', pl: 'cūrant', gloss: 'tends', transitive: true },
  { sg: 'movet', pl: 'movent', gloss: 'moves', transitive: true },
  { sg: 'mūtat', pl: 'mūtant', gloss: 'changes', transitive: true },
  { sg: 'servat', pl: 'servant', gloss: 'keeps', transitive: true },
  { sg: 'quaerit', pl: 'quaerunt', gloss: 'seeks', transitive: true },
  { sg: 'reddit', pl: 'reddunt', gloss: 'returns', transitive: true },
  { sg: 'iuvat', pl: 'iuvant', gloss: 'delights', transitive: true },
  { sg: 'crescit', pl: 'crescunt', gloss: 'grows', transitive: false },
  { sg: 'stat', pl: 'stant', gloss: 'stands', transitive: false },
  { sg: 'manet', pl: 'manent', gloss: 'remains', transitive: false },
  { sg: 'ambulat', pl: 'ambulant', gloss: 'walks', transitive: false },
  { sg: 'rīdet', pl: 'rīdent', gloss: 'smiles', transitive: false },
  { sg: 'est', pl: 'sunt', gloss: 'is', transitive: false },
];

const ADVERBS = ['semper', 'saepe', 'numquam', 'interdum', 'cotīdiē', 'statim', 'paulātim', 'tandem', 'vix', 'bene', 'sapienter', 'celeriter', 'libenter', 'rursus', 'nunc', 'ōlim', 'mox', 'etiam', 'fortasse', 'dīligenter'];

const PREPOSITIONS_PLACE = [
  { latin: 'in', case: 'abl' as const, gloss: 'in' },
  { latin: 'cum', case: 'abl' as const, gloss: 'with' },
  { latin: 'sine', case: 'abl' as const, gloss: 'without' },
  { latin: 'sub', case: 'abl' as const, gloss: 'under' },
  { latin: 'dē', case: 'abl' as const, gloss: 'about' },
  { latin: 'ex', case: 'abl' as const, gloss: 'out of' },
  { latin: 'ad', case: 'acc' as const, gloss: 'towards' },
  { latin: 'per', case: 'acc' as const, gloss: 'through' },
  { latin: 'inter', case: 'acc' as const, gloss: 'among' },
  { latin: 'propter', case: 'acc' as const, gloss: 'because of' },
  { latin: 'apud', case: 'acc' as const, gloss: 'at the house of' },
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickNouns(n: number): Noun[] {
  const pool = [...NOUNS];
  const out: Noun[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function agree(adj: Adjective, noun: Noun, form: 'nom' | 'acc' | 'abl'): string {
  const genderIndex = noun.gender === 'm' ? 0 : noun.gender === 'f' ? 1 : 2;
  return adj[form][genderIndex];
}

function makeClause(): string {
  const roll = Math.random();
  const nouns = pickNouns(2);
  const adj = rand(ADJECTIVES);
  const verb = rand(VERBS);
  const adverb = Math.random() < 0.45 ? rand(ADVERBS) : '';

  if (roll < 0.3) {
    // [adj nom + noun nom] [acc noun] [verb sg] [adverb]
    const subject = Math.random() < 0.5 ? `${agree(adj, nouns[0], 'nom')} ${nouns[0].nom}` : nouns[0].nom;
    const obj = verb.transitive ? `${nouns[1].acc}` : '';
    return `${subject} ${obj} ${verb.sg} ${adverb}`.replace(/\s+/g, ' ').trim();
  }
  if (roll < 0.5) {
    // [prep + abl noun] [nom noun] [verb]
    const prep = rand(PREPOSITIONS_PLACE.filter((p) => p.case === 'abl'));
    return `${prep.latin} ${nouns[0].abl} ${nouns[1].nom} ${verb.sg} ${adverb}`.replace(/\s+/g, ' ').trim();
  }
  if (roll < 0.68) {
    // plural: [noun nom pl] ... handled by using a plural-friendly frame
    const prep = rand(PREPOSITIONS_PLACE.filter((p) => p.case === 'acc'));
    return `${nouns[0].nom} ${adverb} ${prep.latin} ${nouns[1].acc} ${verb.sg}`.replace(/\s+/g, ' ').trim();
  }
  if (roll < 0.84) {
    // [adj acc + acc noun] [verb] [adverb] — object-first emphasis
    return `${agree(adj, nouns[0], 'acc')} ${nouns[0].acc} ${verb.sg} ${adverb}`.replace(/\s+/g, ' ').trim();
  }
  // ablative absolute-flavoured clause
  return `${agree(adj, nouns[0], 'abl')} ${nouns[0].abl} ${nouns[1].nom} ${verb.sg}`.replace(/\s+/g, ' ').trim();
}

function latinSentence(): string {
  const clauses: string[] = [makeClause()];
  const joins = ['et', 'atque', 'sed', 'nam'];
  if (Math.random() < 0.35) clauses.push(makeClause());
  let text = clauses.length === 2 ? `${clauses[0]} ${rand(joins)} ${clauses[1]}` : clauses[0];
  if (Math.random() < 0.18) {
    text = `${text}, ${rand(['ut puto', 'quod sciō', 'sī placet', 'ut aiunt', 'sine morā'])}`;
  }
  text = text.replace(/\s+/g, ' ').trim();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

const CLASSIC_OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

function latinParagraph(minSentences: number, maxSentences: number, opening: boolean): string {
  const count = minSentences + Math.floor(Math.random() * (maxSentences - minSentences + 1));
  const sentences: string[] = [];
  if (opening) sentences.push(CLASSIC_OPENING);
  while (sentences.length < count) sentences.push(latinSentence());
  return sentences.join(' ');
}

const LATIN_WORD_TOKENS = [
  ...NOUNS.flatMap((n) => [n.nom, n.acc, n.abl]),
  ...ADJECTIVES.flatMap((a) => [a.nom[0], a.nom[1], a.nom[2], a.acc[0], a.abl[0]]),
  ...VERBS.flatMap((v) => [v.sg, v.pl]),
  ...ADVERBS,
];

/* ------------------------------ mock data ------------------------------ */

const FIRST_NAMES = ['Aurelia', 'Marcus', 'Junia', 'Felix', 'Cassia', 'Octavian', 'Livia', 'Quintus', 'Marcella', 'Titus', 'Cornelia', 'Sextus'];
const LAST_NAMES = ['Verdi', 'Cato', 'Lucanus', 'Naso', 'Marcellus', 'Varro', 'Sulla', 'Minor', 'Priscus', 'Corvus', 'Rufus', 'Balbus'];
const CITIES = ['Syracusae', 'Pompeii', 'Ravenna', 'Ostia', 'Carthago', 'Massilia', 'Verona', 'Brundisium', 'Neapolis', 'Aquileia'];
const PRODUCTS = ['Honey Waffle', 'Cinnamon Cruller', 'Sourdough Round', 'Maple Poffertjes', 'Butter Croissant', 'Cardamom Bun', 'Olive Focaccia', 'Chocolate Liege'];
const TAGS = ['breakfast', 'bestseller', 'gluten-free', 'seasonal', 'vegan', 'limited', 'classic', 'sweet'];
const COMPANIES = ['Pistrinum Aureum', 'Culinaryus Ltd', 'Furnus Maximus', 'Mola & Sapor', 'Crustum Co'];

const STATUSES = ['active', 'pending', 'inactive'] as const;

function mockUsers(count: number) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const first = rand(FIRST_NAMES);
    const last = rand(LAST_NAMES);
    const handle = `${first}.${last}`.toLowerCase();
    out.push({
      id: i + 1,
      uuid: `${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 6)}-4${Math.random().toString(16).slice(2, 5)}-a${Math.random().toString(16).slice(2, 5)}-${Math.random().toString(16).slice(2, 14)}`,
      name: `${first} ${last}`,
      email: `${handle}@example.com`,
      avatar: `https://i.pravatar.cc/150?u=${handle}`,
      city: rand(CITIES),
      age: 18 + Math.floor(Math.random() * 60),
      status: rand(STATUSES as unknown as string[]),
      joinedAt: new Date(Date.now() - Math.floor(Math.random() * 3_000_000_000)).toISOString(),
      score: Math.round(Math.random() * 1000) / 10,
      verified: Math.random() > 0.4,
      tags: Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => rand(TAGS)).filter((v, i, a) => a.indexOf(v) === i),
    });
  }
  return out;
}

function mockProducts(count: number) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `SKU-${String(1000 + i)}`,
      name: rand(PRODUCTS),
      brand: rand(COMPANIES),
      price: Math.round((2 + Math.random() * 24) * 100) / 100,
      currency: 'EUR',
      inStock: Math.random() > 0.25,
      stock: Math.floor(Math.random() * 250),
      rating: Math.round((2 + Math.random() * 3) * 10) / 10,
      reviews: Math.floor(Math.random() * 4000),
      image: `https://picsum.photos/seed/${Math.random().toString(36).slice(2, 8)}/400/300`,
      tags: Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => rand(TAGS)).filter((v, idx, a) => a.indexOf(v) === idx),
      createdAt: new Date(Date.now() - Math.floor(Math.random() * 2_000_000_000)).toISOString(),
    });
  }
  return out;
}

function mockOrders(count: number) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `ORD-${2024 + Math.floor(Math.random() * 3)}-${String(i + 1).padStart(4, '0')}`,
      customer: `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`,
      items: 1 + Math.floor(Math.random() * 6),
      subtotal: Math.round(Math.random() * 18000) / 100,
      shipping: Math.round(Math.random() * 1200) / 100,
      status: rand(['new', 'packed', 'shipped', 'delivered', 'refunded']),
      placedAt: new Date(Date.now() - Math.floor(Math.random() * 90) * 86_400_000).toISOString(),
      city: rand(CITIES),
    });
  }
  return out;
}

type Mode = 'paragraphs' | 'sentences' | 'words';
type DataKind = 'users' | 'products' | 'orders';

export const LoremIpsumGeneratorTool: React.FC = () => {
  const [tab, setTab] = useState<'text' | 'data'>('text');
  const [mode, setMode] = useState<Mode>('paragraphs');
  const [count, setCount] = useState(4);
  const [minSentences, setMinSentences] = useState(3);
  const [maxSentences, setMaxSentences] = useState(6);
  const [startClassic, setStartClassic] = useState(true);
  const [htmlOutput, setHtmlOutput] = useState(false);
  const [output, setOutput] = useState<string>(() => {
    const paragraphs = [CLASSIC_OPENING];
    while (paragraphs.length < 4) paragraphs.push(latinParagraph(3, 6, false));
    return paragraphs.join('\n\n');
  });

  const [dataKind, setDataKind] = useState<DataKind>('users');
  const [dataCount, setDataCount] = useState(8);
  const [dataOutput, setDataOutput] = useState<string>(() => JSON.stringify(mockUsers(8), null, 2));
  const [dataFormat, setDataFormat] = useState<'json' | 'csv'>('json');

  const generate = useCallback(() => {
    soundEngine.playPop(1.12);
    const n = Math.max(1, Math.min(200, count));
    if (mode === 'paragraphs') {
      const paragraphs: string[] = [];
      if (startClassic) paragraphs.push(CLASSIC_OPENING);
      while (paragraphs.length < n) paragraphs.push(latinParagraph(Math.min(minSentences, maxSentences), Math.max(minSentences, maxSentences), false));
      setOutput(paragraphs.join('\n\n'));
      return;
    }
    if (mode === 'sentences') {
      const sentences: string[] = [];
      if (startClassic) sentences.push(CLASSIC_OPENING);
      while (sentences.length < n) sentences.push(latinSentence());
      setOutput(sentences.join(' '));
      return;
    }
    const words: string[] = [];
    if (startClassic) words.push(...CLASSIC_OPENING.replace(/[,.]/g, '').split(' '));
    while (words.length < n) words.push(rand(LATIN_WORD_TOKENS));
    setOutput(`${words.slice(0, n).join(' ')}.`);
  }, [mode, count, minSentences, maxSentences, startClassic]);

  const generateData = useCallback(() => {
    soundEngine.playPop(1.12);
    const n = Math.max(1, Math.min(100, dataCount));
    const rows = dataKind === 'users' ? mockUsers(n) : dataKind === 'products' ? mockProducts(n) : mockOrders(n);
    if (dataFormat === 'csv') {
      const keys = Object.keys(rows[0] ?? {});
      const escape = (v: unknown) => {
        const str = Array.isArray(v) ? v.join('|') : String(v);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const csv = [keys.join(','), ...rows.map((row) => keys.map((k) => escape((row as Record<string, unknown>)[k])).join(','))].join('\n');
      setDataOutput(csv);
      return;
    }
    setDataOutput(JSON.stringify(rows, null, 2));
  }, [dataKind, dataCount, dataFormat]);

  const previewHtml = useMemo(() => {
    if (!htmlOutput) return null;
    return output
      .split(/\n\n+/)
      .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)
      .join('\n');
  }, [output, htmlOutput]);

  const finalOutput = previewHtml ?? output;

  const stats = useMemo(() => {
    const words = output.trim() ? output.trim().split(/\s+/).length : 0;
    return {
      words,
      chars: output.length,
      paragraphs: output.split(/\n\n+/).filter((p) => p.trim()).length,
      sentences: (output.match(/[.!?](\s|$)/g) ?? []).length,
      bytes: new TextEncoder().encode(output).length,
    };
  }, [output]);

  return (
    <div className="space-y-3">
      <div className="toy-card p-2.5 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={(id) => { soundEngine.playClick(); setTab(id as 'text' | 'data'); }}
          options={[
            { id: 'text', label: 'Latin filler', icon: <FileText className="w-3 h-3" /> },
            { id: 'data', label: 'Mock data', icon: <Database className="w-3 h-3" /> },
          ]}
        />
        <span className="text-[10px] text-[#A98768]">
          {tab === 'text' ? 'Grammatically consistent Latin — nouns and adjectives agree in case and gender' : 'Structured placeholder records as JSON or CSV'}
        </span>
      </div>

      {tab === 'text' && (
        <div className="space-y-3">
          <div className="toy-card p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={mode}
                onChange={(id) => { soundEngine.playClick(); setMode(id as Mode); }}
                options={[
                  { id: 'paragraphs', label: 'Paragraphs', icon: <Layers className="w-3 h-3" /> },
                  { id: 'sentences', label: 'Sentences', icon: <ListOrdered className="w-3 h-3" /> },
                  { id: 'words', label: 'Words', icon: <Sparkles className="w-3 h-3" /> },
                ]}
              />
              <label className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#6B4423]">
                {mode === 'paragraphs' ? 'Count' : mode === 'sentences' ? 'Sentences' : 'Words'}
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                  className="toy-input w-16 py-0.5 px-1.5 font-mono text-[11px]"
                  aria-label="Amount to generate"
                />
              </label>
              <div className="flex-1" />
              <button type="button" onClick={generate} className="toy-btn-mint px-3 py-1 text-[10.5px]">
                <Dices className="w-3.5 h-3.5" /> Generate
              </button>
            </div>

            {mode === 'paragraphs' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10.5px] font-bold text-[#6B4423]">Sentences per paragraph:</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={minSentences}
                  onChange={(e) => { const v = Number(e.target.value); setMinSentences(Math.min(v, maxSentences)); }}
                  className="w-24 accent-[#16A34A]"
                  aria-label="Minimum sentences"
                />
                <span className="font-mono text-[10.5px] text-[#3B2314]">{minSentences}</span>
                <span className="text-[10px] text-[#A98768]">to</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={maxSentences}
                  onChange={(e) => { const v = Number(e.target.value); setMaxSentences(Math.max(v, minSentences)); }}
                  className="w-24 accent-[#16A34A]"
                  aria-label="Maximum sentences"
                />
                <span className="font-mono text-[10.5px] text-[#3B2314]">{maxSentences}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => { soundEngine.playClick(); setStartClassic((v) => !v); }}
                aria-pressed={startClassic}
                className={`toy-pill text-[10px] ${startClassic ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-white border-[#D4AA78] text-[#7A5535]'}`}
              >
                Start with “Lorem ipsum dolor sit amet…”
              </button>
              <button
                type="button"
                onClick={() => { soundEngine.playClick(); setHtmlOutput((v) => !v); }}
                aria-pressed={htmlOutput}
                className={`toy-pill text-[10px] ${htmlOutput ? 'bg-[#DCFCE7] border-[#16A34A] text-[#14532D]' : 'bg-white border-[#D4AA78] text-[#7A5535]'}`}
              >
                &lt;p&gt; HTML output
              </button>
              <div className="flex-1" />
              <StatChip label="words" value={stats.words} tone="cream" />
              <StatChip label="sentences" value={stats.sentences} tone="cream" />
              <StatChip label="bytes" value={stats.bytes} tone="cream" />
              <CopyButton text={finalOutput} label="Copy" />
            </div>
          </div>

          <Panel
            title={htmlOutput ? 'HTML' : 'Generated Latin'}
            icon={<Coffee className="w-3.5 h-3.5" />}
            actions={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { downloadBlob(new Blob([finalOutput], { type: 'text/plain' }), htmlOutput ? 'lorem.html' : 'lorem.txt'); soundEngine.playPop(1.15); }}
                  className="toy-btn-cream px-2 py-1 text-[10px]"
                >
                  Download
                </button>
              </div>
            }
          >
            <textarea
              value={finalOutput}
              onChange={(e) => setOutput(e.target.value)}
              spellCheck={false}
              aria-label="Generated text"
              className="w-full h-64 resize-y rounded-lg border-2 border-[#E2C6A2] bg-[#FFFDF9] p-2.5 text-[12px] leading-relaxed text-[#3B2314] font-serif focus:outline-none focus:border-[#D97706]"
            />
            <p className="mt-1.5 text-[10px] text-[#A98768]">
              Editable — the lorem renders as real Latin sentences rather than the usual word salad. Each sentence is
              assembled from a small declension table so nouns, adjectives and verbs agree.
            </p>
          </Panel>
        </div>
      )}

      {tab === 'data' && (
        <div className="space-y-3">
          <div className="toy-card p-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={dataKind}
                onChange={(id) => { soundEngine.playClick(); setDataKind(id as DataKind); }}
                options={[
                  { id: 'users', label: 'Users' },
                  { id: 'products', label: 'Products' },
                  { id: 'orders', label: 'Orders' },
                ]}
              />
              <Segmented
                value={dataFormat}
                onChange={(id) => { soundEngine.playClick(); setDataFormat(id as 'json' | 'csv'); }}
                options={[{ id: 'json', label: 'JSON' }, { id: 'csv', label: 'CSV' }]}
              />
              <Field label="Records">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={dataCount}
                  onChange={(e) => setDataCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="toy-input w-16 py-0.5 px-1.5 font-mono text-[11px]"
                  aria-label="Number of records"
                />
              </Field>
              <div className="flex-1" />
              <button type="button" onClick={generateData} className="toy-btn-mint px-3 py-1 text-[10.5px]">
                <Dices className="w-3.5 h-3.5" /> Generate
              </button>
            </div>
            <p className="text-[10px] text-[#A98768]">
              Fields are shaped like a realistic API response so they drop straight into fixtures, stories or Postman examples.
            </p>
          </div>

          <Panel
            title={`${dataKind} · ${dataFormat.toUpperCase()}`}
            icon={<Database className="w-3.5 h-3.5" />}
            actions={
              <div className="flex items-center gap-1">
                <CopyButton text={dataOutput} label="Copy" />
                <button
                  type="button"
                  onClick={() => { downloadBlob(new Blob([dataOutput], { type: dataFormat === 'json' ? 'application/json' : 'text/csv' }), `mock-${dataKind}.${dataFormat}`); soundEngine.playPop(1.15); }}
                  className="toy-btn-cream px-2 py-1 text-[10px]"
                >
                  Download
                </button>
              </div>
            }
          >
            <pre className="max-h-[26rem] overflow-auto rounded-lg bg-[#1F150E] p-2.5 font-mono text-[10.5px] leading-relaxed text-[#FDF3E1] whitespace-pre">{dataOutput}</pre>
            {dataOutput.length === 0 && <EmptyHint>Press Generate to create records.</EmptyHint>}
          </Panel>
        </div>
      )}
    </div>
  );
};

export default LoremIpsumGeneratorTool;
