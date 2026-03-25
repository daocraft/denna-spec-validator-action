import { describe, it, expect } from 'vitest';
import { loadManifest, reconcileEntries } from '../action/manifest.mjs';
import { join } from 'path';

const FIXTURES = join(import.meta.dirname, 'fixtures');

describe('loadManifest', () => {
  it('returns manifest data when denna-repo.denna-spec.json exists', () => {
    const result = loadManifest(join(FIXTURES, 'mismatch-entries'));
    expect(result).not.toBeNull();
    expect(result.metadata.id).toBe('mismatch-repo');
    expect(result.repository.entries).toEqual(['found.denna-spec.json']);
  });

  it('returns null when no manifest exists', () => {
    const result = loadManifest(join(FIXTURES, 'schemas'));
    expect(result).toBeNull();
  });
});

describe('reconcileEntries', () => {
  it('returns no errors when entries match discovered files', () => {
    const manifest = {
      repository: {
        entries: ['a.denna-spec.json', 'b.denna-spec.json']
      }
    };
    const discoveredFiles = ['a.denna-spec.json', 'b.denna-spec.json'];
    const errors = reconcileEntries(manifest, discoveredFiles);
    expect(errors).toEqual([]);
  });

  it('reports files in entries but missing from disk', () => {
    const manifest = {
      repository: {
        entries: ['exists.denna-spec.json', 'missing.denna-spec.json']
      }
    };
    const discoveredFiles = ['exists.denna-spec.json'];
    const errors = reconcileEntries(manifest, discoveredFiles);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('missing.denna-spec.json');
    expect(errors[0]).toContain('listed in');
  });

  it('reports files on disk but missing from entries', () => {
    const manifest = {
      repository: {
        entries: ['listed.denna-spec.json']
      }
    };
    const discoveredFiles = ['listed.denna-spec.json', 'unlisted.denna-spec.json'];
    const errors = reconcileEntries(manifest, discoveredFiles);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('unlisted.denna-spec.json');
    expect(errors[0]).toContain('not listed');
  });

  it('reports both directions of mismatch', () => {
    const manifest = {
      repository: {
        entries: ['only-in-manifest.denna-spec.json']
      }
    };
    const discoveredFiles = ['only-on-disk.denna-spec.json'];
    const errors = reconcileEntries(manifest, discoveredFiles);
    expect(errors).toHaveLength(2);
  });
});
