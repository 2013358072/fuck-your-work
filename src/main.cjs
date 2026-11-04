const {app,BrowserWindow,ipcMain,dialog,shell,Notification,net,powerMonitor}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {Store}=require('./store.cjs');const {snapshot,overtime,validate}=require('./core.cjs');
const RELEASES='https://github.com/2013358072/fuck-your-work/releases';let win,store,timer,update={status:'idle'},notice='',checking=false,lastNotified='';
if(!app.requestSingleInstanceLock())app.quit();
else {
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
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
 catch{notice='安装目录不可写，设置已存入系统应用数据目录。';return fallback;}
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
function send(){if(win&&!win.isDestroyed())win.webContents.send('state',view());}
async function checkUpdate(){
 if(checking)return update;checking=true;update={status:'checking'};send();
 try{const r=await net.fetch('https://api.github.com/repos/2013358072/fuck-your-work/releases/latest',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});if(r.status===404){update={status:'current'};return update;}if(!r.ok)throw Error('HTTP '+r.status);const release=await r.json();const v=String(release.tag_name).replace(/^v/,'');const parts=v.split('.').map(Number),current=app.getVersion().split('.').map(Number);if(!/^\d+\.\d+\.\d+$/.test(v))throw Error('版本信息无效');let newer=false;for(let i=0;i<3;i++){if(parts[i]!==current[i]){newer=parts[i]>current[i];break;}}
 if(newer){const suffix=process.platform==='darwin'?`mac-${process.arch}.dmg`:`windows-${process.arch}-setup.exe`;const asset=release.assets.find(a=>a.name.endsWith(suffix));const url=asset?.browser_download_url||RELEASES+'/latest';update={status:'available',version:v,url};if(lastNotified!==v&&store.data.settings.autoUpdate&&Notification.isSupported()){const n=new Notification({icon:path.join(__dirname,'icon.png'),title:'上班鼓励器有新版本',body:`v${v} 已发布，点击查看并下载安装。`});n.on('click',()=>{win?.show();shell.openExternal(url);});n.show();lastNotified=v;}}
 else update={status:'current'};
 }catch{update={status:'error',message:'无法连接 GitHub，请稍后重试'};}finally{checking=false;send();}return update;
}
async function start(){
 store=new Store(chooseDir());if(store.data.active){transact(()=>{store.data.active=null;});notice='检测到上次计时中断，已保留已记录时长。中断期间可手动补录。';}
 win=new BrowserWindow({icon:path.join(__dirname,'icon.png'),useContentSize:true,width:420,height:620,minWidth:390,minHeight:560,resizable:true,title:'上班鼓励器',backgroundColor:'#fafafa',autoHideMenuBar:true,titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.setAlwaysOnTop(store.data.settings.alwaysOnTop);win.once('ready-to-show',()=>win.show());win.loadFile(path.join(__dirname,'index.html'));
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 ipcMain.handle('invoke',async(event,action,payload)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('来源无效');try{
 switch(action){
 case 'state':return {ok:true,state:view()};
 case 'settings': {if(store.data.active)throw Error('请先结束加班，再修改设置');const next=validate(payload);transact(()=>{store.data.settings=next;});win.setAlwaysOnTop(next.alwaysOnTop);break;}
 case 'toggle':{const wasActive=!!store.data.active;checkpoint();transact(()=>{store.data.active=wasActive?null:{since:Date.now(),started:Date.now()};});break;}
 case 'manual':{if(store.data.active)throw Error('请先结束当前加班');const from=new Date(payload.from).getTime(),to=new Date(payload.to).getTime();if(to>Date.now()||from>=to||to-from>48*3600000)throw Error('请选择已发生的加班时间（单次最长 48 小时）');if(store.data.records.some(r=>r.session<to&&(r.end||r.session+r.hours*3600000)>from))throw Error('该时段与已记录加班重叠');const rows=overtime(from,to,store.data.settings);if(!rows.length)throw Error('该时间段全部属于正常工作时间，无需登记加班');transact(()=>{for(const r of rows){store.data.records.push({...r,session:from,end:to});if(r.strategy==='comp')store.data.balance+=r.hours;}});break;}
 case 'redeem':{const h=Number(payload);if(!Number.isFinite(h)||h<=0||h>store.data.balance)throw Error('使用时数须大于 0，且不超过调休余额');transact(()=>{store.data.balance=Math.max(0,store.data.balance-h);store.data.adjustments.push({at:new Date().toISOString(),hours:-h});});break;}
 case 'check-update':await checkUpdate();break;
 case 'download-update':if(update.status==='available')await shell.openExternal(update.url);break;
 case 'open-data':await shell.openPath(store.dir);break;
 case 'export':{checkpoint();const r=await dialog.showSaveDialog(win,{title:'备份设置与全部加班记录',defaultPath:'上班鼓励器备份.json',filters:[{name:'JSON',extensions:['json']}]});if(!r.canceled)fs.writeFileSync(r.filePath,JSON.stringify(store.data,null,2));break;}
 case 'import':{if(store.data.active)throw Error('请先结束加班');const r=await dialog.showOpenDialog(win,{title:'恢复备份',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)break;const {parse}=require('./store.cjs');const data=parse(fs.readFileSync(r.filePaths[0],'utf8'));const confirm=await dialog.showMessageBox(win,{type:'question',message:'用备份替换当前设置和记录？',detail:'当前数据会自动保留为 settings.json.bak。',buttons:['取消','恢复'],defaultId:0,cancelId:0});if(confirm.response===1){transact(()=>{data.active=null;store.data=data;});win.setAlwaysOnTop(data.settings.alwaysOnTop);}break;}
 default:throw Error('未知操作');
 }send();return {ok:true,state:view()};
 }catch(e){return {ok:false,error:e.message};}});
 timer=setInterval(()=>{try{checkpoint();send();}catch(e){notice='数据保存失败：'+e.message;send();}},15000);
 powerMonitor.on('suspend',()=>{try{checkpoint();if(store.data.active)transact(()=>{store.data.active=null;});notice='电脑已休眠，加班计时已结束。';send();}catch(e){notice=e.message;}});
 if(store.data.settings.autoUpdate)setTimeout(checkUpdate,4000);
 setInterval(()=>{if(store.data.settings.autoUpdate)checkUpdate();},6*3600000).unref();
}
app.on('before-quit',()=>{clearInterval(timer);try{checkpoint();if(store?.data.active)transact(()=>{store.data.active=null;});}catch(e){dialog.showErrorBox('数据保存失败',e.message);}});
app.on('window-all-closed',()=>app.quit());
