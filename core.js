import { characterRules } from './character-rules.js';

export function parseUID(input) {
  const value = String(input ?? '').trim();
  if (/^\d{9,10}$/.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('请输入 9–10 位 UID 或 WuWaBuilds Profile 地址'); }
  const match = url.pathname.match(/^\/profile\/(\d{9,10})\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'wuwa.build' || !match) {
    throw new Error('请输入 9–10 位 UID 或 WuWaBuilds Profile 地址');
  }
  return match[1];
}

export function normalizeBuild(detail) {
  const panels = detail?.buildState?.echoPanels;
  const mains = detail?.echoSummary?.mainStats;
  if (!Array.isArray(panels) || !Array.isArray(mains) || panels.length !== 5 || mains.length !== 5) {
    throw new Error('WuWaBuilds 没有返回完整的五件声骸');
  }
  const echoes = panels.map((panel, index) => {
    const summary = mains[index];
    const stats = panel?.stats;
    if (!stats?.mainStat || !Array.isArray(stats.subStats) || stats.subStats.length > 5 ||
        stats.mainStat.type !== summary?.statType || panel.level < 0 || panel.level > 25) {
      throw new Error('声骸主词条、等级或副词条字段不一致');
    }
    return {
      id: String(panel.id), cost: Number(summary.cost), level: Number(panel.level),
      setId: Number(panel.resolvedSetId), mainStat: stats.mainStat, subStats: stats.subStats
    };
  });
  return {
    id: detail.id, uid: detail.owner.uid, username: detail.owner.username,
    characterId: detail.character.id, weaponId: detail.weapon.id,
    sequence: detail.sequence, cv: detail.cv, timestamp: detail.timestamp, echoes
  };
}

const fixedMainStats = {
  1: { type: 'HP', value: 2280 },
  3: { type: 'ATK', value: 100 },
  4: { type: 'ATK', value: 150 }
};

export function scoreEcho(echo, rule) {
  if (!rule) return null;
  const stats = [echo.mainStat, fixedMainStats[echo.cost], ...echo.subStats];
  const contributions = stats.map((stat, index) => ({
    name: stat.type,
    source: index < 2 ? 'main' : 'sub',
    raw: contribution(stat, index < 2 ? rule.mainWeights[echo.cost] : rule.subWeights, rule)
  }));
  const raw = contributions.reduce((sum, item) => sum + item.raw, 0);
  const ratio = raw / rule.maxScoreByCost[echo.cost];
  const value = Math.floor(ratio * 50 * 100) / 100;
  return { id: echo.id, value, grade: grade(ratio, rule.thresholds), contributions };
}

export function scoreBuild(build) {
  const rule = characterRules[build.characterId];
  if (!rule) return { available: false, reason: '该角色暂无国内专属权重配置' };
  const echoes = build.echoes.map(echo => scoreEcho(echo, rule));
  const total = echoes.reduce((sum, echo) => sum + echo.value, 0);
  return {
    available: true,
    templateName: rule.templateName,
    echoes,
    total,
    grade: grade(total / 250, rule.thresholds),
    weakest: echoes.reduce((weakest, echo) => !weakest || echo.value < weakest.value ? echo : weakest, null)
  };
}

function contribution(stat, weights, rule) {
  if (!stat || !weights) return 0;
  if (stat.type in rule.skillWeights) {
    return Number(stat.value) * (weights.SkillDMG || 0) * rule.skillWeights[stat.type];
  }
  if (['Aero DMG', 'Glacio DMG', 'Fusion DMG', 'Electro DMG', 'Havoc DMG', 'Spectro DMG'].includes(stat.type)) {
    return Number(stat.value) * (stat.type === `${rule.attribute} DMG` ? weights.AttributeDMG || 0 : 0);
  }
  return Number(stat.value) * (weights[stat.type] || 0);
}

function grade(ratio, thresholds) {
  const labels = ['C', 'B', 'A', 'S', 'SS', 'SSS'];
  let index = 0;
  thresholds.forEach((threshold, candidate) => { if (ratio >= threshold) index = candidate; });
  return labels[index];
}
