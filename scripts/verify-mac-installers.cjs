const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const assert=require('node:assert/strict');const {execFileSync}=require('node:child_process');
const run=(command,args)=>execFileSync(command,args,{stdio:'inherit'});
function manifest(root){
 const rows=[];
 function visit(relative){
  const file=path.join(root,relative),stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()){rows.push([relative,'link',fs.readlinkSync(file)]);return;}
  if(stat.isDirectory()){rows.push([relative,'directory']);for(const name of fs.readdirSync(file).sort())visit(path.join(relative,name));return;}
  assert.ok(stat.isFile(),`Unexpected file type: ${file}`);
  rows.push([relative,'file',stat.mode&0o111,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
 }
 visit('');return rows;
}
function main(){
 assert.equal(process.platform,'darwin');const arch=process.argv[2];assert.ok(['arm64','x64'].includes(arch));
 const version=require('../package.json').version;
 const original=path.resolve(`dist/mac${arch==='arm64'?'-arm64':''}/上班鼓励器.app`);
 const dmg=path.resolve(process.argv[3]||`dist/WorkEncourager-${version}-mac-${arch}.dmg`);
 const zip=path.resolve(process.argv[4]||`dist/WorkEncourager-${version}-mac-${arch}.zip`);
 // An executable launching before packaging does not prove the installer is readable.
 run('hdiutil',['verify',dmg]);
 const expected=manifest(original),temp=fs.mkdtempSync(path.join(os.tmpdir(),'encourager-install-'));
 const mount=path.join(temp,'volume');fs.mkdirSync(mount);let mounted=false;
 try{
  run('hdiutil',['attach',dmg,'-readonly','-nobrowse','-mountpoint',mount]);mounted=true;
  const installed=path.join(temp,'installed','上班鼓励器.app');
  run('ditto',[path.join(mount,'上班鼓励器.app'),installed]);
  assert.deepEqual(manifest(installed),expected,'DMG copy differs from the signed build');
  run('codesign',['--verify','--deep','--strict',installed]);
  run('hdiutil',['detach',mount]);mounted=false;
  // Launch after ejecting the image, as an installed app would be launched.
  run(process.execPath,[path.join(__dirname,'verify-package.cjs'),path.join(installed,'Contents/MacOS/上班鼓励器')]);
  run('unzip',['-tq',zip]);
  const extracted=path.join(temp,'zip');run('ditto',['-x','-k',zip,extracted]);
  const zipped=path.join(extracted,'上班鼓励器.app');assert.deepEqual(manifest(zipped),expected,'ZIP extraction differs from the signed build');
  run('codesign',['--verify','--deep','--strict',zipped]);
  console.log(`PASS: ${arch} DMG checksum, mounted copy, every file hash, installed launch and ZIP extraction`);
 }finally{
  // Never remove a mountpoint recursively if detach failed.
  if(mounted)run('hdiutil',['detach',mount]);
  fs.rmSync(temp,{recursive:true,force:true});
 }
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
