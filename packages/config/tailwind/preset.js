/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        // Bizovix brand palette - spec section 78. Keep flat hex here (not CSS vars)
        // because the sidebar/topbar/KPI icons reference these directly by name.
        "biz-navy": {
          DEFAULT: "#03214F",
          deep: "#042B62",
        },
        "biz-blue": {
          DEFAULT: "#0B5CFF",
          hover: "#0A4FE0",
          soft: "#EAF1FF",
        },
        "biz-bg": "#F7F9FC",
        "biz-surface": "#FFFFFF",
        "biz-border": "#E5EAF2",
        "biz-text": "#0D1B3E",
        "biz-muted": "#667085",
        "biz-success": {
          DEFAULT: "#16A34A",
          soft: "#E8F7EE",
        },
        "biz-warning": {
          DEFAULT: "#F59E0B",
          soft: "#FEF3E2",
        },
        "biz-danger": {
          DEFAULT: "#EF4444",
          soft: "#FDEDED",
        },
        "biz-purple": {
          DEFAULT: "#7C3AED",
          soft: "#F1EBFD",
        },
        "biz-orange": {
          DEFAULT: "#F97316",
          soft: "#FFF1E6",
        },
        "biz-teal": {
          DEFAULT: "#06B6D4",
          soft: "#E5F8FB",
        },
      },
      borderRadius: {
        sm: "8px",
        md: "10px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(13, 27, 62, 0.06)",
        "card-hover": "0 2px 6px rgba(13, 27, 62, 0.08)",
      },
      fontSize: {
        "page-title": ["24px", { lineHeight: "32px", fontWeight: "700" }],
        "card-header": ["15px", { lineHeight: "20px", fontWeight: "600" }],
        body: ["13px", { lineHeight: "20px" }],
        helper: ["12px", { lineHeight: "16px" }],
        "kpi-value": ["20px", { lineHeight: "26px", fontWeight: "700" }],
      },
      spacing: {
        4.5: "18px",
      },
    },
  },
};
