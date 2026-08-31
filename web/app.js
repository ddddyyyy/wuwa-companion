import { compareBuild, scoreBuild, scoreEcho, selectCharacterRule, validateEchoInventory } from '/core.js';
import { characterNames, weaponNames } from '/character-rules.js';

const form = document.querySelector('#profile-form');
const input = document.querySelector('#profile');
const button = document.querySelector('#refresh');
const status = document.querySelector('#status');
const overview = document.querySelector('#overview');
const buildDiff = document.querySelector('#build-diff');
const roster = document.querySelector('#roster');
const builds = document.querySelector('#builds');
const navButtons = document.querySelectorAll('nav button[data-view]');
const trackerFrame = document.querySelector('#tracker-frame');
const trackerExternal = document.querySelector('#tracker-external');
const trackerPlatformLabel = document.querySelector('#tracker-platform');
const conveneButton = document.querySelector('#convene-refresh');
const conveneStatus = document.querySelector('#convene-status');
const conveneCopy = document.querySelector('#convene-copy');
const conveneURL = document.querySelector('#convene-url');
const ruleUpdate = document.querySelector('#rule-update');
const inventoryView = document.querySelector('#inventory-view');
const echoScanForm = document.querySelector('#echo-scan-form');
const echoCount = document.querySelector('#echo-count');
const echoScanButton = document.querySelector('#echo-scan');
const echoScanStatus = document.querySelector('#echo-scan-status');
const scannerCheck = document.querySelector('#echo-scanner-check');
const scanPreviewButton = document.querySelector('#echo-scan-preview');
const scanPreview = document.querySelector('#scan-preview');
const inventorySummary = document.querySelector('#inventory-summary');
const inventoryList = document.querySelector('#inventory-list');
const inventoryExport = document.querySelector('#inventory-export');
const inventoryImport = document.querySelector('#inventory-import');
let currentBuilds = [];
let previousBuilds = [];
let selectedCharacterId;
let inventoryData = JSON.parse(localStorage.getItem('wuwa-echo-inventory') || 'null');
const skillNames = ['常态', '技能', '解放', '变奏', '回路', '延奏'];
const statNames = {
  HP: '生命', 'HP%': '生命百分比', ATK: '攻击', 'ATK%': '攻击百分比', DEF: '防御', 'DEF%': '防御百分比',
  'Crit Rate': '暴击', 'Crit DMG': '暴击伤害', 'Energy Regen': '共鸣效率', 'Healing Bonus': '治疗效果加成',
  'Aero DMG': '气动伤害加成', 'Glacio DMG': '冷凝伤害加成', 'Fusion DMG': '热熔伤害加成',
  'Electro DMG': '导电伤害加成', 'Havoc DMG': '湮灭伤害加成', 'Spectro DMG': '衍射伤害加成',
  'Basic Attack DMG Bonus': '普攻伤害加成', 'Heavy Attack DMG Bonus': '重击伤害加成',
  'Resonance Skill DMG Bonus': '共鸣技能伤害加成', 'Resonance Liberation DMG Bonus': '共鸣解放伤害加成'
};
const percentageStats = new Set(Object.keys(statNames).filter(name => name.includes('%') || name.includes('Rate') || name.includes('DMG') || name.includes('Regen') || name.includes('Bonus')));
const trackerPlatform = /mac/i.test(navigator.platform) ? 'macos' : /win/i.test(navigator.platform) ? 'windows' : 'linux';
trackerPlatformLabel.textContent = trackerPlatform === 'macos' ? 'macOS' : trackerPlatform === 'windows' ? 'Windows' : 'Linux';
let triedConveneLink = false;
checkRuleUpdate();

navButtons.forEach(item => item.addEventListener('click', () => {
  navButtons.forEach(button => button.classList.toggle('active', button === item));
  document.querySelector('#build-view').hidden = item.dataset.view !== 'build';
  document.querySelector('#gacha-view').hidden = item.dataset.view !== 'gacha';
  inventoryView.hidden = item.dataset.view !== 'inventory';
  if (item.dataset.view === 'gacha' && !triedConveneLink) {
    triedConveneLink = true;
    extractConveneLink();
  }
}));

if (inventoryData?.echoes) renderInventory();

