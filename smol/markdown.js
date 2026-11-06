// Minimal, dependency-free markdown renderer for chat bubbles.
// Handles fenced code, inline code/emphasis/links, headings, lists, quotes.

export const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderMarkdown(src) {
  const blocks = [];
  // Pull fenced code out first so nothing inside it gets formatted.
  let text = src.replace(/```(\w*)\n?([\s\S]*?)(?:```|$)/g, (_, lang, code) => {
    blocks.push(
      `<pre><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ""}>${escapeHtml(
        code.replace(/\n$/, "")
      )}</code></pre>`
    );
    return `\u0000${blocks.length - 1}\u0000`;
  });

  text = escapeHtml(text);

  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      );

  const lines = text.split("\n");
  const out = [];
  let para = [];
  let list = null; // 'ul' | 'ol'
  let quote = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list}>${listItems.join("")}</${list}>`);
      list = null;
      listItems = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
      quote = [];
    }
  };
  let listItems = [];

  for (const line of lines) {
    if (/^\u0000\d+\u0000$/.test(line.trim())) {
      flushPara(); flushList(); flushQuote();
      out.push(line.trim().replace(/\u0000(\d+)\u0000/, (_, i) => blocks[Number(i)]));
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); flushQuote(); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList(); flushQuote();
      const level = Math.min(4, h[1].length);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    const q = /^(?:>|&gt;)\s?(.*)$/.exec(line);
    if (q) { flushPara(); flushList(); quote.push(q[1]); continue; }

    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara(); flushQuote();
      const kind = ul ? "ul" : "ol";
      if (list !== kind) { flushList(); list = kind; }
      listItems.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }
    if (list) flushList();
    if (quote.length) flushQuote();
    para.push(line.trim());
  }
  flushPara(); flushList(); flushQuote();

  return out.join("");
}

