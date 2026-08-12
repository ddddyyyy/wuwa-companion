export const bannerInfo = {
  '1': { name: '角色活动唤取', pity: 80 },
  '2': { name: '武器活动唤取', pity: 80 },
  '3': { name: '角色常驻唤取', pity: 80 },
  '4': { name: '武器常驻唤取', pity: 80 },
  '5': { name: '新手唤取', pity: 50 },
  '6': { name: '新手自选唤取', pity: 80 },
  '7': { name: '回馈唤取', pity: 80 }
};

export function parseConveneURL(input) {
  let url;
  try { url = new URL(String(input ?? '').trim()); } catch { throw new Error('请输入游戏内的唤取记录链接'); }
  if (!/^aki-gm-resources(?:-oversea)?\.aki-game\.(?:net|com)$/.test(url.hostname) || url.pathname !== '/aki/gacha/index.html') {
    throw new Error('这不是有效的鸣潮唤取记录链接');
  }
  const query = new URLSearchParams(url.hash.split('?')[1] || '');
  const required = ['svr_id', 'player_id', 'lang', 'record_id'];
  if (required.some(key => !query.get(key))) throw new Error('唤取记录链接缺少必要参数，请重新在游戏中打开记录页');
  return {
    apiOrigin: url.hostname.endsWith('.com') ? 'https://gmserver-api.aki-game2.com' : 'https://gmserver-api.aki-game2.net',
    serverId: query.get('svr_id'), playerId: query.get('player_id'), languageCode: query.get('lang'),
    recordId: query.get('record_id'), serverArea: query.get('svr_area') || ''
  };
}

export function analyzeBanner(pulls = [], type = '1') {
  const rarity = pull => Number(pull.qualityLevel);
  const fiveIndices = pulls.map((pull, index) => rarity(pull) === 5 ? index : -1).filter(index => index >= 0);
  const currentPity = fiveIndices[0] ?? pulls.length;
  const firstFour = pulls.findIndex(pull => rarity(pull) >= 4);
  const fiveStars = fiveIndices.map((index, position) => ({
    ...pulls[index], pulls: (fiveIndices[position + 1] ?? pulls.length) - index
  }));
  const fiveCount = fiveIndices.length;
  return {
    type, total: pulls.length, pity: bannerInfo[type]?.pity || 80, currentPity,
    currentPity4: firstFour < 0 ? pulls.length : firstFour,
    fiveCount, fourCount: pulls.filter(pull => rarity(pull) === 4).length,
    fiveRate: pulls.length ? fiveCount / pulls.length * 100 : 0,
    averagePity: fiveCount ? fiveStars.reduce((sum, pull) => sum + pull.pulls, 0) / fiveCount : 0,
    fiveStars
  };
}

export function mergeGachaData(previous, current) {
  const pulls = {};
  for (const type of Object.keys({ ...(previous?.pulls || {}), ...(current?.pulls || {}) })) {
    const fresh = current?.pulls?.[type] || [];
    const counts = new Map();
    fresh.forEach(pull => counts.set(pullKey(pull), (counts.get(pullKey(pull)) || 0) + 1));
    const seen = new Map();
    const older = (previous?.pulls?.[type] || []).filter(pull => {
      const key = pullKey(pull), occurrence = (seen.get(key) || 0) + 1;
      seen.set(key, occurrence);
      return occurrence > (counts.get(key) || 0);
    });
    pulls[type] = [...fresh, ...older].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  }
  return { ...previous, ...current, pulls };
}

function pullKey(pull) {
  return [pull.time, pull.name, pull.qualityLevel, pull.resourceId || '', pull.resourceType || ''].join('|');
}
