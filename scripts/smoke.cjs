const {_electron}=require('playwright-core');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'encourager-ui-'));let app;try{
 const launch=()=>_electron.launch({args:[path.join(__dirname,'..')],env:{...process.env,WORK_ENCOURAGER_TEST_DATA:dir},timeout:60000});
 app=await launch();let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#earned').waitFor();await page.waitForFunction(()=>document.querySelector('#clock').textContent.length>0);
 assert.equal(await page.title(),'上班鼓励器');
 await page.locator('#settingsOpen').click();await page.locator('[name=salary]').fill('8700');await page.locator('[name=payday]').fill('15');await page.locator('[name=strategy]').selectOption('comp');await page.locator('[name=autoUpdate]').uncheck();
 const d=new Date();d.setDate(d.getDate()-7);d.setHours(10,0,0,0);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 await page.locator('summary').click();await page.locator('#overrides').fill(`${key} rest`);await page.locator('#settingsForm button[type=submit]').click();try{await page.waitForFunction(()=>!document.querySelector('#settingsDialog').open||!document.querySelector('#toast').hidden);}catch(e){console.error(await page.evaluate(()=>({toast:document.querySelector('#toast').textContent,invalid:[...document.querySelectorAll('#settingsForm input')].filter(x=>!x.validity.valid).map(x=>({name:x.name,value:x.value,message:x.validationMessage}))})));throw e;}assert.equal(await page.locator('#settingsDialog').evaluate(d=>d.open),false,await page.locator('#toast').textContent());
 await page.locator('#manualOpen').click();await page.locator('#manualForm [name=from]').fill(key+'T10:00');await page.locator('#manualForm [name=to]').fill(key+'T12:00');await page.locator('#manualForm button.primary').click();await page.waitForFunction(()=>!document.querySelector('#manualDialog').open);assert.match(await page.locator('#otValue').textContent(),/2 小时/);
 await page.locator('#redeemOpen').click();await page.locator('#redeemForm [name=hours]').fill('1.25');await page.locator('#redeemForm button.primary').click();await page.waitForFunction(()=>!document.querySelector('#redeemDialog').open);assert.match(await page.locator('#otValue').textContent(),/0.75 小时/);
 await page.locator('#historyOpen').click();assert.match(await page.locator('#history').textContent(),/使用调休/);await page.locator('[data-close=historyDialog]').click();
 await page.locator('#toggleOT').click();await page.waitForFunction(()=>document.querySelector('#toggleOT').classList.contains('active'));await page.locator('#toggleOT').click();await page.waitForFunction(()=>!document.querySelector('#toggleOT').classList.contains('active'));
 // A narrow window must stay usable with no horizontal page overflow.
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false);
 await page.evaluate(()=>{document.querySelector('#toast').hidden=true;window.scrollTo(0,0);});
 const height=await page.evaluate(()=>({footer:document.querySelector('footer').getBoundingClientRect().bottom,viewport:window.innerHeight}));assert.ok(height.footer<=height.viewport,JSON.stringify(height));
 if(process.env.WORK_ENCOURAGER_SCREENSHOT)await page.screenshot({path:process.env.WORK_ENCOURAGER_SCREENSHOT});
 // Exercise native floating mode, pin state, both windows' income and restoring.
 const created=app.waitForEvent('window');await page.locator('#miniOpen').click();let mini=await created;
 await mini.locator('#miniEarned').waitFor();mini.on('pageerror',e=>errors.push(e.message));
 await mini.locator('#miniPin').focus();await mini.locator('#miniPin').click();await mini.waitForFunction(()=>document.querySelector('#miniPin').getAttribute('aria-pressed')==='true');
 let native=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({mini:w.webContents.getURL().endsWith('mini.html'),visible:w.isVisible(),pinned:w.isAlwaysOnTop(),bounds:w.getBounds()})));
 assert.equal(native.find(w=>w.mini).pinned,true);assert.equal(native.find(w=>!w.mini).visible,false);assert.equal(native.find(w=>w.mini).bounds.width,320);
 const miniState=await mini.evaluate(()=>window.encourager.invoke('state'));assert.ok(Math.abs(Number((await mini.locator('#miniEarned').textContent()).replace(/[¥,]/g,''))-miniState.state.stats.today)<.1);
 if(process.env.WORK_ENCOURAGER_SCREENSHOT)await mini.screenshot({path:process.env.WORK_ENCOURAGER_SCREENSHOT.replace('.png','-mini.png')});
 await mini.locator('#miniRestore').click();await page.waitForFunction(()=>document.querySelector('#pinWindow').getAttribute('aria-pressed')==='true');
 // Replace the network transport in this isolated test process only.
 await app.evaluate(({net})=>{net.fetch=async()=>({ok:true,json:async()=>({tag_name:'v99.0.0',body:'测试更新说明：发薪周期与悬浮窗',published_at:'2026-11-05T00:00:00Z',assets:[]})});});
 await page.locator('#settingsOpen').click();await page.locator('#checkUpdate').click();await page.waitForFunction(()=>document.querySelector('#updateStatus').textContent.includes('99.0.0'));await page.locator('[data-close=settingsDialog]').click();await page.locator('#updateBanner').click();assert.match(await page.locator('#updateDetails').textContent(),/测试更新说明/);assert.equal(await page.locator('#downloadUpdate').textContent(),'前往发布页 ↗');await page.locator('[data-close=updateDialog]').click();
 await app.evaluate(({net})=>{net.fetch=async()=>{throw Error('offline');};});await page.locator('#settingsOpen').click();await page.locator('#checkUpdate').click();await page.waitForFunction(()=>document.querySelector('#updateStatus').textContent.includes('无法连接'));await page.locator('[data-close=settingsDialog]').click();assert.equal(await page.locator('#updateBanner').isVisible(),true);
 await page.locator('#miniOpen').click();
 await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#clock').textContent.length>0);
 await app.waitForEvent('window',{predicate:p=>p.url().endsWith('mini.html'),timeout:3000}).catch(()=>{});mini=app.windows().find(p=>p.url().endsWith('mini.html'));assert.ok(mini);await mini.locator('#miniEarned').waitFor();
 const r=await page.evaluate(()=>window.encourager.invoke('state'));assert.equal(r.state.settings.salary,8700);assert.equal(r.state.settings.payday,15);assert.equal(r.state.settings.miniMode,true);assert.equal(r.state.settings.alwaysOnTop,true);assert.ok(r.state.stats.balance>=.75&&r.state.stats.balance<.751);assert.equal(r.state.active,null);assert.equal(r.state.adjustments.length,1);
 await mini.locator('#miniRestore').focus();await mini.locator('#miniRestore').click();assert.deepEqual(errors,[]);console.log('PASS: 桌面设置、发薪日、加班调休、悬浮窗、原生置顶、更新详情及离线处理、重启恢复');
 }finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
