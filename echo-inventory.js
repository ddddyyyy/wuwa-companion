import { echoCatalog, sonataCatalog } from './echo-data.js';

const statLabels = {
  '共鸣解放伤害加成': 'Resonance Liberation DMG Bonus', '共鸣技能伤害加成': 'Resonance Skill DMG Bonus',
  '普攻伤害加成': 'Basic Attack DMG Bonus', '重击伤害加成': 'Heavy Attack DMG Bonus',
  '冷凝伤害加成': 'Glacio DMG', '热熔伤害加成': 'Fusion DMG', '导电伤害加成': 'Electro DMG',
  '气动伤害加成': 'Aero DMG', '衍射伤害加成': 'Spectro DMG', '湮灭伤害加成': 'Havoc DMG',
  '暴击伤害': 'Crit DMG', '治疗效果加成': 'Healing Bonus', '共鸣效率': 'Energy Regen',
  '暴击': 'Crit Rate', '生命': 'HP', '攻击': 'ATK', '防御': 'DEF',
  'resonanceliberationdmgbonus': 'Resonance Liberation DMG Bonus', 'resonanceskilldmgbonus': 'Resonance Skill DMG Bonus',
  'basicattackdmgbonus': 'Basic Attack DMG Bonus', 'heavyattackdmgbonus': 'Heavy Attack DMG Bonus',
  'glaciodmgbonus': 'Glacio DMG', 'fusiondmgbonus': 'Fusion DMG', 'electrodmgbonus': 'Electro DMG',
  'aerodmgbonus': 'Aero DMG', 'spectrodmgbonus': 'Spectro DMG', 'havocdmgbonus': 'Havoc DMG',
  'critdmg': 'Crit DMG', 'critrate': 'Crit Rate', 'energyregen': 'Energy Regen', 'healingbonus': 'Healing Bonus',
  'hp': 'HP', 'atk': 'ATK', 'def': 'DEF'
};

const catalog = Object.values(echoCatalog);

export function parseEchoScan(raw) {
  if (!raw || !Array.isArray(raw.card) || !Array.isArray(raw.statNames) || !Array.isArray(raw.statValues)) {
    throw new Error('声骸扫描数据格式不正确');
  }
  const cardText = normalize(raw.card.join(''));
  const meta = catalog.flatMap(item => item.aliases.map(alias => ({ item, alias: normalize(alias) })))
    .filter(candidate => candidate.alias && cardText.includes(candidate.alias))
    .sort((a, b) => b.alias.length - a.alias.length)[0]?.item;
  const sonataText = normalize((raw.sonata || []).join(''));
  const possibleSets = meta?.sets || Object.keys(sonataCatalog).map(name => ({ id: 0, name }));
  const set = possibleSets.filter(item => sonataText.includes(normalize(item.name))).sort((a, b) => b.name.length - a.name.length)[0];
  const values = raw.statValues.map(parseValue).filter(Boolean);
  const names = raw.statNames.map(normalizeStat).filter(Boolean);
  const pairs = names.slice(0, values.length).map((type, index) => ({ type: withPercent(type, values[index]), value: values[index].value }));
  const cost = meta?.cost || parseCost(cardText);
  const mainCandidates = pairs.slice(0, 2);
  const mainStat = mainCandidates.find(stat => !isFixedMain(stat, cost)) || mainCandidates[0];
  const issues = [];
  if (!meta) issues.push('未识别声骸名称');
  if (!cost) issues.push('未识别 COST');
  if (!mainStat) issues.push('未识别主词条');
  if (names.length !== values.length) issues.push('词条名称与数值数量不一致');
  return {
    id: `scan-${meta?.id || 'unknown'}-${Number(raw.index) + 1}`,
    resourceId: meta?.id,
    name: meta?.name || raw.card[0] || '未识别声骸',
    cost: cost || 0,
    level: parseLevel(cardText),
    setId: set?.id || 0,
    sonata: set?.name,
    mainStat,
    subStats: pairs.slice(2, 7),
    valid: issues.length === 0,
    issues,
    raw
  };
}

export function parseEchoScanBatch(result) {
  if (!Array.isArray(result?.echoes)) throw new Error('扫描器没有返回声骸列表');
  return {
    platform: 'macos', scannedAt: new Date().toISOString(),
    requested: result.requested, detected: result.detected,
    cancelled: Boolean(result.cancelled),
    echoes: result.echoes.map(parseEchoScan)
  };
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[·•・∙。（）()\s:_%.-]/g, '');
}

function normalizeStat(value) {
  const text = normalize(value);
  const label = Object.keys(statLabels).sort((a, b) => b.length - a.length).find(name => text.includes(normalize(name)));
  return label ? statLabels[label] : null;
}

function parseValue(value) {
  const text = String(value || '').replace(/[oOＯ]/g, '0').replace(/,/g, '').replace(/[^\d.%+-]/g, '');
  const match = text.match(/[+-]?(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number < 0 || number > 10_000) return null;
  return { value: number, percent: text.includes('%') };
}

function withPercent(type, parsed) {
  return parsed.percent && ['HP', 'ATK', 'DEF'].includes(type) ? `${type}%` : type;
}

function parseCost(text) {
  return Number(text.match(/(?:cost|合鸣值)([134])/)?.[1]) || 0;
}

function parseLevel(text) {
  return Math.min(25, Number(text.match(/(?:lv|等级)\+?([0-2]?\d)/)?.[1] || text.match(/\+([0-2]?\d)/)?.[1]) || 0);
}

function isFixedMain(stat, cost) {
  return (cost === 4 && stat.type === 'ATK' && stat.value === 150) ||
    (cost === 3 && stat.type === 'ATK' && stat.value === 100) ||
    (cost === 1 && stat.type === 'HP' && stat.value === 2280);
}
