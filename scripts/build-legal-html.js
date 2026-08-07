const fs = require("fs");

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inUl = false;
  let inOl = false;
  const closeLists = () => {
    if (inUl) {
      html += "</ul>";
      inUl = false;
    }
    if (inOl) {
      html += "</ol>";
      inOl = false;
    }
  };
  const inline = (s) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  for (const line of lines) {
    if (/^---\s*$/.test(line)) {
      closeLists();
      html += "<hr/>";
      continue;
    }
    if (/^### /.test(line)) {
      closeLists();
      html += `<h3>${inline(line.slice(4))}</h3>`;
      continue;
    }
    if (/^## /.test(line)) {
      closeLists();
      html += `<h2>${inline(line.slice(3))}</h2>`;
      continue;
    }
    if (/^# /.test(line)) {
      closeLists();
      html += `<h1>${inline(line.slice(2))}</h1>`;
      continue;
    }
    if (/^- /.test(line)) {
      if (inOl) {
        html += "</ol>";
        inOl = false;
      }
      if (!inUl) {
        html += "<ul>";
        inUl = true;
      }
      html += `<li>${inline(line.slice(2))}</li>`;
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      if (inUl) {
        html += "</ul>";
        inUl = false;
      }
      if (!inOl) {
        html += "<ol>";
        inOl = true;
      }
      html += `<li>${inline(line.replace(/^\d+\.\s/, ""))}</li>`;
      continue;
    }
    if (!line.trim()) {
      closeLists();
      continue;
    }
    closeLists();
    html += `<p>${inline(line)}</p>`;
  }
  closeLists();
  return html;
}

function wrap(title, body, otherHref, otherLabel) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${title}</title>
  <meta name="robots" content="index,follow" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="stylesheet" href="/legal.css" />
</head>
<body class="legal-page">
  <header class="legal-header">
    <div class="legal-header__inner">
      <a href="/">CMR Nexo</a>
      <a href="${otherHref}">${otherLabel}</a>
    </div>
  </header>
  <main class="legal-wrap">
    <nav class="legal-nav-docs" aria-label="Documentos legales">
      <a href="/privacidad">Política de Privacidad</a>
      <a href="/terminos">Términos y Condiciones</a>
    </nav>
    ${body}
  </main>
  <footer class="legal-footer">
    © 2026 CMR Software Solutions · CMR Nexo ·
    <a href="/">Inicio</a> ·
    <a href="/privacidad">Privacidad</a> ·
    <a href="/terminos">Términos</a>
  </footer>
</body>
</html>
`;
}

const terms = fs.readFileSync("docs/TERMINOS-Y-CONDICIONES.md", "utf8");
const priv = fs.readFileSync("docs/POLITICA-DE-PRIVACIDAD.md", "utf8");
fs.writeFileSync(
  "public/terminos.html",
  wrap("Términos y Condiciones — CMR Nexo", mdToHtml(terms), "/privacidad", "Política de Privacidad")
);
fs.writeFileSync(
  "public/privacidad.html",
  wrap("Política de Privacidad — CMR Nexo", mdToHtml(priv), "/terminos", "Términos y Condiciones")
);
console.log("written");
