const {_electron}=require('playwright-core');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'encourager-ui-'));let app;try{
 const launch=()=>_electron.launch({args:[path.join(__dirname,'..')],env:{...process.env,WORK_ENCOURAGER_TEST_DATA:dir},timeout:60000});
 app=await launch();let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('#earned').waitFor();await page.waitForFunction(()=>document.querySelector('#clock').textContent.length>0);
 assert.equal(await page.title(),'上班鼓励器');
 await page.locator('#settingsOpen').click();await page.locator('[name=salary]').fill('8700');await page.locator('[name=strategy]').selectOption('comp');await page.locator('[name=autoUpdate]').uncheck();
 const d=new Date();d.setDate(d.getDate()-7);d.setHours(10,0,0,0);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 await page.locator('summary').click();await page.locator('#overrides').fill(`${key} rest`);await page.locator('#settingsForm button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#settingsDialog').open);
 await page.locator('#manualOpen').click();await page.locator('#manualForm [name=from]').fill(key+'T10:00');await page.locator('#manualForm [name=to]').fill(key+'T12:00');await page.locator('#manualForm button.primary').click();await page.waitForFunction(()=>!document.querySelector('#manualDialog').open);assert.match(await page.locator('#otValue').textContent(),/2 小时/);
 await page.locator('#redeemOpen').click();await page.locator('#redeemForm [name=hours]').fill('1.25');await page.locator('#redeemForm button.primary').click();await page.waitForFunction(()=>!document.querySelector('#redeemDialog').open);assert.match(await page.locator('#otValue').textContent(),/0.75 小时/);
 await page.locator('#historyOpen').click();assert.match(await page.locator('#history').textContent(),/使用调休/);await page.locator('[data-close=historyDialog]').click();
 await page.locator('#toggleOT').click();await page.waitForFunction(()=>document.querySelector('#toggleOT').classList.contains('active'));await page.locator('#toggleOT').click();await page.waitForFunction(()=>!document.querySelector('#toggleOT').classList.contains('active'));
 // A narrow window must stay usable with no horizontal page overflow.
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);assert.equal(overflow,false);
 await page.evaluate(()=>{document.querySelector('#toast').hidden=true;window.scrollTo(0,0);});
 const height=await page.evaluate(()=>({footer:document.querySelector('footer').getBoundingClientRect().bottom,viewport:window.innerHeight}));assert.ok(height.footer<=height.viewport,JSON.stringify(height));
 if(process.env.WORK_ENCOURAGER_SCREENSHOT)await page.screenshot({path:process.env.WORK_ENCOURAGER_SCREENSHOT});
 await app.close();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>document.querySelector('#clock').textContent.length>0);const r=await page.evaluate(()=>window.encourager.invoke('state'));assert.equal(r.state.settings.salary,8700);assert.ok(r.state.stats.balance>=.75&&r.state.stats.balance<.751);assert.equal(r.state.active,null);assert.equal(r.state.adjustments.length,1);assert.deepEqual(errors,[]);console.log('PASS: 真实桌面窗口、设置保存、加班补录、调休使用、记录、计时切换、重启恢复、无渲染错误');
 }finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
