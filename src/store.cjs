const fs=require('node:fs');const path=require('node:path');const {defaults,validate}=require('./core.cjs');
function fresh(){return {schema:1,settings:{...defaults,overrides:{}},records:[],balance:0,active:null,adjustments:[]};}
function parse(raw){const v=JSON.parse(raw);if(v.schema!==1||!Array.isArray(v.records)||!Array.isArray(v.adjustments)||!Number.isFinite(v.balance)||v.balance<0)throw Error('数据格式损坏');v.settings=validate(v.settings);if(v.active!==null&&(!Number.isFinite(v.active.since)||!Number.isFinite(v.active.started)))throw Error('加班状态损坏');for(const r of v.records)if(!Number.isFinite(r.hours)||r.hours<0||!Number.isFinite(r.pay)||r.pay<0||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!['pay','comp'].includes(r.strategy))throw Error('加班记录损坏');return v;}
class Store {
 constructor(dir){this.dir=dir;this.file=path.join(dir,'settings.json');fs.mkdirSync(dir,{recursive:true});this.warning='';this.data=fresh();if(fs.existsSync(this.file)){try{this.data=parse(fs.readFileSync(this.file,'utf8'));}catch{const backup=this.file+'.corrupt-'+Date.now();fs.copyFileSync(this.file,backup);try{this.data=parse(fs.readFileSync(this.file+'.bak','utf8'));this.warning='主数据异常，已从备份恢复。损坏文件已保留。';}catch{throw Error('本地数据损坏，原文件已保留在 '+backup+'；请恢复备份后重新启动。');}}}}
 save(){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data,null,2),{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');fs.renameSync(tmp,this.file);}
}
module.exports={Store,fresh,parse};
