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

const weights = {
  'Crit Rate': 1, 'Crit DMG': 1, 'ATK%': 1, ATK: 0.6, 'Energy Regen': 0.5,
  'Basic Attack DMG Bonus': 0.8, 'Heavy Attack DMG Bonus': 0.8,
  'Resonance Skill DMG Bonus': 0.8, 'Resonance Liberation DMG Bonus': 0.8
};
const maximumRoll = {
  'Crit Rate': 10.5, 'Crit DMG': 21, 'ATK%': 11.6, ATK: 60, 'Energy Regen': 12.4,
  'Basic Attack DMG Bonus': 11.6, 'Heavy Attack DMG Bonus': 11.6,
  'Resonance Skill DMG Bonus': 11.6, 'Resonance Liberation DMG Bonus': 11.6
};

export function scoreEcho(echo) {
  const contributions = echo.subStats.map(stat => ({
    name: stat.type,
    value: weights[stat.type] && maximumRoll[stat.type]
      ? Math.min(Number(stat.value) / maximumRoll[stat.type], 1) * 10 * weights[stat.type]
      : 0
  }));
  const value = Math.floor(Math.min(contributions.reduce((sum, item) => sum + item.value, 0), 50) * 100) / 100;
  const grade = value >= 42 ? 'SSS' : value >= 39 ? 'SS' : value >= 35 ? 'S' : value >= 30 ? 'A' : value >= 24 ? 'B' : 'C';
  return { id: echo.id, value, grade, contributions };
}

export function scoreBuild(build) {
  const echoes = build.echoes.map(scoreEcho);
  return {
    echoes,
    total: echoes.reduce((sum, echo) => sum + echo.value, 0),
    weakest: echoes.reduce((weakest, echo) => !weakest || echo.value < weakest.value ? echo : weakest, null)
  };
}

