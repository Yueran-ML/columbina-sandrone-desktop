'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = name => async value => {
  const result = await ipcRenderer.invoke('companion:' + name, value);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const subscribe = channel => callback => {
  if (typeof callback !== 'function') return () => {};
  const handler = (_event, value) => callback(value);
  ipcRenderer.on('companion:' + channel, handler);
  return () => ipcRenderer.removeListener('companion:' + channel, handler);
};
contextBridge.exposeInMainWorld('companion', Object.freeze({
  getState: invoke('getState'), care: invoke('care'), panel: invoke('panel'), settings: invoke('settings'), timer: invoke('timer'),
  chat: invoke('chat'), clearChat: invoke('clearChat'), saveApi: invoke('saveApi'), workMode: invoke('workMode'),
  companion: invoke('companion'),
  duoScene: invoke('duoScene'),
  contextMenu: invoke('contextMenu'), hide: invoke('hide'), drag: invoke('drag'), dismissWelcome: invoke('dismissWelcome'),
  onState: subscribe('state'), onInteraction: subscribe('interaction'), onGaze: subscribe('gaze'), onRoam: subscribe('roam'),
  onNotice: subscribe('notice'), onNavigate: subscribe('navigate'), onComplete: subscribe('complete')
}));
