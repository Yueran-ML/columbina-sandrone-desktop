'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { createRequire } = require('node:module');

// Run the real main process source with only Electron/clock/IO surfaces replaced.
// No copy of the roaming loop, timer handler or dialogue-selection implementation.
function desktopHarness() {
  const root = path.resolve(__dirname, '..'), requireApp = createRequire(path.join(root, 'main.cjs'));
  const instances = [], handlers = new Map(), intervals = [], timeouts = [];
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  let ready;
  const appPaths = { appData: path.join(root, 'test-output', 'unwritten-vm-' + process.pid), userData: path.join(root, 'test-output', 'unwritten-vm-' + process.pid) };
  class Window {
    constructor(options) {
      this.bounds = { x: options.x || 0, y: options.y || 0, width: options.width, height: options.height };
      this.visible = true; this.messages = []; this.events = new Map();
      this.webContents = {
        mainFrame: { url: '' },
        setWindowOpenHandler() {}, on() {},
        send: (channel, value) => this.messages.push({ channel, value })
      };
      instances.push(this);
    }
    loadFile(file, options) { this.webContents.mainFrame.url = pathToFileURL(file).toString() + '?' + new URLSearchParams(options.query).toString(); }
    on(event, fn) { this.events.set(event, fn); }
    isDestroyed() { return false; }
    isVisible() { return this.visible; }
    showInactive() { this.visible = true; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    setOpacity() {}
    setAlwaysOnTop() {}
    setIgnoreMouseEvents() {}
    getBounds() { return { ...this.bounds }; }
    setBounds(value) { this.bounds = { ...this.bounds, ...value }; }
    setPosition(x, y) { this.bounds.x = x; this.bounds.y = y; }
    static fromWebContents(contents) { return instances.find(w => w.webContents === contents); }
  }
  const noOp = () => {};
  const app = {
    setPath: (key, value) => { appPaths[key] = value; }, getPath: key => appPaths[key],
    setName: noOp, setAppUserModelId: noOp, requestSingleInstanceLock: () => true,
    on: noOp, getVersion: () => 'test', quit: noOp, exit: noOp,
    whenReady: () => ({ then: fn => { ready = fn; return { catch: noOp }; } })
  };
  const electron = {
    app, BrowserWindow: Window, ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
    Menu: { buildFromTemplate: () => ({ popup: noOp }) },
    Tray: class { setToolTip() {} on() {} setContextMenu() {} },
    nativeImage: { createFromPath: () => ({}) }, Notification: { isSupported: () => false },
    safeStorage: {}, session: { defaultSession: { setPermissionRequestHandler: noOp, setPermissionCheckHandler: noOp } },
    net: {}, powerMonitor: { on: noOp },
    screen: { getPrimaryDisplay: () => ({ workArea: area }), getDisplayNearestPoint: () => ({ workArea: area }), getDisplayMatching: () => ({ workArea: area }), getCursorScreenPoint: () => ({ x: 500, y: 400 }), on: noOp }
  };
  const context = vm.createContext({
    // fs.watch is replaced: a real watch would keep the test process open.
    require: name => name === 'electron' ? electron : name === 'node:fs' ? { ...fs, mkdirSync: noOp, watch: () => ({ close: noOp }) } : requireApp(name),
    __dirname: root, Buffer, URL, console,
    // Only the test process counts as a running Columbina.
    process: { argv: ['node', 'main.cjs'], pid: process.pid, kill: pid => { if (pid !== process.pid) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' }); } },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; }, clearTimeout: noOp
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'main.cjs'), 'utf8'), context, { filename: 'main.cjs' });
  ready();
  return {
    appData: appPaths.appData,
    windows: instances,
    tick: ms => intervals.filter(item => item.ms === ms).forEach(item => item.fn()),
    async call(name, value) {
      const panel = instances.find(w => !w.characterId);
      const result = await handlers.get('companion:' + name)({ sender: panel.webContents, senderFrame: panel.webContents.mainFrame }, value);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    }
  };
}

test('two companions at opposite outward edges both turn and resume walking', async () => {
  const h = desktopHarness();
  await h.call('settings', { roam: true });
  const columbina = h.windows.find(w => w.characterId === 'columbina');
  const sandrone = h.windows.find(w => w.characterId === 'sandrone');
  // Initial directions are right for Columbina, left for Sandrone.
  columbina.setPosition(730, 400); sandrone.setPosition(0, 400);
  for (let i = 0; i < 5; i++) h.tick(120);
  assert.ok(columbina.getBounds().x < 730, 'Columbina must leave the right edge');
  assert.ok(sandrone.getBounds().x > 0, 'Sandrone must leave the left edge');
  assert.equal(columbina.messages.filter(m => m.channel === 'companion:roam').at(-1).value.direction, -1);
  assert.equal(sandrone.messages.filter(m => m.channel === 'companion:roam').at(-1).value.direction, 1);
});

test('starting a break through real timer IPC plays rest dialogue and waiting animation', async () => {
  const h = desktopHarness();
  const result = await h.call('timer', { action: 'start', kind: 'break', minutes: 5 });
  assert.equal(result.timer.kind, 'break'); assert.equal(result.timer.status, 'running');
  const scenes = require('../duo-scenes.json');
  const interactions = h.windows.flatMap(w => w.messages.filter(m => m.channel === 'companion:interaction').map(m => m.value));
  assert.ok(interactions.some(m => m.text === scenes.rest[0].text && m.animation === 'waiting'));
  assert.ok(!interactions.some(m => scenes.focusStart.some(line => line.text === m.text)), 'a break must not announce the start of work');
});

test('following Columbina switches the work mode from its state file, speaks at a question, and stops on a manual choice', async () => {
  const h = desktopHarness();
  const folder = path.join(h.appData, 'Columbina');
  fs.mkdirSync(folder, { recursive: true });
  const write = value => fs.writeFileSync(path.join(folder, 'pet-state.json'), JSON.stringify({ version: 1, at: 1, pid: process.pid, label: '', ...value }));
  const columbina = h.windows.find(w => w.characterId === 'columbina');
  const lastState = () => columbina.messages.filter(m => m.channel === 'companion:state').at(-1).value;
  const said = () => columbina.messages.filter(m => m.channel === 'companion:interaction').map(m => m.value);
  try {
    write({ state: 'thinking' });
    // Off by default: nothing is read.
    h.tick(2000);
    assert.ok(!columbina.messages.some(m => m.channel === 'companion:state' && m.value.workMode !== 'idle'));
    await h.call('settings', { followColumbina: true });
    assert.equal(lastState().workMode, 'thinking');
    write({ state: 'waiting', label: 'shell' });
    h.tick(2000);
    assert.equal(lastState().workMode, 'waiting');
    const asked = said().at(-1);
    assert.deepEqual([asked.text, asked.animation, asked.characterId], ['要用 shell，等你点头。', 'waiting', 'columbina']);
    // The same state read again says nothing more.
    const count = said().length;
    h.tick(2000);
    assert.equal(said().length, count);
    write({ state: 'done' });
    h.tick(2000);
    assert.equal(lastState().workMode, 'idle');
    assert.equal(said().at(-1).animation, 'wave');
    write({ state: 'failed', label: 'AUTH' });
    h.tick(2000);
    assert.equal(lastState().workMode, 'failed');
    assert.equal(said().at(-1).animation, 'failed');
    // A Columbina that is gone rests.
    write({ state: 'thinking', pid: process.pid + 1 });
    h.tick(2000);
    assert.equal(lastState().workMode, 'idle');
    write({ state: 'review', label: 'read' });
    h.tick(2000);
    assert.equal(lastState().workMode, 'review');
    // A manual choice stops following.
    await h.call('workMode', 'thinking');
    assert.equal(lastState().settings.followColumbina, false);
    write({ state: 'waiting', label: 'shell' });
    h.tick(2000);
    assert.equal(lastState().workMode, 'thinking');
    // Turned on again it follows at once, and turned off it rests.
    await h.call('settings', { followColumbina: true });
    assert.equal(lastState().workMode, 'waiting');
    await h.call('settings', { followColumbina: false });
    assert.equal(lastState().workMode, 'idle');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
