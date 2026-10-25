'use strict';
const api = window.companion;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const isPet = new URLSearchParams(location.search).get('view') === 'pet';
const characterId = new URLSearchParams(location.search).get('character') === 'sandrone' ? 'sandrone' : 'columbina';
const spriteSource = characterId === 'sandrone' ? 'assets/sprite-sheet-sandrone.png' : 'assets/sprite-sheet.png';
$('#sprite-loader').src = spriteSource;
if (characterId === 'sandrone') {
  $('#pet-bubble').textContent = '我在检查这里的结构。';
  $('#pet-character').setAttribute('aria-label', '桑多涅：单击互动，拖动移动，双击打开小屋');
}
let current, animation = { name: 'idle', until: 0, started: performance.now() }, gazeAngle = null, lastRoam = 0, roamName = 'runRight';
let toastTimer, bubbleTimer, chatSignature = '', settingsInitialized = false;
document.body.classList.toggle('pet-body', isPet);
$('#pet-view').hidden = !isPet;
$('#panel-view').hidden = isPet;

function toast(text, error = false) {
  const el = $('#toast'); el.textContent = text; el.hidden = false; el.classList.toggle('error', error);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 3500);
}
async function safely(fn) {
  try { return await fn(); } catch (error) { toast(error.message, true); return null; }
}
function navigate(tab) {
  if (!['home', 'chat', 'focus', 'settings'].includes(tab)) tab = 'home';
  $$('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + tab));
  $$('[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  $('#breadcrumb').textContent = { home: '月下小屋', chat: '和她说话', focus: '一起专注', settings: '偏好设置' }[tab];
  if (tab === 'chat') $('#messages').scrollTop = $('#messages').scrollHeight;
}
function interact(event) {
  $('#home-quote').textContent = event.text;
  $('#pet-bubble').textContent = event.text;
  $('#pet-bubble').classList.remove('quiet');
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => $('#pet-bubble').classList.add('quiet'), 7000);
  animation = { name: event.animation || 'idle', until: performance.now() + 2500, started: performance.now() };
}
function displayMessages() {
  const sig = current.conversation.length + ':' + current.conversation.at(-1)?.at + ':' + current.chatBusy;
  if (sig === chatSignature) return;
  chatSignature = sig;
  const container = $('#messages'); container.replaceChildren();
  if (!current.conversation.length && !current.chatBusy) {
    const empty = document.createElement('div'); empty.className = 'chat-empty';
    for (const [tag, text] of [['span', '☽'], ['strong', '从一句「你好」开始。'], ['p', '这里的对话记录保存在这台电脑。']]) {
      const el = document.createElement(tag); el.textContent = text; empty.append(el);
    }
    container.append(empty);
  }
  for (const message of current.conversation) {
    const row = document.createElement('div'); row.className = 'message ' + message.role;
    const meta = document.createElement('div'); meta.className = 'message-meta';
    meta.textContent = message.role === 'user' ? '你' : '哥伦比娅 · ' + (message.mode === 'api' ? 'API 对话' : '本地规则');
    const body = document.createElement('div'); body.className = 'message-text'; body.textContent = message.text;
    row.append(meta, body); container.append(row);
  }
  if (current.chatBusy) {
    const waiting = document.createElement('div'); waiting.className = 'message-meta'; waiting.textContent = current.api.enabled ? '正在等待接口回复……' : '正在回应……'; container.append(waiting);
  }
  container.scrollTop = container.scrollHeight;
}
function updateState(state) {
  current = state;
  $$('.sprite').forEach(el => el.style.backgroundSize = state.manifest.width + 'px ' + state.manifest.height + 'px');
  $('#sandrone-enabled').checked = state.companions.sandroneEnabled;
  document.body.classList.toggle('reduced-motion', state.settings.reduceMotion);
  if (isPet) $('.pet-shell').style.transform = 'scale(' + state.settings.scale + ')';
  const labels = { idle: '安静相伴', waiting: '安静等候', thinking: '想一想', review: '翻阅片刻', failed: '遇到一点难题' };
  $('#hero-status').textContent = state.wellbeing.resting ? '休息一会儿' : labels[state.workMode];
  $('#rest-label').textContent = state.wellbeing.resting ? '结束休息' : '一起休息';
  for (const key of ['energy', 'mood', 'familiarity']) {
    const value = Math.round(state.wellbeing[key]);
    $('#' + key + '-value').replaceChildren(document.createTextNode(value.toString()));
    const small = document.createElement('small'); small.textContent = '/ 100'; $('#' + key + '-value').append(small);
    $('#' + key + '-bar').style.width = value + '%';
  }
  $$('[data-mode]').forEach(el => el.classList.toggle('active', el.dataset.mode === state.workMode));
  $$('[data-setting]').forEach(el => {
    const value = state.settings[el.dataset.setting];
    if (el.type === 'checkbox') el.checked = value;
    else if (document.activeElement !== el) el.value = value;
  });
  $('#scale-output').textContent = Math.round(state.settings.scale * 100) + '%';
  $('#opacity-output').textContent = Math.round(state.settings.opacity * 100) + '%';
  $('#animationSpeed-output').textContent = state.settings.animationSpeed.toFixed(1) + '×';
  if (!settingsInitialized) {
    $('#api-enabled').checked = state.api.enabled; $('#api-endpoint').value = state.api.endpoint; $('#api-model').value = state.api.model;
    $('#focus-minutes').value = state.settings.focusMinutes; $('#break-minutes').value = state.settings.breakMinutes;
    settingsInitialized = true;
  }
  $('#key-status').textContent = state.api.keyPresent ? '密钥已由系统加密保存' : '尚未保存密钥';
  $('#chat-mode').textContent = state.api.enabled ? 'API 对话' : '本地规则';
  $('#home-mode').textContent = state.api.enabled ? 'API 已启用' : '本地陪伴';
  $('#chat-description').textContent = state.api.enabled ? '通过你配置的兼容接口对话，回复由该服务生成。' : '本地规则对话，依据关键词选择预写台词。';
  $('#compose-note').textContent = state.api.enabled ? '消息将发送到你设置的服务；本应用不会执行回复中的命令。' : '本地模式不调用大模型；可在偏好设置中启用自己的 API。';
  $('#send-chat').disabled = state.chatBusy; $('#clear-chat').disabled = state.chatBusy;
  $('#sessions-value').textContent = state.completedSessions; $('#minutes-value').textContent = state.completedMinutes;
  $('#version-label').textContent = 'v' + state.appVersion;
  $('#disclaimer').textContent = state.persona.disclaimer;
  $('#data-directory').textContent = state.dataDirectory;
  displayMessages(); renderTimer();
}
function renderTimer() {
  if (!current) return;
  const timer = current.timer;
  const diff = timer ? (timer.status === 'running' ? Math.max(0, timer.deadline - Date.now()) : timer.remainingMs) : Number($('#focus-minutes').value || current.settings.focusMinutes) * 60000;
  const seconds = Math.ceil(diff / 1000);
  const text = Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
  $('#timer-display').textContent = text; $('#pet-timer-text').textContent = text;
  $('#pet-timer').hidden = !timer;
  $('#timer-label').textContent = timer ? (timer.status === 'paused' ? '已暂停 · 随时继续' : timer.kind === 'focus' ? '把注意力留给眼前' : '松一口气，歇一会儿') : '准备好了，就开始吧';
  $('#focus-caption').textContent = timer?.kind === 'break' ? '休息片刻' : '一起专注';
  $('#timer-ring').style.setProperty('--progress', timer ? Math.min(100, (1 - diff / timer.totalMs) * 100) + '%' : '0%');
  $('#start-focus').hidden = !!timer; $('#start-break').hidden = !!timer; $('#timer-setup').hidden = !!timer;
  $('#pause-timer').hidden = !timer; $('#cancel-timer').hidden = !timer;
  $('#pause-timer').textContent = timer?.status === 'paused' ? '继续' : '暂停';
}
let lastFrame = '';
function animate(now) {
  if (current?.manifest) {
    let key = 'idle';
    if (animation.until > now) key = animation.name;
    else if (current.chatBusy) key = 'thinking';
    else if (current.wellbeing.resting) key = 'waiting';
    else if (current.workMode !== 'idle') key = current.workMode;
    else if (current.settings.roam && now - lastRoam < 500) key = roamName;
    else if (current.timer?.status === 'running') key = current.timer.kind === 'break' ? 'waiting' : 'thinking';
    const definition = current.manifest.animations[key] || current.manifest.animations.idle;
    let row = definition.row, col = current.settings.reduceMotion ? 0 : Math.floor((now - animation.started) / 1000 * definition.fps * current.settings.animationSpeed) % definition.frames;
    if (key === 'idle' && current.manifest.gaze && current.settings.followGaze && !current.settings.reduceMotion && gazeAngle !== null && isPet) {
      // Sprite gaze zero is up, then clockwise in 22.5-degree increments.
      const angle = (gazeAngle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      const frame = Math.round(angle / (Math.PI * 2) * 16) % 16;
      row = current.manifest.gaze.startRow + Math.floor(frame / 8); col = frame % 8;
    }
    const pos = `${-col * 192}px ${-row * 208}px`;
    if (pos !== lastFrame) { $$('.sprite').forEach(el => el.style.backgroundPosition = pos); lastFrame = pos; }
  }
  requestAnimationFrame(animate);
}
function imageReady() {
  if ($('#sprite-loader').naturalWidth > 0) $$('.sprite').forEach(el => { el.classList.add('ready'); el.style.backgroundImage = `url('${spriteSource}')`; });
}
$('#sprite-loader').addEventListener('load', imageReady); imageReady();
$$('[data-tab]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.tab)));
$$('[data-panel]').forEach(el => el.addEventListener('click', () => safely(() => api.panel(el.dataset.panel))));
$$('[data-care]').forEach(el => el.addEventListener('click', () => safely(() => api.care(el.dataset.care))));
$$('[data-mode]').forEach(el => el.addEventListener('click', () => safely(() => api.workMode(el.dataset.mode))));
$$('[data-setting]').forEach(el => el.addEventListener('input', () => safely(() => api.settings({ [el.dataset.setting]: el.type === 'checkbox' ? el.checked : Number(el.value) }))));
$('#pet-hide').addEventListener('click', () => safely(() => api.hide()));
$('#sandrone-enabled').addEventListener('change', () => safely(() => api.companion($('#sandrone-enabled').checked)));
$('#duo-greet').addEventListener('click', () => safely(() => api.duoScene('encounter')));
$('#focus-minutes').addEventListener('change', () => { renderTimer(); safely(() => api.settings({ focusMinutes: Number($('#focus-minutes').value) })); });
$('#break-minutes').addEventListener('change', () => safely(() => api.settings({ breakMinutes: Number($('#break-minutes').value) })));
$('#start-focus').addEventListener('click', () => safely(() => api.timer({ action: 'start', kind: 'focus', minutes: Number($('#focus-minutes').value) })));
$('#start-break').addEventListener('click', () => safely(() => api.timer({ action: 'start', kind: 'break', minutes: Number($('#break-minutes').value) })));
$('#pause-timer').addEventListener('click', () => safely(() => api.timer({ action: current.timer?.status === 'paused' ? 'resume' : 'pause' })));
$('#cancel-timer').addEventListener('click', () => safely(() => api.timer({ action: 'cancel' })));
$('#api-form').addEventListener('submit', event => {
  event.preventDefault();
  safely(async () => { await api.saveApi({ enabled: $('#api-enabled').checked, endpoint: $('#api-endpoint').value, model: $('#api-model').value, key: $('#api-key').value }); $('#api-key').value = ''; toast('连接设置已保存'); });
});
$('#clear-key').addEventListener('click', () => safely(async () => { await api.saveApi({ enabled: false, endpoint: $('#api-endpoint').value, model: $('#api-model').value, clearKey: true }); $('#api-key').value = ''; $('#api-enabled').checked = false; toast('已删除保存的密钥，切回本地对话'); }));
$('#chat-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#chat-input'), text = input.value.trim();
  if (!text || current?.chatBusy) return;
  safely(async () => { const reply = await api.chat(text); if (reply) input.value = ''; });
});
$('#chat-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#chat-form').requestSubmit(); } });
$$('[data-prompt]').forEach(el => el.addEventListener('click', () => { $('#chat-input').value = el.dataset.prompt; $('#chat-input').focus(); }));
$('#clear-chat').addEventListener('click', () => safely(() => api.clearChat()));
const character = $('#pet-character');
let pointer = null;
character.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  pointer = { x: event.clientX, y: event.clientY, moved: false };
  character.setPointerCapture(event.pointerId); character.classList.add('dragging');
  safely(() => api.drag({ phase: 'start' }));
});
character.addEventListener('pointermove', event => {
  if (!pointer) return;
  if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) pointer.moved = true;
  if (pointer.moved) api.drag({ phase: 'move' }).catch(() => {});
});
character.addEventListener('pointerup', event => {
  if (!pointer) return;
  const moved = pointer.moved; pointer = null; character.classList.remove('dragging');
  safely(() => api.drag({ phase: 'end' }));
  if (!moved) safely(() => api.care('pat'));
  character.releasePointerCapture(event.pointerId);
});
character.addEventListener('lostpointercapture', () => { if (pointer) { pointer = null; character.classList.remove('dragging'); safely(() => api.drag({ phase: 'end' })); } });
character.addEventListener('dblclick', () => safely(() => api.panel('home')));
character.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); safely(() => api.care('pat')); } });
document.addEventListener('contextmenu', event => { if (isPet) { event.preventDefault(); safely(() => api.contextMenu()); } });
api.onState(updateState); api.onInteraction(interact); api.onNotice(event => toast(event.text, event.error)); api.onNavigate(navigate);
api.onGaze(event => { gazeAngle = event.angle; }); api.onRoam(event => { lastRoam = performance.now(); roamName = event.direction > 0 ? 'runRight' : 'runLeft'; });
api.onComplete(event => toast(event.text));
api.getState().then(state => { updateState(state); navigate(new URLSearchParams(location.search).get('tab') || 'home'); if (!isPet && state.firstRun) api.dismissWelcome(); }).catch(error => toast(error.message, true));
setTimeout(() => $('#pet-bubble').classList.add('quiet'), 7000);
setInterval(renderTimer, 250); requestAnimationFrame(animate);
