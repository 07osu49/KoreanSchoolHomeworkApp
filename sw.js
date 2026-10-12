const CACHE='work-station-github-v1';
const BASE=new URL('./',self.location.href);
const ASSETS=['./','index.html','app.js','icon.svg','manifest.json'].map(p=>new URL(p,BASE).href);
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('work-station-github-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!ASSETS.includes(e.request.url))return;e.respondWith(fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return res}).catch(()=>caches.match(e.request))) });
