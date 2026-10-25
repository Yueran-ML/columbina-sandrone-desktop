'use strict';
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, Notification, safeStorage, session, net, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const core = require('./core.cjs');

const smoke = process.argv.includes('--smoke-test');
const smokeDirArg = process.argv.find(a => a.startsWith('--smoke-test-dir='));
if (smoke) app.setPath('userData', smokeDirArg ? path.resolve(smokeDirArg.split('=').slice(1).join('=')) : path.join(__dirname, 'test-output', 'profile'));
else app.setPath('userData', path.join(app.getPath('appData'), 'ColumbinaMoonlitCompanion'));
app.setName('哥伦比娅 · 月下同伴');
app.setAppUserModelId('local.columbina.moonlit.companion');
const file = path.join(app.getPath('userData'), 'state.json');
let state, persona, manifest, pet, panel, tray, saveTimer, quitting = false;
const pets = new Map(), characters = new Map();
let dragging = null, chatBusy = false, workMode = 'idle';
// 跟随 Columbina 桌面端：它写出的任务状态文件、上次看到的状态和对文件夹的监视。
const columbinaFile = path.join(app.getPath('appData'), 'Columbina', 'pet-state.json');
let columbinaSeen = null, columbinaWatch = null;
const roamDirections = { columbina: 1, sandrone: -1 };
const recentPats = { columbina: [], sandrone: [] };
const sceneCooldowns = new Map();
const windows = new Set();
const root = __dirname;
const duoScenes = require('./duo-scenes.json');
const spritePath = path.join(root, 'assets', 'sprite-sheet.png');
const pageUrl = pathToFileURL(path.join(root, 'index.html')).toString();
const readJSON = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));

