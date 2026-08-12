import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUID, normalizeBuild, scoreEcho } from '../core.js';

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

test('generic score is bounded and graded', () => {
  const score = scoreEcho({ id: 'e', subStats: [
    { type: 'Crit Rate', value: 10.5 }, { type: 'Crit DMG', value: 21 },
    { type: 'ATK%', value: 11.6 }, { type: 'Basic Attack DMG Bonus', value: 11.6 },
    { type: 'DEF%', value: 14.7 }
  ] });
  assert.equal(score.value, 38);
  assert.equal(score.grade, 'S');
});

