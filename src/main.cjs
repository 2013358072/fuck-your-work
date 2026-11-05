const {app,BrowserWindow,ipcMain,dialog,shell,Notification,net,powerMonitor}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {Store}=require('./store.cjs');const {snapshot,overtime,validate}=require('./core.cjs');
const {fetchUpdate}=require('./updates.cjs');
let win,miniWin,store,timer,displayTimer,updateTimer,startupTimer,quitting=false,update={status:'idle'},notice='',checking=false,lastNotified='',lastAttempt=0;
// Keep desktop tests isolated from an installed copy, including Electron's instance lock.
if(!app.isPackaged&&process.env.WORK_ENCOURAGER_TEST_DATA)app.setPath('userData',process.env.WORK_ENCOURAGER_TEST_DATA);
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{if(win)restoreMain();});
 app.on('activate',()=>{if(win)restoreMain();});
 app.whenReady().then(start).catch(e=>{dialog.showErrorBox('启动失败',e.message);app.quit();});
}
function chooseDir(){
 if(!app.isPackaged&&process.env.WORK_ENCOURAGER_TEST_DATA)return process.env.WORK_ENCOURAGER_TEST_DATA;
 const base=app.isPackaged?(process.env.PORTABLE_EXECUTABLE_DIR||(process.platform==='darwin'?path.dirname(path.dirname(path.dirname(path.dirname(app.getPath('exe'))))):path.dirname(app.getPath('exe')))):app.getAppPath();
 const preferred=path.join(base,'.work-encourager-data');
 // Preserve an existing fallback store if the installation later becomes writable.
 const fallback=path.join(app.getPath('userData'),'data');
 if(fs.existsSync(path.join(fallback,'settings.json')))return fallback;
 try{fs.mkdirSync(preferred,{recursive:true});const probe=path.join(preferred,'.write-test');fs.writeFileSync(probe,'');fs.unlinkSync(probe);return preferred;}
 catch{return fallback;}
}
function transact(fn){const before=structuredClone(store.data);try{fn();store.save();}catch(e){store.data=before;throw e;}}
function checkpoint(){
 const active=store.data.active;if(!active)return;
 const now=Date.now(),gap=now-active.since;
 if(gap<0||gap>120000){transact(()=>{store.data.active=null;});notice='计时遇到休眠或时间跳变，已暂停；未确认的时间可手动补录。';return;}
 if(gap===0)return;
 transact(()=>{const rows=overtime(active.since,now,store.data.settings);for(const row of rows){const last=store.data.records.at(-1);if(last&&last.session===active.started&&last.date===row.date&&last.strategy===row.strategy&&last.rate===row.rate){last.hours+=row.hours;last.pay+=row.pay;last.end=now;}else store.data.records.push({...row,session:active.started,end:now});if(row.strategy==='comp')store.data.balance+=row.hours;}store.data.active.since=now;});
}
function view(){return {settings:store.data.settings,stats:snapshot(new Date(),store.data.settings,store.data),active:store.data.active,records:store.data.records.slice(-100).reverse(),adjustments:store.data.adjustments.slice(-100).reverse(),dataPath:store.file,notice:notice||store.warning,version:app.getVersion(),update};}
function send(){const state=view();for(const w of [win,miniWin])if(w&&!w.isDestroyed())w.webContents.send('state',state);}
function applyPin(){for(const w of [win,miniWin])if(w&&!w.isDestroyed())w.setAlwaysOnTop(store.data.settings.alwaysOnTop,'floating');}
function restoreMain(){
 if(!win||win.isDestroyed())return;
 if(store.data.settings.miniMode)transact(()=>{store.data.settings.miniMode=false;});
 miniWin?.hide();if(win.isMinimized())win.restore();win.show();win.focus();send();
}
function openMini(){
 if(!miniWin||miniWin.isDestroyed()){
  const {x,y}=win.getBounds();
  miniWin=new BrowserWindow({x,y,width:320,height:72,frame:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,show:false,title:'今日已赚 · 上班鼓励器',backgroundColor:'#fafafa',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  miniWin.webContents.setWindowOpenHandler(()=>({action:'deny'}));miniWin.webContents.on('will-navigate',e=>e.preventDefault());
  miniWin.on('close',e=>{if(!quitting){e.preventDefault();restoreMain();}});
  miniWin.once('ready-to-show',()=>{if(store.data.settings.miniMode){miniWin.show();win.hide();send();}});
  miniWin.loadFile(path.join(__dirname,'mini.html'));
 }
 transact(()=>{store.data.settings.miniMode=true;});applyPin();
 if(!miniWin.webContents.isLoading()){miniWin.show();win.hide();}send();
}
async function checkUpdate(){
 if(checking)return update;checking=true;lastAttempt=Date.now();const previous=update;update={...update,checking:true,message:''};send();
 try{
  update={...await fetchUpdate(net.fetch,app.getVersion(),process.platform,process.arch),checkedAt:new Date().toISOString()};
  if(update.status==='available'&&lastNotified!==update.version&&store.data.settings.autoUpdate&&Notification.isSupported()){
   const n=new Notification({icon:path.join(__dirname,'icon.png'),title:'上班鼓励器有新版本',body:`v${update.version} 已发布，点击查看更新内容。`});
   n.on('click',()=>{restoreMain();win.webContents.send('show-update');});n.show();lastNotified=update.version;
  }
 }catch{update={...previous,status:previous.status==='available'?'available':'error',message:'无法连接 GitHub，自动检查开启时将在 5 分钟后重试'};}
 finally{checking=false;update.checking=false;send();}return update;
}
function autoCheck(){if(store.data.settings.autoUpdate&&Date.now()-lastAttempt>=(update.message?5:30)*60000)checkUpdate();}
async function start(){
 if(process.platform==='win32')app.setAppUserModelId('com.encourager.work');
 store=new Store(chooseDir());if(store.data.active){transact(()=>{store.data.active=null;});notice='检测到上次计时中断，已保留已记录时长。中断期间可手动补录。';}
 win=new BrowserWindow({icon:path.join(__dirname,'icon.png'),useContentSize:true,width:420,height:420,minWidth:390,minHeight:400,resizable:true,title:'上班鼓励器',backgroundColor:'#fafafa',autoHideMenuBar:true,titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 applyPin();win.once('ready-to-show',()=>{if(store.data.settings.miniMode)openMini();else win.show();});win.loadFile(path.join(__dirname,'index.html'));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 ipcMain.handle('invoke',async(event,action,payload)=>{const sender=[win,miniWin].find(w=>w&&!w.isDestroyed()&&event.sender===w.webContents);if(!sender||event.senderFrame!==sender.webContents.mainFrame)throw Error('来源无效');if(sender===miniWin&&!['state','pin','restore'].includes(action))throw Error('悬浮窗操作无效');try{
 switch(action){
 case 'state':return {ok:true,state:view()};
 case 'settings': {if(store.data.active)throw Error('请先结束加班，再修改设置');const next=validate({...payload,miniMode:store.data.settings.miniMode});const newlyEnabled=!store.data.settings.autoUpdate&&next.autoUpdate;transact(()=>{store.data.settings=next;});applyPin();if(newlyEnabled)checkUpdate();break;}
 case 'mini':openMini();break;
 case 'restore':restoreMain();break;
 case 'pin':transact(()=>{store.data.settings.alwaysOnTop=!store.data.settings.alwaysOnTop;});applyPin();break;
 case 'toggle':{const wasActive=!!store.data.active;checkpoint();transact(()=>{store.data.active=wasActive?null:{since:Date.now(),started:Date.now()};});break;}
 case 'manual':{if(store.data.active)throw Error('请先结束当前加班');const from=new Date(payload.from).getTime(),to=new Date(payload.to).getTime();if(to>Date.now()||from>=to||to-from>48*3600000)throw Error('请选择已发生的加班时间（单次最长 48 小时）');if(store.data.records.some(r=>r.session<to&&(r.end||r.session+r.hours*3600000)>from))throw Error('该时段与已记录加班重叠');const rows=overtime(from,to,store.data.settings);if(!rows.length)throw Error('该时间段全部属于正常工作时间，无需登记加班');transact(()=>{for(const r of rows){store.data.records.push({...r,session:from,end:to});if(r.strategy==='comp')store.data.balance+=r.hours;}});break;}
 case 'redeem':{const h=Number(payload);if(!Number.isFinite(h)||h<=0||h>store.data.balance)throw Error('使用时数须大于 0，且不超过调休余额');transact(()=>{store.data.balance=Math.max(0,store.data.balance-h);store.data.adjustments.push({at:new Date().toISOString(),hours:-h});});break;}
 case 'check-update':await checkUpdate();break;
 case 'online':autoCheck();break;
 case 'download-update':if(update.status==='available')await shell.openExternal(update.url);break;
 case 'open-data':await shell.openPath(store.dir);break;
 case 'export':{checkpoint();const r=await dialog.showSaveDialog(win,{title:'备份设置与全部加班记录',defaultPath:'上班鼓励器备份.json',filters:[{name:'JSON',extensions:['json']}]});if(!r.canceled)fs.writeFileSync(r.filePath,JSON.stringify(store.data,null,2));break;}
 case 'import':{if(store.data.active)throw Error('请先结束加班');const r=await dialog.showOpenDialog(win,{title:'恢复备份',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)break;const {parse}=require('./store.cjs');const data=parse(fs.readFileSync(r.filePaths[0],'utf8'));const confirm=await dialog.showMessageBox(win,{type:'question',message:'用备份替换当前设置和记录？',detail:'当前数据会自动保留为 settings.json.bak。',buttons:['取消','恢复'],defaultId:0,cancelId:0});if(confirm.response===1){transact(()=>{data.active=null;data.settings.miniMode=false;store.data=data;});applyPin();autoCheck();}break;}
 default:throw Error('未知操作');
 }send();return {ok:true,state:view()};
 }catch(e){return {ok:false,error:e.message};}});
 timer=setInterval(()=>{try{checkpoint();send();}catch(e){notice='数据保存失败：'+e.message;send();}},15000);
 displayTimer=setInterval(send,1000);
 powerMonitor.on('suspend',()=>{try{checkpoint();if(store.data.active)transact(()=>{store.data.active=null;});notice='电脑已休眠，加班计时已结束。';send();}catch(e){notice=e.message;}});
 startupTimer=setTimeout(autoCheck,4000);
 powerMonitor.on('resume',()=>{send();autoCheck();});
 updateTimer=setInterval(autoCheck,60000);updateTimer.unref();
 win.on('closed',()=>app.quit());
}
app.on('before-quit',()=>{quitting=true;clearInterval(timer);clearInterval(displayTimer);clearInterval(updateTimer);clearTimeout(startupTimer);try{checkpoint();if(store?.data.active)transact(()=>{store.data.active=null;});}catch(e){dialog.showErrorBox('数据保存失败',e.message);}});
app.on('window-all-closed',()=>app.quit());
