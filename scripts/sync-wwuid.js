import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repository = 'https://github.com/raared/WWUID.git';
const scoringRepository = 'https://github.com/Loping151/XutheringWavesUID';
const currentResource = 'https://ww1.loping151.top/XutheringWavesUID/resource/map/character';
const currentDetailResource = 'https://ww1.loping151.top/XutheringWavesUID/resource/map/detail_json';
const root = resolve(import.meta.dirname, '..');
const commitOption = process.argv.indexOf('--commit');
const pinnedCommit = JSON.parse(await readFile(join(root, 'wwuid-sync-report.json'), 'utf8')).commit;
const commit = commitOption >= 0 ? process.argv[commitOption + 1] : pinnedCommit;
if (!/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('请提供完整的 WWUID Commit SHA');
const resourceCommitOption = process.argv.indexOf('--resource-commit');
const resourceCommit = resourceCommitOption >= 0 ? process.argv[resourceCommitOption + 1] : await latestResourceCommit();
if (!/^[a-f0-9]{40}$/.test(resourceCommit || '')) throw new Error('请提供完整的 XutheringWavesUID Commit SHA');
const sourceOption = process.argv.indexOf('--source');
let source = sourceOption >= 0 ? resolve(process.argv[sourceOption + 1] || '') : null;
let temporary;
const statNames = {
  '攻击': 'ATK', '攻击%': 'ATK%', '生命': 'HP', '生命%': 'HP%', '防御': 'DEF', '防御%': 'DEF%',
  '暴击': 'Crit Rate', '暴击伤害': 'Crit DMG', '治疗效果加成': 'Healing Bonus', '共鸣效率': 'Energy Regen',
  '属性伤害加成': 'AttributeDMG', '技能伤害加成': 'SkillDMG',
  '普攻伤害加成': 'Basic Attack DMG Bonus', '重击伤害加成': 'Heavy Attack DMG Bonus',
  '共鸣技能伤害加成': 'Resonance Skill DMG Bonus', '共鸣解放伤害加成': 'Resonance Liberation DMG Bonus'
};

try {
  if (!source) {
    temporary = await mkdtemp(join(tmpdir(), 'wwuid-sync-'));
    execFileSync('git', ['init', '-q', temporary]);
    execFileSync('git', ['-C', temporary, 'fetch', '-q', '--depth', '1', repository, commit], { timeout: 60_000 });
    execFileSync('git', ['-C', temporary, 'checkout', '-q', '--detach', 'FETCH_HEAD']);
    source = temporary;
  }
  await sync(source);
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true });
}

