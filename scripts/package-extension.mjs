import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';

const root = process.cwd();
const dist = join(root, 'dist');
const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3, 'Expected a Manifest V3 extension');
assert.equal(manifest.version, pkg.version, 'Package and manifest versions must match');
assert.match(manifest.version, /^\d+(\.\d+){0,3}$/, 'Invalid extension version');

const files = {};
async function collect(directory = '') {
  for (const entry of await readdir(join(dist, directory), { withFileTypes: true })) {
    const name = directory ? `${directory}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), `Symlink is not allowed in the package: ${name}`);
    if (entry.isDirectory()) {
      assert.match(name, /^(assets|background|icons)$/, `Unexpected output directory: ${name}`);
      await collect(name);
    } else if (entry.isFile() && !name.endsWith('.map')) {
      assert.match(
        name,
        /^(manifest\.json|popup\.html|options\.html|assets\/[\w.-]+\.(js|css)|background\/service-worker\.js|icons\/[\w.-]+\.png)$/,
        `Unexpected output file: ${name}`,
      );
      files[name] = await readFile(join(dist, directory, entry.name));
    }
  }
}
await collect();

const references = [
  manifest.action.default_popup,
  manifest.options_ui.page,
  manifest.background.service_worker,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
];
for (const reference of references) {
  assert.ok(Object.hasOwn(files, reference), `Missing manifest resource: ${reference}`);
}
for (const html of ['popup.html', 'options.html']) {
  const content = files[html].toString('utf8');
  for (const [, reference] of content.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(
      Object.hasOwn(files, reference.replace(/^\.\//, '')),
      `Missing or remote HTML resource: ${reference}`,
    );
  }
}

const release = join(root, 'release');
await mkdir(release, { recursive: true });
const output = join(release, `ado-pipeline-tracker-${manifest.version}.zip`);
await writeFile(output, zipSync(files, { level: 9 }));
console.log(
  `Created ${output} (${Object.keys(files).length} runtime files; no source maps or store assets).`,
);