function snapshot(characterId = 'columbina') {
  const character = characters.get(characterId) || characters.get('columbina');
  return {
    ...state, api: { enabled: state.api.enabled, endpoint: state.api.endpoint, model: state.api.model, keyPresent: !!state.api.keyCipher },
    persona: { name: persona.name, subtitle: persona.subtitle, disclaimer: persona.disclaimer, version: persona.version },
    manifest: character?.manifest || manifest, characterId, characterName: character?.persona.name || persona.name,
    assetReady: fs.existsSync(character?.spritePath || spritePath), workMode,
    timerRemainingMs: core.remaining(state.timer), now: Date.now(), chatBusy,
    dataDirectory: app.getPath('userData'), appVersion: app.getVersion()
  };
}
function broadcast(channel, payload) {
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send(channel, payload);
}
function publish() {
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send('companion:state', snapshot(w.characterId || 'columbina'));
}
function persist(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try { core.saveState(file, state); }
    catch { broadcast('companion:notice', { text: '记录暂时未能保存，请检查数据文件夹的写入权限。', error: true }); }
  };
  if (immediate) write(); else saveTimer = setTimeout(write, 300);
}
function phrase(key, characterId = 'columbina') {
  const targetPersona = characters.get(characterId)?.persona || persona;
  const items = targetPersona.dialogue?.[key] || targetPersona.dialogue?.idle || ['嗯。'];
  return items[Math.floor(Math.random() * items.length)];
}
function speak(key, animation = 'idle', characterId = 'columbina') {
  const text = phrase(key, characterId);
  speakText(text, animation, characterId);
  return text;
}
function speakText(text, animation, characterId) {
  for (const w of windows) if (!w.isDestroyed() && (w.characterId === characterId || (!w.characterId && characterId === 'columbina'))) w.webContents.send('companion:interaction', { text, animation, characterId });
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}
/** 读一次 Columbina 的任务状态；有变化时切换动作，等批准、出错、做完时说一句。 */
function followColumbina() {
  if (!state.settings.followColumbina) return;
  let text = null;
  try { text = fs.readFileSync(columbinaFile, 'utf8'); } catch { /* 还没有文件：当作空闲 */ }
  const seen = core.columbinaState(text, alive);
  if (!seen) return;
  const key = seen.state + ' ' + seen.label;
  if (key === columbinaSeen) return;
  columbinaSeen = key;
  workMode = seen.mode;
  publish();
  if (seen.state === 'waiting') speakText(seen.label ? `要用 ${seen.label}，等你点头。` : '有件事等你点头。', 'waiting', 'columbina');
  else if (seen.state === 'failed') speakText('那边遇到了一点难题。', 'failed', 'columbina');
  else if (seen.state === 'done') speakText('那边做完了。', 'wave', 'columbina');
}
/** 按设置开始或停止跟随。停止时回到闲坐。 */
function watchColumbina() {
  columbinaWatch?.close();
  columbinaWatch = null;
  columbinaSeen = null;
  if (!state.settings.followColumbina) { workMode = 'idle'; return; }
  // 监视可能漏掉变化，主循环每两秒也会读一次。
  try { columbinaWatch = fs.watch(path.dirname(columbinaFile), () => followColumbina()); } catch { /* 文件夹还没有 */ }
  followColumbina();
}
function linkedScene(scene, initiatingCharacter = 'columbina') {
  if (!state.companions.sandroneEnabled || (!smoke && (!pets.get('sandrone')?.isVisible() || !pet?.isVisible()))) return false;
  const now = Date.now(), interval = scene === 'encounter' ? 90000 : 20000;
  if (now - (sceneCooldowns.get(scene) || 0) < interval) return false;
  const lines = duoScenes[scene === 'share' ? (initiatingCharacter === 'sandrone' ? 'shareBread' : 'shareFruit') : scene];
  if (!lines) return false;
  sceneCooldowns.set(scene, now);
  for (const [index, line] of lines.entries()) {
    const display = () => {
      if (quitting || (!smoke && !pets.get(line.character)?.isVisible())) return;
      speakText(line.text, line.animation, line.character);
    };
    if (index === 0) display(); else setTimeout(display, 1700 * index);
  }
  return true;
}
function protectedWindow(options) {
  const w = new BrowserWindow({
    show: false, backgroundColor: '#10101d', icon: path.join(root, 'assets', 'moon-icon.png'),
    ...options,
    webPreferences: {
      preload: path.join(root, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true,
      spellcheck: false, backgroundThrottling: false
    }
  });
  windows.add(w);
  w.on('closed', () => windows.delete(w));
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', event => event.preventDefault());
  w.webContents.on('will-attach-webview', event => event.preventDefault());
  return w;
}
function applyPetSettings() {
  for (const [id, target] of pets) {
  if (target.isDestroyed()) continue;
  const oldBounds = target.getBounds();
  const width = Math.round(270 * state.settings.scale), height = Math.round(355 * state.settings.scale);
  const workArea = screen.getDisplayMatching(oldBounds).workArea;
  const pos = core.constrainPosition({ x: oldBounds.x + oldBounds.width - width, y: oldBounds.y + oldBounds.height - height }, { width, height }, workArea, state.settings.snap);
  target.setBounds({ ...pos, width, height });
  target.setOpacity(state.settings.opacity);
  target.setAlwaysOnTop(state.settings.alwaysOnTop, 'floating');
  state.companions.positions[id] = pos;
  if (id === 'columbina') state.position = pos;
  }
}
function createPet(characterId = 'columbina') {
  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.round(270 * state.settings.scale), height = Math.round(355 * state.settings.scale);
  const saved = state.companions.positions[characterId] || (characterId === 'columbina' ? state.position : null) || { x: area.x + area.width - width - 32 - (characterId === 'sandrone' ? width - 20 : 0), y: area.y + area.height - height - 16 };
  const display = screen.getDisplayNearestPoint(saved);
  const pos = core.constrainPosition(saved, { width, height }, display.workArea, state.settings.snap);
  const target = protectedWindow({ width, height, ...pos, transparent: true, frame: false, resizable: false, maximizable: false, minimizable: false, hasShadow: false, backgroundColor: '#00000000', skipTaskbar: true, alwaysOnTop: state.settings.alwaysOnTop });
  target.characterId = characterId; pets.set(characterId, target);
  if (characterId === 'columbina') pet = target;
  target.loadFile(path.join(root, 'index.html'), { query: { view: 'pet', character: characterId } });
  target.setOpacity(state.settings.opacity);
  target.on('ready-to-show', () => { if (!smoke && (characterId !== 'sandrone' || state.companions.sandroneEnabled)) target.showInactive(); });
  target.on('close', event => { if (!quitting) { event.preventDefault(); target.hide(); if (characterId === 'sandrone') { state.companions.sandroneEnabled = false; persist(); publish(); } updateTray(); } });
}
function setSandrone(enabled) {
  state.companions.sandroneEnabled = enabled;
  if (!smoke) { if (enabled) pets.get('sandrone').showInactive(); else pets.get('sandrone').hide(); }
  persist(); publish(); updateTray();
}
function openPanel(tab = 'home') {
  if (!panel || panel.isDestroyed()) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const width = Math.min(1050, area.width - 32), height = Math.min(760, area.height - 32);
    panel = protectedWindow({ width, height, minWidth: Math.min(860, width), minHeight: Math.min(650, height), title: '哥伦比娅 · 月下同伴', titleBarStyle: 'hidden', titleBarOverlay: { color: '#10101d', symbolColor: '#d9d4f2', height: 38 } });
    panel.loadFile(path.join(root, 'index.html'), { query: { view: 'panel', tab } });
    panel.on('ready-to-show', () => { if (!smoke) panel.show(); });
  } else {
    if (!smoke) { panel.show(); panel.focus(); }
    panel.webContents.send('companion:navigate', tab);
  }
  return panel;
}
function togglePet() {
  if (pet.isVisible()) pet.hide(); else pet.showInactive();
  updateTray();
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '哥伦比娅 · 月下同伴', enabled: false },
    { type: 'separator' },
    { label: pet?.isVisible() ? '收起哥伦比娅' : '显示哥伦比娅', click: togglePet },
    { label: '桑多涅一同出现', type: 'checkbox', checked: state.companions.sandroneEnabled, click: item => setSandrone(item.checked) },
    { label: '打开月下小屋', click: () => openPanel() },
    { label: '开始专注', click: () => openPanel('focus') },
    { type: 'separator' },
    { label: '置于最前', type: 'checkbox', checked: state.settings.alwaysOnTop, click: item => { state.settings.alwaysOnTop = item.checked; applyPetSettings(); persist(); publish(); updateTray(); } },
    { label: '偏好设置', click: () => openPanel('settings') },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
}
function contextMenu(characterId = 'columbina') {
  const target = pets.get(characterId) || pet;
  Menu.buildFromTemplate([
    { label: characters.get(characterId)?.persona.name || '哥伦比娅', enabled: false },
    { label: '打个招呼', click: () => doCare('greet', characterId) },
    { label: '分享点心', click: () => doCare('share', characterId) },
    { label: state.wellbeing.resting ? '结束休息' : '一起休息', click: () => doCare('rest', characterId) },
    { type: 'separator' },
    { label: '对话', click: () => openPanel('chat') },
    { label: '专注计时', click: () => openPanel('focus') },
    { label: '偏好设置', click: () => openPanel('settings') },
    { type: 'separator' },
    { label: '暂时收起这一位', click: () => { if (characterId === 'sandrone') setSandrone(false); else togglePet(); } },
    { label: '退出', click: () => app.quit() }
  ]).popup({ window: target });
}
function doCare(action, characterId = 'columbina') {
  if (action === 'pat') {
    const now = Date.now();
    recentPats[characterId] = recentPats[characterId].filter(t => now - t < 8000); recentPats[characterId].push(now);
    if (recentPats[characterId].length >= 4) {
      const text = phrase('boundary', characterId);
      if (now - (sceneCooldowns.get('patBoundary:' + characterId) || 0) >= 12000) {
        sceneCooldowns.set('patBoundary:' + characterId, now);
        if (!linkedScene('boundary')) speakText(text, 'waiting', characterId);
      }
      return { text, action: 'boundary' };
    }
  }
  const result = core.careAction(state, action);
  const animation = { pat: 'wave', greet: 'wave', share: 'jump', rest: 'waiting', wake: 'wave' }[result];
  const paired = (result === 'share' || result === 'rest') && linkedScene(result, characterId);
  const text = paired ? phrase(result, characterId) : speak(result, animation, characterId);
  persist(); publish();
  return { text, action: result };
}
function settle() {
  core.updateWellbeing(state);
  const finished = core.settleTimer(state);
  if (finished) {
    const key = finished.kind === 'focus' ? 'focusDone' : 'breakDone';
    const text = linkedScene(key) ? phrase(key) : speak(key, 'wave');
    if (!smoke && Notification.isSupported()) {
      const notification = new Notification({ title: finished.kind === 'focus' ? '一段专注，完成了' : '休息结束', body: text, icon: path.join(root, 'assets', 'moon-icon.png'), silent: !state.settings.sound });
      notification.on('click', () => openPanel('focus'));
      notification.show();
    }
    broadcast('companion:complete', { kind: finished.kind, text });
    persist(true); publish();
  }
  return finished;
}
function assertSender(event) {
  const valid = [...windows].some(w => !w.isDestroyed() && w.webContents === event.sender);
  const url = event.senderFrame?.url || '';
  if (!valid || event.senderFrame !== event.sender.mainFrame || !url.startsWith(pageUrl + '?')) throw new Error('不受信任的消息来源。');
}
function ipc(name, fn) {
  ipcMain.handle('companion:' + name, async (event, payload) => {
    try { assertSender(event); return { ok: true, value: await fn(payload, event) }; }
    catch (error) { return { ok: false, error: error.message || '操作未完成。' }; }
  });
}
async function requestChat(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1200) throw new Error('请输入 1–1200 字的消息。');
  if (chatBusy) throw new Error('上一条回复还在途中。');
  text = text.trim();
  const mode = state.api.enabled ? 'api' : 'local';
  let answer;
  chatBusy = true; publish();
  try {
    if (mode === 'local') answer = core.localReply(text, persona);
    else {
      const url = core.normalizeEndpoint(state.api.endpoint);
      if (!state.api.model.trim()) throw new Error('请先在设置中填写模型名称。');
      const headers = { 'Content-Type': 'application/json' };
      if (state.api.keyCipher) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥存储暂时不可用。');
        let key;
        try { key = safeStorage.decryptString(Buffer.from(state.api.keyCipher, 'base64')); }
        catch { throw new Error('无法解密已保存的 API Key，请重新填写。'); }
        headers.Authorization = 'Bearer ' + key;
      }
      const messages = [
        { role: 'system', content: persona.systemPrompt },
        ...state.conversation.filter(m => m.mode === 'api').slice(-12).map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: text }
      ];
      let response;
      try {
        response = await net.fetch(url, { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(45000), body: JSON.stringify({ model: state.api.model, messages, temperature: .7, max_tokens: 350, stream: false }) });
      } catch { throw new Error('连接未完成：请检查接口地址、网络或服务状态（45 秒超时）。'); }
      if (!response.ok) throw new Error('接口返回 HTTP ' + response.status + '。请检查模型、权限和 API Key。');
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1000000) { await reader.cancel(); throw new Error('接口返回内容过大。'); }
        chunks.push(Buffer.from(value));
      }
      let data;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('接口没有返回有效 JSON。'); }
      answer = data?.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('接口没有返回可显示的文本。');
      answer = answer.trim().slice(0, 2400);
    }
    const now = Date.now();
    state.conversation.push({ role: 'user', text, mode, at: now }, { role: 'assistant', text: answer, mode, at: now });
    state.conversation = state.conversation.slice(-60);
    const farewellPlayed = mode === 'local' && /再见|走了|离开/.test(text) && linkedScene('farewell');
    if (farewellPlayed) {
      answer = duoScenes.farewell[0].text;
      state.conversation[state.conversation.length - 1].text = answer;
    } else for (const w of windows) if (!w.isDestroyed() && w.characterId !== 'sandrone') w.webContents.send('companion:interaction', { text: answer, animation: 'wave' });
    persist();
    return { text: answer, mode };
  } finally { chatBusy = false; publish(); }
}
function installIPC() {
  ipc('getState', (_payload, event) => { settle(); return snapshot(BrowserWindow.fromWebContents(event.sender)?.characterId || 'columbina'); });
  ipc('care', (action, event) => doCare(action, BrowserWindow.fromWebContents(event.sender)?.characterId || 'columbina'));
  ipc('companion', value => { if (typeof value !== 'boolean') throw new Error('显示设置无效。'); setSandrone(value); return value; });
  ipc('duoScene', value => {
    if (value !== 'encounter') throw new Error('不支持的双人场景。');
    if (!state.companions.sandroneEnabled) throw new Error('先打开“一同出现”，让桑多涅来这里。');
    if (!smoke) { pet.showInactive(); pets.get('sandrone').showInactive(); }
    if (!linkedScene(value)) throw new Error('刚刚聊过一会儿，让她们安静坐坐吧。');
    return true;
  });
  ipc('panel', tab => { openPanel(['home', 'chat', 'focus', 'settings'].includes(tab) ? tab : 'home'); return true; });
  ipc('settings', patch => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置格式不正确。');
    const following = state.settings.followColumbina;
    state.settings = core.normalizeSettings({ ...state.settings, ...patch });
    if (state.settings.followColumbina !== following) watchColumbina();
    applyPetSettings(); updateTray(); persist(); publish(); return snapshot();
  });
  ipc('timer', payload => {
    settle();
    if (!payload || typeof payload !== 'object') throw new Error('计时格式不正确。');
    core.timerAction(state, payload.action, payload);
    if (payload.action === 'start') {
      const key = payload.kind === 'break' ? 'rest' : 'focusStart';
      if (!linkedScene(key)) speak(key, payload.kind === 'break' ? 'waiting' : 'thinking');
    }
    persist(); publish(); return snapshot();
  });
  ipc('chat', requestChat);
  ipc('clearChat', () => { if (chatBusy) throw new Error('请等待当前回复完成。'); state.conversation = []; persist(); publish(); return true; });
  ipc('saveApi', value => {
    if (!value || typeof value !== 'object') throw new Error('接口设置格式不正确。');
    core.normalizeEndpoint(value.endpoint);
    if (typeof value.model !== 'string' || value.model.length > 100) throw new Error('模型名称过长。');
    if (value.enabled && !value.model.trim()) throw new Error('启用 API 前请填写模型名称。');
    let keyCipher = state.api.keyCipher;
    if (value.clearKey === true) keyCipher = '';
    if (value.key) {
      if (typeof value.key !== 'string' || value.key.length > 8000 || /[\r\n]/.test(value.key)) throw new Error('API Key 格式不正确。');
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥存储不可用，本次没有保存密钥。');
      keyCipher = safeStorage.encryptString(value.key.trim()).toString('base64');
    }
    state.api = { enabled: value.enabled === true, endpoint: value.endpoint.trim(), model: value.model.trim(), keyCipher };
    persist(true); publish(); return { keyPresent: !!keyCipher };
  });
  ipc('workMode', value => {
    if (!['idle', 'waiting', 'thinking', 'review', 'failed'].includes(value)) throw new Error('不支持的工作状态。');
    // 手动选了动作，就不再跟随 Columbina。
    if (state.settings.followColumbina) {
      state.settings.followColumbina = false;
      watchColumbina(); persist();
    }
    workMode = value; publish(); return value;
  });
  ipc('contextMenu', (_payload, event) => { contextMenu(BrowserWindow.fromWebContents(event.sender)?.characterId || 'columbina'); return true; });
  ipc('hide', (_payload, event) => { const target = BrowserWindow.fromWebContents(event.sender); if (target?.characterId === 'sandrone') setSandrone(false); else pet.hide(); updateTray(); return true; });
  ipc('drag', (payload, event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow?.characterId) throw new Error('只能拖动桌面角色。');
    if (!payload || !['start', 'move', 'end'].includes(payload.phase)) throw new Error('拖动参数无效。');
    if (payload.phase === 'start') { dragging = { cursor: screen.getCursorScreenPoint(), bounds: targetWindow.getBounds(), characterId: targetWindow.characterId }; return true; }
    if (!dragging || dragging.characterId !== targetWindow.characterId) return false;
    const cursor = screen.getCursorScreenPoint();
    const bounds = dragging.bounds;
    const size = { width: bounds.width, height: bounds.height };
    const target = { x: bounds.x + cursor.x - dragging.cursor.x, y: bounds.y + cursor.y - dragging.cursor.y };
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const position = core.constrainPosition(target, size, area, payload.phase === 'end' && state.settings.snap);
    targetWindow.setPosition(position.x, position.y);
    if (payload.phase === 'end') { dragging = null; state.companions.positions[targetWindow.characterId] = position; if (targetWindow.characterId === 'columbina') state.position = position; persist(); }
    return position;
  });
  ipc('dismissWelcome', () => { state.firstRun = false; persist(); return true; });
}
async function runSmokeTest() {
  const output = path.join(app.getPath('userData'), '..', 'smoke-result.json');
  let fixture;
  try {
    const p = openPanel();
    await Promise.all([pet, pets.get('sandrone'), p].map(w => new Promise(resolve => w.webContents.isLoading() ? w.webContents.once('did-finish-load', resolve) : resolve())));
    await new Promise(r => setTimeout(r, 700));
    for (const w of pets.values()) await w.webContents.executeJavaScript(`window.smokeInteractions=[];window.companion.onInteraction(event=>window.smokeInteractions.push({...event,at:Date.now()}));true`);
    await p.webContents.executeJavaScript(`window.companion.duoScene('encounter')`);
    await new Promise(r => setTimeout(r, 1850));
    const firstLines = await pet.webContents.executeJavaScript(`window.smokeInteractions`);
    const secondLines = await pets.get('sandrone').webContents.executeJavaScript(`window.smokeInteractions`);
    const colLine = firstLines.find(e => e.text === duoScenes.encounter[0].text);
    const sandLine = secondLines.find(e => e.text === duoScenes.encounter[1].text);
    const duoResult = {
      columbinaSpoke: !!colLine && colLine.characterId === 'columbina',
      sandroneReplied: !!sandLine && sandLine.characterId === 'sandrone',
      ordered: !!colLine && !!sandLine && sandLine.at - colLine.at >= 1500,
      cooldownEnforced: await p.webContents.executeJavaScript(`window.companion.duoScene('encounter').then(()=>false,()=>true)`)
    };
    const panelResult = await p.webContents.executeJavaScript(`(async()=>{ const a=await window.companion.getState(); const b=await window.companion.care('share'); const c=await window.companion.chat('你好'); const d=await window.companion.timer({action:'start',kind:'focus',minutes:1}); const e=await window.companion.timer({action:'pause'}); const f=await window.companion.timer({action:'resume'}); const g=await window.companion.timer({action:'cancel'}); const bad=await window.companion.saveApi({enabled:true,endpoint:'http://example.com',model:'bad'}).then(()=>false,()=>true); return {ready:!!a.manifest,share:!!b.text,chat:c.mode,timerStarted:d.timer.status,timerPaused:e.timer.status,timerResumed:f.timer.status,timerCanceled:g.timer===null,insecureApiRejected:bad,rendererNodeUnavailable:typeof require==='undefined',mainVisible:!!document.querySelector('.panel-shell')};})()`);
    const petResult = await pet.webContents.executeJavaScript(`({petPresent:!!document.querySelector('.pet-sprite'),imageLoaded:document.querySelector('#sprite-loader')?.naturalWidth||0,imageHeight:document.querySelector('#sprite-loader')?.naturalHeight||0,bridge:typeof window.companion.getState})`);
    const sandroneResult = await pets.get('sandrone').webContents.executeJavaScript(`(async()=>{const s=await window.companion.getState();return {character:s.characterId,name:s.characterName,frames:s.manifest.animations.idle.frames,imageLoaded:document.querySelector('#sprite-loader')?.naturalWidth||0,imageHeight:document.querySelector('#sprite-loader')?.naturalHeight||0};})()`);
    let requestContract = false;
    fixture = require('node:http').createServer((request, response) => {
      let body = ''; request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        const parsed = JSON.parse(body);
        requestContract = request.url === '/v1/chat/completions' && request.headers.authorization === 'Bearer fixture-test-key' && parsed.model === 'fixture-model' && parsed.messages[0].role === 'system' && parsed.messages.at(-1).content === '接口测试';
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: '这是本地兼容接口测试响应。' } }] }));
      });
    });
    await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
    const port = fixture.address().port;
    const apiResult = await p.webContents.executeJavaScript(`(async()=>{await window.companion.saveApi({enabled:true,endpoint:'http://127.0.0.1:${port}/v1',model:'fixture-model',key:'fixture-test-key'});const s=await window.companion.getState();const r=await window.companion.chat('接口测试');const forbidden=await window.companion.drag({phase:'start'}).then(()=>false,()=>true);return {reply:r.text,mode:r.mode,keyPresent:s.api.keyPresent,keyHidden:!('keyCipher' in s.api),panelDragRejected:forbidden};})()`);
    apiResult.requestContract = requestContract;
    apiResult.encryptedAtRest = !!state.api.keyCipher && !fs.readFileSync(file, 'utf8').includes('fixture-test-key');
    await p.webContents.executeJavaScript(`window.companion.saveApi({enabled:false,endpoint:'https://api.openai.com/v1',model:'',clearKey:true})`);
    await new Promise(resolve => fixture.close(resolve)); fixture = null;
    await p.webContents.executeJavaScript(`(async()=>{await window.companion.clearChat();await window.companion.chat('你好');document.querySelector('[data-tab="home"]').click();return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const panelImage = await p.webContents.capturePage();
    fs.writeFileSync(path.join(path.dirname(output), 'panel.png'), panelImage.toPNG());
    const petImage = await pet.webContents.capturePage();
    fs.writeFileSync(path.join(path.dirname(output), 'pet.png'), petImage.toPNG());
    const sandroneImage = await pets.get('sandrone').webContents.capturePage();
    fs.writeFileSync(path.join(path.dirname(output), 'sandrone.png'), sandroneImage.toPNG());
    for (const tab of ['chat', 'focus', 'settings']) {
      await p.webContents.executeJavaScript(`document.querySelector('[data-tab="${tab}"]').click();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      await new Promise(r => setTimeout(r, 200));
      fs.writeFileSync(path.join(path.dirname(output), tab + '.png'), (await p.webContents.capturePage()).toPNG());
    }
    const codeChecksPassed = Object.values(panelResult).every(Boolean) && Object.values(duoResult).every(Boolean) && requestContract && apiResult.encryptedAtRest && apiResult.keyHidden && apiResult.panelDragRejected;
    const assetsPassed = petResult.imageLoaded === 1536 && petResult.imageHeight === 2288 && sandroneResult.imageLoaded === 1536 && sandroneResult.imageHeight === 1040;
    fs.writeFileSync(output, JSON.stringify({ ok: codeChecksPassed && assetsPassed, codeChecksPassed, assetsPassed, panel: panelResult, duo: duoResult, pet: petResult, sandrone: sandroneResult, apiFixture: apiResult, electron: process.versions.electron }, null, 2));
    app.exit(0);
  } catch (error) {
    fixture?.close();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ ok: false, error: error.message }, null, 2));
    app.exit(1);
  }
}

