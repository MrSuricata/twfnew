/**
 * Preset Tailwind compartido para los 9 sitios.
 * Cada sitio extiende este preset y sobreescribe colores/typografías en su tailwind.config.ts.
 */
import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  theme: {
    screens: {
      xs: '360px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      spacing: {
        'section-y': '4rem',
        'section-y-lg': '6rem',
        gutter: '1.25rem',
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        xs: '0 1px 2px rgb(0 0 0 / 0.04)',
        sm: '0 2px 4px rgb(0 0 0 / 0.06)',
        md: '0 4px 12px rgb(0 0 0 / 0.08)',
        lg: '0 12px 32px rgb(0 0 0 / 0.10)',
      },
      zIndex: {
        dropdown: '1000',
        sticky: '1100',
        header: '1200',
        'whatsapp-fab': '1250',
        drawer: '1300',
        modal: '1400',
        toast: '1500',
        'cookie-banner': '1600',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        hover: '150ms',
        overlay: '300ms',
      },
    },
  },
};

export default preset;