const stored = JSON.parse(localStorage.getItem('wuwa-builds') || 'null');
const previousStored = JSON.parse(localStorage.getItem('wuwa-builds-previous') || 'null');
if (stored?.uid && previousStored?.uid === stored.uid) previousBuilds = previousStored.builds || [];
if (stored?.uid) {
  input.value = stored.uid;
  if (stored.builds?.every(build => build.characterLevel != null && build.weaponLevel != null && build.stats && build.echoes?.every(echo => echo.resourceId))) {
    render(stored.builds);
    status.textContent = '正在显示上一次同步结果';
  } else {
    status.textContent = '正在更新旧版缓存…';
    queueMicrotask(() => form.requestSubmit());
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = '正在读取 WuWaBuilds…';
  try {
    const response = await fetch(`/api/builds?profile=${encodeURIComponent(input.value)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '同步失败');
    const old = JSON.parse(localStorage.getItem('wuwa-builds') || 'null');
    if (old?.uid === data.uid && JSON.stringify(old.builds) !== JSON.stringify(data.builds)) {
      localStorage.setItem('wuwa-builds-previous', JSON.stringify(old));
      previousBuilds = old.builds || [];
    } else if (old?.uid !== data.uid) {
      localStorage.removeItem('wuwa-builds-previous');
      previousBuilds = [];
    }
    localStorage.setItem('wuwa-builds', JSON.stringify(data));
    input.value = data.uid;
    render(data.builds);
    status.textContent = data.builds.length ? `已同步 ${data.builds.length} 个角色` : '这个 UID 暂无公开 Build';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

conveneButton.addEventListener('click', extractConveneLink);
scannerCheck.addEventListener('click', checkEchoScanner);
scanPreviewButton.addEventListener('click', previewEchoScan);
echoScanForm.addEventListener('submit', scanEchoInventory);
inventoryExport.addEventListener('click', exportInventory);
inventoryImport.addEventListener('change', importInventory);
document.querySelector('#convene-copy-button').addEventListener('click', copyConveneLink);
document.querySelectorAll('[data-tracker-page]').forEach(button => button.addEventListener('click', () => showTrackerPage(button.dataset.trackerPage)));

async function extractConveneLink() {
  conveneButton.disabled = true;
  conveneStatus.textContent = '正在本机查找游戏记录…';
  showTrackerPage('import');
  try {
    const response = await fetch('/api/convene-link');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '没有找到抽卡链接');
    conveneURL.value = data.url;
    conveneCopy.hidden = false;
    const copied = await copyConveneLink();
    conveneStatus.textContent = copied ? '链接已复制，请粘贴到右侧导入框' : '链接已提取，请点击“复制链接”后粘贴到右侧';
  } catch (error) {
    conveneStatus.textContent = error.message;
  } finally {
    conveneButton.disabled = false;
  }
}

async function copyConveneLink() {
  try {
    await navigator.clipboard.writeText(conveneURL.value);
    return true;
  } catch { return false; }
}

function showTrackerPage(page) {
  const url = page === 'import' ? `https://wuwatracker.com/zh-CN/import?platform=${trackerPlatform}` : 'https://wuwatracker.com/zh-CN/tracker';
  if (trackerFrame.src !== url) trackerFrame.src = url;
  trackerExternal.href = url;
}

function render(items = []) {
  currentBuilds = items;
  const scored = items.map(scoreBuild).filter(score => score.available);
  const average = scored.length ? scored.reduce((sum, score) => sum + score.total, 0) / scored.length : 0;
  overview.innerHTML = items.length ? `<div><small>公开角色</small><strong>${items.length}</strong></div>
    <div><small>已评分</small><strong>${scored.length}</strong></div>
    <div><small>平均评分</small><strong>${number(average)}<em> / 250</em></strong></div>` : '';
  if (!items.length) { roster.innerHTML = ''; builds.innerHTML = '<div class="empty">暂无 Build</div>'; return; }
  if (!items.some(build => build.characterId === selectedCharacterId)) selectedCharacterId = items[0].characterId;
  roster.innerHTML = `<div class="roster-label"><strong>选择角色</strong><span>点击头像查看完整面板</span></div><div class="roster-list">${items.map(build => {
    const score = scoreBuild(build);
    const name = characterNames[build.characterId] || `角色 ${build.characterId}`;
    return `<button type="button" data-character="${build.characterId}" class="${build.characterId === selectedCharacterId ? 'selected' : ''}" aria-pressed="${build.characterId === selectedCharacterId}"><img src="${asset('waves_avatar', `role_head_${build.characterId}.png`)}" alt=""><span>${escapeHTML(name)}</span><small>${score.available ? `${number(score.total)} · ${score.grade}` : '未评分'}</small></button>`;
  }).join('')}</div>`;
  showSelected();
}

roster.addEventListener('click', event => {
  const target = event.target.closest('button[data-character]');
  if (!target) return;
  selectedCharacterId = target.dataset.character;
  roster.querySelectorAll('button').forEach(item => {
    const selected = item === target;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', selected);
  });
  showSelected();
});

function showSelected() {
  const build = currentBuilds.find(item => item.characterId === selectedCharacterId);
  builds.replaceChildren(buildCard(build));
  renderDifference(build);
  if (inventoryData?.echoes) renderInventory();
}

async function checkEchoScanner() {
  scannerCheck.disabled = true;
  echoScanStatus.textContent = '正在检查 macOS 权限…';
  try {
    const response = await fetch('/api/echo-scanner');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '检查失败');
    const missing = [];
    if (!data.gameFound) missing.push('未检测到鸣潮');
    if (!data.screenCapture) missing.push('未授权屏幕录制');
    if (!data.accessibility) missing.push('未授权辅助功能');
    echoScanStatus.textContent = missing.length ? missing.join('；') : '游戏与系统权限已就绪';
  } catch (error) { echoScanStatus.textContent = error.message; }
  finally { scannerCheck.disabled = false; }
}

async function scanEchoInventory(event) {
  event.preventDefault();
  await runEchoScan(echoCount.value ? Number(echoCount.value) : 0, true);
}

async function previewEchoScan() {
  await runEchoScan(1, false);
}

async function runEchoScan(limit, save) {
  echoScanButton.disabled = true;
  scannerCheck.disabled = true;
  scanPreviewButton.disabled = true;
  echoScanStatus.textContent = save ? '扫描开始后会切换到游戏，请不要操作鼠标。声骸较多时需要几分钟…' : '正在预检第一件声骸…';
  const progressTimer = setInterval(updateScanProgress, 800);
  if (save) scanPreview.innerHTML = '';
  try {
    const response = await fetch('/api/echo-scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '扫描失败');
    const invalid = data.echoes.filter(echo => !echo.valid).length;
    if (save) {
      inventoryData = data;
      localStorage.setItem('wuwa-echo-inventory', JSON.stringify(data));
      renderInventory();
      echoScanStatus.textContent = `${data.partial || data.cancelled ? '扫描已中断，已保留' : '已扫描'} ${data.echoes.length} 个声骸${invalid ? `，${invalid} 个需要校对` : ''}${data.error ? `；${data.error}` : ''}`;
    } else {
      const echo = data.echoes[0];
      scanPreview.innerHTML = echo ? `<div><strong>预检结果</strong><span>确认名称、主词条和副词条正确后，再开始全量扫描。</span></div>${inventoryEchoCard(echo, selectedInventoryRule())}` : '';
      echoScanStatus.textContent = echo?.valid ? '预检通过，可以开始全量扫描' : `预检需要校对：${echo?.issues?.join('；') || '没有识别到声骸'}`;
    }
  } catch (error) { echoScanStatus.textContent = error.message; }
  finally { clearInterval(progressTimer); echoScanButton.disabled = false; scannerCheck.disabled = false; scanPreviewButton.disabled = false; }
}

async function updateScanProgress() {
  try {
    const response = await fetch('/api/echo-scan-progress');
    const data = await response.json();
    if (data.running && data.requested) echoScanStatus.textContent = `正在扫描 ${data.scanned} / ${data.requested}，按 Esc 可中止…`;
  } catch { /* 下一次轮询重试 */ }
}

function renderInventory() {
  const items = inventoryData?.echoes || [];
  const build = currentBuilds.find(item => item.characterId === selectedCharacterId);
  const rule = selectedInventoryRule();
  const valid = items.filter(echo => echo.valid);
  inventoryExport.disabled = !items.length;
  inventorySummary.innerHTML = items.length ? `<div><small>已扫描</small><strong>${items.length}</strong></div><div><small>识别完整</small><strong>${valid.length}</strong></div><div><small>当前评分角色</small><strong>${escapeHTML(build ? characterNames[build.characterId] || build.characterId : '未选择')}</strong></div>` : '';
  inventoryList.innerHTML = items.length ? items.map(echo => inventoryEchoCard(echo, rule)).join('') : '<div class="empty">还没有扫描声骸</div>';
}

function selectedInventoryRule() {
  const build = currentBuilds.find(item => item.characterId === selectedCharacterId);
  return build && selectCharacterRule(build)?.rule;
}

function inventoryEchoCard(echo, rule) {
  const score = echo.valid && rule ? scoreEcho(echo, rule) : null;
  const main = echo.mainStat ? `${statNames[echo.mainStat.type] || echo.mainStat.type} ${formatStat(echo.mainStat.type, echo.mainStat.value)}` : '主词条未识别';
  return `<article class="inventory-echo ${echo.valid ? '' : 'needs-review'}"><header><div>${echo.resourceId ? `<img src="${currentAsset('phantom', `phantom_${echo.resourceId}.png`)}" alt="">` : '<span>◇</span>'}<div><b>${escapeHTML(echo.name)}</b><small>LV.${echo.level} · C${echo.cost || '—'}${echo.sonata ? ` · ${escapeHTML(echo.sonata)}` : ''}</small></div></div><strong>${score ? `${number(score.value)} ${score.grade}` : echo.valid ? '待选角色' : '待校对'}</strong></header><p><b>主词条</b>${escapeHTML(main)}</p><dl>${echo.subStats.map(stat => `<div><dt>${escapeHTML(statNames[stat.type] || stat.type)}</dt><dd>${formatStat(stat.type, stat.value)}</dd></div>`).join('')}</dl>${echo.issues.length ? `<footer>${escapeHTML(echo.issues.join('；'))}</footer>` : ''}</article>`;
}

function exportInventory() {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(inventoryData, null, 2)], { type: 'application/json' }));
  link.download = `wuwa-echoes-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importInventory() {
  const file = inventoryImport.files[0];
  inventoryImport.value = '';
  if (!file) return;
  try {
    if (file.size > 10_000_000) throw new Error('库存文件不能超过 10 MB');
    const data = validateEchoInventory(JSON.parse(await file.text()));
    if (inventoryData?.echoes?.length && !confirm('导入会替换当前本地声骸库存，确定继续吗？')) return;
    inventoryData = data;
    localStorage.setItem('wuwa-echo-inventory', JSON.stringify(data));
    renderInventory();
    echoScanStatus.textContent = `已导入 ${data.echoes.length} 个声骸`;
  } catch (error) { echoScanStatus.textContent = error.message; }
}

function renderDifference(build) {
  const previous = previousBuilds.find(item => item.characterId === build.characterId);
  const difference = compareBuild(build, previous);
  if (!difference) {
    buildDiff.innerHTML = '<small>BUILD 对比</small><p>下次同步新 Build 后显示变化</p>';
    return;
  }
  const delta = difference.delta == null ? '' : `${difference.delta >= 0 ? '+' : ''}${number(difference.delta)} 分`;
  const changes = [];
  if (difference.weaponChanged) changes.push(`武器：${weaponLabel(previous)} → ${weaponLabel(build)}`);
  changes.push(...difference.echoes.map(item => `C${item.after.cost} ${item.before?.name || '旧声骸'} → ${item.after.name || '新声骸'}${item.beforeScore && item.afterScore ? `（${number(item.beforeScore.value)} → ${number(item.afterScore.value)}）` : ''}`));
  buildDiff.innerHTML = `<div><small>较上次同步</small><strong class="${difference.delta >= 0 ? 'positive' : 'negative'}">${delta || (difference.changed ? 'Build 已变化' : '无变化')}</strong></div>${changes.length ? `<ul>${changes.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '<p>装备与声骸没有变化</p>'}`;
}

function weaponLabel(build) {
  return `${build.weaponName || weaponNames[build.weaponId] || '未知武器'} R${build.weaponRank || '—'}`;
}

ruleUpdate.addEventListener('click', () => ruleUpdate.dataset.available ? updateRuleConfig() : checkRuleUpdate());
async function checkRuleUpdate() {
  ruleUpdate.disabled = true;
  ruleUpdate.textContent = '正在检查评分配置…';
  try {
    const response = await fetch('/api/scoring-update');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '检查失败');
    ruleUpdate.textContent = data.available ? '更新评分配置' : '评分配置已是最新 · 点击检查';
    ruleUpdate.dataset.available = data.available ? 'true' : '';
  } catch (error) {
    ruleUpdate.textContent = '评分配置检查失败，点击重试';
    ruleUpdate.title = error.message;
  } finally { ruleUpdate.disabled = false; }
}

