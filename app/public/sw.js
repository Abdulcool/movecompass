const CACHE = 'movecompass-shell-v3';
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE),response=await fetch('/');
    const html=await response.clone().text();await cache.put('/',response);
    const paths=[...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m=>new URL(m[1],self.location.origin)).filter(u=>u.origin===self.location.origin);
    await Promise.all(paths.map(u=>cache.add(u.href).catch(()=>{})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(event.request.method!=='GET'||u.origin!==self.location.origin||/^\/(api|ws|flasher|firmware|esp-web-tools)(\/|$)/.test(u.pathname)||u.pathname==='/flash.html')return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate') {
      try {const r=await fetch(event.request);if(r.ok)await cache.put(event.request,r.clone());return r;}
      catch {return (await cache.match(event.request))||(await cache.match('/'));}
    }
    const saved=await cache.match(event.request);if(saved)return saved;
    const r=await fetch(event.request);if(r.ok)event.waitUntil(cache.put(event.request,r.clone()));return r;
  })());
});
