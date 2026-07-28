/**
 * Bridge Tailwind CDN — misma paleta que tailwind.config.ts / globals.css
 * Cargar DESPUÉS de https://cdn.tailwindcss.com
 */
tailwind.config = {
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
        metric: ["1.875rem", { lineHeight: "1.15", fontWeight: "700" }],
        h1: ["1.5rem", { lineHeight: "1.25", fontWeight: "700" }],
        h2: ["1.125rem", { lineHeight: "1.35", fontWeight: "600" }],
        h3: ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.5", fontWeight: "500" }],
        meta: ["0.8125rem", { lineHeight: "1.45", fontWeight: "400" }],
        "meta-sm": ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
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
};
