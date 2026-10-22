import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
export const datasetPath = new URL('../data/zywoo-history.json', import.meta.url);
export async function readDataset() {
  return JSON.parse(await fs.readFile(datasetPath, 'utf8'));
}
// Run scrapers sequentially. Re-read before saving to preserve other collections.
export async function updateEvidence(changes) {
  const dataset = await readDataset();
  dataset.evidence = { ...dataset.evidence, ...changes };
  const temporary = new URL(`../data/.zywoo-history-${randomUUID()}.tmp`, import.meta.url);
  try {
    await fs.writeFile(temporary, JSON.stringify(dataset, null, 2) + '\n');
    await fs.rename(temporary, datasetPath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
