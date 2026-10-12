import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { REFERENCE_TEMPLATES, createReferenceTemplate } from '../../packages/design-document/src/index.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return [arg.slice(0, i), arg.slice(i + 1)]; }));
if (!args['--modules'] || !args['--browser']) throw new Error('Provide existing --modules and --browser paths.');
const { chromium } = createRequire(join(resolve(args['--modules']), 'qa.cjs'))('playwright');
const { build } = createRequire(resolve('node_modules/.pnpm/tsx@4.20.5/node_modules/tsx/package.json'))('esbuild');
const shim = resolve('scripts/design/qa-next-shim.tsx');
const bundle = await build({ entryPoints: ['scripts/design/qa-workspace-entry.tsx'], bundle: true, nodePaths: [resolve('apps/web/node_modules')], write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'apps/web/tsconfig.json', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'offline-next-adapters', setup(api) { api.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: 'qa-next' })); api.onLoad({ filter: /.*/, namespace: 'qa-next' }, args => ({ contents: args.path.endsWith('/navigation') ? `export { usePathname, useRouter, useSearchParams } from ${JSON.stringify(shim)}` : `export { ${args.path.endsWith('/link') ? 'Link' : 'Image'} as default } from ${JSON.stringify(shim)}`, loader: 'js', resolveDir: process.cwd() })); } }] });
const css = (await Promise.all(['apps/web/src/app/globals.css', 'apps/web/src/app/events/events.css', 'apps/web/src/app/events/journey.css', 'apps/web/src/app/events/[eventId]/designs/designs.css', 'apps/web/src/app/events/[eventId]/designs/designs-step1.css', 'apps/web/src/app/events/[eventId]/designs/designs-journey.css', 'apps/web/src/app/events/[eventId]/guests/guests.css', 'apps/web/src/app/events/[eventId]/invitations/invitations.css', 'apps/web/src/app/events/[eventId]/invitations/invitations-journey.css'].map(file => readFile(file, 'utf8')))).join('\n').replace(/@import[^;]+;/g, '');
const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', designId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const event = { id: eventId, name: 'Mariage de Nadia et Samuel', eventType: 'WEDDING', status: 'DRAFT', timezone: 'Africa/Kinshasa', startAt: '2026-10-10T10:00:00+01:00', invitationText: 'Nous serons heureux de partager cette journée unique avec vous.', ceremonies: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Cérémonie', ceremonyType: 'RELIGIOUS', startAt: '2026-10-10T10:00:00+01:00', venue: 'Lieu de démonstration' }] };
const server = createServer(async (request, response) => {
  if (request.url === '/bundle.js') { response.setHeader('content-type', 'application/javascript'); response.end(bundle.outputFiles[0].text); }
  else if (request.url?.startsWith('/brand/')) { try { response.setHeader('content-type', 'image/png'); response.end(await readFile(join('apps/web/public', request.url))); } catch { response.writeHead(404).end(); } }
  else { response.setHeader('content-type', 'text/html'); response.end(`<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>window.__qaEvent=${JSON.stringify(event)}</script><script src="/bundle.js"></script></html>`); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const out = resolve('docs/design-references/reconstructed'); await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: args['--browser'], headless: true });
const report = { mode: 'actual-workspace-component-with-fixture-APIs-and-Next-navigation-adapter', authenticatedJourneyValidated: false, realProvidersCalled: false, cases: [] };
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 375, 812]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    let design = null, selection = null, failSave = false;
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort(); // Offline: no fonts, analytics, provider or other remote call.
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const method = route.request().method(), path = url.pathname;
      let data = {}, status = 200;
      if (path === `/api/events/${eventId}/designs/templates`) data = { items: REFERENCE_TEMPLATES };
      else if (path === `/api/events/${eventId}/designs` && method === 'POST') { const input = route.request().postDataJSON(); design = { id: designId, name: input.name, version: 1, templateSlug: input.templateId, document: createReferenceTemplate(input.templateId), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; data = design; }
      else if (path === `/api/events/${eventId}/designs`) data = { items: design ? [design] : [], selection };
      else if (path.endsWith('/versions')) data = { items: [{ version: design.version, name: design.name, createdAt: design.createdAt }] };
      else if (path.endsWith('/continue')) { selection = { designId, version: design.version }; data = selection; }
      else if (path === `/api/events/${eventId}/designs/${designId}` && method === 'PUT') { if (failSave) { status = 503; data = { message: 'Enregistrement momentanément indisponible. Réessayez.' }; } else { const input = route.request().postDataJSON(); design = { ...design, ...input, version: design.version + 1 }; data = design; } }
      else if (path === `/api/events/${eventId}/designs/${designId}`) data = design;
      else if (path.endsWith('/invitations/batches')) data = [];
      else if (path.endsWith('/guests')) data = { items: [], total: 0, nextCursor: null };
      else if (path.endsWith('/me')) data = { role: 'PERSONAL', availableCredits: 0, reservedCredits: 0 };
      else if (path === '/api/assets') data = { items: [], nextCursor: null };
      else { status = 404; data = { message: 'QA fixture does not implement this endpoint' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(origin);
    await page.getByRole('button', { name: /Choisir ce modèle/ }).first().waitFor();
    await page.screenshot({ path: join(out, `workspace-${name}-catalogue.png`), fullPage: true });
    await page.getByRole('button', { name: /Choisir ce modèle/ }).first().click();
    const next = page.getByRole('button', { name: /Utiliser ce design et ajouter mes invités/ });
    await next.waitFor();
    assert.equal(await page.locator('.editor-body').getAttribute('data-simple'), 'true');
    assert.equal(await page.locator('.editor-left').isVisible(), false);
    const rect = await next.boundingBox(); assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= width && rect.y >= 0 && rect.y + rect.height <= height, `${name}: next action outside viewport`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    await page.screenshot({ path: join(out, `workspace-${name}-selected.png`) });
    await next.click();
    await page.waitForFunction(() => Boolean(window.__qaNavigation));
    assert.equal(await page.evaluate(() => window.__qaNavigation), `/events/${eventId}/guests`);
    assert.equal(selection.designId, designId);
    // Error/retry keeps the same selected design and never navigates after a failed save.
    await page.evaluate(() => { window.__qaNavigation = null; });
    await page.getByRole('button', { name: 'Personnaliser (facultatif)' }).click();
    assert.equal(await page.locator('.editor-left').isVisible(), false);
    await page.getByLabel('Nom du design').fill('Mon invitation relue');
    let prevented = false;
    page.once('dialog', async dialog => { prevented = true; await dialog.dismiss(); });
    await page.getByRole('link', { name: '← Étape précédente' }).click();
    assert.equal(prevented, true);
    assert.equal(await page.getByLabel('Nom du design').inputValue(), 'Mon invitation relue');
    failSave = true; await next.click();
    await page.getByText('Enregistrement momentanément indisponible. Réessayez.').waitFor();
    assert.equal(await page.evaluate(() => window.__qaNavigation), null);
    failSave = false; await next.click(); await page.waitForFunction(() => Boolean(window.__qaNavigation));
    assert.equal(design.name, 'Mon invitation relue');
    assert.deepEqual(failures, []);
    report.cases.push({ name, viewport: { width, height }, selectionWithoutEditor: 'passed', nextActionInViewport: 'passed', mobileOverflow: 'none', advancedHiddenByDefault: 'passed', failedSaveThenRetry: 'passed', pageErrors: failures });
    await page.close();
  }

  for (const [name,width,height] of [['desktop',1440,1000],['mobile',375,812]]) {
    const page = await browser.newPage({ viewport: {width,height} }); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    let status='COMPLETED', failed=false, expired=false, calls=0;
    await page.route('**/*', async route => {
      const url=new URL(route.request().url()); if(url.origin!==origin) return route.abort();
      if(!url.pathname.startsWith('/api/')) return route.continue(); calls++;
      assert.equal(route.request().method(),'GET');
      return route.fulfill({status:failed?503:200,contentType:'application/json',body:JSON.stringify({id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status,completedItems:2,failedItems:0,zipExpiresAt:expired?'2020-01-01':null})});
    });
    await page.goto(origin+'/?thanks'); await page.getByRole('heading',{name:'Merci ! Vos invitations sont prêtes.'}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Télécharger le ZIP'}).count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.match(await page.getByRole('link',{name:'Revenir à mon événement',exact:true}).first().getAttribute('href'), /events/);
    await page.screenshot({path:join(out,'confirmation-'+name+'.png'),fullPage:true});
    status='GENERATING'; await page.reload(); await page.getByText(/La génération est encore en cours/).waitFor();
    assert.equal(await page.getByRole('link',{name:'Télécharger le ZIP'}).count(),0);
    status='COMPLETED';expired=true;await page.getByRole('button',{name:'Réessayer la vérification'}).click(); await page.getByText(/Ce ZIP a expiré/).waitFor();
    failed=true;await page.getByRole('button',{name:'Réessayer la vérification'}).click();await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('link',{name:'Télécharger le ZIP'}).count(),0);
    failed=false;expired=false;await page.getByRole('button',{name:'Réessayer la vérification'}).click();await page.getByRole('heading',{name:'Merci ! Vos invitations sont prêtes.'}).waitFor();
    assert.deepEqual(errors,[]);report.cases.push({name:'confirmation-'+name,readyPendingExpiredErrorRetry:'passed',readOnlyRequests:calls,realZipDownloaded:false,pageErrors:errors});await page.close();
  }

  for (const [name,width,height] of [['desktop',1440,1000],['mobile',375,812]]) {
    const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const batch={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',status:'COMPLETED',totalItems:2,completedItems:2,failedItems:0,createdAt:'2026-10-11T10:00:00Z'};
    const design={id:designId,name:'Invitation de test',version:1,document:createReferenceTemplate('reference-01-ivory')};
    let guests=[];
    await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();let data={};
      if(url.pathname.endsWith('/guests/groups'))data=[];
      else if(url.pathname.endsWith('/guests'))data={items:guests,total:guests.length,nextCursor:null};
      else if(url.pathname.endsWith('/designs'))data={items:[design],selection:{designId,version:1}};
      else if(url.pathname.endsWith('/designs/'+designId))data=design;
      else if(url.pathname.endsWith('/invitations/batches'))data=[batch];
      else if(url.pathname.endsWith('/wallet/me'))data={availableCredits:10,reservedCredits:0,currency:'CREDITS'};
      else if(url.pathname.replace(/\/$/,'')==='/api/events')data=route.request().method()==='POST'?event:{items:[event]};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(origin+'/?stage=events');await page.getByRole('button',{name:'+ Nouvel événement'}).click();await page.getByLabel('Nom de l’événement').fill('Événement de test');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'storyboard horizontal overflow');await page.screenshot({path:join(out,'storyboard-events-'+name+'.png'),fullPage:true});await page.getByRole('button',{name:/Créer et continuer/}).click();await page.waitForFunction(()=>Boolean(window.__qaNavigation));assert.equal(await page.evaluate(()=>window.__qaNavigation),'/events/'+eventId);
    await page.goto(origin+'/?stage=ceremonies');await page.getByRole('heading',{name:'Étape 2 sur 6'}).waitFor();assert.equal(await page.getByRole('link',{name:/Découvrir mes propositions/}).getAttribute('href'),'/events/'+eventId+'/designs');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'storyboard horizontal overflow');await page.screenshot({path:join(out,'storyboard-ceremonies-'+name+'.png'),fullPage:true});
    await page.goto(origin+'/?stage=guests');await page.getByRole('heading',{name:'Étape 4 sur 6'}).waitFor();await page.getByRole('link',{name:/Ajouter ou importer mes invités/}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'storyboard horizontal overflow');await page.screenshot({path:join(out,'storyboard-guests-'+name+'.png'),fullPage:true});
    await page.getByLabel('Nom complet',{exact:true}).fill('Brouillon invité conservé'); let stayed=false;page.once('dialog',async dialog=>{stayed=true;await dialog.dismiss();});await page.getByRole('link',{name:'← Étape précédente'}).click();assert.equal(stayed,true);assert.equal(await page.getByLabel('Nom complet',{exact:true}).inputValue(),'Brouillon invité conservé');
    guests=[{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',fullName:'Invité test',email:null,phone:null,status:'ACTIVE',group:null,companions:[],access:[]}];
    await page.evaluate(eventId=>window.dispatchEvent(new CustomEvent('invitaflow:journey-updated',{detail:eventId})),eventId);await page.getByRole('link',{name:/Vérifier mes invitations/}).waitFor();
    await page.goto(origin+'/?stage=invitations');await page.getByRole('button',{name:'Générer mes invitations'}).waitFor();await page.getByRole('link',{name:'Télécharger le ZIP',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Terminer → Merci',exact:true}).count()>0,true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'storyboard horizontal overflow');await page.screenshot({path:join(out,'storyboard-invitations-'+name+'.png'),fullPage:true});
    assert.deepEqual(errors,[]);report.cases.push({name:'storyboard-'+name,eventCreateWithFixture:'passed',ceremoniesViewAndNext:'passed',guestsViewAndCountRefresh:'passed',invitationsViewAndThanksLink:'passed',unsavedGuestReturnCancelled:'passed',realImportOrGeneration:false,pageErrors:errors});await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await writeFile(join(out, 'workspace-ui-report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify(report));
