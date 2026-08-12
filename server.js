import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseUID, normalizeBuild } from './core.js';
import { findConveneLink, trackerPlatform } from './convene-link.js';
import { wwuidMeta } from './character-rules.js';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const apiOrigin = 'https://api.wuwa.build';
const resourceOrigin = 'https://ww1.loping151.top';
const resourceCache = new Map();
let scoringUpdateCache;
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

  const latest = new Map();
  for (const build of summaries) {
    const previous = latest.get(build.character?.id);
    if (!previous || previous.timestamp < build.timestamp) latest.set(build.character?.id, build);
  }
  const builds = [];
  for (const summary of [...latest.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
    const build = normalizeBuild(await remoteJSON(`/build/${encodeURIComponent(summary.id)}`));
    const weapon = await resourceJSON(`/XutheringWavesUID/resource/map/detail_json/weapon/${build.weaponId}.json`);
    build.weaponName = weapon?.name;
    await Promise.all(build.echoes.map(async echo => {
      echo.resourceId = String(echo.id).slice(0, -1);
      const resource = await resourceJSON(`/XutheringWavesUID/resource/map/detail_json/echo/${echo.resourceId}.json`);
      echo.name = resource?.name;
      echo.intensity = resource?.intensityCode;
    }));
    builds.push(build);
  }
  const data = { uid, builds, syncedAt: new Date().toISOString() };
  return data;
}

export async function checkScoringUpdate() {
  if (scoringUpdateCache && Date.now() - scoringUpdateCache.time < 3_600_000) return scoringUpdateCache.data;
  const response = await fetch('https://api.github.com/repos/raared/WWUID/commits/master', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'wuwa-companion' }, redirect: 'manual', signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`评分配置检查失败（HTTP ${response.status}）`);
  const value = await response.json();
  if (!/^[a-f0-9]{40}$/.test(value?.sha) || !/^https:\/\/github\.com\/raared\/WWUID\/commit\/[a-f0-9]{40}$/.test(value?.html_url)) {
    throw new Error('WWUID 版本信息格式已变化');
  }
  const data = { current: wwuidMeta.commit, latest: value.sha, available: value.sha !== wwuidMeta.commit, url: value.html_url };
  scoringUpdateCache = { time: Date.now(), data };
  return data;
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => console.log(`WuWa Companion: http://127.0.0.1:${port}`));
}