if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (pet) pet.showInactive(); openPanel(); });
  app.whenReady().then(() => {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const loaded = core.loadState(file);
    state = loaded.state;
    if (loaded.warning && fs.existsSync(file)) {
      // Keep the unreadable user file for recovery before the next normal save.
      fs.copyFileSync(file, file + '.unreadable-' + Date.now());
    }
    persona = readJSON(path.join(root, 'persona.json'));
    manifest = readJSON(path.join(root, 'assets', 'sprites.json'));
    characters.set('columbina', { persona, manifest, spritePath });
    characters.set('sandrone', { persona: readJSON(path.join(root, 'persona-sandrone.json')), manifest: readJSON(path.join(root, 'assets', 'sprites-sandrone.json')), spritePath: path.join(root, 'assets', 'sprite-sheet-sandrone.png') });
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    createPet(); createPet('sandrone'); installIPC();
    if (!smoke) {
      const icon = nativeImage.createFromPath(path.join(root, 'assets', 'moon-icon.png'));
      tray = new Tray(icon);
      tray.setToolTip('哥伦比娅 · 月下同伴');
      tray.on('double-click', () => openPanel());
      tray.on('click', () => { pet.showInactive(); updateTray(); });
      updateTray();
      if (state.firstRun) openPanel();
    }
    if (loaded.warning) pet.webContents.once('did-finish-load', () => broadcast('companion:notice', { text: loaded.warning, error: true }));
    setInterval(() => { settle(); if (state.timer) publish(); }, 1000);
    watchColumbina();
    setInterval(followColumbina, 2000);
    setInterval(() => { core.updateWellbeing(state); persist(); publish(); }, 60000);
    setInterval(() => {
      if (dragging) return;
      for (const [characterId, target] of pets) {
      if (target.isDestroyed() || !target.isVisible()) continue;
      const pointerPosition = screen.getCursorScreenPoint(), windowBounds = target.getBounds();
      const localX = (pointerPosition.x - windowBounds.x) / state.settings.scale;
      const localY = (pointerPosition.y - windowBounds.y) / state.settings.scale;
      // Let empty window margins pass clicks to the desktop; retain the character and toolbar hit areas.
      const hitArea = localX >= 35 && localX <= 235 && localY >= 110 && localY <= 355;
      target.setIgnoreMouseEvents(!hitArea, { forward: true });
      if (state.settings.followGaze && !state.settings.reduceMotion) {
        const cursor = pointerPosition, bounds = windowBounds;
        const angle = Math.atan2(cursor.y - bounds.y - bounds.height * .62, cursor.x - bounds.x - bounds.width / 2);
        target.webContents.send('companion:gaze', { angle });
      }
      if (state.settings.roam && !state.settings.reduceMotion && !state.wellbeing.resting && !state.timer && workMode === 'idle') {
        const bounds = target.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
        const roamDirection = roamDirections[characterId];
        const nextX = bounds.x + roamDirection * 4 * state.settings.animationSpeed;
        const pos = core.constrainPosition({ x: nextX, y: bounds.y }, bounds, area);
        if (pos.x === bounds.x) roamDirections[characterId] *= -1;
        target.setPosition(pos.x, pos.y);
        state.companions.positions[characterId] = pos;
        if (characterId === 'columbina') state.position = pos;
        target.webContents.send('companion:roam', { direction: roamDirections[characterId] });
      }
      }
    }, 120);
    setInterval(() => {
      const a = pets.get('columbina'), b = pets.get('sandrone');
      if (smoke || dragging || !a?.isVisible() || !b?.isVisible() || state.timer || state.wellbeing.resting) return;
      const p = a.getBounds(), q = b.getBounds();
      if (Math.hypot(p.x - q.x, p.y - q.y) < 290 * state.settings.scale && Date.now() - (sceneCooldowns.get('encounter') || 0) >= 90000) {
        linkedScene('encounter');
      }
    }, 10000);
    powerMonitor.on('resume', () => { settle(); publish(); });
    screen.on('display-metrics-changed', () => { applyPetSettings(); persist(); });
    screen.on('display-removed', () => { applyPetSettings(); persist(); });
    if (smoke) runSmokeTest();
  }).catch(error => { fs.writeFileSync(path.join(app.getPath('userData'), 'startup-error.log'), error.stack || error.message); app.exit(1); });
  app.on('before-quit', () => { quitting = true; if (state) persist(true); });
  app.on('window-all-closed', () => { if (quitting || smoke) app.quit(); });
}
