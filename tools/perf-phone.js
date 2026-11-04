// Диагностика телефона (не входит в набор check-*): сценарий «тач-скролл героя → пролёт → свайпы страниц → На главную», 2 круга.
// Эмуляция 430×932, DPR 3, deviceMemory 4 (DM=…), настоящие тач-события. По фазам: RSS браузера, куча JS, кадры (p50/p95/max, число >50 мс), состояние движков.
// Рендер программный: память и порядок загрузки он показывает, частоту кадров и нагрузку видеокарты iPhone — нет. Запуск: node tools/perf-phone.js (LOOPS=1, LITE=1, DM=8).
// Стресс-сценарий телефона: тач-скролл героя → пролёт → читалка, свайпы страниц, «На главную», повтор.
// Метрики по фазам: RSS процесса (MB), куча JS, кадры (p50/p95/max, число кадров >50 мс), движки.
const http=require('http'),fs=require('fs'),path=require('path'),cp=require('child_process');
let pw; for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(m); break; } catch (e) { /* — */ } }
const ROOT=process.env.ROOT||path.join(__dirname,'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const rss=()=>{ try{ const out=cp.execSync("ps -eo rss,args | grep -E 'chrome|headless_shell' | grep -v grep | awk '{s+=$1} END{print s}'").toString().trim(); return Math.round(+out/1024);}catch(e){return -1;} };
const LITE=process.env.LITE==='1', DM=+(process.env.DM||4), LOOPS=+(process.env.LOOPS||2);
(async()=>{
 const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));if(f.endsWith('/'))f+='index.html';fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':'no-store'});r.end(d);});});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+srv.address().port;
 const b=await pw.chromium.launch(); const ctx=await b.newContext({viewport:{width:430,height:932},deviceScaleFactor:3,isMobile:true,hasTouch:true}); const p=await ctx.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('crash',()=>{errs.push('PAGE CRASH');console.log('PAGE CRASH');});
 await p.route(/^https:\/\/fonts\./,r=>r.abort()); await p.route('**/api/assistant/status',r=>r.fulfill({status:404,body:''}));
 await p.addInitScript((dm)=>{try{localStorage.setItem('astreya:consent',JSON.stringify({v:1,a:false,t:Date.now()}));}catch(e){} try{Object.defineProperty(navigator,'deviceMemory',{get:()=>dm});}catch(e){}
   window.__fr=[]; window.__lt=0; let last=0; const loop=t=>{ if(last) window.__fr.push(t-last); last=t; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
   try{ new PerformanceObserver(l=>{ for(const e of l.getEntries()) window.__lt+=1; }).observe({entryTypes:['longtask']}); }catch(e){} },DM);
 const cdp=await ctx.newCDPSession(p);
 await cdp.send('Performance.enable'); let pm0=null;
 const pmGet=async()=>{ const r=await cdp.send('Performance.getMetrics'); const o={}; r.metrics.forEach(m=>o[m.name]=m.value); return o; };
 const stats=async(tag)=>{ const pm1=await pmGet(); let pmS=''; if(pm0){ const d=k=>Math.round(((pm1[k]||0)-(pm0[k]||0))*1000); pmS=' main[task/script/layout/style ms]='+[d('TaskDuration'),d('ScriptDuration'),d('LayoutDuration'),d('RecalcStyleDuration')].join('/'); } pm0=pm1; const s=await p.evaluate(()=>{ const f=window.__fr.slice().sort((a,b)=>a-b); const n=f.length; const q=x=>n?Math.round(f[Math.min(n-1,Math.floor(n*x))]*10)/10:0; const o={n,p50:q(.5),p95:q(.95),max:n?Math.round(f[n-1]):0,over50:f.filter(x=>x>50).length,lt:window.__lt};
     const m=performance.memory; o.heap=m?Math.round(m.usedJSHeapSize/1048576):-1; const j=window.Astreya&&window.Astreya.jar; const a=j&&j.arch&&j.arch.state&&j.arch.state(), fl=j&&j.fly&&j.fly.state&&j.fly.state();
     o.hero=a&&{res:a.resident,low:a.lows,sz:(a.size||[]).join('x')}; o.fly=fl&&{res:fl.resident,low:fl.lows,fast:fl.fast,sz:(fl.size||[]).join('x')}; window.__fr=[]; window.__lt=0; o.y=Math.round(scrollY); o.imgs=document.querySelectorAll('#mag img').length; return o; });
   console.log(tag.padEnd(26),'rss',String(rss()).padStart(5),'heap',String(s.heap).padStart(4),'fr n/p50/p95/max/>50:',[s.n,s.p50,s.p95,s.max,s.over50].join('/'),'lt',s.lt,'y',s.y+pmS,'hero',JSON.stringify(s.hero),'fly',JSON.stringify(s.fly)); return s; };
 const tch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
 const fling=async(dy,ms)=>{ const n=Math.max(6,Math.round((ms||160)/16)); await tch('touchStart',215,800); for(let i=1;i<=n;i++){ await tch('touchMove',215,800-dy*i/n); await p.waitForTimeout(16);} await tch('touchEnd'); };
 const swipe=async(dx)=>{ const n=8; await tch('touchStart',dx<0?330:100,420); for(let i=1;i<=n;i++){ await tch('touchMove',(dx<0?330:100)+dx*i/n,420+((i%2)?2:-2)); await p.waitForTimeout(16);} await tch('touchEnd'); };
 console.log('profile: DM',DM,'LITE',LITE,'LOOPS',LOOPS);
 console.log('start', rss());
 await p.goto(base+'/index.html'+(LITE?'?lite=1':'')); await p.waitForSelector('html.ready',{timeout:30000}).catch(()=>{}); await p.waitForTimeout(3500);
 await stats('loaded');
 for(let L=1;L<=LOOPS;L++){
   // 1) герой: серия тач-скроллов вниз до начала читалки
   const rb=await p.evaluate(()=>{const r=document.getElementById('house-reader'),b=r.getBoundingClientRect();return {top:b.top+scrollY,h:r.offsetHeight,vh:innerHeight};});
   for(let k=0;k<30;k++){ const y=await p.evaluate(()=>scrollY); if(y>=rb.top-40) break; await fling(620,180); await p.waitForTimeout(420); }
   await p.waitForTimeout(1200); await stats('L'+L+' hero→reader top');
   // 2) читалка: пролёт и выдержка
   for(let k=0;k<12;k++){ const y=await p.evaluate(()=>scrollY); if(y>=rb.top+rb.h*0.74) break; await fling(620,180); await p.waitForTimeout(420); }
   await p.waitForTimeout(1500); await stats('L'+L+' flight done');
   // 3) свайпы страниц влево (листание вперёд) ×12
   for(let k=0;k<12;k++){ await swipe(-260); await p.waitForTimeout(1300); if(k%3===2) await stats('L'+L+' swipe '+(k+1)); }
   // 4) назад ×6
   for(let k=0;k<6;k++){ await swipe(260); await p.waitForTimeout(1100); }
   await stats('L'+L+' swipes back');
   // 5) «На главную»
   await p.evaluate(()=>window.Astreya.house.home()); await p.waitForTimeout(4500); await stats('L'+L+' home');
 }
 try{ await cdp.send('HeapProfiler.collectGarbage'); }catch(e){} await p.waitForTimeout(1500); console.log('final after gc', rss());
 console.log('errors', JSON.stringify(errs.slice(0,6)));
 await b.close(); srv.close();
})().catch(e=>{console.error('FAIL',e);process.exit(1)});
