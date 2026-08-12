import { scoreBuild } from '/core.js';
import { characterNames, weaponNames } from '/character-rules.js';

const form = document.querySelector('#profile-form');
const input = document.querySelector('#profile');
const button = document.querySelector('#refresh');
const status = document.querySelector('#status');
const overview = document.querySelector('#overview');
const builds = document.querySelector('#builds');
const skillNames = ['常态', '技能', '解放', '变奏', '回路'];
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
  render(stored.builds);
  status.textContent = '正在显示上一次同步结果';
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
  const scored = items.map(scoreBuild).filter(score => score.available);
  const average = scored.length ? scored.reduce((sum, score) => sum + score.total, 0) / scored.length : 0;
  overview.innerHTML = items.length ? `<div><small>公开角色</small><strong>${items.length}</strong></div>
    <div><small>已评分</small><strong>${scored.length}</strong></div>
    <div><small>平均评分</small><strong>${number(average)}<em> / 250</em></strong></div>` : '';
  builds.replaceChildren(...items.map(buildCard));
  if (!items.length) builds.innerHTML = '<div class="empty">暂无 Build</div>';
}

function buildCard(build) {
  const score = scoreBuild(build);
  const article = document.createElement('article');
  const character = characterNames[build.characterId] || `角色 ${build.characterId}`;
  const weapon = weaponNames[build.weaponId] || `武器 ${build.weaponId}`;
  const rating = score.available
    ? `<div class="grade grade-${score.grade.toLowerCase()}">${score.grade}</div><div><strong>${number(score.total)}<small> / 250</small></strong><span>${escapeHTML(score.templateName)}</span></div>`
    : `<div class="grade grade-na">—</div><div><strong>暂无评分</strong><span>${escapeHTML(score.reason)}</span></div>`;
  const echoScores = score.available ? score.echoes : build.echoes.map(() => null);
  const stats = visibleStats(build);
  const characterArt = asset('role_pile', `role_pile_${build.characterId}.png`);
  const weaponArt = asset('waves_weapon', `weapon_${build.weaponId}.png`);
  article.innerHTML = `
    <div class="profile-panel">
      <div class="character-art"><img src="${characterArt}" alt="" loading="lazy"><div class="character-title"><span>LV.${build.characterLevel || '—'}</span><h3>${escapeHTML(character)}</h3></div>
        <div class="skills"><b>共鸣链 ${build.sequence}</b>${(build.forte || []).map((level, index) => `<span><i>${skillNames[index] || index + 1}</i>${level}</span>`).join('')}</div>
      </div>
      <div class="stat-panel"><div class="panel-label">角色面板 <small>来自 WuWaBuilds</small></div>${stats.map(([name, value, highlight]) => `<div class="stat-row${highlight ? ' effective' : ''}"><span>${escapeHTML(statNames[name] || name)}</span><strong>${formatStat(name, value)}</strong></div>`).join('')}</div>
    </div>
    <div class="equipment-row"><div class="weapon-card"><img src="${weaponArt}" alt="" loading="lazy"><div><strong>${escapeHTML(weapon)}</strong><span>LV.${build.weaponLevel || '—'} · 谐振 ${build.weaponRank || '—'} 阶</span></div></div><div class="total">${rating}</div></div>
    ${score.available ? `<div class="progress"><span>综合养成度</span><strong>${score.grade}</strong><i><b style="width:${Math.min(score.total / 250 * 100, 100)}%"></b></i><em>${number(score.total / 250 * 100)}%</em></div>` : ''}
    <div class="echoes">${build.echoes.map((echo, index) => echoCard(echo, echoScores[index])).join('')}</div>
    ${score.available ? `<p class="weakest"><span>优化建议</span> 优先检查 ${score.weakest.grade} 级声骸（${number(score.weakest.value)} 分）</p>` : ''}`;
  return article;
}

function echoCard(echo, score) {
  const gradeName = score ? `grade-${score.grade.toLowerCase()}` : 'grade-na';
  return `<section class="echo ${gradeName}"><div class="echo-head"><span class="echo-mark">◈</span><div><b>${echo.cost} COST 声骸</b><small>LV.${echo.level}</small></div><strong>${score ? `${number(score.value)} ${score.grade}` : '—'}</strong></div>
    <div class="echo-stats"><b>${escapeHTML(statNames[echo.mainStat.type] || echo.mainStat.type)}</b><strong>${formatStat(echo.mainStat.type, echo.mainStat.value)}</strong>
    ${echo.subStats.map(stat => `<span>${escapeHTML(statNames[stat.type] || stat.type)}</span><em>${formatStat(stat.type, stat.value)}</em>`).join('')}</div></section>`;
}

function visibleStats(build) {
  if (!build.stats) return [];
  const attribute = { '1': 'Glacio DMG', '2': 'Fusion DMG', '3': 'Electro DMG', '4': 'Aero DMG', '5': 'Spectro DMG', '6': 'Havoc DMG' }[String(build.characterId)[1]];
  const ordered = ['HP', 'ATK', 'DEF', 'Crit Rate', 'Crit DMG', 'Energy Regen', attribute, 'Basic Attack DMG Bonus', 'Heavy Attack DMG Bonus', 'Resonance Skill DMG Bonus', 'Resonance Liberation DMG Bonus'];
  return ordered.filter(name => name && build.stats[name] != null).map(name => [name, build.stats[name], ['ATK', 'Crit Rate', 'Crit DMG', attribute].includes(name)]);
}

function formatStat(name, value) { return `${number(value)}${percentageStats.has(name) ? '%' : ''}`; }
function asset(folder, file) { return `https://cdn.jsdelivr.net/gh/MoonShadow1976/WutheringWaves_OverSea_StaticAssets@main/data/resource/${folder}/${file}`; }

function number(value) { return Number(value).toFixed(1); }
function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
