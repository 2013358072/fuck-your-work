const {test}=require('node:test');const assert=require('node:assert/strict');const {defaults,validate,dayType,snapshot,overtime,workdays,dailyHours}=require('../src/core.cjs');const {fresh,Store,parse}=require('../src/store.cjs');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const s=()=>({...defaults,overrides:{}});const dt=s=>new Date(s);const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('2026 官方节假日、连休休息日、调休上班日区分',()=>{assert.equal(dayType(dt('2026-10-01T12:00:00'),s()),'holiday');assert.equal(dayType(dt('2026-10-05T12:00:00'),s()),'rest');assert.equal(dayType(dt('2026-10-10T12:00:00'),s()),'work');assert.equal(dayType(dt('2026-11-07T12:00:00'),s()),'rest');assert.equal(dayType(dt('2026-02-16T12:00:00'),s()),'holiday');});
test('未到上班、午休、下班边界与周末不产生正常计时',()=>{for(const [date,h]of [['2026-11-04T08:59:59',0],['2026-11-04T09:00:00',0],['2026-11-04T12:00:00',3],['2026-11-04T12:59:59',3],['2026-11-04T18:00:00',8],['2026-11-04T23:00:00',8],['2026-11-07T12:00:00',0]])near(snapshot(dt(date),s(),fresh()).today,15000/workdays(dt(date),s())*h/8);});
test('当月出勤日包含调休；月末累计恰好一个月薪',()=>{assert.equal(workdays(dt('2026-11-01T12:00:00'),s()),21);assert.equal(workdays(dt('2026-10-01T12:00:00'),s()),18);for(let m=1;m<=12;m++){const now=new Date(2026,m,0,23,59);near(snapshot(now,s(),fresh()).month,15000);}});
test('周中、周末、法定节日分别按 1.5/2/3 倍计算',()=>{for(const [date,mult]of [['2026-11-04',1.5],['2026-11-07',2],['2026-10-01',3],['2026-10-05',2],['2026-10-10',1.5]]){const r=overtime(+dt(date+'T19:00:00'),+dt(date+'T20:00:00'),s());near(r[0].pay,15000/21.75/8*mult);}});
test('加班扣除正常工作时间、保留午休及下班后明确登记部分',()=>{const r=overtime(+dt('2026-11-04T09:00:00'),+dt('2026-11-04T20:00:00'),s());near(r[0].hours,3);assert.deepEqual(overtime(+dt('2026-11-04T09:00:00'),+dt('2026-11-04T12:00:00'),s()),[]);});
test('跨午夜按各自日期倍率拆分；调休 1:1 不同时算加班工资',()=>{const r=overtime(+dt('2026-11-06T23:00:00'),+dt('2026-11-07T01:00:00'),s());assert.equal(r.length,2);near(r[0].hours,1);assert.equal(r[0].rate,1.5);assert.equal(r[1].rate,2);const comp=overtime(+dt('2026-10-01T09:00:00'),+dt('2026-10-01T12:00:00'),{...s(),strategy:'comp'});near(comp[0].hours,3);assert.equal(comp[0].pay,0);});
test('手动日历优先、未知年份默认周末休息并标识未知',()=>{assert.equal(dayType(dt('2026-11-07T12:00:00'),{...s(),overrides:{'2026-11-07':'work'}}),'work');assert.equal(snapshot(dt('2027-01-01T12:00:00'),s(),fresh()).calendarKnown,false);});
test('拒绝异常金额、跨天班次、无效午休、错误日期',()=>{for(const extra of [{salary:NaN},{salary:-1},{start:'18:00',end:'09:00'},{breakStart:'08:00'},{end:'25:00'},{overrides:{'2026-02-30':'holiday'}},{autoUpdate:'yes'}])assert.throws(()=>validate({...s(),...extra}));near(dailyHours(s()),8);assert.equal(dailyHours(validate({...s(),breakEnd:'12:00'})),9);});
test('设置与多年调休记录重启恢复；保存自动保留备份',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'encourager-test-'));try{let store=new Store(dir);store.data.balance=36.25;store.data.records.push({date:'2025-01-01',hours:36.25,pay:0,strategy:'comp',rate:1.5,session:1});store.save();store.data.balance=30.25;store.data.adjustments.push({at:'2026-11-04T00:00:00Z',hours:-6});store.save();store=new Store(dir);assert.equal(store.data.balance,30.25);assert.equal(store.data.records.length,1);assert.equal(store.data.adjustments.length,1);assert.equal(parse(fs.readFileSync(store.file+'.bak','utf8')).balance,36.25);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('损坏主文件从备份恢复；无有效备份时拒绝覆盖原数据',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'encourager-test-'));try{let store=new Store(dir);store.save();store.data.balance=2;store.save();fs.writeFileSync(store.file,'bad');store=new Store(dir);assert.ok(store.warning);assert.equal(store.data.balance,0);fs.writeFileSync(store.file+'.bak','bad');assert.throws(()=>new Store(dir),/数据损坏/);assert.equal(fs.readFileSync(store.file,'utf8'),'bad');}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('发薪日零点重置；周期结束累计恰好月薪，不清空加班与调休',()=>{
 const settings={...s(),payday:15},state=fresh();state.balance=42;state.records=[{date:'2026-11-14',hours:2,pay:100}];
 const before=snapshot(dt('2026-11-14T23:59:59'),settings,state),after=snapshot(dt('2026-11-15T00:00:00'),settings,state);
 assert.equal(before.period.start,'2026-10-15');assert.equal(before.period.end,'2026-11-14');near(before.month,15000);near(after.month,0);
 assert.equal(after.period.nextPayday,'2026-12-15');assert.equal(after.balance,42);assert.equal(state.records.length,1);
 near(snapshot(dt('2026-11-16T18:00:00'),settings,state).today,15000/after.workdays);
});
test('29/30/31 日发薪适配平闰年二月、短月份和跨年',()=>{
 for(const [now,day,start,end,next]of [
  ['2026-02-27T23:59:59',31,'2026-01-31','2026-02-27','2026-02-28'],
  ['2026-02-28T00:00:00',31,'2026-02-28','2026-03-30','2026-03-31'],
  ['2028-02-29T00:00:00',30,'2028-02-29','2028-03-29','2028-03-30'],
  ['2028-02-28T12:00:00',29,'2028-01-29','2028-02-28','2028-02-29'],
  ['2026-04-30T00:00:00',31,'2026-04-30','2026-05-30','2026-05-31'],
  ['2027-01-01T12:00:00',15,'2026-12-15','2027-01-14','2027-01-15']]){
  const t=snapshot(dt(now),{...s(),payday:day},fresh());assert.equal(t.period.start,start);assert.equal(t.period.end,end);assert.equal(t.period.nextPayday,next);
 }
 assert.equal(snapshot(dt('2026-12-31T12:00:00'),{...s(),payday:15},fresh()).calendarKnown,false);
});
test('跨月周期应出勤日正确扣除周末、假日并包含调休班；全休周期不除零',()=>{
 const settings={...s(),payday:15},t=snapshot(dt('2026-10-01T12:00:00'),settings,fresh());
 // Sep 15–30: 12 weekdays minus Sep 25 plus Sun 20; Oct 1–14: 10 weekdays minus 1/2/5/6/7 plus Sat 10.
 assert.equal(t.workdays,18);near(t.month,15000/18*12);near(t.today,0);
 const overrides={};for(let i=1;i<=30;i++)overrides[`2026-11-${String(i).padStart(2,'0')}`]='rest';
 const rest=snapshot(dt('2026-11-30T23:00:00'),{...s(),overrides},fresh());assert.equal(rest.workdays,0);near(rest.month,0);
});
test('旧版数据补齐发薪日及悬浮设置，新增设置保存后可恢复，拒绝非法发薪日',()=>{
 const data=fresh();delete data.settings.payday;delete data.settings.miniMode;assert.equal(parse(JSON.stringify(data)).settings.payday,1);assert.equal(parse(JSON.stringify(data)).settings.miniMode,false);
 data.settings={...s(),payday:31,miniMode:true,alwaysOnTop:true};assert.deepEqual(parse(JSON.stringify(data)).settings,data.settings);
 for(const payday of [0,32,1.5,'15',NaN])assert.throws(()=>validate({...s(),payday}),/发薪日/);
});
