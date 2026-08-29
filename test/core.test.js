import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBuild, parseUID, normalizeBuild, scoreBuild, scoreEcho, selectCharacterRule, validateEchoInventory } from '../core.js';
import { characterRuleSets, wwuidMeta } from '../character-rules.js';
import { candidateLogPaths, extractConveneURL, trackerPlatform } from '../convene-link.js';
import { parseEchoScan, parseEchoScanBatch } from '../echo-inventory.js';

test('accepts UID and exact WuWaBuilds profile URL only', () => {
  assert.equal(parseUID('700000001'), '700000001');
  assert.equal(parseUID('https://wuwa.build/profile/700000001'), '700000001');
  assert.throws(() => parseUID('https://example.com/profile/700000001'));
});

test('normalizes five matching echo panels', () => {
  const panel = (id, type, cost) => ({
    panel: { id, level: 25, resolvedSetId: 1, stats: { mainStat: { type, value: 30 }, subStats: [] } },
    main: { cost, statType: type }
  });
  const pairs = [panel('1', 'Crit DMG', 4), panel('2', 'ATK%', 3), panel('3', 'ATK%', 3), panel('4', 'ATK%', 1), panel('5', 'ATK%', 1)];
  const build = normalizeBuild({
    id: 'b', owner: { uid: '700000001', username: 'u' }, character: { id: 'c' }, weapon: { id: 'w' },
    sequence: 0, cv: 200, timestamp: '2026-01-01T00:00:00Z', statATK: 2200, statCritRate: 70,
    buildState: { characterLevel: 90, forte: [[10], [9]], echoPanels: pairs.map(item => item.panel) },
    echoSummary: { mainStats: pairs.map(item => item.main) },
  });
  assert.equal(build.echoes.length, 5);
  assert.equal(build.echoes[0].cost, 4);
  assert.equal(build.characterLevel, 90);
  assert.equal(build.stats.ATK, 2200);
});

test('matches WWUID Aemeath 4-cost normalization', () => {
  const score = scoreEcho({
    id: 'e', cost: 4, mainStat: { type: 'Crit DMG', value: 44 }, subStats: [
      { type: 'Crit Rate', value: 10.5 }, { type: 'Crit DMG', value: 21 },
      { type: 'ATK%', value: 11.6 }, { type: 'ATK', value: 60 },
      { type: 'Resonance Liberation DMG Bonus', value: 11.6 }
    ]
  }, characterRuleSets['1210'].templates['calc.json']);
  assert.equal(score.value, 50);
  assert.equal(score.grade, 'SSS');
});

test('scores only the character matching elemental main stat', () => {
  const rule = selectCharacterRule({ characterId: '1210', echoes: [] }).rule;
  const echo = type => ({ id: 'e', cost: 3, mainStat: { type, value: 30 }, subStats: [] });
  assert.equal(scoreEcho(echo('Fusion DMG'), rule).contributions[0].raw, 8.25);
  assert.equal(scoreEcho(echo('Glacio DMG'), rule).contributions[0].raw, 0);
});

test('contains the complete pinned WWUID character configuration', () => {
  assert.equal(wwuidMeta.commit, '1d0ed3b7bc640cdf05b9320e5d514227549bf0c2');
  assert.equal(wwuidMeta.characterDirectories, 49);
  assert.equal(wwuidMeta.templates, 50);
  for (const ruleSet of Object.values(characterRuleSets)) {
    assert.ok(ruleSet.templates[ruleSet.defaultTemplate]);
  }
});

test('selects Phoebe scoring template from the equipped sonata', () => {
  const build = { characterId: '1506', weaponId: 'w', sequence: 0, echoes: Array.from({ length: 5 }, (_, id) => ({ id, setId: 11 })) };
  assert.equal(selectCharacterRule(build).templateName, '菲比-新光套');
  build.echoes.forEach(echo => { echo.setId = 8; });
  assert.equal(selectCharacterRule(build).templateName, '菲比-通用');
});

test('uses the current domestic Hiyuki scoring configuration', () => {
  const selected = selectCharacterRule({ characterId: '1108', echoes: [] });
  assert.equal(selected.rule.name, '绯雪-通用');
  assert.equal(selected.rule.attribute, 'Glacio');
});

test('extracts raw and XOR-obfuscated convene links', () => {
  const url = 'https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?player_id=700000001&record_id=token';
  const encoded = Buffer.from(url, 'utf8').map(value => {
    for (let byte = 0; byte < 256; byte += 1) {
      if ((byte ^ ((byte & 0x0f) % 2 === 1 ? 0xa5 : 0xef)) === value) return byte;
    }
    throw new Error('cannot encode test byte');
  });
  assert.equal(extractConveneURL(Buffer.from(`prefix ${url} suffix`)), url);
  assert.equal(extractConveneURL(encoded), url);
  assert.equal(trackerPlatform('darwin'), 'macos');
  assert.match(candidateLogPaths('darwin', '/Users/test')[0], /com\.kurogame\.wutheringwaves\.global/);
});

test('compares score, weapon and replaced echoes with the previous build', () => {
  const echo = (id, value = 6.4) => ({ id, cost: 1, level: 25, setId: 1, mainStat: { type: 'ATK%', value: 18 }, subStats: [{ type: 'Crit Rate', value }] });
  const previous = { characterId: '1102', weaponId: 'old', weaponLevel: 90, weaponRank: 1, sequence: 0, echoes: [echo('1'), echo('2'), echo('3'), echo('4'), echo('5')] };
  const current = { ...previous, weaponId: 'new', echoes: [echo('6', 10.5), ...previous.echoes.slice(1)] };
  const difference = compareBuild(current, previous);
  assert.equal(difference.weaponChanged, true);
  assert.equal(difference.echoes.length, 1);
  assert.equal(difference.echoes[0].before.id, '1');
  assert.ok(difference.delta > 0);
});

test('normalizes macOS OCR output into a scored echo shape', () => {
  const raw = {
    index: 0,
    card: ['阿嗞嗞', '等级 +25', 'COST 1'],
    statNames: ['攻击百分比', '生命', '暴击伤害', '暴击', '共鸣效率'],
    statValues: ['18.0%', '2280', '21.0%', '10.5%', '11.6%'],
    sonata: ['轻云出月', '共鸣效果']
  };
  const echo = parseEchoScan(raw);
  assert.equal(echo.name, '阿嗞嗞');
  assert.equal(echo.cost, 1);
  assert.equal(echo.level, 25);
  assert.equal(echo.setId, 8);
  assert.deepEqual(echo.mainStat, { type: 'ATK%', value: 18 });
  assert.deepEqual(echo.subStats[0], { type: 'Crit DMG', value: 21 });
  assert.equal(echo.valid, true);
  assert.equal(parseEchoScanBatch({ requested: 1, detected: 1, echoes: [raw] }).echoes.length, 1);
});

test('validates imported inventory before rendering resource URLs', () => {
  const inventory = { echoes: [{ name: '阿嗞嗞', resourceId: '390070067', cost: 1, level: 25,
    mainStat: { type: 'ATK%', value: 18 }, subStats: [{ type: 'Crit Rate', value: 10.5 }], issues: [] }] };
  assert.equal(validateEchoInventory(inventory), inventory);
  assert.throws(() => validateEchoInventory({ echoes: [{ ...inventory.echoes[0], resourceId: '1" onerror="alert(1)' }] }));
});
