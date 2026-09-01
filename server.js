import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { parseUID, normalizeBuild } from './core.js';
import { findConveneLink, trackerPlatform } from './convene-link.js';
import { echoScannerProgress, echoScannerStatus, scanMacEchoes } from './echo-scanner.js';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const apiOrigin = 'https://api.wuwa.build';
const resourceOrigin = 'https://ww1.loping151.top';
const resourceCache = new Map();
let scoringUpdateCache;
let scoringUpdatePromise;
const runFile = promisify(execFile);
const staticFiles = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/core.js', ['core.js', 'text/javascript; charset=utf-8']],
  ['/character-rules.js', ['character-rules.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['web/styles.css', 'text/css; charset=utf-8']]
]);

async function remoteJSON(path) {
  const url = new URL(path, apiOrigin);
  if (url.protocol !== 'https:' || url.origin !== apiOrigin) throw new Error('非法远程地址');
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  if (response.status >= 300 && response.status < 400) throw new Error('WuWaBuilds 返回了未允许的跳转');
  if (response.url && new URL(response.url).origin !== apiOrigin) throw new Error('WuWaBuilds 响应来源异常');
  if (!response.ok) throw new Error(`WuWaBuilds 请求失败（HTTP ${response.status}）`);
  return response.json();
}

async function resourceJSON(path) {
  if (resourceCache.has(path)) return resourceCache.get(path);
  const url = new URL(path, resourceOrigin);
  if (url.origin !== resourceOrigin) throw new Error('非法素材地址');
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const value = await response.json();
  resourceCache.set(path, value);
  return value;
}

export async function loadLatestBuilds(input) {
  const uid = parseUID(input);

  const summaries = [];
  let page = 1;
  let total = Infinity;
  while (summaries.length < total) {
    const result = await remoteJSON(`/profile/${uid}/builds?page=${page}&pageSize=50`);
    if (!Array.isArray(result.builds) || !Number.isInteger(result.total)) throw new Error('WuWaBuilds 列表格式已变化');
    summaries.push(...result.builds);
    total = result.total;
    page += 1;
    if (!result.builds.length) break;
  }

  const { latest, previous } = selectBuildHistory(summaries);

  async function loadBuild(summary) {
    const build = normalizeBuild(await remoteJSON(`/build/${encodeURIComponent(summary.id)}`));
    const weapon = await resourceJSON(`/XutheringWavesUID/resource/map/detail_json/weapon/${build.weaponId}.json`);
    build.weaponName = weapon?.name;
    await Promise.all(build.echoes.map(async echo => {
      echo.resourceId = String(echo.id).slice(0, -1);
      const resource = await resourceJSON(`/XutheringWavesUID/resource/map/detail_json/echo/${echo.resourceId}.json`);
      echo.name = resource?.name;
      echo.intensity = resource?.intensityCode;
    }));
    return build;
  }
  const [builds, previousBuilds] = await Promise.all([
    Promise.all(latest.map(loadBuild)),
    Promise.all(previous.map(loadBuild))
  ]);
  const data = { uid, builds, previousBuilds, syncedAt: new Date().toISOString() };
  return data;
}

export function selectBuildHistory(summaries) {
  const history = new Map();
  for (const build of summaries) {
    const builds = history.get(build.character?.id) || [];
    builds.push(build);
    history.set(build.character?.id, builds);
  }
  history.forEach(builds => builds.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
  return {
    latest: [...history.values()].map(builds => builds[0]).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    previous: [...history.values()].map(builds => builds[1]).filter(Boolean)
  };
}

export async function checkScoringUpdate(force = false) {
  if (!force && scoringUpdateCache && Date.now() - scoringUpdateCache.time < 3_600_000) return scoringUpdateCache.data;
  const response = await fetch('https://api.github.com/repos/Loping151/XutheringWavesUID/commits/HEAD', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'wuwa-companion' }, redirect: 'manual', signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`评分配置检查失败（HTTP ${response.status}）`);
  const value = await response.json();
  if (!/^[a-f0-9]{40}$/.test(value?.sha) || !/^https:\/\/github\.com\/Loping151\/XutheringWavesUID\/commit\/[a-f0-9]{40}$/.test(value?.html_url)) {
    throw new Error('XutheringWavesUID 版本信息格式已变化');
  }
  const current = JSON.parse(await readFile(join(root, 'wwuid-sync-report.json'), 'utf8')).resourceCommit;
  const data = { current, latest: value.sha, available: value.sha !== current, url: value.html_url };
  scoringUpdateCache = { time: Date.now(), data };
  return data;
}

