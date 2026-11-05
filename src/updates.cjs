const RELEASES='https://github.com/2013358072/fuck-your-work/releases';
const API='https://api.github.com/repos/2013358072/fuck-your-work/releases/latest';
function resolveRelease(release,current,platform,arch) {
 if(release.draft||release.prerelease)return {status:'current'};
 const version=String(release.tag_name).replace(/^v/,'');
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('版本信息无效');
 const next=version.split('.').map(Number),old=current.split('.').map(Number);
 const differing=next.findIndex((v,i)=>v!==old[i]);
 if(differing<0||next[differing]<old[differing])return {status:'current'};
 const suffix=platform==='darwin'?`mac-${arch}.dmg`:`windows-${arch}-setup.exe`;
 const asset=(release.assets||[]).find(a=>a.name.endsWith(suffix)&&a.state==='uploaded'&&a.size>0);
 // Only this repository's HTTPS release downloads may be opened from remote metadata.
 const prefix=RELEASES+'/download/';
 const candidate=asset?.browser_download_url;
 const url=typeof candidate==='string'&&candidate.startsWith(prefix)&&!/[\s\\]/.test(candidate)?candidate:RELEASES+'/latest';
 return {status:'available',version,url,notes:String(release.body||'本次更新暂无说明。').slice(0,12000),publishedAt:release.published_at||'',directDownload:url!==RELEASES+'/latest'};
}
async function fetchUpdate(fetcher,current,platform,arch) {
 const response=await fetcher(API,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
 if(response.status===404)return {status:'current'};
 if(!response.ok)throw Error('HTTP '+response.status);
 return resolveRelease(await response.json(),current,platform,arch);
}
module.exports={resolveRelease,fetchUpdate};
