import type { Config } from "tailwindcss";

/**
 * CMR Turnos — Tailwind theme
 * Los valores apuntan a CSS custom properties definidas en public/globals.css
 * para que home, ficha de negocio, admin y super-admin compartan la misma fuente de verdad.
 *
 * Alcance de acentos:
 * - accent → plataforma (home, buscador, super-admin)
 * - business-accent → solo ficha pública / panel del negocio (se setea en runtime)
 */
const config: Config = {
  content: ["./public/**/*.{html,js}", "./server/**/*.{js,html}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      fontSize: {
        metric: ["1.875rem", { lineHeight: "1.15", fontWeight: "700" }], // 30px
        h1: ["1.5rem", { lineHeight: "1.25", fontWeight: "700" }], // 24px
        h2: ["1.125rem", { lineHeight: "1.35", fontWeight: "600" }], // 18px
        h3: ["1rem", { lineHeight: "1.4", fontWeight: "600" }], // 16px
        body: ["0.875rem", { lineHeight: "1.5", fontWeight: "500" }], // 14px
        meta: ["0.8125rem", { lineHeight: "1.45", fontWeight: "400" }], // 13px
        "meta-sm": ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }], // 12px
      },
      colors: {
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          light: "var(--accent-light)",
        },
        "business-accent": {
          DEFAULT: "var(--business-accent)",
          hover: "var(--business-accent-hover)",
          light: "var(--business-accent-light)",
        },
        sidebar: "var(--sidebar-bg)",
        content: "var(--content-bg)",
        card: "var(--card-bg)",
        border: {
          DEFAULT: "var(--border-color)",
        },
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        "on-dark": "var(--text-on-dark)",
        success: {
          DEFAULT: "var(--success)",
          bg: "var(--success-bg)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          bg: "var(--warning-bg)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          bg: "var(--danger-bg)",
        },
        neutral: {
          DEFAULT: "var(--neutral)",
          bg: "var(--neutral-bg)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};

export default config;