async function sync(sourceRoot) {
  if (sourceOption < 0) {
    const actualCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (actualCommit !== commit) throw new Error(`WWUID 版本不匹配：期望 ${commit}，得到 ${actualCommit}`);
  }

  const mapRoot = join(sourceRoot, 'WutheringWavesUID/utils/map/character');
  const detailRoot = join(sourceRoot, 'WutheringWavesUID/utils/map/detail_json');
  const characterNames = parseCharacterNames(await readFile(join(sourceRoot, 'WutheringWavesUID/utils/resource/constant.py'), 'utf8'));
  const idsByName = Object.entries(characterNames).reduce((result, [id, name]) => {
    (result[name] ||= []).push(id);
    return result;
  }, {});
  const ruleSets = {};
  const unmapped = [];
  let templateCount = 0;
  let conditionCount = 0;

  for (const entry of await readdir(mapRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'default') continue;
    const ids = idsByName[entry.name];
    if (!ids) { unmapped.push(entry.name); continue; }
    const directory = join(mapRoot, entry.name);
    const files = (await readdir(directory)).filter(name => name.startsWith('calc') && name.endsWith('.json')).sort();
    const templates = {};
    for (const file of files) templates[file] = convert(JSON.parse(await readFile(join(directory, file), 'utf8')));
    const conditionFile = (await exists(join(directory, 'condition-user.json'))) ? 'condition-user.json' : 'condition.json';
    const conditions = await exists(join(directory, conditionFile))
      ? JSON.parse(await readFile(join(directory, conditionFile), 'utf8')) : [];
    for (const id of ids) ruleSets[id] = {
      characterName: entry.name,
      attribute: attributeFor(id),
      defaultTemplate: 'calc.json',
      templates,
      conditions
    };
    templateCount += files.length;
    conditionCount += conditions.length;
  }

  const currentRules = await loadCurrentRules();
  for (const { id, name, configs, conditions } of currentRules) {
    const previous = ruleSets[id];
    characterNames[id] = name;
    ruleSets[id] = {
      characterName: name, attribute: attributeFor(id), defaultTemplate: 'calc.json',
      templates: { ...previous?.templates, ...Object.fromEntries(Object.entries(configs).map(([file, config]) => [file, convert(config)])) },
      conditions: conditions.length ? conditions : previous?.conditions || []
    };
  }
  const uniqueRules = new Map(Object.values(ruleSets).map(rule => [rule.characterName, rule]));
  templateCount = [...uniqueRules.values()].reduce((sum, rule) => sum + Object.keys(rule.templates).length, 0);
  conditionCount = [...uniqueRules.values()].reduce((sum, rule) => sum + rule.conditions.length, 0);
  const currentSonatas = await loadCurrentSonatas();
  const meta = {
    repository,
    commit,
    scoringRepository,
    resourceCommit,
    currentResource,
    license: 'GPL-3.0-only',
    characterDirectories: new Set(Object.values(ruleSets).map(rule => rule.characterName)).size,
    characterIds: Object.keys(ruleSets).length,
    templates: templateCount,
    conditions: conditionCount,
    resourceCharacterIds: currentRules.map(rule => rule.id),
    unmapped
  };
  const output = `// Generated by npm run sync:wwuid. Do not edit by hand.\n` +
    `export const wwuidMeta = ${JSON.stringify(meta, null, 2)};\n\n` +
    `export const characterRuleSets = ${JSON.stringify(ruleSets, null, 2)};\n\n` +
    `export const characterNames = ${JSON.stringify(characterNames, null, 2)};\n\n` +
    `export const weaponNames = ${JSON.stringify({ '21020076': '永耀星辉', '21020086': 'Frostburn' }, null, 2)};\n\n` +
    `export const sonataNames = ${JSON.stringify(Object.fromEntries(currentSonatas.map(sonata => [sonata.id, sonata.name])), null, 2)};\n`;
  await writeFile(join(root, 'character-rules.js'), output);
  const echoAliases = JSON.parse(await readFile(join(sourceRoot, 'WutheringWavesUID/utils/alias/echo_alias.json'), 'utf8'));
  const echoCatalog = {};
  for (const file of await readdir(join(detailRoot, 'echo'))) {
    const echo = JSON.parse(await readFile(join(detailRoot, 'echo', file), 'utf8'));
    if (echo.name === '敬请期待') continue;
    echoCatalog[echo.name] = {
      id: String(echo.id), name: echo.name, cost: ({ 0: 1, 1: 3, 3: 4 })[echo.intensityCode],
      aliases: echoAliases[echo.name] || [echo.name],
      sets: Object.entries(echo.group || {}).map(([id, group]) => ({ id: Number(id), name: group.name }))
    };
  }
  const sonataCatalog = {};
  for (const file of await readdir(join(detailRoot, 'sonata'))) {
    const sonata = JSON.parse(await readFile(join(detailRoot, 'sonata', file), 'utf8'));
    sonataCatalog[sonata.name] = { name: sonata.name };
  }
  for (const sonata of currentSonatas) sonataCatalog[sonata.name] = { name: sonata.name };
  const echoOutput = `// Generated by npm run sync:wwuid. Do not edit by hand.\n` +
    `export const echoCatalog = ${JSON.stringify(echoCatalog, null, 2)};\n\n` +
    `export const sonataCatalog = ${JSON.stringify(sonataCatalog, null, 2)};\n`;
  await writeFile(join(root, 'echo-data.js'), echoOutput);
  await writeFile(join(root, 'wwuid-sync-report.json'), `${JSON.stringify(meta, null, 2)}\n`);
  await cp(join(sourceRoot, 'LICENSE'), join(root, 'LICENSE'));
  console.log(`已同步 ${meta.characterDirectories} 个角色目录、${meta.characterIds} 个角色 ID、${templateCount} 个评分模板、${Object.keys(echoCatalog).length} 种声骸。`);
}

