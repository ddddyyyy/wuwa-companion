import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUID, normalizeBuild, scoreBuild, scoreEcho } from '../core.js';
import { characterRules } from '../character-rules.js';

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
    sequence: 0, cv: 200, timestamp: '2026-01-01T00:00:00Z',
    echoSummary: { mainStats: pairs.map(item => item.main) },
    buildState: { echoPanels: pairs.map(item => item.panel) }
  });
  assert.equal(build.echoes.length, 5);
  assert.equal(build.echoes[0].cost, 4);
});

test('matches WWUID Aemeath 4-cost normalization', () => {
  const score = scoreEcho({
    id: 'e', cost: 4, mainStat: { type: 'Crit DMG', value: 44 }, subStats: [
      { type: 'Crit Rate', value: 10.5 }, { type: 'Crit DMG', value: 21 },
      { type: 'ATK%', value: 11.6 }, { type: 'ATK', value: 60 },
      { type: 'Resonance Liberation DMG Bonus', value: 11.6 }
    ]
  }, characterRules['1210']);
  assert.equal(score.value, 50);
  assert.equal(score.grade, 'SSS');
});

test('does not invent a score for an unconfigured character', () => {
  assert.deepEqual(scoreBuild({ characterId: '1108', echoes: [] }), {
    available: false,
    reason: '该角色暂无国内专属权重配置'
  });
});
