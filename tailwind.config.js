/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './*.html',
    './auth/**/*.html',
    './assets/js/**/*.js',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Accent hex colors — solid values for Tailwind opacity modifier support (bg-cyan/10 etc.)
        'cyan':    '#00e5ff',
        'coral':   '#ff4d6d',
        'gold':    '#ffd166',
        'lime':    '#39ff14',
        'success': '#2dd4a0',
        'error':   '#ff6b6b',
        'warning': '#ffd166',
        'danger':  '#ff6b6b',
        'scarlet': '#ff4d6d',

        // Accent dim / glow variants — rgba, no opacity modifier needed
        'cyan-dim':  'rgba(0, 229, 255, 0.12)',
        'cyan-glow': 'rgba(0, 229, 255, 0.35)',
        'coral-dim': 'rgba(255, 77, 109, 0.12)',
        'gold-dim':  'rgba(255, 209, 102, 0.12)',
        'lime-dim':  'rgba(57, 255, 20, 0.12)',

        // Theme-aware structural tokens (switch via CSS vars for dark/light support)
        'bg-base':          'var(--bg)',
        'surface':          'var(--surface)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-hover':    'var(--surface-hover)',
        'text-primary':     'var(--text)',
        'text-secondary':   'var(--text-secondary)',
        'muted':            'var(--muted)',
        'border-token':     'var(--border)',
        'border-hover':     'var(--border-hover)',
        'on-accent':        'var(--on-accent)',
        'accent':           'var(--accent)',

        // Legacy aliases — kept for backward compat with existing HTML/JS
        'void':        'var(--bg)',
        'ink':         'var(--surface)',
        'ink-elevated':'var(--surface-elevated)',
        'ivory':       'var(--text)',
        'ivory-dim':   'var(--text-secondary)',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['Share Tech Mono', 'monospace'],
      },
      maxWidth: {
        'content': '1280px',
      },
      spacing: {
        'navbar': '72px',
      },
      borderRadius: {
        'sm-token': '6px',
        'md-token': '10px',
        'lg-token': '14px',
        'xl-token': '20px',
      },
      boxShadow: {
        'card':     'var(--shadow-card)',
        'elevated': 'var(--shadow-elevated)',
        'glow-sm':  'var(--shadow-glow-sm)',
        'glow-md':  'var(--shadow-glow-md)',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(var(--reveal-offset, 30px))' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-30px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(30px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        flashPulse: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.7' },
        },
        checkPulse: {
          '0%':   { transform: 'scale(1)' },
          '50%':  { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'shimmer':    'shimmer 1.5s linear infinite',
        'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'fade-in':    'fadeIn 0.5s ease forwards',
        'slide-left': 'slideInLeft 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-right':'slideInRight 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'toast-in':   'toastIn 0.3s ease forwards',
        'flash-pulse':'flashPulse 1.5s ease-in-out infinite',
        'check-pulse':'checkPulse 0.4s ease',
      },
    },
  },
  plugins: [],
};
