'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const c = require('../core.cjs');

test('deadline timer survives sleep, pauses accurately and settles only once', () => {
  const state = c.defaultState(100000);
  c.timerAction(state, 'start', { kind: 'focus', minutes: 25 }, 100000);
  assert.equal(c.remaining(state.timer, 160000), 1440000);
  c.timerAction(state, 'pause', {}, 160000);
  assert.equal(c.remaining(state.timer, 2000000), 1440000);
  c.timerAction(state, 'resume', {}, 2000000);
  const saved = c.normalizeState(JSON.parse(JSON.stringify(state)), 4000000);
  assert.equal(c.remaining(saved.timer, 4000000), 0);
  assert.equal(c.settleTimer(saved, 4000000).kind, 'focus');
  assert.equal(saved.completedSessions, 1); assert.equal(saved.completedMinutes, 25);
  assert.equal(c.settleTimer(saved, 4000001), null); assert.equal(saved.completedSessions, 1);
});

test('cancel, invalid durations and concurrent timer starts do not corrupt progress', () => {
  const state = c.defaultState();
  for (const minutes of [0, -1, 181, 2.5, '25', NaN]) assert.throws(() => c.timerAction(state, 'start', { minutes }));
  c.timerAction(state, 'start', { kind: 'break', minutes: 5 });
  assert.throws(() => c.timerAction(state, 'start', { minutes: 25 }));
  c.timerAction(state, 'cancel'); assert.equal(state.timer, null); assert.equal(state.completedSessions, 0);
  assert.throws(() => c.timerAction(state, 'resume'));
});

test('remote HTTP, credential-bearing URLs and secret query strings are rejected', () => {
  assert.equal(c.normalizeEndpoint('https://example.com/v1/'), 'https://example.com/v1/chat/completions');
  assert.equal(c.normalizeEndpoint('http://localhost:1234/v1/chat/completions'), 'http://localhost:1234/v1/chat/completions');
  assert.equal(c.normalizeEndpoint('http://[::1]:1234/v1'), 'http://[::1]:1234/v1/chat/completions');
  for (const url of ['http://example.com/v1', 'file:///secret', 'https://user:password@example.com', 'https://example.com?key=abc', 'https://example.com#secret', 'not a url']) assert.throws(() => c.normalizeEndpoint(url));
});

test('persisted preferences are bounded and malformed state gets safe defaults', () => {
  const state = c.normalizeState({ settings: { scale: 9, opacity: -2, animationSpeed: Infinity, roam: 'true' }, timer: { status: 'running', kind: 'focus', totalMs: 5 }, conversation: [{ role: 'system', text: 'bad' }, { role: 'user', text: 'hi' }] });
  assert.equal(state.settings.scale, 1.75); assert.equal(state.settings.opacity, .35);
  assert.equal(state.settings.animationSpeed, 1); assert.equal(state.settings.roam, false);
  assert.equal(state.timer, null); assert.equal(state.conversation.length, 1);
});

test('atomic state save round-trips settings, conversation and encrypted key field', () => {
  const temporaryRoot = path.resolve(__dirname, '..', 'test-output');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(temporaryRoot, 'state-'));
  try {
    const file = path.join(dir, 'state.json'), state = c.defaultState(100000);
    state.position = { x: -800, y: 50 }; state.api.keyCipher = 'encrypted-example';
    state.companions = { sandroneEnabled: false, positions: { columbina: { x: -800, y: 50 }, sandrone: { x: -1100, y: 75 } } };
    state.conversation = [{ role: 'user', text: '<script>not executable</script>', mode: 'local', at: 100000 }];
    c.saveState(file, state);
    const loaded = c.loadState(file, 100001);
    assert.equal(loaded.warning, null); assert.deepEqual(loaded.state.position, state.position);
    assert.deepEqual(loaded.state.companions, state.companions);
    assert.equal(loaded.state.api.keyCipher, 'encrypted-example');
    assert.equal(loaded.state.conversation[0].text, state.conversation[0].text);
    fs.writeFileSync(file, '{broken');
    assert.match(c.loadState(file).warning, /无法读取/);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  } finally {
    assert.ok(path.resolve(dir).startsWith(temporaryRoot + path.sep));
    fs.rmSync(dir, { recursive: true });
  }
});

test('absence causes no mood or familiarity penalty; rest and sharing replenish energy', () => {
  const state = c.defaultState(100000); state.wellbeing.energy = 30;
  c.updateWellbeing(state, 100000 + 30 * 86400000);
  assert.equal(state.wellbeing.mood, 78); assert.equal(state.wellbeing.familiarity, 0);
  c.careAction(state, 'rest', 3000000000);
  c.updateWellbeing(state, 3000000000 + 3600000);
  assert.equal(state.wellbeing.energy, 48);
  c.careAction(state, 'share', 3003600001); assert.ok(Math.abs(state.wellbeing.energy - 56) < .001);
  const familiarity = state.wellbeing.familiarity;
  c.careAction(state, 'share', 3003600002); assert.equal(state.wellbeing.familiarity, familiarity);
});

test('position is clamped and edge-snapped on negative-coordinate monitors', () => {
  const area = { x: -1920, y: 0, width: 1920, height: 1040 }, size = { width: 270, height: 355 };
  assert.deepEqual(c.constrainPosition({ x: -1910, y: 700 }, size, area, true), { x: -1920, y: 685 });
  assert.deepEqual(c.constrainPosition({ x: 2000, y: -1000 }, size, area), { x: -270, y: 0 });
});

test('local dialogue uses reviewed rules and does not invent an LLM response', () => {
  const persona = require('../persona.json');
  assert.ok(persona.version.includes('canon-reviewed'));
  assert.match(c.localReply('我有点累', persona), /歇|坐/);
  assert.match(c.localReply('你好', persona), /你好|回来了/);
  assert.match(c.localReply('说说桑多涅剧情', persona), /不会补写/);
});
