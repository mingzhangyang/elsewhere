import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import type { Plugin } from 'vite';

/** Host configuration files that are never served as assets. */
const HOST_ONLY = new Set(['_headers', '_redirects']);

/** Build-owned cache manifest: never cache weather requests or shared coordinates. */
export function offlinePlugin(): Plugin {
  let directory = '',
    base = '/';
  return {
    name: 'elsewhere-offline-shell',
    apply: 'build',
    configResolved(config) {
      directory = resolve(config.root, config.build.outDir);
      base = config.base;
    },
    async closeBundle() {
      const files: string[] = [];
      async function walk(dir: string) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) await walk(path);
          // The host reads _headers and never serves it; precaching it would fail the whole install.
          else if (entry.name !== 'sw.js' && !HOST_ONLY.has(entry.name))
            files.push(relative(directory, path).replaceAll('\\', '/'));
        }
      }
      await walk(directory);
      files.sort();
      const source = `const BASE=new URL(${JSON.stringify(base)},self.location).pathname;
const FILES=${JSON.stringify(files)}.map(p=>new URL(p,self.registration.scope).href);
// A navigation cannot be answered with a redirected response, and hosts may redirect /index.html to /
// (Cloudflare does). Store a plain copy under the same URL-only request identity.
const plain=async r=>r.redirected?new Response(await r.blob(),{status:r.status,statusText:r.statusText,headers:r.headers}):r;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>Promise.all(FILES.map(async url=>{
 const request=new Request(url),response=await fetch(request);
 if(!response.ok)throw new TypeError('Precache failed: '+url);
 await cache.put(request,await plain(response));
})))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith('elsewhere-')&&key!==CACHE)await caches.delete(key);}await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(async c=>(await c.match(url.origin+url.pathname))||(await c.match(url.origin+url.pathname+'.html'))||(await c.match(new URL('index.html',self.registration.scope).href)))));return;
 }
 // Manifest assets have one build-owned representation. Match the same URL-only
 // request used by addAll, regardless of the caller's Origin or other headers.
 if(FILES.includes(url.href))event.respondWith(caches.open(CACHE).then(async c=>(await c.match(url.href))||fetch(event.request)));
});
`;
      // Worker-only changes also need a separate cache while the old worker is active.
      const hash = createHash('sha256').update(source);
      for (const file of files) {
        hash.update(file);
        hash.update(await readFile(join(directory, file)));
      }
      const cache = `elsewhere-${hash.digest('hex').slice(0, 12)}`;
      await writeFile(join(directory, 'sw.js'), `const CACHE=${JSON.stringify(cache)};\n${source}`);
    },
  };
}