export async function updateScoringRules() {
  if (scoringUpdatePromise) return scoringUpdatePromise;
  scoringUpdatePromise = (async () => {
    const update = await checkScoringUpdate(true);
    if (!update.available) return { ...update, updated: false };
    const files = ['character-rules.js', 'echo-data.js', 'wwuid-sync-report.json', 'LICENSE'];
    const backups = await Promise.all(files.map(file => readFile(join(root, file))));
    try {
      await runFile(process.execPath, [join(root, 'scripts/sync-wwuid.js'), '--resource-commit', update.latest], { timeout: 180_000 });
      const installed = JSON.parse(await readFile(join(root, 'wwuid-sync-report.json'), 'utf8')).resourceCommit;
      if (installed !== update.latest) throw new Error('同步后的版本与目标版本不一致');
      const result = { ...update, current: installed, available: false, updated: true };
      scoringUpdateCache = { time: Date.now(), data: result };
      return result;
    } catch (error) {
      await Promise.all(files.map((file, index) => writeFile(join(root, file), backups[index])));
      throw new Error(`评分配置更新失败：${error.stderr?.trim() || error.message}`);
    }
  })().finally(() => { scoringUpdatePromise = undefined; });
  return scoringUpdatePromise;
}

export const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    if (request.method === 'GET' && url.pathname === '/api/builds') {
      const data = await loadLatestBuilds(url.searchParams.get('profile'));
      return sendJSON(response, 200, data);
    }
    if (request.method === 'GET' && url.pathname === '/api/convene-link') {
      try {
        return sendJSON(response, 200, await findConveneLink());
      } catch (error) {
        return sendJSON(response, 404, { platform: trackerPlatform(), error: error.message });
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/scoring-update') {
      return sendJSON(response, 200, await checkScoringUpdate());
    }
    if (request.method === 'POST' && url.pathname === '/api/scoring-update') {
      if (request.headers['x-wuwa-action'] !== 'update-scoring') return sendJSON(response, 403, { error: '更新请求校验失败' });
      return sendJSON(response, 200, await updateScoringRules());
    }
    if (request.method === 'GET' && url.pathname === '/api/echo-scanner') {
      return sendJSON(response, 200, await echoScannerStatus());
    }
    if (request.method === 'GET' && url.pathname === '/api/echo-scan-progress') {
      return sendJSON(response, 200, await echoScannerProgress());
    }
    if (request.method === 'POST' && url.pathname === '/api/echo-scan') {
      const input = await readJSON(request);
      return sendJSON(response, 200, await scanMacEchoes(input.limit == null || input.limit === '' ? 0 : Number(input.limit)));
    }
    if (request.method !== 'GET') return sendJSON(response, 405, { error: '不支持这个请求' });
    const file = staticFiles.get(url.pathname);
    if (!file) return sendJSON(response, 404, { error: '页面不存在' });
    response.writeHead(200, { 'content-type': file[1], 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
    response.end(await readFile(join(root, file[0])));
  } catch (error) {
    sendJSON(response, 400, { error: error instanceof Error ? error.message : '请求失败' });
  }
});

function sendJSON(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJSON(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error('请求内容过大');
  }
  try { return body ? JSON.parse(body) : {}; } catch { throw new Error('请求内容不是有效 JSON'); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => console.log(`WuWa Companion: http://127.0.0.1:${port}`));
}
