'use strict';

const fs = require('node:fs');
const path = require('node:path');

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const number = (n, fallback, lo, hi) => Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
const settingsDefault = {
  scale: 1, opacity: 1, animationSpeed: 1, alwaysOnTop: true,
  followGaze: true, roam: false, reduceMotion: false, sound: false,
  snap: true, focusMinutes: 25, breakMinutes: 5, followColumbina: false
};

function normalizeSettings(input = {}) {
  const value = { ...settingsDefault };
  for (const key of ['alwaysOnTop', 'followGaze', 'roam', 'reduceMotion', 'sound', 'snap', 'followColumbina']) {
    if (typeof input[key] === 'boolean') value[key] = input[key];
  }
  for (const [key, lo, hi] of [
    ['scale', .65, 1.75], ['opacity', .35, 1], ['animationSpeed', .5, 2],
    ['focusMinutes', 1, 180], ['breakMinutes', 1, 60]
  ]) value[key] = number(input[key], settingsDefault[key], lo, hi);
  return value;
}

function normalizeEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length > 500) throw new Error('请输入有效的接口地址。');
  let url;
  try { url = new URL(raw.trim()); } catch { throw new Error('接口地址格式不正确。'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('远程接口须使用 HTTPS；本机 localhost 可使用 HTTP。');
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('接口地址不能包含账号、密码、查询参数或片段。');
  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/chat/completions')) pathname += '/chat/completions';
  url.pathname = pathname;
  return url.toString();
}

function defaultState(now = Date.now()) {
  return {
    schema: 1, settings: { ...settingsDefault }, position: null,
    companions: { sandroneEnabled: true, positions: {} },
    wellbeing: { energy: 80, mood: 78, familiarity: 0, resting: false, updatedAt: now },
    timer: null, completedSessions: 0, completedMinutes: 0,
    api: { enabled: false, endpoint: 'https://api.openai.com/v1', model: '', keyCipher: '' },
    conversation: [], lastActions: {}, firstRun: true
  };
}

function normalizeState(input, now = Date.now()) {
  const state = defaultState(now);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return state;
  state.settings = normalizeSettings(input.settings);
  const p = input.position;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) state.position = { x: Math.round(p.x), y: Math.round(p.y) };
  if (input.companions?.sandroneEnabled === false) state.companions.sandroneEnabled = false;
  for (const id of ['columbina', 'sandrone']) {
    const pos = input.companions?.positions?.[id];
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) state.companions.positions[id] = { x: Math.round(pos.x), y: Math.round(pos.y) };
  }
  const w = input.wellbeing || {};
  for (const key of ['energy', 'mood', 'familiarity']) state.wellbeing[key] = number(w[key], state.wellbeing[key], 0, 100);
  state.wellbeing.resting = w.resting === true;
  state.wellbeing.updatedAt = number(w.updatedAt, now, 0, now);
  const t = input.timer;
  if (t && ['focus', 'break'].includes(t.kind) && ['running', 'paused'].includes(t.status) && Number.isFinite(t.totalMs) && t.totalMs >= 60000 && t.totalMs <= 10800000) {
    state.timer = {
      kind: t.kind, status: t.status, totalMs: t.totalMs,
      remainingMs: number(t.remainingMs, t.totalMs, 0, t.totalMs),
      deadline: number(t.deadline, now, 0, Number.MAX_SAFE_INTEGER)
    };
  }
  state.completedSessions = Math.floor(number(input.completedSessions, 0, 0, 100000));
  state.completedMinutes = Math.floor(number(input.completedMinutes, 0, 0, 10000000));
  const api = input.api || {};
  state.api.enabled = api.enabled === true;
  state.api.endpoint = typeof api.endpoint === 'string' ? api.endpoint.slice(0, 500) : state.api.endpoint;
  state.api.model = typeof api.model === 'string' ? api.model.slice(0, 100) : '';
  state.api.keyCipher = typeof api.keyCipher === 'string' ? api.keyCipher.slice(0, 20000) : '';
  state.conversation = Array.isArray(input.conversation) ? input.conversation.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.text === 'string').slice(-60).map(m => ({ role: m.role, text: m.text.slice(0, 2400), mode: m.mode === 'api' ? 'api' : 'local', at: number(m.at, now, 0, now) })) : [];
  state.firstRun = input.firstRun !== false;
  for (const key of ['pat', 'share', 'greet']) {
    state.lastActions[key] = number(input.lastActions?.[key], 0, 0, now);
  }
  return state;
}

