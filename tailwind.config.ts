import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ui-requirements.md 2.1 — CSS-variable-backed aliases so shared
      // components can use `bg-brand`/`text-ink`/etc. instead of repeating
      // `style={{ color: 'var(--ink)' }}`. The variables themselves (light
      // and dark values) stay defined in app/globals.css; these just name
      // them for Tailwind's utility generator. Values are hex/rgba-backed
      // custom properties, not colors with alpha channels Tailwind can
      // itself modify, so avoid `/opacity` modifiers on these utilities.
      colors: {
        brand: 'var(--machine)',
        'brand-dark': 'var(--machine-dark)',
        'brand-tint': 'var(--machine-tint)',
        navy: 'var(--navy)',
        canvas: 'var(--surface)',
        panel: 'var(--panel)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        line: 'var(--rule)',
        'line-soft': 'var(--rule-soft)',
      },
    },
  },
  plugins: [],
} satisfies Config;
