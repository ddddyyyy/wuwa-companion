import { scoreBuild, selectCharacterRule } from '/core.js';
import { characterNames, weaponNames } from '/character-rules.js';

const form = document.querySelector('#profile-form');
const input = document.querySelector('#profile');
const button = document.querySelector('#refresh');
const status = document.querySelector('#status');
const overview = document.querySelector('#overview');
const roster = document.querySelector('#roster');
const builds = document.querySelector('#builds');
let currentBuilds = [];
let selectedCharacterId;
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
const stored = JSON.parse(localStorage.getItem('wuwa-builds') || 'null');
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
    localStorage.setItem('wuwa-builds', JSON.stringify(data));
    input.value = data.uid;
    render(data.builds);
    status.textContent = data.builds.length ? `已同步 ${data.builds.length} 个角色${data.cached ? '（缓存）' : ''}` : '这个 UID 暂无公开 Build';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

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
}

function buildCard(build) {
  const score = scoreBuild(build);
  const article = document.createElement('article');
  const character = characterNames[build.characterId] || `角色 ${build.characterId}`;
  const weapon = build.weaponName || weaponNames[build.weaponId] || `武器 ${build.weaponId}`;
  const rating = score.available
    ? `<div class="grade grade-${score.grade.toLowerCase()}">${score.grade}</div><div><strong>${number(score.total)}<small> / 250</small></strong><span>${escapeHTML(score.templateName)}</span></div>`
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
    ${score.available ? `<div class="progress"><span>经初步评估，你的声骸评价：</span><strong>${score.grade}</strong><i><b style="width:${Math.min(score.total / 250 * 100, 100)}%"></b></i><em>${number(score.total / 250 * 100)}%</em></div>` : ''}
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
