import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialComposition, validateDesignDocumentV2 } from '@invitaflow/design-document';
import { AiDesignService } from './ai-design.service.js';

test('initial composition runs GPT then FLUX with checkpoints and keeps independent editable layers', async () => {
  const oldFetch = globalThis.fetch, names = ['AI_PROVIDER','AI_IMAGE_PROVIDER','OPENAI_API_KEY','BFL_API_KEY'] as const;
  const prior = names.map(name => process.env[name]);
  Object.assign(process.env, { AI_PROVIDER:'openai', AI_IMAGE_PROVIDER:'flux', OPENAI_API_KEY:'test-placeholder', BFL_API_KEY:'test-placeholder' });
  const source = createInitialComposition(); source['metadata'].initialGeneration = true;
  const before = JSON.stringify(source), calls: string[] = [];
  const job: { id: string; status: string; errorCode: string | null; proposal: Record<string, unknown> | null; [key: string]: unknown } = { id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',eventId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',designId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',baseVersion:1,sourceDocument:source,prompt:'VISUAL_VARIATION\nINITIAL_COMPOSITION\nUn style botanique',proposal:null,status:'QUEUED',errorCode:null };
  const delegate = { findUnique:async()=>job, updateMany:async({where,data}:{where:Record<string,unknown>;data:Record<string,unknown>})=>{if(where['status']&&where['status']!==job['status'])return {count:0};Object.assign(job,data);return {count:1};} };
  const tx={aiDesignJob:delegate,outboxMessage:{create:async()=>({})}};
  const db={...tx,$transaction:async(run:(tx:unknown)=>Promise<unknown>)=>run(tx)};
  const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(768,16);png.writeUInt32BE(1024,20);
  try {
    globalThis.fetch=async(url,init)=>{
      calls.push(String(url));
      if(String(url)==='https://api.openai.com/v1/responses') {
        const body=JSON.parse(String(init?.body));assert.match(body.instructions,/initial invitation composition/);assert.equal(body.text.format.strict,true);
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Composition initiale',visualPrompt:'Subtle botanical decoration, no text',changes:[{op:'set_element_text',elementId:'ai-invitation-prose',value:'Partageons une belle célébration.'},{op:'set_element_bounds',elementId:'ai-invitation-prose',x:150,y:760,width:1180,height:180}]})}]}]});
      }
      if(String(url)==='https://api.bfl.ai/v1/flux-2-klein-9b')return Response.json({id:'isolated-task',polling_url:'https://api.bfl.ai/v1/get_result?id=isolated-task'});
      if(String(url).startsWith('https://api.bfl.ai/v1/get_result'))return Response.json({status:'Ready',result:{sample:'https://delivery-eu1.bfl.ai/test.png'}});
      if(String(url)==='https://delivery-eu1.bfl.ai/test.png')return new Response(png);
      throw new Error('Unexpected network request in isolated test');
    };
    const service=new AiDesignService(db as never,{} as never,{} as never,{put:async()=> 'test-preview',delete:async()=>{}} as never);
    await service.process(job['id']);
    assert.equal(job['status'],'PROPOSED'); assert.equal(job['previewObjectKey'],'test-preview');
    const document=job['proposal']!['document'] as ReturnType<typeof createInitialComposition>;
    validateDesignDocumentV2(document);assert.equal(document.elements.length,source.elements.length);
    assert.equal(document.elements.find((layer:Record<string,unknown>)=>layer['id']==='ai-invitation-prose')!['text'],'Partageons une belle célébration.');
    assert.equal(document['metadata'].initialCompositionSeed,undefined);assert.equal(JSON.stringify(source),before);
    const count=calls.length; await service.process(job['id']);assert.equal(calls.length,count);
    assert.equal(calls.filter(url=>url.includes('/responses')).length,1);assert.equal(calls.filter(url=>url.includes('/flux-2-klein')).length,1);
  } finally { globalThis.fetch=oldFetch;names.forEach((name,index)=>{if(prior[index]===undefined)delete process.env[name];else process.env[name]=prior[index];}); }
});

test('initial generation never falls back silently to a local mock', async () => {
  const prior=process.env['AI_PROVIDER'];process.env['AI_PROVIDER']='mock';
  try { await assert.rejects(new AiDesignService({} as never,{} as never,{} as never,{} as never).create('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','test-owner','Bearer test',{workflow:'INITIAL_COMPOSITION',prompt:'Une composition sobre'}),/création manuelle/); }
  finally {if(prior===undefined)delete process.env['AI_PROVIDER'];else process.env['AI_PROVIDER']=prior;}
});
