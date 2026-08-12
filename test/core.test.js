import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUID, normalizeBuild, scoreBuild, scoreEcho, selectCharacterRule } from '../core.js';
import { characterRuleSets, wwuidMeta } from '../character-rules.js';
import { analyzeBanner, mergeGachaData, parseConveneURL } from '../gacha.js';

test('accepts UID and exact WuWaBuilds profile URL only', () => {
  assert.equal(parseUID('701776400'), '701776400');
  assert.equal(parseUID('https://wuwa.build/profile/701776400'), '701776400');
  assert.throws(() => parseUID('https://example.com/profile/701776400'));
});

test('normalizes five matching echo panels', () => {
  const panel = (id, type, cost) => ({
    panel: { id, level: 25, resolvedSetId: 1, stats: { mainStat: { type, value: 30 }, subStats: [] } },
    main: { cost, statType: type }
  });
  const pairs = [panel('1', 'Crit DMG', 4), panel('2', 'ATK%', 3), panel('3', 'ATK%', 3), panel('4', 'ATK%', 1), panel('5', 'ATK%', 1)];
  const build = normalizeBuild({
    id: 'b', owner: { uid: '701776400', username: 'u' }, character: { id: 'c' }, weapon: { id: 'w' },
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

test('parses official convene URL and analyzes newest-first pulls', () => {
  const params = parseConveneURL('https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?svr_id=1&player_id=715705407&lang=zh-Hans&record_id=token&svr_area=global');
  assert.equal(params.playerId, '715705407');
  assert.equal(params.apiOrigin, 'https://gmserver-api.aki-game2.net');
  const stats = analyzeBanner([
    { name: '三星', qualityLevel: 3 }, { name: '四星', qualityLevel: 4 },
    { name: '五星甲', qualityLevel: 5 }, { name: '三星', qualityLevel: 3 }, { name: '五星乙', qualityLevel: 5 }
  ]);
  assert.equal(stats.currentPity, 2);
  assert.equal(stats.currentPity4, 1);
  assert.deepEqual(stats.fiveStars.map(item => item.pulls), [2, 1]);
});

test('merges expired gacha records without collapsing identical pulls', () => {
  const pull = { name: '相同物品', qualityLevel: 3, time: '2026-01-01 00:00:00' };
  const merged = mergeGachaData({ pulls: { 1: [pull, pull] } }, { pulls: { 1: [pull] } });
  assert.equal(merged.pulls[1].length, 2);
});
