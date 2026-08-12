import { scoreBuild } from '/core.js';
import { characterNames, weaponNames } from '/character-rules.js';

const form = document.querySelector('#profile-form');
const input = document.querySelector('#profile');
const button = document.querySelector('#refresh');
const status = document.querySelector('#status');
const overview = document.querySelector('#overview');
const builds = document.querySelector('#builds');
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
  article.innerHTML = `
    <div class="build-head">
      <div class="identity"><span class="avatar">${escapeHTML(character.slice(0, 1))}</span><div><h3>${escapeHTML(character)}</h3><p>${escapeHTML(weapon)}</p><div class="chips"><span>共鸣链 ${build.sequence}</span><span>CV ${number(build.cv)}</span></div></div></div>
      <div class="total">${rating}</div>
    </div>
    <div class="echoes">${build.echoes.map((echo, index) => echoCard(echo, echoScores[index])).join('')}</div>
    ${score.available ? `<p class="weakest"><span>优化建议</span> 优先检查 ${score.weakest.grade} 级声骸（${number(score.weakest.value)} 分）</p>` : ''}`;
  return article;
}

function echoCard(echo, score) {
  const gradeName = score ? `grade-${score.grade.toLowerCase()}` : 'grade-na';
  return `<details class="echo ${gradeName}"><summary><span class="cost">${echo.cost}<i>COST</i></span><strong>${score?.grade || '—'}</strong><small>${score ? `${number(score.value)} 分` : '未配置'}</small><span class="meter"><i style="width:${score ? Math.min(score.value / 50 * 100, 100) : 0}%"></i></span></summary>
    <div class="stats"><b>主词条</b><span>${escapeHTML(echo.mainStat.type)} ${number(echo.mainStat.value)}</span>
    ${echo.subStats.map(stat => `<b>${escapeHTML(stat.type)}</b><span>${number(stat.value)}</span>`).join('')}</div></details>`;
}

function number(value) { return Number(value).toFixed(1); }
function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
