// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve('scripts', 'package-extension.mjs');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'ado-store-package-'));
  temporaryDirectories.push(root);
  for (const directory of ['assets', 'background', 'icons']) {
    mkdirSync(join(root, 'dist', directory), { recursive: true });
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  writeFileSync(
    join(root, 'dist', 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      version: '1.0.0',
      icons: { 128: 'icons/icon-128.png' },
      action: { default_popup: 'popup.html', default_icon: { 128: 'icons/icon-128.png' } },
      options_ui: { page: 'options.html' },
      background: { service_worker: 'background/service-worker.js' },
    }),
  );
  writeFileSync(join(root, 'dist', 'popup.html'), '<script src="./assets/popup.js"></script>');
  writeFileSync(join(root, 'dist', 'options.html'), '<script src="./assets/popup.js"></script>');
  writeFileSync(join(root, 'dist', 'assets', 'popup.js'), 'console.log("fixture");');
  writeFileSync(join(root, 'dist', 'assets', 'popup.js.map'), 'source map must not be packaged');
  writeFileSync(join(root, 'dist', 'background', 'service-worker.js'), '// fixture worker');
  writeFileSync(join(root, 'dist', 'icons', 'icon-128.png'), 'fixture icon');
  return root;
}

function run(root: string) {
  return execFileSync(process.execPath, [script], { cwd: root, stdio: 'pipe' });
}

describe('Store upload package', () => {
  it('puts manifest and runtime resources at the ZIP root without source maps or workspace files', () => {
    const root = fixture();
    writeFileSync(join(root, '.env'), 'fixture-private-data');
    run(root);
    const archive = unzipSync(
      readFileSync(join(root, 'release', 'ado-pipeline-tracker-1.0.0.zip')),
    );
    expect(Object.keys(archive).sort()).toEqual([
      'assets/popup.js',
      'background/service-worker.js',
      'icons/icon-128.png',
      'manifest.json',
      'options.html',
      'popup.html',
    ]);
    expect(JSON.parse(Buffer.from(archive['manifest.json']).toString()).version).toBe('1.0.0');
  });

  it('rejects unexpected build output instead of accidentally packaging it', () => {
    const root = fixture();
    writeFileSync(join(root, 'dist', 'capture.log'), 'fixture-private-data');
    expect(() => run(root)).toThrow(/Unexpected output file: capture.log/);
  });

  it('rejects missing runtime resources and mismatched versions', () => {
    const root = fixture();
    rmSync(join(root, 'dist', 'icons', 'icon-128.png'));
    expect(() => run(root)).toThrow(/Missing manifest resource/);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '2.0.0' }));
    expect(() => run(root)).toThrow(/Package and manifest versions must match/);
  });
});
