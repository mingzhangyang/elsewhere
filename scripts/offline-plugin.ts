import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import type { Plugin } from 'vite';

/** Build-owned cache manifest: never cache weather requests or shared coordinates. */
export function offlinePlugin(): Plugin {
  let directory = '', base = '/';
  return {
    name: 'elsewhere-offline-shell', apply: 'build',
    configResolved(config) { directory = resolve(config.root,config.build.outDir); base = config.base; },
    async closeBundle() {
      const files: string[] = [];
      async function walk(dir: string) {
        for (const entry of await readdir(dir,{withFileTypes:true})) {
          const path = join(dir,entry.name);
          if (entry.isDirectory()) await walk(path);
          else if (entry.name !== 'sw.js') files.push(relative(directory,path).replaceAll('\\','/'));
        }
      }
      await walk(directory); files.sort();
      const hash = createHash('sha256');
      for (const file of files) { hash.update(file); hash.update(await readFile(join(directory,file))); }
      const cache = `elsewhere-${hash.digest('hex').slice(0,12)}`;
      const source = `const CACHE=${JSON.stringify(cache)},BASE=new URL(${JSON.stringify(base)},self.location).pathname;
const FILES=${JSON.stringify(files)}.map(p=>new URL(p,self.registration.scope).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith('elsewhere-')&&key!==CACHE)await caches.delete(key);}await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(async c=>(await c.match(url.origin+url.pathname))||(await c.match(new URL('index.html',self.registration.scope).href)))));return;
 }
 if(FILES.includes(url.href))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(event.request))||fetch(event.request)));
});
`;
      await writeFile(join(directory,'sw.js'),source);
    },
  };
}