async function loadCurrentRules() {
  const index = await remoteText(`${currentResource}/`);
  const ids = [...index.matchAll(/href="(\d+)\/"/g)].map(match => match[1]);
  return mapLimit(ids, 8, async id => {
    const directory = await remoteText(`${currentResource}/${id}/`);
    const files = [...directory.matchAll(/href="([^"/]+\.json)"/g)].map(match => match[1]);
    const configFiles = files.filter(file => /^calc[^/]*\.json$/.test(file)).sort();
    if (!configFiles.includes('calc.json')) throw new Error(`角色 ${id} 缺少 calc.json`);
    const configs = Object.fromEntries(await Promise.all(configFiles.map(async file =>
      [file, JSON.parse(await remoteText(`${currentResource}/${id}/${file}`))])));
    const conditionFile = files.includes('condition-user.json') ? 'condition-user.json' : files.includes('condition.json') ? 'condition.json' : null;
    const conditions = conditionFile ? JSON.parse(await remoteText(`${currentResource}/${id}/${conditionFile}`)) : [];
    const detail = JSON.parse(await remoteText(`${currentDetailResource}/char/${id}.json`));
    if (!detail.name) throw new Error(`角色 ${id} 缺少名称`);
    return { id, name: detail.name, configs, conditions };
  });
}

async function loadCurrentSonatas() {
  const index = await remoteText(`${currentDetailResource}/sonata/`);
  const files = [...index.matchAll(/href="(\d+\.json)"/g)].map(match => match[1]);
  return mapLimit(files, 8, async file => {
    const sonata = JSON.parse(await remoteText(`${currentDetailResource}/sonata/${file}`));
    return { id: Number(file.slice(0, -5)), name: sonata.name };
  });
}

async function latestResourceCommit() {
  const response = await fetch('https://api.github.com/repos/Loping151/XutheringWavesUID/commits/HEAD', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'wuwa-companion' }, signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`无法检查 XutheringWavesUID 版本（HTTP ${response.status}）`);
  return (await response.json()).sha;
}

async function remoteText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`评分资源请求失败（HTTP ${response.status}）`);
  return response.text();
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index]);
    }
  }));
  return results;
}

function convert(config) {
  const costs = [1, 3, 4];
  return {
    name: config.name,
    mainWeights: Object.fromEntries(costs.map(cost => [cost, mapWeights(config.main_props[cost])])),
    subWeights: mapWeights(config.sub_props),
    skillWeights: Object.fromEntries(['Basic Attack DMG Bonus', 'Heavy Attack DMG Bonus', 'Resonance Skill DMG Bonus', 'Resonance Liberation DMG Bonus']
      .map((name, index) => [name, config.skill_weight[index]])),
    maxScoreByCost: Object.fromEntries(costs.map((cost, index) => [cost, config.score_max[index]])),
    thresholdsByCost: Object.fromEntries(costs.map((cost, index) => [cost, config.props_grade[index]])),
    totalThresholds: config.total_grade
  };
}

function mapWeights(weights) {
  return Object.fromEntries(Object.entries(weights).map(([name, value]) => {
    if (!statNames[name]) throw new Error(`未知 WWUID 词条：${name}`);
    return [statNames[name], value];
  }));
}

function parseCharacterNames(source) {
  const start = source.indexOf('CHAR_DETAIL = {');
  const end = source.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error('无法读取 WWUID CHAR_DETAIL');
  return Object.fromEntries([...source.slice(start, end).matchAll(/^\s*"(\d+)": \{.*?"name": "([^"]+)"/gm)]
    .map(([, id, name]) => [id, name]));
}

function attributeFor(id) {
  return ({ 1: 'Glacio', 2: 'Fusion', 3: 'Electro', 4: 'Aero', 5: 'Spectro', 6: 'Havoc' })[String(id)[1]];
}

async function exists(path) {
  try { await readFile(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
