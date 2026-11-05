const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('encourager',{invoke:(action,payload)=>ipcRenderer.invoke('invoke',action,payload),onState:fn=>ipcRenderer.on('state',(_event,state)=>fn(state)),onShowUpdate:fn=>ipcRenderer.on('show-update',()=>fn())});
