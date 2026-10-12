import assert from 'node:assert/strict';
import test from 'node:test';
import { EventsService } from './events.service.js';
test('a repeated moment creation reuses its ID and outbox; changed intent and foreign owner are refused', async () => {
  const rows=new Map<string, Record<string,unknown>>(); let writes=0;
  const tx={ $queryRaw:async (_sql:unknown,_id:string,owner:string)=>owner==='owner'?[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'DRAFT',start_at:null,end_at:null}]:[], ceremony:{findUnique:async({where}:{where:{id:string}})=>rows.get(where.id)??null,create:async({data}:{data:Record<string,unknown>})=>{const row={...data,createdAt:new Date()};rows.set(String(data['id']),row);return row;}},outboxMessage:{create:async()=>{writes++;}}};
  const db={$transaction:async(callback:(tx:unknown)=>Promise<unknown>)=>callback(tx)};
  const service=new EventsService(db as never), event='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const data={name:'Accueil',ceremonyType:'OTHER',startAt:new Date('2026-10-12T09:00:00Z'),timezone:'Africa/Kinshasa'};
  const first=await service.addCeremony('owner',event,data,'same-request-123');
  const again=await service.addCeremony('owner',event,data,'same-request-123');
  assert.equal(first.id,again.id);assert.equal(rows.size,1);assert.equal(writes,1);
  await assert.rejects(service.addCeremony('owner',event,{...data,name:'Autre'},'same-request-123'));
  await assert.rejects(service.addCeremony('foreign',event,data,'same-request-123'));
});
