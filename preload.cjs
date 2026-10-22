/* Preload — جسر آمن بين الواجهة (renderer) وملفات الجهاز (ديسكتوب فقط).
   يُحقن window.nativeLocalFiles في الصفحة عبر contextBridge.
   كل عملية ملفات تتم في main عبر IPC؛ لا يوجد وصول مباشر للـ fs هنا. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nativeLocalFiles", {
  save: (payload) => ipcRenderer.invoke("local-files:save", payload),
  read: (payload) => ipcRenderer.invoke("local-files:read", payload),
  remove: (payload) => ipcRenderer.invoke("local-files:remove", payload),
  exists: (payload) => ipcRenderer.invoke("local-files:exists", payload),
  open: (payload) => ipcRenderer.invoke("local-files:open", payload),
  dir: () => ipcRenderer.invoke("local-files:dir"),
});