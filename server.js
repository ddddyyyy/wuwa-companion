import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseUID, normalizeBuild } from './core.js';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const apiOrigin = 'https://api.wuwa.build';
const resourceOrigin = 'https://ww1.loping151.top';
const cache = new Map();
const resourceCache = new Map();
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
  const cached = cache.get(uid);
  if (cached && Date.now() - cached.time < 300_000) return { ...cached.data, cached: true };

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
  cache.set(uid, { time: Date.now(), data });
  return { ...data, cached: false };
}

export const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
    if (request.method !== 'GET') return sendJSON(response, 405, { error: '只支持 GET 请求' });
    if (url.pathname === '/api/builds') {
      const data = await loadLatestBuilds(url.searchParams.get('profile'));
      return sendJSON(response, 200, data);
    }
    const file = staticFiles.get(url.pathname);
    if (!file) return sendJSON(response, 404, { error: '页面不存在' });
    response.writeHead(200, { 'content-type': file[1], 'x-content-type-options': 'nosniff' });
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
