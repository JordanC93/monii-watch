/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"], [data-theme="oled"], [data-theme="glass"]'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        // Borders
        border: 'rgb(var(--border) / <alpha-value>)',
        'border-strong': 'rgb(var(--border-strong) / <alpha-value>)',
        // Text
        fg: 'rgb(var(--fg) / <alpha-value>)',
        'fg-muted': 'rgb(var(--fg-muted) / <alpha-value>)',
        'fg-subtle': 'rgb(var(--fg-subtle) / <alpha-value>)',
        // Accents
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        // Semantic
        positive: 'rgb(var(--positive) / <alpha-value>)',
        negative: 'rgb(var(--negative) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        // Flag colors
        'flag-red': 'rgb(var(--flag-red) / <alpha-value>)',
        'flag-orange': 'rgb(var(--flag-orange) / <alpha-value>)',
        'flag-yellow': 'rgb(var(--flag-yellow) / <alpha-value>)',
        'flag-green': 'rgb(var(--flag-green) / <alpha-value>)',
        'flag-blue': 'rgb(var(--flag-blue) / <alpha-value>)',
        'flag-purple': 'rgb(var(--flag-purple) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.08)',
        'glass-lg': '0 20px 60px 0 rgba(0,0,0,0.32), inset 0 0 0 1px rgba(255,255,255,0.10)',
      },
      backdropBlur: {
        '4xl': '72px',
      },
      animation: {
        // iOS-style timing — slightly longer durations + a softer easing
        // curve (cubic-bezier matched to iOS UIViewPropertyAnimator's
        // default spring damping). The fade now ramps in over 220 ms
        // instead of 120 ms so the backdrop blur builds in visibly
        // alongside the slide rather than appearing fully formed.
        'fade-in': 'fadeIn 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'scale-in': 'scaleIn 240ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-up': 'slideUp 320ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        // ScaleIn: starts smaller + slight downward offset so the modal
        // feels like it's "rising" into view rather than simply popping.
        scaleIn: {
          from: { opacity: 0, transform: 'scale(0.94) translateY(6px)' },
          to:   { opacity: 1, transform: 'scale(1) translateY(0)' },
        },
        // SlideUp: a longer travel (16 px) makes mobile sheets feel
        // less abrupt — closer to iOS's UISheetPresentationController.
        slideUp: { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