function loadState(file, now = Date.now()) {
  try { return { state: normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')), now), warning: null }; }
  catch (error) {
    return { state: defaultState(now), warning: error.code === 'ENOENT' ? null : '本地记录无法读取，本次使用默认状态；原文件已保留。' };
  }
}

function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

function remaining(timer, now = Date.now()) {
  if (!timer) return 0;
  return timer.status === 'running' ? Math.max(0, timer.deadline - now) : timer.remainingMs;
}

function timerAction(state, action, payload = {}, now = Date.now()) {
  if (action === 'start') {
    if (state.timer) throw new Error('请先结束当前计时。');
    const kind = payload.kind === 'break' ? 'break' : 'focus';
    const minutes = payload.minutes;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > (kind === 'focus' ? 180 : 60)) throw new Error('计时长度超出范围。');
    state.timer = { kind, status: 'running', totalMs: minutes * 60000, remainingMs: minutes * 60000, deadline: now + minutes * 60000 };
  } else if (action === 'pause') {
    if (state.timer?.status !== 'running') throw new Error('当前没有运行中的计时。');
    state.timer.remainingMs = remaining(state.timer, now);
    state.timer.status = 'paused';
  } else if (action === 'resume') {
    if (state.timer?.status !== 'paused') throw new Error('当前没有暂停的计时。');
    state.timer.deadline = now + state.timer.remainingMs;
    state.timer.status = 'running';
  } else if (action === 'cancel') state.timer = null;
  else throw new Error('不支持的计时操作。');
  return state.timer;
}

function settleTimer(state, now = Date.now()) {
  if (!state.timer || state.timer.status !== 'running' || remaining(state.timer, now) > 0) return null;
  const finished = { ...state.timer };
  state.timer = null;
  if (finished.kind === 'focus') {
    state.completedSessions += 1;
    state.completedMinutes += Math.round(finished.totalMs / 60000);
    state.wellbeing.familiarity = clamp(state.wellbeing.familiarity + 1, 0, 100);
  }
  return finished;
}

function updateWellbeing(state, now = Date.now()) {
  const w = state.wellbeing;
  const elapsedHours = Math.max(0, Math.min(12, (now - w.updatedAt) / 3600000));
  // Absence never reduces mood or familiarity. Rest replenishes energy.
  if (w.resting) w.energy = clamp(w.energy + elapsedHours * 18, 0, 100);
  w.updatedAt = now;
}

function careAction(state, action, now = Date.now()) {
  updateWellbeing(state, now);
  const w = state.wellbeing;
  if (action === 'rest') { w.resting = !w.resting; return w.resting ? 'rest' : 'wake'; }
  if (!['pat', 'share', 'greet'].includes(action)) throw new Error('不支持的互动。');
  if (now - (state.lastActions[action] || 0) > 30000) {
    w.mood = clamp(w.mood + (action === 'share' ? 5 : 2), 0, 100);
    w.familiarity = clamp(w.familiarity + .5, 0, 100);
    if (action === 'share') w.energy = clamp(w.energy + 8, 0, 100);
    state.lastActions[action] = now;
  }
  return action;
}

function constrainPosition(position, size, workArea, snap = false) {
  const xMax = workArea.x + Math.max(0, workArea.width - size.width);
  const yMax = workArea.y + Math.max(0, workArea.height - size.height);
  let x = clamp(Math.round(position.x), workArea.x, xMax);
  let y = clamp(Math.round(position.y), workArea.y, yMax);
  if (snap) {
    if (x - workArea.x < 28) x = workArea.x;
    if (xMax - x < 28) x = xMax;
    if (y - workArea.y < 28) y = workArea.y;
    if (yMax - y < 28) y = yMax;
  }
  return { x, y };
}

function localReply(text, persona) {
  const rules = Array.isArray(persona.localRules) ? persona.localRules : [];
  const input = text.toLowerCase();
  for (const rule of rules) if (Array.isArray(rule.keywords) && rule.keywords.some(k => input.includes(String(k).toLowerCase()))) return rule.replies[Math.floor(Math.random() * rule.replies.length)];
  const defaults = persona.dialogue?.idle || ['嗯……我在听。'];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// Columbina 桌面端写出的任务状态（见其仓库 docs/pets.md）对应到“工作时的样子”。
// done 表示一轮刚做完：动作回到闲坐，另由主进程播一次招呼。
const COLUMBINA_MODES = { idle: 'idle', thinking: 'thinking', review: 'review', waiting: 'waiting', failed: 'failed', done: 'idle' };
const AT_REST = { state: 'idle', mode: 'idle', label: '' };

/**
 * 读 Columbina 的 pet-state.json。文件内容不对返回 null（保持现状）；
 * 写文件的 Columbina 进程已经不在（如崩溃）时视为空闲。alive(pid) 判断进程是否还在。
 */
function columbinaState(text, alive) {
  if (text === null) return AT_REST;
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  if (!value || typeof value !== 'object' || value.version !== 1 || !Object.hasOwn(COLUMBINA_MODES, value.state)) return null;
  if (!Number.isInteger(value.pid) || !alive(value.pid)) return AT_REST;
  const label = typeof value.label === 'string' ? Array.from(value.label.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).slice(0, 40).join('') : '';
  return { state: value.state, mode: COLUMBINA_MODES[value.state], label };
}

module.exports = { columbinaState, clamp, normalizeSettings, normalizeEndpoint, defaultState, normalizeState, loadState, saveState, remaining, timerAction, settleTimer, updateWellbeing, careAction, constrainPosition, localReply };
