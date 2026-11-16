/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Editorial kitchen palette, matched to the live site.
        paper: '#faf8f1',
        surface: '#fffefa',
        soft: '#f0f1e7',
        ink: '#21382e',
        muted: '#617264',
        line: '#e1e5d8',
        green: { DEFAULT: '#224c38', deep: '#1b3329', soft: '#3d5544' },
        leaf: '#416e4b',
        accent: '#d5764e',
        gold: '#c39144',
        // legacy aliases kept so untouched components still compile
        waffle: {
          cream: '#faf8f1',
          grid: '#eef0e4',
          pocket: '#e5e7db',
          crust: '#cfd8c2',
          caramel: '#8a9281',
          espresso: '#273e30',
          latte: '#f7f8f0',
          butter: '#eef0e4',
          syrup: '#8b9a7c',
        },
      },
      boxShadow: {
        'toy-sm': '0 2px 5px #2a3c2507',
        'toy': '0 2px 5px #2a3c2507',
        'toy-lg': '0 15px 30px #37472a13',
        'card': '0 14px 40px #28392112',
        'waffle-inset': 'inset 0 1px 2px #21382e0a',
      },
    },
  },
  plugins: [],
};
