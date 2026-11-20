import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const output = join(root, 'store', 'assets');
const origin = 'https://store-preview.invalid';
const icon = await readFile(join(root, 'store', 'branding', 'icon.svg'), 'utf8');
await mkdir(output, { recursive: true });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const unexpectedRequests = [];
  const pageErrors = [];
  context.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(error.message)));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      unexpectedRequests.push(`${url.origin}${url.pathname}`);
      await route.abort('blockedbyclient');
      return;
    }
    const relative = decodeURIComponent(url.pathname).slice(1);
    const file = resolve(root, 'dist', relative);
    assert.ok(file.startsWith(`${resolve(root, 'dist')}${sep}`), 'Preview path escaped dist');
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
    };
    await route.fulfill({
      body: await readFile(file),
      contentType: contentTypes[extname(file)] ?? 'application/octet-stream',
    });
  });

  await context.addInitScript(() => {
    const now = Date.now();
    const settings = {
      notifications: {
        stageCompleted: true,
        stageFailed: true,
        pipelineCompleted: true,
        pipelineFailed: true,
      },
      showBadge: true,
      openPopupOnFinish: true,
      logLevel: 'info',
    };
    const makeRun = (buildId, displayName, state, result, stages) => ({
      id: `demo-org/sample-project/${buildId}`,
      ref: {
        collectionBaseUrl: 'https://dev.azure.com/demo-org',
        organization: 'demo-org',
        project: 'sample-project',
        buildId,
      },
      displayName,
      runUrl: `https://dev.azure.com/demo-org/sample-project/_build/results?buildId=${buildId}`,
      state,
      result,
      stages,
      isActive: state !== 'completed',
      addedAt: now - buildId * 1000,
      lastPolledAt: now,
    });
    const stage = (id, name, state, result, order) => ({
      id,
      name,
      state,
      result,
      order,
      refName: id,
    });
    const running = makeRun(1042, 'Sample app - CI #1042', 'inProgress', 'none', [
      stage('build', 'Build', 'completed', 'succeeded', 1),
      stage('test', 'Test', 'inProgress', 'none', 2),
    ]);
    const failed = makeRun(1041, 'Sample API - CI #1041', 'completed', 'failed', [
      stage('test', 'Integration tests', 'completed', 'failed', 1),
    ]);
    const review = makeRun(1043, 'Sample app - Release #1043', 'inProgress', 'none', [
      stage('build', 'Build and test', 'completed', 'succeeded', 1),
      stage('deploy', 'Deploy to staging', 'pending', 'none', 2),
    ]);
    review.pendingReviews = [{ id: 'demo-approval', kind: 'approval', stageId: 'deploy' }];
    const state = {
      trackedRuns: location.hash === '#review' ? [review] : [running, failed],
      history: [],
      settings,
    };
    globalThis.chrome = {
      runtime: {
        sendMessage(message, callback) {
          switch (message.type) {
            case 'GET_STATE':
              callback({ ok: true, type: 'STATE', state });
              break;
            case 'GET_SETTINGS':
              callback({ ok: true, type: 'SETTINGS', settings });
              break;
            case 'MARK_FINISHED_SEEN':
              callback({ ok: true, type: 'OK' });
              break;
            default:
              throw new Error(`Unsupported store preview action: ${message.type}`);
          }
        },
      },
      tabs: { query: (_query, callback) => callback([{ url: running.runUrl }]) },
    };
  });

  const page = await context.newPage();
  async function savePng(name, buffer, width, height) {
    assert.equal(buffer.readUInt32BE(16), width, `${name}: incorrect width`);
    assert.equal(buffer.readUInt32BE(20), height, `${name}: incorrect height`);
    await writeFile(join(output, name), buffer);
  }

  for (const size of [16, 32, 48, 128, 300]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${icon}`,
    );
    const png = await page.screenshot({ omitBackground: true });
    await savePng(`logo_${size}x${size}.png`, png, size, size);
    if (size !== 300) {
      await writeFile(join(root, 'public', 'icons', `icon-${size}.png`), png);
    }
  }

  const pipelineArt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 280">
    <path d="M100 140H540" stroke="#3b71ae" stroke-width="12"/>
    <circle cx="100" cy="140" r="58" fill="#15803d"/>
    <path d="M75 140l17 18 34-38" stroke="white" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="320" cy="140" r="58" fill="#0969da"/>
    <path d="M320 104a36 36 0 1 1-36 36" stroke="white" stroke-width="9" fill="none" stroke-linecap="round"/>
    <circle cx="540" cy="140" r="58" fill="#dc2626"/>
    <path d="M521 121l38 38m0-38l-38 38" stroke="white" stroke-width="9" fill="none" stroke-linecap="round"/>
  </svg>`;
  for (const [name, width, height] of [
    ['promo_small_440x280.png', 440, 280],
    ['promo_large_1400x560.png', 1400, 560],
  ]) {
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>
      *{box-sizing:border-box}body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4vh;background:radial-gradient(ellipse at 30% 10%,#174b85,#091a32 75%)}
      .brand{width:20vh;height:20vh}.pipeline{width:86vw;max-width:900px;height:48vh}
      svg{width:100%;height:100%;display:block}
    </style><div class="brand">${icon}</div><div class="pipeline">${pipelineArt}</div>`);
    await savePng(name, await page.screenshot(), width, height);
  }

  const scenes = [
    {
      key: 'progress',
      title: 'Your builds.\nOne clear view.',
      detail: 'Follow stages and spot failures\nwithout keeping every tab open.',
      path: '/popup.html',
      width: 380,
      height: 560,
    },
    {
      key: 'review',
      title: 'Know when\nyou are needed.',
      detail: 'See approval waits and jump\nstraight to Azure DevOps.',
      path: '/popup.html#review',
      width: 380,
      height: 560,
    },
    {
      key: 'settings',
      title: 'Alerts on\nyour terms.',
      detail: 'Choose your notifications,\ntoolbar badge, and popup behavior.',
      path: '/options.html',
      width: 640,
      height: 740,
    },
  ];
  for (const scene of scenes) {
    await page.setViewportSize({ width: scene.width, height: scene.height });
    await page.goto(`${origin}${scene.path}`);
    await page.getByRole('heading', { name: 'ADO Pipeline Tracker', exact: true }).waitFor();
    if (scene.key === 'settings') {
      await page
        .getByRole('checkbox', { name: 'Stage completed', exact: true })
        .waitFor({ state: 'attached' });
    } else {
      await page
        .getByText(
          scene.key === 'review' ? 'Sample app - Release #1043' : 'Sample app - CI #1042',
          { exact: true },
        )
        .waitFor();
      if (scene.key === 'review') {
        assert.equal(
          await page.getByRole('link', { name: 'Review in Azure DevOps', exact: true }).count(),
          1,
        );
      } else {
        assert.equal(
          await page.getByRole('button', { name: 'Rerun failed jobs', exact: true }).count(),
          1,
        );
      }
    }
    await page.evaluate(() => document.fonts.ready);
    const capture = await page.screenshot();
    await page.goto('about:blank');
    await page.setViewportSize({ width: 1280, height: 800 });
    const settingsScene = scene.key === 'settings';
    await page.setContent(`<style>
      *{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 10% 0%,#174b85,#091a32 80%);color:white;font-family:Arial,Helvetica,sans-serif;height:800px;overflow:hidden}
      main{position:absolute;left:76px;top:100px;width:${settingsScene ? 465 : 600}px}
      .brand{display:flex;align-items:center;gap:14px;font-size:19px;font-weight:bold}.brand svg{width:52px;height:52px}
      h1{font-size:${settingsScene ? 55 : 68}px;line-height:1.08;letter-spacing:-2px;margin:64px 0 28px;white-space:pre-line}
      p{font-size:23px;line-height:1.55;color:#c1d9f3;white-space:pre-line}
      .preview{position:absolute;right:${settingsScene ? 40 : 102}px;top:${settingsScene ? 52 : 92}px;width:${settingsScene ? 600 : 418}px;border-radius:12px;box-shadow:0 24px 70px #0008;overflow:hidden;background:white}
      .preview img{width:100%;display:block}.note{position:absolute;bottom:40px;left:76px;color:#99b9da;font-size:14px}
    </style><main><div class="brand">${icon}<span>ADO Pipeline Tracker</span></div><h1>${scene.title}</h1><p>${scene.detail}</p></main>
    <div class="preview"><img src="data:image/png;base64,${capture.toString('base64')}" alt="Actual extension UI with fictional sample data"></div>
    <div class="note">Actual extension interface. Fictional sample data. No live account connected.</div>`);
    await page.locator('img').evaluate((image) => image.decode());
    await savePng(`screenshot_${scene.key}_1280x800.png`, await page.screenshot(), 1280, 800);
  }
  assert.deepEqual(
    unexpectedRequests,
    [],
    'External requests were blocked during asset generation',
  );
  assert.deepEqual(pageErrors, [], 'UI errors occurred during asset generation');
  console.log(
    'Generated store artwork and fictional-data screenshots; no external requests or existing browser profiles used.',
  );
} finally {
  await browser.close();
}
