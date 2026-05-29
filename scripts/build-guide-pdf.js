const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const mdPath = path.join(root, 'ЕДИНОЕ_РУКОВОДСТВО_FOREMAN.md');
const htmlPath = path.join(os.tmpdir(), 'foreman-guide-pdf.html');
const pdfPath = path.join(root, 'ЕДИНОЕ_РУКОВОДСТВО_FOREMAN.pdf');
const heroPath = path.join(root, 'assets', 'foreman-login-hero.jpg');

const md = fs.readFileSync(mdPath, 'utf8');

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(value) {
  let out = esc(value);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/<br>/g, ' ')
    .replace(/[`"“”'().,:;/\\[\]]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zа-яё0-9-]/gi, '')
    .slice(0, 80);
}

function labelForHeading(text, level) {
  const t = text.toLowerCase();
  if (level === 1 && /foreman:/.test(t)) return null;
  if (/как читать/.test(t)) return { text: 'Как пользоваться', kind: 'read' };
  if (/короткая карта|почему это важно|перед началом|вход|права|раздел 1|foreman web|раздел 2|мобильная|раздел 3|telegram/.test(t)) {
    return { text: 'Читать всем', kind: 'read' };
  }
  if (/сквозные рабочие сценарии|частые проблемы|как объяснить сотруднику/.test(t)) {
    return { text: 'Практика', kind: 'practice' };
  }
  if (/администратор|админ|status|modcheck|очередь важных|почтовые ожидания|ручной разбор|что считать главным/.test(t)) {
    return { text: 'Администратору', kind: 'admin' };
  }
  if (/postgresql|безопасность|антивирус|проверяет файлы|проверяется перед выпуском|мега-тест|мегатест|устойчивость|качества защитных тестов|покрыта тестами|ручного клика|ограничение/.test(t)) {
    return { text: 'Справочно', kind: 'reference' };
  }
  if (/документохранилище|таймлайн|план-график|профиль|пользователи|шаблоны|голосовой|многосоставные|реестр запусков/.test(t)) {
    return { text: 'По необходимости', kind: 'optional' };
  }
  if (level >= 3) return null;
  return { text: 'Для чтения', kind: 'read' };
}

function paragraphClass(text) {
  const t = text.toLowerCase();
  if (/главный смысл|практическое правило|важно понимать|что важно/.test(t)) return ' note';
  if (/честно:|нельзя|не должен|не нужно|опасн|вирус|парол|токен|секрет/.test(t)) return ' warn';
  return '';
}

function tableHtml(rows) {
  const parsed = rows
    .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length > 1);
  if (parsed.length < 2) return '';
  const header = parsed[0];
  const body = parsed.slice(2);
  let html = '<table><thead><tr>';
  html += header.map((cell) => `<th>${inline(cell)}</th>`).join('');
  html += '</tr></thead><tbody>';
  for (const row of body) {
    html += '<tr>' + row.map((cell) => `<td>${inline(cell)}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const toc = [];
  let paragraph = [];
  let list = [];
  let code = [];
  let inCode = false;
  let table = [];

  function flushParagraph() {
    if (!paragraph.length) return;
    const text = paragraph.join(' ');
    html.push(`<p class="${paragraphClass(text).trim()}">${inline(text)}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    html.push('<ul>' + list.map((item) => `<li>${inline(item)}</li>`).join('') + '</ul>');
    list = [];
  }

  function flushTable() {
    if (!table.length) return;
    html.push(tableHtml(table));
    table = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith('```')) {
      flushParagraph();
      flushList();
      flushTable();
      if (inCode) {
        html.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (/^\|.*\|$/.test(line)) {
      flushParagraph();
      flushList();
      table.push(line);
      continue;
    }
    flushTable();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      const label = labelForHeading(text, level);
      if (level <= 2) toc.push({ level, text, id, label });
      const badge = label ? `<span class="badge ${label.kind}">${esc(label.text)}</span>` : '';
      const cls = level === 1 ? ' class="chapter"' : '';
      html.push(`<h${level}${cls} id="${id}">${badge}<span>${inline(text)}</span></h${level}>`);
      continue;
    }

    const li = /^-\s+(.+)$/.exec(line);
    if (li) {
      flushParagraph();
      list.push(li[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushTable();

  return { body: html.join('\n'), toc };
}

function tocHtml(toc) {
  return toc
    .filter((item) => item.level <= 2)
    .map((item) => {
      const label = item.label ? `<span class="toc-badge ${item.label.kind}">${esc(item.label.text)}</span>` : '';
      return `<a class="toc-row level-${item.level}" href="#${item.id}"><span>${inline(item.text)}</span>${label}</a>`;
    })
    .join('\n');
}

const { body, toc } = renderMarkdown(md);
const heroData = fs.existsSync(heroPath)
  ? `data:image/jpeg;base64,${fs.readFileSync(heroPath).toString('base64')}`
  : '';

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Foreman: единое рабочее руководство</title>
<style>
  @page {
    size: A4;
    margin: 18mm 16mm 18mm 16mm;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #1f2933;
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    background: #fff;
  }
  .cover {
    min-height: 255mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
  }
  .cover-image {
    width: 100%;
    height: 118mm;
    object-fit: cover;
    border-radius: 10px;
    border: 1px solid #d8e0e6;
  }
  .cover h1 {
    margin: 22mm 0 4mm;
    font-size: 32pt;
    line-height: 1.05;
    color: #102a43;
    letter-spacing: 0;
  }
  .cover-subtitle {
    margin: 0;
    font-size: 16pt;
    color: #486581;
  }
  .cover-note {
    margin-top: 12mm;
    padding: 6mm;
    border-left: 4px solid #127c56;
    background: #eef8f3;
    border-radius: 6px;
    font-size: 11pt;
  }
  .legend {
    page-break-after: always;
  }
  .legend-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
    margin-top: 5mm;
  }
  .legend-card {
    border: 1px solid #d8e0e6;
    border-radius: 8px;
    padding: 4mm;
    background: #fbfdff;
  }
  .legend-card strong { display: block; margin-bottom: 1mm; }
  .toc { page-break-after: always; }
  .toc-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8mm;
    color: #102a43;
    text-decoration: none;
    border-bottom: 1px solid #e5ebf0;
    padding: 2mm 0;
  }
  .toc-row.level-1 {
    margin-top: 4mm;
    font-weight: 700;
    font-size: 12pt;
  }
  .toc-row.level-2 {
    padding-left: 5mm;
    font-size: 10pt;
  }
  .toc-badge, .badge {
    display: inline-block;
    white-space: nowrap;
    font-size: 8pt;
    line-height: 1;
    font-weight: 700;
    border-radius: 999px;
    padding: 2.2mm 3mm;
    margin-right: 3mm;
    vertical-align: middle;
    color: #102a43;
    background: #edf2f7;
  }
  .toc-badge { margin: 0; font-size: 7.5pt; }
  .read { background: #e6f4ff; color: #074b7a; }
  .practice { background: #e9f8ef; color: #116149; }
  .optional { background: #fff5d6; color: #725002; }
  .reference { background: #f0edff; color: #47328c; }
  .admin { background: #ffe9e3; color: #8a2d16; }
  h1, h2, h3, h4 {
    color: #102a43;
    line-height: 1.22;
    letter-spacing: 0;
    page-break-after: avoid;
  }
  h1.chapter {
    margin: 14mm 0 5mm;
    padding-top: 5mm;
    border-top: 3px solid #127c56;
    font-size: 23pt;
    page-break-before: always;
  }
  h1.chapter:first-of-type { page-break-before: auto; }
  h2 {
    margin: 9mm 0 3mm;
    font-size: 17pt;
    border-bottom: 1px solid #d8e0e6;
    padding-bottom: 2mm;
  }
  h3 { margin: 7mm 0 2.5mm; font-size: 13.5pt; }
  h4 { margin: 5mm 0 2mm; font-size: 11.5pt; }
  p { margin: 0 0 3mm; }
  p.note, p.warn {
    padding: 3mm 4mm;
    border-radius: 7px;
    border-left: 4px solid #127c56;
    background: #f0faf5;
  }
  p.warn {
    border-left-color: #b54708;
    background: #fff7ed;
  }
  ul { margin: 0 0 4mm 5mm; padding-left: 5mm; }
  li { margin-bottom: 1.4mm; }
  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 9pt;
    background: #edf2f7;
    border-radius: 4px;
    padding: 0.4mm 1mm;
  }
  pre {
    white-space: pre-wrap;
    border: 1px solid #d8e0e6;
    border-radius: 7px;
    background: #f7fafc;
    padding: 4mm;
    page-break-inside: avoid;
  }
  pre code { background: transparent; padding: 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 4mm 0 6mm;
    page-break-inside: auto;
    font-size: 9.4pt;
  }
  tr { page-break-inside: avoid; page-break-after: auto; }
  th, td {
    border: 1px solid #cbd5df;
    padding: 2.3mm 2.8mm;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #edf3f8;
    color: #102a43;
    font-weight: 700;
  }
  tbody tr:nth-child(even) td { background: #f8fbfd; }
  a { color: #0b6bcb; }
  .generated {
    margin-top: 8mm;
    color: #627d98;
    font-size: 9pt;
  }
</style>
</head>
<body>
<section class="cover">
  <div>
    <h1>Foreman:<br>единое рабочее руководство</h1>
    <p class="cover-subtitle">Веб-браузер, мобильное приложение, Telegram-бот</p>
    <div class="cover-note">
      PDF-версия сделана для спокойного чтения: обязательные главы, справочные места и администраторские разделы отмечены отдельно.
    </div>
  </div>
  ${heroData ? `<img class="cover-image" src="${heroData}" alt="Foreman Web">` : ''}
  <p class="generated">Сформировано из актуального Markdown-руководства.</p>
</section>

<section class="legend">
  <h1>Как читать PDF</h1>
  <p>Руководство большое, поэтому его не нужно читать подряд от первой до последней страницы. Метки помогают быстро понять, кому нужен раздел.</p>
  <div class="legend-grid">
    <div class="legend-card"><strong><span class="badge read">Читать всем</span></strong>Базовые главы для прорабов, офиса и руководителя.</div>
    <div class="legend-card"><strong><span class="badge practice">Практика</span></strong>Готовые сценарии и частые проблемы.</div>
    <div class="legend-card"><strong><span class="badge optional">По необходимости</span></strong>Разделы, которые открывают, когда появляется конкретная задача.</div>
    <div class="legend-card"><strong><span class="badge reference">Справочно</span></strong>Фоновые объяснения: безопасность, проверки, ограничения.</div>
    <div class="legend-card"><strong><span class="badge admin">Администратору</span></strong>Команды и действия, которые нужны только ответственному администратору.</div>
  </div>
</section>

<section class="toc">
  <h1>Оглавление</h1>
  ${tocHtml(toc)}
</section>

<main>
${body}
</main>
</body>
</html>`;

fs.writeFileSync(htmlPath, html, 'utf8');

const browsers = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const browser = browsers.find((candidate) => fs.existsSync(candidate));
if (!browser) {
  console.error('Chrome or Edge was not found. HTML was generated:', htmlPath);
  process.exit(1);
}

const result = spawnSync(browser, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--print-to-pdf=${pdfPath}`,
  `file:///${htmlPath.replace(/\\/g, '/')}`,
], { stdio: 'inherit' });

if (result.status !== 0) {
  process.exit(result.status || 1);
}

fs.rmSync(htmlPath, { force: true });
console.log(`Generated ${pdfPath}`);
