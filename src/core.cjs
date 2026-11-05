const calendar = require('./calendar.json');
const DAY = 86400000;
const defaults = Object.freeze({salary: 15000, payday: 1, start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00', strategy: 'pay', weekdayRate: 1.5, weekendRate: 2, holidayRate: 3, divisor: 21.75, autoUpdate: true, alwaysOnTop: false, miniMode: false, overrides: {}, configured: false});
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const minutes = s => { if (!/^\d{2}:\d{2}$/.test(s)) throw Error('时间格式不正确'); const [h,m]=s.split(':').map(Number); if(h>23||m>59) throw Error('时间超出范围'); return h*60+m; };
function validate(input) {
 const s={...defaults,...input};
 if(!Number.isFinite(s.salary)||s.salary<=0||s.salary>1e9) throw Error('月薪请输入大于 0 的有效金额');
 if(!Number.isInteger(s.payday)||s.payday<1||s.payday>31) throw Error('发薪日请输入 1 至 31 的整数');
 const a=minutes(s.start),b=minutes(s.end),c=minutes(s.breakStart),d=minutes(s.breakEnd);
 if(b<=a) throw Error('下班时间须晚于上班时间（暂不支持跨午夜班次）');
 if(c<a||d<c||d>b||b-a-(d-c)<=0) throw Error('休息时间须在班次内，且保留有效工作时间');
 if(!['pay','comp'].includes(s.strategy)) throw Error('加班策略无效');
 for(const k of ['weekdayRate','weekendRate','holidayRate','divisor']) if(!Number.isFinite(s[k])||s[k]<=0||s[k]>100) throw Error('工资倍数或月计薪天数无效');
 for(const k of ['autoUpdate','alwaysOnTop','miniMode','configured']) if(typeof s[k] !== 'boolean') throw Error('设置格式不正确');
 if(!s.overrides||typeof s.overrides!=='object'||Array.isArray(s.overrides)) throw Error('日历格式不正确');
 for(const [k,v] of Object.entries(s.overrides)) if(!/^\d{4}-\d{2}-\d{2}$/.test(k)||!['work','rest','holiday'].includes(v)||dateKey(new Date(`${k}T12:00:00`))!==k) throw Error('请填写有效的日历日期和类型');
 return Object.fromEntries(Object.keys(defaults).map(k=>[k,s[k]]));
}
function dayType(d,s) {
 const key=dateKey(d); if(s.overrides[key]) return s.overrides[key];
 if(calendar.holidays.includes(key)) return 'holiday';
 if(calendar.workdays.includes(key)) return 'work';
 if(calendar.restDays.includes(key)) return 'rest';
 return [0,6].includes(d.getDay())?'rest':'work';
}
function bounds(d,s) {
 const at=t=>{const v=new Date(d);v.setHours(0,minutes(t),0,0);return v.getTime();};
 return [[at(s.start),at(s.breakStart)],[at(s.breakEnd),at(s.end)]].filter(([a,b])=>b>a);
}
function dailyHours(s) {return (minutes(s.end)-minutes(s.start)-minutes(s.breakEnd)+minutes(s.breakStart))/60;}
function workdays(d,s) {let n=0; for(let i=1;i<=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();i++) if(dayType(new Date(d.getFullYear(),d.getMonth(),i,12),s)==='work')n++; return n;}
function regularMs(d,s) {if(dayType(d,s)!=='work')return 0;return bounds(d,s).reduce((n,[a,b])=>n+Math.max(0,Math.min(+d,b)-a),0);}
function payPeriod(now,s) {
 const at=offset=>{const first=new Date(now.getFullYear(),now.getMonth()+offset,1);return new Date(first.getFullYear(),first.getMonth(),Math.min(s.payday,new Date(first.getFullYear(),first.getMonth()+1,0).getDate()));};
 const current=at(0),start=now<current?at(-1):current,end=now<current?current:at(1);
 let count=0,completed=0,calendarKnown=true;const today=dateKey(now);
 for(const d=new Date(start);d<end;d.setDate(d.getDate()+1)) {
  if(!calendar.years.includes(d.getFullYear()))calendarKnown=false;
  if(dayType(d,s)==='work'){count++;if(dateKey(d)<today)completed++;}
 }
 const last=new Date(end);last.setDate(last.getDate()-1);
 return {start:dateKey(start),end:dateKey(last),nextPayday:dateKey(end),workdays:count,completed,calendarKnown};
}
function snapshot(now,s,state) {
 const period=payPeriod(now,s),count=period.workdays, hours=dailyHours(s), daily=s.salary/(count||1), hourly=s.salary/s.divisor/hours;
 const todayMs=regularMs(now,s),completed=period.completed;
 const ms=now.getHours()*60+now.getMinutes();
 const type=dayType(now,s);const inWork=type==='work'&&bounds(now,s).some(([a,b])=>+now>=a&&+now<b);
 const atBreak=type==='work'&&ms>=minutes(s.breakStart)&&ms<minutes(s.breakEnd);
 const today=state.records.filter(r=>r.date===dateKey(now));
 return {type,inWork,atBreak,period,workdays:count,daily,hourly,today:daily*todayMs/(hours*3600000),month:daily*(completed+todayMs/(hours*3600000)),progress:todayMs/(hours*3600000),otPay:today.reduce((n,r)=>n+r.pay,0),otHours:today.reduce((n,r)=>n+r.hours,0),balance:state.balance,calendarKnown:period.calendarKnown,perSecond:daily/(hours*3600)};
}
function rate(d,s) {return dayType(d,s)==='holiday'?s.holidayRate:dayType(d,s)==='work'?s.weekdayRate:s.weekendRate;}
// Only intervals explicitly recorded by the user count as overtime. Normal working hours are excluded.
function overtime(from,to,s) {
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<from||to-from>DAY*367)throw Error('加班时间范围无效（最长 366 天）');
 const result=[];
 for(let cursor=from;cursor<to;) {
  const d=new Date(cursor), next=new Date(d);next.setHours(24,0,0,0); const stop=Math.min(to,+next);
  let ms=stop-cursor;
  if(dayType(d,s)==='work') for(const [a,b]of bounds(d,s))ms-=Math.max(0,Math.min(stop,b)-Math.max(cursor,a));
  if(ms>0){const hours=ms/3600000;result.push({date:dateKey(d),hours,rate:rate(d,s),pay:s.strategy==='pay'?hours*s.salary/s.divisor/dailyHours(s)*rate(d,s):0,strategy:s.strategy});}
  cursor=stop;
 }
 return result;
}
module.exports={defaults,validate,dateKey,dayType,dailyHours,workdays,payPeriod,snapshot,overtime,rate};
