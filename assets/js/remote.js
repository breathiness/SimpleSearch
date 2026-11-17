// 联网联想（§5.6/§23.2）：默认百度 JSONP，可切换自定义 fetch 源；永不 reject。
;(function(root){'use strict';
const SS=(root.SimpleSearch=root.SimpleSearch||{}),K='ss.remote',PK='ss.suggestProvider',UK='ss.suggestUrl',DT=700,DL=5,MW=100,MCW=8,TTL=600000,CMAX=100,MRW=10,CP='ss_suggest_';
let cs=0,rs=0;const ch=new Map(),fl=new Map();
let se=null,sp=null,su=null;
function nq(r){return typeof r==='string'?r.trim().replace(/\s+/g,' '):''}
function nt(v){const n=Number(v);if(!Number.isFinite(n)||n<=0)return DT;return Math.max(100,Math.min(5000,Math.floor(n)))}
function nl(v){if(v==null)return DL;const n=Number(v);if(!Number.isFinite(n)||n<0)return DL;return Math.max(0,Math.min(20,Math.floor(n)))}
function nw(ws,lim){const o=[],seen=new Set(),src=Array.isArray(ws)?ws:[];for(const v of src){if(typeof v!=='string')continue;const w=v.trim();if(!w||w.length>MW)continue;const k=w.toLowerCase();if(seen.has(k))continue;seen.add(k);o.push(w);if(o.length>=lim)break}return o}
function st(){try{const s=root.localStorage;if(s&&typeof s.getItem==='function')return s}catch(e){}return null}
function en(){if(se!==null)return se;const s=st();if(!s)return true;try{const v=s.getItem(K);if(v==='off')return false;if(v==='on')return true}catch(e){}return true}
function setEn(v){const on=Boolean(v),s=st();if(s&&typeof s.setItem==='function'){try{s.setItem(K,on?'on':'off');if(typeof s.getItem==='function'&&s.getItem(K)===(on?'on':'off')){se=null;return on}}catch(e){}}se=on;return on}
function rs2(s,k){if(!s||typeof s.getItem!=='function')return null;try{const v=s.getItem(k);return typeof v==='string'?v:null}catch(e){return null}}
function np(v){return v==='custom'||v==='off'||v==='baidu'?v:'baidu'}
function cfg(){const s=st(),p=np(sp!==null?sp:rs2(s,PK));let u=su;if(u===null)u=rs2(s,UK)||'';return{provider:p,url:String(u).trim()}}
function configure(c){if(!c||typeof c!=='object')return cfg();const s=st();if(c.provider!==undefined){const p=np(c.provider);sp=p;if(s&&typeof s.setItem==='function'){try{s.setItem(PK,p)}catch(e){}}}if(c.url!==undefined){const u=typeof c.url==='string'?c.url.trim():'';su=u;if(s&&typeof s.setItem==='function'){try{s.setItem(UK,u)}catch(e){}}}ch.clear();fl.clear();rs+=1;return cfg()}
function rc(k){const e=ch.get(k);if(!e)return null;if(Date.now()-e.time>TTL){ch.delete(k);return null}ch.delete(k);ch.set(k,e);return e.words.slice()}
function wc(k,ws){if(!ws||!ws.length)return;ch.delete(k);ch.set(k,{time:Date.now(),words:ws.slice()});while(ch.size>CMAX){const x=ch.keys().next();if(x.done)break;ch.delete(x.value)}}
function pcp(pl){let src=null;if(Array.isArray(pl))src=pl;else if(pl&&typeof pl==='object'){if(Array.isArray(pl.s))src=pl.s;else if(Array.isArray(pl.data))src=pl.data}if(!src)return[];const o=[],seen=new Set();for(const v of src){if(typeof v!=='string')continue;const w=v.trim();if(!w||w.length>MW)continue;const k=w.toLowerCase();if(seen.has(k))continue;seen.add(k);o.push(w);if(o.length>=MCW)break}return o}
function rcustom(q,opt){const c=cfg();if(!c.url||c.url.indexOf('{q}')===-1)return Promise.resolve([]);const f=root.fetch;if(typeof f!=='function')return Promise.resolve([]);const u=c.url.split('{q}').join(encodeURIComponent(q)),to=nt(opt.timeout),ro={};try{if(root.AbortSignal&&typeof root.AbortSignal.timeout==='function')ro.signal=root.AbortSignal.timeout(to)}catch(e){}return new Promise((resolve)=>{let done=false;const fin=(ws)=>{if(done)return;done=true;root.clearTimeout(tm);resolve(Array.isArray(ws)?ws:[])};const tm=root.setTimeout(()=>fin([]),to+50);let r=null;try{r=f(u,ro)}catch(e){fin([]);return}Promise.resolve(r).then((res)=>res&&res.ok!==false?res.json():[]).then((pl)=>fin(pcp(pl))).catch(()=>fin([]))})}
function bu(q,cb){return 'https://suggestion.baidu.com/su?wd='+encodeURIComponent(q)+'&cb='+encodeURIComponent(cb)}
function pjb(t){let b=t.trim();if(!b)return null;const o=b.indexOf('('),c=b.lastIndexOf(')');if(o!==-1&&c>o)b=b.slice(o+1,c).trim();b=b.replace(/;\s*$/,'');try{return JSON.parse(b)}catch(e){}const q=b.replace(/([,{]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g,'$1"$2":');try{return JSON.parse(q)}catch(e){return null}}
function pbs(inp){let p=inp;if(typeof p==='string')p=pjb(p);if(!p||typeof p!=='object')return[];const src=Array.isArray(p.s)?p.s:(Array.isArray(p)?p:[]),o=[];for(const v of src){if(typeof v!=='string')continue;const w=v.trim();if(!w||w.length>MW)continue;o.push(w)}return o}
const bp={id:'baidu',label:'百度',buildUrl:bu,parse:pbs};
function cp(){const c=SS.remote&&SS.remote.provider;return c&&typeof c.buildUrl==='function'&&typeof c.parse==='function'?c:bp}
function jp(q,opt){return new Promise((resolve)=>{const d=root.document,p=cp();if(!d||typeof d.createElement!=='function'){resolve([]);return}const to=nt(opt.timeout),cb=CP+(cs+=1);let sc=null,tm=0,ok=false,ah=null;
function clean(){if(tm){root.clearTimeout(tm);tm=0}if(ah&&opt.signal&&typeof opt.signal.removeEventListener==='function'){try{opt.signal.removeEventListener('abort',ah)}catch(e){}}ah=null;if(sc){try{if(sc.parentNode)sc.parentNode.removeChild(sc)}catch(e){}sc.onerror=null;sc.onload=null;sc=null}try{delete root[cb]}catch(e){root[cb]=undefined}}
function fin(ws){if(ok)return;ok=true;clean();resolve(Array.isArray(ws)?ws:[])}
root[cb]=function(pl){let ws=[];try{ws=p.parse(pl)}catch(e){ws=[]}fin(ws)};
if(opt.signal){if(opt.signal.aborted){fin([]);return}ah=()=>fin([]);try{opt.signal.addEventListener('abort',ah,{once:true})}catch(e){ah=null}}
tm=root.setTimeout(()=>fin([]),to);
try{sc=d.createElement('script');sc.async=true;sc.onerror=()=>fin([]);sc.src=p.buildUrl(q,cb);const par=d.head||d.body||d.documentElement;if(!par){fin([]);return}par.appendChild(sc)}catch(e){fin([])}})}
function fetchWords(rq,opts){const opt=opts&&typeof opts==='object'?opts:{},q=nq(rq),lim=nl(opt.limit);if(!q||lim===0)return Promise.resolve([]);if(!en())return Promise.resolve([]);const c=cfg();if(c.provider==='off')return Promise.resolve([]);
if(c.provider==='custom'){const ck='custom:'+q.toLowerCase(),cached=rc(ck);if(cached)return Promise.resolve(cached.slice(0,lim));const pend=fl.get(ck);if(pend)return pend.then((ws)=>ws.slice(0,lim)).catch(()=>[]);const seq=(rs+=1);const pr=rcustom(q,{timeout:opt.timeout}).then((ws)=>{const n=nw(ws,MRW);if(n.length)wc(ck,n);if(seq!==rs)return[];return n}).catch(()=>[]).then((ws)=>{fl.delete(ck);return ws});fl.set(ck,pr);return pr.then((ws)=>ws.slice(0,lim))}
if(!root.document)return Promise.resolve([]);const ck=q.toLowerCase(),cached=rc(ck);if(cached)return Promise.resolve(cached.slice(0,lim));const pend=fl.get(ck);if(pend)return pend.then((ws)=>ws.slice(0,lim)).catch(()=>[]);const seq=(rs+=1);const pr=jp(q,{timeout:opt.timeout,signal:opt.signal}).then((ws)=>{const n=nw(ws,MRW);if(n.length)wc(ck,n);if(seq!==rs)return[];return n}).catch(()=>[]).then((ws)=>{fl.delete(ck);return ws});fl.set(ck,pr);return pr.then((ws)=>ws.slice(0,lim))}
SS.remote={KEY:K,PROVIDER_KEY:PK,URL_KEY:UK,enabled:en,setEnabled:setEn,configure,parseCustomPayload:pcp,fetch:fetchWords,provider:bp};
})(typeof globalThis!=='undefined'?globalThis:this);
