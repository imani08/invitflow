// Explicit offline fixture APIs. Never imported or started by production.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { REFERENCE_TEMPLATES, createReferenceTemplate, createBlankDesign, validateDesignDocumentV2 } from '../../packages/design-document/src/index.mjs';
const { build } = createRequire(resolve('node_modules/.pnpm/tsx@4.20.5/node_modules/tsx/package.json'))('esbuild');
const shim = resolve('scripts/design/qa-next-shim.tsx');
const bundle = await build({ entryPoints: ['scripts/design/qa-workspace-entry.tsx'], bundle: true, nodePaths: [resolve('apps/web/node_modules')], write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'apps/web/tsconfig.json', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'offline-next-adapters', setup(api) { api.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: 'qa-next' })); api.onLoad({ filter: /.*/, namespace: 'qa-next' }, args => ({ contents: args.path.endsWith('/navigation') ? `export { usePathname, useRouter, useSearchParams } from ${JSON.stringify(shim)}` : `export { ${args.path.endsWith('/link') ? 'Link' : 'Image'} as default } from ${JSON.stringify(shim)}`, loader: 'js', resolveDir: process.cwd() })); } }] });
const css = (await Promise.all(['apps/web/src/app/globals.css','apps/web/src/app/events/events.css','apps/web/src/app/events/journey.css','apps/web/src/app/events/[eventId]/designs/designs.css','apps/web/src/app/events/[eventId]/designs/designs-step1.css','apps/web/src/app/events/[eventId]/designs/designs-journey.css'].map(file=>readFile(file,'utf8')))).join('\n').replace(/@import[^;]+;/g,'');
const eventId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',designId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const event={id:eventId,name:'Événement de test isolé',eventType:'WEDDING',status:'DRAFT',timezone:'Africa/Kinshasa',startAt:'2026-10-12T10:00:00+01:00',invitationText:'Nous vous invitons à partager cette journée.',ceremonies:[]};
let design=null,selection=null;const drafts=new Map(),operations=new Map(),media=new Map();
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host),path=url.pathname;
  const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  try {
    if(path.startsWith('/qa-upload/')) { for await(const _part of req) { /* Explicit simulated upload: no MinIO/ClamAV validation claimed. */ } res.writeHead(204); return res.end(); }
    if(path.startsWith('/qa-image/')) { res.writeHead(200,{'content-type':'image/png'}); return res.end(await readFile('coverage/journey-qa/photo-test.png')); }
    if(path==='/bundle.js'){res.writeHead(200,{'content-type':'application/javascript'});return res.end(bundle.outputFiles[0].text);}
    if(path.startsWith('/brand/')){try{res.writeHead(200,{'content-type':'image/png'});return res.end(await readFile(join('apps/web/public',path)));}catch{return res.writeHead(404).end();}}
    if(path.startsWith('/api/')){
      let text='';for await(const part of req)text+=part;const input=text?JSON.parse(text):{};
      if(path==='/api/journey-draft'){
        const scope=url.searchParams.get('path'),prior=drafts.get(scope)??{revision:0,data:{},savedAt:null};
        if(req.method==='PUT'){if(input.revision!==prior.revision)return json({message:'Conflit de révision de test'},409);const saved={revision:prior.revision+1,data:input.data,savedAt:new Date().toISOString()};drafts.set(scope,saved);return json(saved);}
        return json(prior);
      }
      if(path.endsWith('/me'))return json({role:'PERSONAL',availableCredits:100,reservedCredits:0,currency:'CREDITS'});
      if(path.endsWith('/designs/templates'))return json({items:REFERENCE_TEMPLATES});
      if(path.endsWith('/designs')&&req.method==='POST'){design={id:designId,name:input.name,version:1,templateSlug:input.templateId,document:input.templateId==='blank'?createBlankDesign():createReferenceTemplate(input.templateId),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return json(design,201);}
      if(path.endsWith('/designs'))return json({items:design?[design]:[],selection});
      if(path.endsWith('/versions'))return json({items:design?[{version:design.version,name:design.name,createdAt:design.createdAt}]:[]});
      if(path.endsWith('/continue')){selection={designId,version:design.version};return json(selection);}
      if(path.endsWith('/designs/'+designId)){if(req.method==='PUT'){if(input.expectedVersion!==design.version)return json({message:'Version périmée'},409);validateDesignDocumentV2(input.document);design={...design,name:input.name,document:input.document,version:design.version+1};}return json(design);}
      if(path.endsWith('/ceremonies')&&req.method==='POST'){const key=req.headers['idempotency-key'];if(key&&operations.has(key))return json(operations.get(key),201);const item={id:randomUUID(),...input,status:'DRAFT',programItems:[]};event.ceremonies.push(item);if(key)operations.set(key,item);return json(item,201);}
      if(path.includes('/ceremonies/')&&req.method==='PATCH'){const item=event.ceremonies.find(item=>item.id===path.split('/').at(-1));Object.assign(item,input);return json(item);}
      if(path.endsWith('/invitations/batches'))return json([]);
      if(path.endsWith('/guests'))return json({items:[],total:0,nextCursor:null});
      if(path==='/api/assets'&&req.method==='POST'){const id=randomUUID();media.set(id,{id,...input,status:'CREATED',width:640,height:480});return json({id},201);}
      if(path.startsWith('/api/assets/')){
        const parts=path.split('/'),id=parts[3],asset=media.get(id);
        if(!asset)return json({message:'Ressource de test absente'},404);
        if(parts[4]==='upload-url')return json({upload:{method:'POST',url:url.origin+'/qa-upload/'+id,fields:{}}});
        if(parts[4]==='complete'){asset.status='READY';return json(asset);}
        if(parts[4]==='download-url')return json({download:{url:url.origin+'/qa-image/'+id}});
        if(req.method==='DELETE'){media.delete(id);return json({deleted:true});}
      }
      if(path==='/api/assets')return json({items:[...media.values()].filter(asset=>asset.status==='READY'),nextCursor:null});
      if(path==='/api/events/'||path==='/api/events')return json({items:[event]});
      if(path==='/api/events/'+eventId)return json(event);
      return json({message:'Endpoint non simulé dans ce test explicite'},404);
    }
    res.writeHead(200,{'content-type':'text/html'});res.end(`<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><p role="note">TEST ISOLÉ — données fictives, aucun appel IA ni paiement</p><div id="root"></div><script>window.__qaEvent=${JSON.stringify(event)}</script><script src="/bundle.js"></script></html>`);
  }catch{json({message:'Erreur du banc de test'},500);}
});
const port = Number(process.env.QA_PORT ?? 4319);
server.listen(port,'127.0.0.1',()=>console.log(`Offline component QA: http://127.0.0.1:${port} — fixture APIs, no production data`));
