/**
 * BiteSizedUtilities — Authentic W3C CSS4 Standard Color Name Resolver
 * STRICT INTEGRITY RULE: Resolves HEX/RGB values strictly to official recognized W3C/CSS4
 * standard named colors via perceptual CIELAB distance. Zero invented food/parody color names.
 */

export interface StandardNamedColor {
  name: string;
  cssKeyword: string;
  hex: string;
}

const CSS4_NAMED_COLORS: ReadonlyArray<[string, string, string]> = [
  ['Alice Blue', 'aliceblue', '#F0F8FF'],
  ['Antique White', 'antiquewhite', '#FAEBD7'],
  ['Aqua', 'aqua', '#00FFFF'],
  ['Aquamarine', 'aquamarine', '#7FFFD4'],
  ['Azure', 'azure', '#F0FFFF'],
  ['Beige', 'beige', '#F5F5DC'],
  ['Bisque', 'bisque', '#FFE4C4'],
  ['Black', 'black', '#000000'],
  ['Blanched Almond', 'blanchedalmond', '#FFEBCD'],
  ['Blue', 'blue', '#0000FF'],
  ['Blue Violet', 'blueviolet', '#8A2BE2'],
  ['Brown', 'brown', '#A52A2A'],
  ['Burly Wood', 'burlywood', '#DEB887'],
  ['Cadet Blue', 'cadetblue', '#5F9EA0'],
  ['Chartreuse', 'chartreuse', '#7FFF00'],
  ['Chocolate', 'chocolate', '#D2691E'],
  ['Coral', 'coral', '#FF7F50'],
  ['Cornflower Blue', 'cornflowerblue', '#6495ED'],
  ['Cornsilk', 'cornsilk', '#FFF8DC'],
  ['Crimson', 'crimson', '#DC143C'],
  ['Cyan', 'cyan', '#00FFFF'],
  ['Dark Blue', 'darkblue', '#00008B'],
  ['Dark Cyan', 'darkcyan', '#008B8B'],
  ['Dark Goldenrod', 'darkgoldenrod', '#B8860B'],
  ['Dark Gray', 'darkgray', '#A9A9A9'],
  ['Dark Green', 'darkgreen', '#006400'],
  ['Dark Khaki', 'darkkhaki', '#BDB76B'],
  ['Dark Magenta', 'darkmagenta', '#8B008B'],
  ['Dark Olive Green', 'darkolivegreen', '#556B2F'],
  ['Dark Orange', 'darkorange', '#FF8C00'],
  ['Dark Orchid', 'darkorchid', '#9932CC'],
  ['Dark Red', 'darkred', '#8B0000'],
  ['Dark Salmon', 'darksalmon', '#E9967A'],
  ['Dark Sea Green', 'darkseagreen', '#8FBC8F'],
  ['Dark Slate Blue', 'darkslateblue', '#483D8B'],
  ['Dark Slate Gray', 'darkslategray', '#2F4F4F'],
  ['Dark Turquoise', 'darkturquoise', '#00CED1'],
  ['Dark Violet', 'darkviolet', '#9400D3'],
  ['Deep Pink', 'deeppink', '#FF1493'],
  ['Deep Sky Blue', 'deepskyblue', '#00BFFF'],
  ['Dim Gray', 'dimgray', '#696969'],
  ['Dodger Blue', 'dodgerblue', '#1E90FF'],
  ['Firebrick', 'firebrick', '#B22222'],
  ['Floral White', 'floralwhite', '#FFFAF0'],
  ['Forest Green', 'forestgreen', '#228B22'],
  ['Fuchsia', 'fuchsia', '#FF00FF'],
  ['Gainsboro', 'gainsboro', '#DCDCDC'],
  ['Ghost White', 'ghostwhite', '#F8F8FF'],
  ['Gold', 'gold', '#FFD700'],
  ['Goldenrod', 'goldenrod', '#DAA520'],
  ['Gray', 'gray', '#808080'],
  ['Green', 'green', '#008000'],
  ['Green Yellow', 'greenyellow', '#ADFF2F'],
  ['Honeydew', 'honeydew', '#F0FFF0'],
  ['Hot Pink', 'hotpink', '#FF69B4'],
  ['Indian Red', 'indianred', '#CD5C5C'],
  ['Indigo', 'indigo', '#4B0082'],
  ['Ivory', 'ivory', '#FFFFF0'],
  ['Khaki', 'khaki', '#F0E68C'],
  ['Lavender', 'lavender', '#E6E6FA'],
  ['Lavender Blush', 'lavenderblush', '#FFF0F5'],
  ['Lawn Green', 'lawngreen', '#7CFC00'],
  ['Lemon Chiffon', 'lemonchiffon', '#FFFACD'],
  ['Light Blue', 'lightblue', '#ADD8E6'],
  ['Light Coral', 'lightcoral', '#F08080'],
  ['Light Cyan', 'lightcyan', '#E0FFFF'],
  ['Light Goldenrod Yellow', 'lightgoldenrodyellow', '#FAFAD2'],
  ['Light Gray', 'lightgray', '#D3D3D3'],
  ['Light Green', 'lightgreen', '#90EE90'],
  ['Light Pink', 'lightpink', '#FFB6C1'],
  ['Light Salmon', 'lightsalmon', '#FFA07A'],
  ['Light Sea Green', 'lightseagreen', '#20B2AA'],
  ['Light Sky Blue', 'lightskyblue', '#87CEFA'],
  ['Light Slate Gray', 'lightslategray', '#778899'],
  ['Light Steel Blue', 'lightsteelblue', '#B0C4DE'],
  ['Light Yellow', 'lightyellow', '#FFFFE0'],
  ['Lime', 'lime', '#00FF00'],
  ['Lime Green', 'limegreen', '#32CD32'],
  ['Linen', 'linen', '#FAF0E6'],
  ['Magenta', 'magenta', '#FF00FF'],
  ['Maroon', 'maroon', '#800000'],
  ['Medium Aquamarine', 'mediumaquamarine', '#66CDAA'],
  ['Medium Blue', 'mediumblue', '#0000CD'],
  ['Medium Orchid', 'mediumorchid', '#BA55D3'],
  ['Medium Purple', 'mediumpurple', '#9370DB'],
  ['Medium Sea Green', 'mediumseagreen', '#3CB371'],
  ['Medium Slate Blue', 'mediumslateblue', '#7B68EE'],
  ['Medium Spring Green', 'mediumspringgreen', '#00FA9A'],
  ['Medium Turquoise', 'mediumturquoise', '#48D1CC'],
  ['Medium Violet Red', 'mediumvioletred', '#C71585'],
  ['Midnight Blue', 'midnightblue', '#191970'],
  ['Mint Cream', 'mintcream', '#F5FFFA'],
  ['Misty Rose', 'mistyrose', '#FFE4E1'],
  ['Moccasin', 'moccasin', '#FFE4B5'],
  ['Navajo White', 'navajowhite', '#FFDEAD'],
  ['Navy', 'navy', '#000080'],
  ['Old Lace', 'oldlace', '#FDF5E6'],
  ['Olive', 'olive', '#808000'],
  ['Olive Drab', 'olivedrab', '#6B8E23'],
  ['Orange', 'orange', '#FFA500'],
  ['Orange Red', 'orangered', '#FF4500'],
  ['Orchid', 'orchid', '#DA70D6'],
  ['Pale Goldenrod', 'palegoldenrod', '#EEE8AA'],
  ['Pale Green', 'palegreen', '#98FB98'],
  ['Pale Turquoise', 'paleturquoise', '#AFEEEE'],
  ['Pale Violet Red', 'palevioletred', '#DB7093'],
  ['Papaya Whip', 'papayawhip', '#FFEFD5'],
  ['Peach Puff', 'peachpuff', '#FFDAB9'],
  ['Peru', 'peru', '#CD853F'],
  ['Pink', 'pink', '#FFC0CB'],
  ['Plum', 'plum', '#DDA0DD'],
  ['Powder Blue', 'powderblue', '#B0E0E6'],
  ['Purple', 'purple', '#800080'],
  ['Rebecca Purple', 'rebeccapurple', '#663399'],
  ['Red', 'red', '#FF0000'],
  ['Rosy Brown', 'rosybrown', '#BC8F8F'],
  ['Royal Blue', 'royalblue', '#4169E1'],
  ['Saddle Brown', 'saddlebrown', '#8B4513'],
  ['Salmon', 'salmon', '#FA8072'],
  ['Sandy Brown', 'sandybrown', '#F4A460'],
  ['Sea Green', 'seagreen', '#2E8B57'],
  ['Seashell', 'seashell', '#FFF5EE'],
  ['Sienna', 'sienna', '#A0522D'],
  ['Silver', 'silver', '#C0C0C0'],
  ['Sky Blue', 'skyblue', '#87CEEB'],
  ['Slate Blue', 'slateblue', '#6A5ACD'],
  ['Slate Gray', 'slategray', '#708090'],
  ['Snow', 'snow', '#FFFAFA'],
  ['Spring Green', 'springgreen', '#00FF7F'],
  ['Steel Blue', 'steelblue', '#4682B4'],
  ['Tan', 'tan', '#D2B48C'],
  ['Teal', 'teal', '#008080'],
  ['Thistle', 'thistle', '#D8BFD8'],
  ['Tomato', 'tomato', '#FF6347'],
  ['Turquoise', 'turquoise', '#40E0D0'],
  ['Violet', 'violet', '#EE82EE'],
  ['Wheat', 'wheat', '#F5DEB3'],
  ['White', 'white', '#FFFFFF'],
  ['White Smoke', 'whitesmoke', '#F5F5F5'],
  ['Yellow', 'yellow', '#FFFF00'],
  ['Yellow Green', 'yellowgreen', '#9ACD32'],
];

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.slice(0, 6);
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return [0, 0, 0];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const PRECOMPUTED = CSS4_NAMED_COLORS.map(([name, cssKeyword, hex]) => {
  const [r, g, b] = hexToRgb(hex);
  const lab = rgbToLab(r, g, b);
  return { name, cssKeyword, hex, lab };
});

export function getNearestStandardColorName(hex: string): StandardNamedColor & { exact: boolean } {
  const [r, g, b] = hexToRgb(hex);
  const [l1, a1, b1] = rgbToLab(r, g, b);
  const normalizedHex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

  let best = PRECOMPUTED[0];
  let bestDist = Infinity;

  for (const entry of PRECOMPUTED) {
    if (entry.hex === normalizedHex) {
      return { name: entry.name, cssKeyword: entry.cssKeyword, hex: entry.hex, exact: true };
    }
    const dl = l1 - entry.lab[0];
    const da = a1 - entry.lab[1];
    const db = b1 - entry.lab[2];
    const dist = dl * dl + da * da + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }

  return { name: best.name, cssKeyword: best.cssKeyword, hex: best.hex, exact: false };
}
