import { readFileSync, existsSync, appendFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { glob } from 'glob';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const patterns = (process.env.INPUT_PATTERNS || '**/*.denna-spec.json').split('\n').map(p => p.trim()).filter(Boolean);
const excludePatterns = (process.env.INPUT_EXCLUDE || '').split('\n').map(p => p.trim()).filter(Boolean);
const strict = process.env.INPUT_STRICT === 'true';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  loadSchema: async (uri) => {
    if (uri.startsWith('https://spec.denna.io/')) {
      const schemaPath = join(
        process.env.GITHUB_ACTION_PATH || dirname(new URL(import.meta.url).pathname),
        '..',
        'docs',
        uri.replace('https://spec.denna.io/', '')
      );
      if (existsSync(schemaPath)) {
        return JSON.parse(readFileSync(schemaPath, 'utf-8'));
      }
    }

    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch schema: ${uri} (${response.status})`);
    }
    return response.json();
  }
});
addFormats(ajv);

function resolveLocalRef(schemaUri, fileDir) {
  if (schemaUri.startsWith('http://') || schemaUri.startsWith('https://')) {
    return { type: 'remote', uri: schemaUri };
  }
  const resolved = resolve(fileDir, schemaUri);
  if (existsSync(resolved)) {
    return { type: 'local', path: resolved };
  }
  return { type: 'not_found', uri: schemaUri };
}

async function loadAndCompileSchema(schemaPath) {
  const schemaContent = JSON.parse(readFileSync(schemaPath, 'utf-8'));

  const processRefs = (obj, baseDir) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => processRefs(item, baseDir));

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        const [refPath, fragment] = value.split('#');
        if (refPath && !refPath.startsWith('http')) {
          const resolved = resolve(baseDir, refPath);
          if (existsSync(resolved)) {
            const refSchema = JSON.parse(readFileSync(resolved, 'utf-8'));
            if (fragment) {
              result[key] = `${refSchema.$id || resolved}#${fragment}`;
              if (!ajv.getSchema(refSchema.$id || resolved)) {
                try { ajv.addSchema(refSchema, refSchema.$id || resolved); } catch {}
              }
            } else {
              result[key] = refSchema.$id || resolved;
              if (!ajv.getSchema(refSchema.$id || resolved)) {
                try { ajv.addSchema(refSchema, refSchema.$id || resolved); } catch {}
              }
            }
          } else {
            result[key] = value;
          }
        } else {
          result[key] = value;
        }
      } else {
        result[key] = processRefs(value, baseDir);
      }
    }
    return result;
  };

  const processed = processRefs(schemaContent, dirname(schemaPath));

  const schemaId = processed.$id || schemaPath;
  if (!ajv.getSchema(schemaId)) {
    ajv.addSchema(processed, schemaId);
  }
  return ajv.compile(processed);
}

async function main() {
  const files = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      ignore: excludePatterns,
      absolute: true,
      nodir: true
    });
    files.push(...matches);
  }

  const uniqueFiles = [...new Set(files)];

  if (uniqueFiles.length === 0) {
    console.log('No .denna-spec.json files found matching the patterns.');
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, 'validated=0\nfailed=0\n');
    }
    return;
  }

  console.log(`Found ${uniqueFiles.length} .denna-spec.json file(s) to validate.\n`);

  let validated = 0;
  let failed = 0;
  const errors = [];

  for (const filePath of uniqueFiles) {
    const relativePath = filePath.replace(process.cwd() + '/', '');
    let fileContent;

    try {
      fileContent = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.log(`FAIL: ${relativePath}`);
      console.log(`  Invalid JSON: ${e.message}\n`);
      errors.push({ file: relativePath, error: `Invalid JSON: ${e.message}` });
      failed++;
      continue;
    }

    const schemaRef = fileContent.$schema;
    if (!schemaRef) {
      console.log(`FAIL: ${relativePath}`);
      console.log('  Missing $schema field.\n');
      errors.push({ file: relativePath, error: 'Missing $schema field' });
      failed++;
      continue;
    }

    const ref = resolveLocalRef(schemaRef, dirname(filePath));

    if (ref.type === 'not_found') {
      console.log(`FAIL: ${relativePath}`);
      console.log(`  Schema not found: ${schemaRef}\n`);
      errors.push({ file: relativePath, error: `Schema not found: ${schemaRef}` });
      failed++;
      continue;
    }

    try {
      let validate;
      if (ref.type === 'local') {
        validate = await loadAndCompileSchema(ref.path);
      } else {
        validate = await ajv.compileAsync({ $ref: ref.uri });
      }

      const valid = validate(fileContent);
      if (valid) {
        console.log(`PASS: ${relativePath}`);
        validated++;
      } else {
        console.log(`FAIL: ${relativePath}`);
        for (const err of validate.errors) {
          console.log(`  ${err.instancePath || '/'}: ${err.message}`);
        }
        console.log('');
        errors.push({
          file: relativePath,
          error: validate.errors.map(e => `${e.instancePath || '/'}: ${e.message}`).join('; ')
        });
        failed++;
      }
    } catch (e) {
      console.log(`FAIL: ${relativePath}`);
      console.log(`  Schema compilation error: ${e.message}\n`);
      errors.push({ file: relativePath, error: `Schema compilation error: ${e.message}` });
      failed++;
    }
  }

  console.log(`\nResults: ${validated} passed, ${failed} failed out of ${uniqueFiles.length} files.`);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `validated=${validated}\nfailed=${failed}\n`);
  }

  if (failed > 0) {
    console.log('\nValidation failed.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