async function updateRuleConfig() {
  if (!window.confirm('更新会替换本机评分配置，完成后页面将刷新。是否继续？')) return;
  ruleUpdate.disabled = true;
  ruleUpdate.textContent = '正在更新评分配置…';
  try {
    const response = await fetch('/api/scoring-update', { method: 'POST', headers: { 'x-wuwa-action': 'update-scoring' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '更新失败');
    ruleUpdate.textContent = data.updated ? '更新完成，正在刷新…' : '评分配置已是最新';
    if (data.updated) location.reload();
  } catch (error) {
    ruleUpdate.textContent = '更新失败，点击重试';
    ruleUpdate.title = error.message;
    ruleUpdate.dataset.available = 'true';
    ruleUpdate.disabled = false;
  }
}

function buildCard(build) {
  const score = scoreBuild(build);
  const article = document.createElement('article');
  article.className = 'build-card';
  const character = characterNames[build.characterId] || `角色 ${build.characterId}`;
  const weapon = build.weaponName || weaponNames[build.weaponId] || `武器 ${build.weaponId}`;
  const rating = score.available
    ? `<div class="grade grade-${score.grade.toLowerCase()}">${score.grade}</div><div class="rating-copy"><strong>${number(score.total)}<small> / 250</small></strong><span>${escapeHTML(score.templateName)}</span><div class="rating-progress"><i><b style="width:${Math.min(score.total / 250 * 100, 100)}%"></b></i><em>${number(score.total / 250 * 100)}%</em></div></div>`
    : `<div class="grade grade-na">—</div><div><strong>暂无评分</strong><span>${escapeHTML(score.reason)}</span></div>`;
  const echoScores = score.available ? score.echoes : build.echoes.map(() => null);
  const rule = selectCharacterRule(build)?.rule;
  const stats = visibleStats(build, rule);
  const forte = [...(build.forte || []), 1];
  const characterArt = asset('role_pile', `role_pile_${build.characterId}.png`);
  const weaponArt = asset('waves_weapon', `weapon_${build.weaponId}.png`);
  article.innerHTML = `
    <div class="profile-panel">
      <div class="character-art"><img src="${characterArt}" alt="" loading="lazy">
        <b class="sequence">共鸣链 ${build.sequence}</b><div class="skills">${forte.map((level, index) => `<span><i>${skillNames[index]}</i>${level}</span>`).join('')}</div>
      </div>
      <div class="stat-column"><div class="character-title"><span>LV.${build.characterLevel || '—'}</span><h3>${escapeHTML(character)}</h3></div><div class="panel-label"><b>声骸词条合计</b><small>默认角色权重 1</small></div><div class="stat-panel">${stats.map(([name, value, tone]) => `<div class="stat-row ${tone}"><span>${escapeHTML(statNames[name] || name)}</span><strong>${formatStat(name, value)}</strong></div>`).join('')}</div></div>
    </div>
    <div class="equipment-row"><div class="weapon-card"><img src="${weaponArt}" alt="" loading="lazy"><div><strong>${escapeHTML(weapon)}</strong><span>LV.${build.weaponLevel || '—'} · 谐振 ${build.weaponRank || '—'} 阶</span></div></div><div class="total">${rating}</div></div>
    <div class="echoes">${build.echoes.map((echo, index) => echoCard(echo, echoScores[index])).join('')}</div>
    ${score.available ? `<p class="weakest"><span>优化建议</span> 优先检查 ${score.weakest.grade} 级声骸（${number(score.weakest.value)} 分）</p>` : ''}`;
  return article;
}

function echoCard(echo, score) {
  const gradeName = score ? `grade-${score.grade.toLowerCase()}` : 'grade-na';
  const contributions = score?.contributions || [];
  const icon = echo.resourceId ? `<img src="${currentAsset('phantom', `phantom_${echo.resourceId}.png`)}" alt="">` : '<span class="echo-placeholder">◇</span>';
  return `<section class="echo ${gradeName}"><div class="echo-head">${icon}<div><b>${escapeHTML(echo.name || `${echo.cost} COST 声骸`)}</b><small>LV.${echo.level} · C${echo.cost}</small></div><strong>${score ? `${number(score.value)} ${score.grade}` : '—'}</strong></div>
    <div class="echo-main ${contributionTone(contributions[0])}"><small>主词条</small><b>${escapeHTML(statNames[echo.mainStat.type] || echo.mainStat.type)}</b><strong>${formatStat(echo.mainStat.type, echo.mainStat.value)}</strong></div>
    <div class="echo-subs">${echo.subStats.map((stat, index) => { const tone = contributionTone(contributions[index + 2], stat); return `<span class="${tone}">${escapeHTML(statNames[stat.type] || stat.type)}</span><em class="${tone}">${formatStat(stat.type, stat.value)}</em>`; }).join('')}</div></section>`;
}

function visibleStats(build, rule) {
  if (!build.stats) return [];
  const attribute = { '1': 'Glacio DMG', '2': 'Fusion DMG', '3': 'Electro DMG', '4': 'Aero DMG', '5': 'Spectro DMG', '6': 'Havoc DMG' }[String(build.characterId)[1]];
  const ordered = ['HP%', 'ATK%', 'DEF%', 'Crit Rate', 'Crit DMG', 'Energy Regen', attribute, 'Basic Attack DMG Bonus', 'Heavy Attack DMG Bonus', 'Resonance Skill DMG Bonus', 'Resonance Liberation DMG Bonus'];
  return ordered.filter(name => name && build.stats[name] != null).map(name => [name, build.stats[name], statTone(name, build.stats[name], rule)]);
}

function statTone(name, value, rule) {
  const weight = rule?.subWeights?.[name] || (name.endsWith(' DMG') ? rule?.subWeights?.AttributeDMG : 0) || (name.endsWith(' DMG Bonus') ? rule?.subWeights?.SkillDMG : 0);
  const high = { 'ATK%': 70, 'HP%': 70, 'DEF%': 70, 'Crit Rate': 70, 'Crit DMG': 260, 'Energy Regen': 130 }[name] ?? (name.endsWith(' DMG') ? 50 : name.endsWith(' DMG Bonus') ? 30 : Infinity);
  const good = { 'ATK%': 45, 'HP%': 45, 'DEF%': 45, 'Crit Rate': 50, 'Crit DMG': 220, 'Energy Regen': 115 }[name] ?? high * .55;
  return value >= high ? 'hot' : value >= good ? 'good' : weight ? 'useful' : '';
}

function contributionTone(contribution, stat) {
  if (!contribution?.raw) return 'muted';
  const max = { 'Crit Rate': 10.5, 'Crit DMG': 21, 'ATK%': 11.6, ATK: 60, 'HP%': 11.6, HP: 580, 'DEF%': 14.7, DEF: 70, 'Energy Regen': 12.4,
    'Basic Attack DMG Bonus': 11.6, 'Heavy Attack DMG Bonus': 11.6, 'Resonance Skill DMG Bonus': 11.6, 'Resonance Liberation DMG Bonus': 11.6 }[stat?.type];
  if (max && Number(stat.value) >= max) return 'hot';
  return contribution.raw >= 10 ? 'good' : 'useful';
}

function formatStat(name, value) { return `${number(value)}${percentageStats.has(name) ? '%' : ''}`; }
function asset(folder, file) { return `https://cdn.jsdelivr.net/gh/MoonShadow1976/WutheringWaves_OverSea_StaticAssets@main/data/resource/${folder}/${file}`; }
function currentAsset(folder, file) { return `https://ww1.loping151.top/XutheringWavesUID/resource/${folder}/${file}`; }

function number(value) { return Number(value).toFixed(1); }
function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
