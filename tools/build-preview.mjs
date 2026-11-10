// Bundles the app into one self-contained HTML file (used for the Claude preview).
// The real site doesn't need this: upload the project folder as-is.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stripModule = (src) => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\n/gm, '')
  .replace(/^export\s+(?=(const|function|let|class|async))/gm, '');

const js = ['js/exercises.js', 'js/units.js', 'js/scheduler.js', 'js/anatomy.js', 'js/freshness.js', 'js/progress.js', 'js/tracking.js', 'js/stats.js', 'js/workout.js', 'js/timetable.js', 'js/adjust.js', 'js/readiness.js', 'js/coach.js', 'js/store.js', 'js/sync.js', 'js/app.js'].map((f) => `// ---- ${f} ----\n${stripModule(read(f))}`).join('\n');
const html = read('index.html');
const body = html.slice(html.indexOf('<div class="shell">'), html.indexOf('<script type="module"'));

const out = `<title>Slotted</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#101214">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap" rel="stylesheet">
<style>
${read('styles.css')}
</style>
${body}<script type="module">
${js}
</script>
`;
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/slotted.html', import.meta.url), out);
console.log(`dist/slotted.html ${(out.length / 1024).toFixed(1)} KB`);
