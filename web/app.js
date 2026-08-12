import { scoreBuild } from '/core.js';
import { characterNames, weaponNames } from '/character-rules.js';

const form = document.querySelector('#profile-form');
const input = document.querySelector('#profile');
const button = document.querySelector('#refresh');
const status = document.querySelector('#status');
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
  builds.replaceChildren(...items.map(buildCard));
  if (!items.length) builds.innerHTML = '<div class="empty">暂无 Build</div>';
}

function buildCard(build) {
  const score = scoreBuild(build);
  const article = document.createElement('article');
  const character = characterNames[build.characterId] || `角色 ${build.characterId}`;
  const weapon = weaponNames[build.weaponId] || `武器 ${build.weaponId}`;
  const rating = score.available
    ? `<strong>${number(score.total)} / 250 · ${score.grade}</strong><span>${escapeHTML(score.templateName)}</span>`
    : `<strong>暂无专属评分</strong><span>${escapeHTML(score.reason)}</span>`;
  const echoScores = score.available ? score.echoes : build.echoes.map(() => null);
  article.innerHTML = `
    <div class="build-head">
      <div><h3>${escapeHTML(character)}</h3><p>${escapeHTML(weapon)} · S${build.sequence} · CV ${number(build.cv)}</p></div>
      <div class="total">${rating}</div>
    </div>
    <div class="echoes">${build.echoes.map((echo, index) => echoCard(echo, echoScores[index])).join('')}</div>
    ${score.available ? `<p class="weakest">优先检查：${score.weakest.grade} · ${number(score.weakest.value)} 分</p>` : ''}`;
  return article;
}

function echoCard(echo, score) {
  return `<details><summary><span>${echo.cost}C</span><strong>${score?.grade || '—'}</strong><small>${score ? number(score.value) : '未配置'}</small></summary>
    <div class="stats"><b>主词条</b><span>${escapeHTML(echo.mainStat.type)} ${number(echo.mainStat.value)}</span>
    ${echo.subStats.map(stat => `<b>${escapeHTML(stat.type)}</b><span>${number(stat.value)}</span>`).join('')}</div></details>`;
}

function number(value) { return Number(value).toFixed(1); }
function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
