/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shell: '#07131f',
        ink: '#0f172a',
        mist: '#e2e8f0',
        canvas: '#f8fafc',
        accent: '#0f766e',
        accentSoft: '#ccfbf1',
        warning: '#b45309',
        danger: '#b91c1c',
      },
      boxShadow: {
        panel: '0 20px 45px rgba(15, 23, 42, 0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
