/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './public/**/*.html',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        background: { DEFAULT: 'var(--background)' },
        foreground: { DEFAULT: 'var(--foreground)' },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        border: { DEFAULT: 'var(--border)' },
        input: { DEFAULT: 'var(--input)' },
        ring: { DEFAULT: 'var(--ring)' },
        positive: { DEFAULT: 'var(--positive)' },
        negative: { DEFAULT: 'var(--negative)' },
        warning: { DEFAULT: 'var(--warning)' },
        info: { DEFAULT: 'var(--info)' },
        navy: {
          50: 'var(--navy-50)',
          100: 'var(--navy-100)',
          200: 'var(--navy-200)',
          600: 'var(--navy-600)',
          700: 'var(--navy-700)',
          800: 'var(--navy-800)',
          900: 'var(--navy-900)',
        },
        teal: {
          400: 'var(--teal-400)',
          500: 'var(--teal-500)',
          600: 'var(--teal-600)',
        },
        mint: { DEFAULT: 'var(--mint)' },
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'calc(var(--radius) - 6px)',
        md: 'calc(var(--radius) - 4px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        full: '9999px',
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta)', 'Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,52,96,0.06), 0 1px 2px rgba(15,52,96,0.04)',
        'card-md': '0 4px 12px rgba(15,52,96,0.08), 0 2px 4px rgba(15,52,96,0.05)',
        'card-lg': '0 8px 24px rgba(15,52,96,0.1), 0 4px 8px rgba(15,52,96,0.06)',
        'teal-glow': '0 4px 14px rgba(14,165,160,0.3)',
        'navy-glow': '0 4px 14px rgba(15,52,96,0.25)',
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease forwards',
        'slide-up': 'slideUp 250ms ease forwards',
        'scale-in': 'scaleIn 150ms ease forwards',
        'shimmer': 'shimmer 1.5s infinite',
      },
      spacing: {
        'sidebar': 'var(--sidebar-width)',
        'sidebar-sm': 'var(--sidebar-collapsed)',
        'topbar': 'var(--topbar-height)',
        'bottom-nav': 'var(--bottom-nav-height)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};