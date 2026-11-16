/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Fredoka"', '"Nunito"', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', '"Nunito"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        waffle: {
          cream: '#FFF8EB',
          grid: '#F3DFC1',
          pocket: '#E6C79C',
          crust: '#C98A4B',
          caramel: '#8B5A2B',
          espresso: '#3B2314',
          latte: '#FDF3E1',
          butter: '#FFE066',
          syrup: '#B45309',
        },
      },
      boxShadow: {
        'toy-sm': 'inset 0 2px 0 rgba(255,255,255,0.68), 0 4px 10px rgba(74, 42, 16, 0.12)',
        'toy': 'inset 0 2px 0 rgba(255,255,255,0.72), 0 8px 18px rgba(74, 42, 16, 0.16)',
        'toy-lg': 'inset 0 3px 0 rgba(255,255,255,0.75), 0 14px 30px rgba(74, 42, 16, 0.22)',
        'waffle-inset': 'inset 2px 2px 5px rgba(139, 90, 43, 0.16), inset -2px -2px 5px rgba(255, 255, 255, 0.85)',
      },
    },
  },
  plugins: [],
};
