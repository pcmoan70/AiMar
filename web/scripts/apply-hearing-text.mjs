// After extract_text.py has run over the lysingsblad archive: copy the text of each attached
// application document into public/data/text/lys_<id>_doc.txt and flag the notice.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const TEXT_DIR = process.env.TEXT_DIR ?? '/media/pc/ext4TB/AiMar/docs/text';
const OUT = new URL('../public/data/', import.meta.url);
const CAP = 200_000;
const target = fileURLToPath(new URL('hearings.geojson', OUT));
const fc = JSON.parse(await readFile(target, 'utf8'));
let done = 0;
for (const f of fc.features) {
  const h = f.properties;
  if (!h.docFile) continue;
  const stem = h.docFile.replace(/\.[^.]+$/, '');
  const text = await readFile(`${TEXT_DIR}/${stem}.txt`, 'utf8').catch(() => null);
  if (!text) continue;
  const body = `\uFEFF${text.length > CAP ? `${text.slice(0, CAP)}\n\n… [${text.length - CAP} tegn til i originalen / more characters in the original]` : text}`;
  await writeFile(new URL(`text/lys_${h.id}_doc.txt`, OUT), body);
  h.docText = true;
  done++;
}
await writeFile(target + '.tmp', JSON.stringify(fc));
await rename(target + '.tmp', target);
console.log(`hearing documents as text: ${done}`);
