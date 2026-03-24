import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const MANIFEST_FILENAME = 'denna-repo.denna-spec.json';

export function loadManifest(dir) {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

export function reconcileEntries(manifest, discoveredFiles) {
  const errors = [];
  const entrySet = new Set(manifest.repository.entries);
  const fileSet = new Set(discoveredFiles);

  for (const entry of entrySet) {
    if (!fileSet.has(entry)) {
      errors.push(
        `${entry} is listed in ${MANIFEST_FILENAME} entries but was not found on disk`
      );
    }
  }

  for (const file of fileSet) {
    if (!entrySet.has(file)) {
      errors.push(
        `${file} exists but is not listed in ${MANIFEST_FILENAME} entries`
      );
    }
  }

  return errors;
}

export { MANIFEST_FILENAME };
