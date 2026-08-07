/**
 * Bridge Tailwind CDN — misma paleta que tailwind.config.ts / globals.css
 * Cargar DESPUÉS de https://cdn.tailwindcss.com
 */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        display: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        /* TODO: reemplazar por fuente serif oficial de marca */
        serif: [
          "Playfair Display",
          "Fraunces",
          "Georgia",
          "Times New Roman",
          "serif",
        ],
        sans: [
          "Poppins",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      fontSize: {
        metric: ["1.875rem", { lineHeight: "1.15", fontWeight: "900" }],
        h1: ["1.5rem", { lineHeight: "1.2", fontWeight: "900" }],
        h2: ["1.125rem", { lineHeight: "1.25", fontWeight: "900" }],
        h3: ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.5", fontWeight: "500" }],
        meta: ["0.8125rem", { lineHeight: "1.45", fontWeight: "400" }],
        "meta-sm": ["0.75rem", { lineHeight: "1.4", fontWeight: "400" }],
        display: [
          "clamp(2.25rem, 5vw, 3.75rem)",
          { lineHeight: "0.95", fontWeight: "900", letterSpacing: "-0.03em" },
        ],
      },
      colors: {
        canito: {
          oliva: "var(--canito-oliva)",
          taupe: "var(--canito-taupe)",
          crema: "var(--canito-crema)",
          carbon: "var(--canito-carbon)",
        },
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
