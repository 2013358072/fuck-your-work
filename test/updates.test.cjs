const {test}=require('node:test');const assert=require('node:assert/strict');const {resolveRelease,fetchUpdate}=require('../src/updates.cjs');
const base='https://github.com/2013358072/fuck-your-work/releases/download/v1.1.0/';
const release=()=>({tag_name:'v1.1.0',body:'发薪周期与悬浮窗',published_at:'2026-11-05T00:00:00Z',assets:['mac-arm64.dmg','mac-x64.dmg','windows-x64-setup.exe','windows-x64-portable.exe'].map(s=>({name:'WorkEncourager-1.1.0-'+s,state:'uploaded',size:100,browser_download_url:base+'WorkEncourager-1.1.0-'+s}))});
test('语义版本比较及正式版本过滤',()=>{
 assert.equal(resolveRelease(release(),'1.0.4','darwin','arm64').status,'available');
 for(const current of ['1.1.0','1.2.0','1.10.0','2.0.0'])assert.equal(resolveRelease(release(),current,'darwin','arm64').status,'current');
 for(const extra of [{draft:true},{prerelease:true}])assert.equal(resolveRelease({...release(),...extra},'1.0.4','win32','x64').status,'current');
 assert.throws(()=>resolveRelease({...release(),tag_name:'not-a-version'},'1.0.4','win32','x64'));
});
test('按系统架构选择安装包，并保留发布说明',()=>{
 for(const [platform,arch,suffix]of [['darwin','arm64','mac-arm64.dmg'],['darwin','x64','mac-x64.dmg'],['win32','x64','windows-x64-setup.exe']]){
  const result=resolveRelease(release(),'1.0.4',platform,arch);assert.ok(result.url.endsWith(suffix));assert.equal(result.directDownload,true);assert.equal(result.notes,'发薪周期与悬浮窗');
 }
 assert.equal(resolveRelease(release(),'1.0.4','win32','arm64').directDownload,false);
});
test('拒绝下载到其他仓库、外部站点、非 HTTPS 和未完成资源',()=>{
 for(const url of ['https://evil.example/a.exe','javascript:alert(1)','file:///tmp/a.exe','https://github.com/else/repo/releases/download/a.exe','https://github.com\\@evil.example/a.exe']){
  const r=release();r.assets[0].browser_download_url=url;assert.equal(resolveRelease(r,'1.0.4','darwin','arm64').directDownload,false);
 }
 const r=release();r.assets[0].state='starter';assert.equal(resolveRelease(r,'1.0.4','darwin','arm64').directDownload,false);
});
test('远程查询覆盖成功、无发布、限流、离线与损坏响应',async()=>{
 const run=fetcher=>fetchUpdate(fetcher,'1.0.4','darwin','arm64');
 const found=await run(async(url,options)=>{assert.ok(url.endsWith('/releases/latest'));assert.ok(options.signal);return {ok:true,json:async()=>release()};});assert.equal(found.status,'available');
 assert.equal((await run(async()=>({status:404}))).status,'current');
 await assert.rejects(run(async()=>({status:403,ok:false})),/403/);
 await assert.rejects(run(async()=>{throw Error('offline');}),/offline/);
 await assert.rejects(run(async()=>({ok:true,json:async()=>{throw Error('bad JSON');}})),/bad JSON/);
});
