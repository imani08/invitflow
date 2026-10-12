// Opt-in integration check: existing Docker PostgreSQL, real PrismaPg adapter.
// Only a randomly named test schema is created and dropped; no business tables.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ai = source('services/ai-design/src/ai-design.service.ts');
const invitation = source('services/invitations/src/invitation.service.ts');
const templates = source('services/designs/src/publish-professional-templates.ts');
const locks = text => text.split(/\r?\n/).filter(line => line.includes('await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock'));
assert.equal(locks(ai).length, 2);
assert.equal(locks(invitation).length, 1);
assert.equal(locks(templates).length, 1);
for (const text of [ai, invitation, templates]) assert.doesNotMatch(text, /\$queryRaw\(Prisma.sql`SELECT pg_advisory_xact_lock/);

for (const [service, statements] of [['ai-design', locks(ai)], ['invitations', locks(invitation)], ['designs', locks(templates)]]) {
  const program = `
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from './dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
const db = new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const schema = 'lockcheck_' + randomUUID().replaceAll('-', '');
const table = '"' + schema + '".limits';
const scope = randomUUID();
const lock = new Function('tx','Prisma','ownerSubject','eventId','slug',
  'return (async () => {' + ${JSON.stringify(statements.join('\n'))} + '})()');
let made = false;
try {
  // Reproduce the original incompatibility with the actual adapter, read-only.
  await assert.rejects(db.$transaction(tx=>tx.$queryRaw(Prisma.sql\`SELECT pg_advisory_xact_lock(hashtext(\${scope}))\`)),
    error=>error.code==='P2010' && /void|UnsupportedNativeDataType/.test(JSON.stringify(error.meta)));
  await db.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"'); made=true;
  await db.$executeRawUnsafe('CREATE TABLE ' + table + ' (id int PRIMARY KEY, active int NOT NULL, available int NOT NULL, reserved int NOT NULL)');
  await db.$executeRawUnsafe('INSERT INTO ' + table + ' VALUES (1, 0, 1, 0)');
  // Both transactions contend for the same production lock keys. One admission
  // only is possible; the read is deliberately not protected by a row lock.
  const admit = () => db.$transaction(async tx => {
    await lock(tx,Prisma,scope,scope,scope);
    const [row] = await tx.$queryRawUnsafe('SELECT active, available FROM ' + table + ' WHERE id=1');
    if (row.active>=1 || row.available<1) return false;
    await new Promise(resolve=>setTimeout(resolve,100));
    await tx.$executeRawUnsafe('UPDATE ' + table + ' SET active=active+1, available=available-1, reserved=reserved+1 WHERE id=1');
    return true;
  }, {timeout:10000});
  assert.equal((await Promise.all([admit(),admit()])).filter(Boolean).length,1);
  const [row]=await db.$queryRawUnsafe('SELECT active, available, reserved FROM ' + table);
  assert.deepEqual(row,{active:1,available:0,reserved:1});
  // Rollback releases the transaction-scoped lock; acquisition outside the
  // aborted transaction must finish within the next transaction's timeout.
  await assert.rejects(db.$transaction(async tx=>{await lock(tx,Prisma,scope,scope,scope);throw new Error('test rollback');}),/test rollback/);
  await db.$transaction(tx=>lock(tx,Prisma,scope,scope,scope),{timeout:2000});
  console.log(JSON.stringify({service:${JSON.stringify(service)},prismaVoidFailureReproduced:true,productionLockSQLAccepted:true,concurrentAdmissions:1,available:0,reserved:1,rollbackReleasesLock:true}));
} finally {
  if(made) await db.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE');
  await db.$disconnect();
}


`;
  // No credentials cross stdout; only the safe JSON summary is forwarded.
  try {
    process.stdout.write(execFileSync('docker', ['compose', 'exec', '-T', service, 'node', '--input-type=module'], { input: program, encoding: 'utf8', timeout: 45000, stdio: ['pipe', 'pipe', 'pipe'] }));
  } catch {
    throw new Error(`PostgreSQL advisory-lock integration check failed for ${service}; no credentials printed`);
  }
}

// Exercise actual service admission/reservation methods against isolated tables.
// AI's corrected private lock method is loaded from the source above; no worker
// is started and the configured AI provider is replaced only in this test process.
for (const service of ['ai-design', 'wallet']) {
  const program = `
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient,Prisma} from './dist/generated/prisma/client.js';
import {PrismaPg} from '@prisma/adapter-pg';
const admin=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const schema='servicecheck_'+randomUUID().replaceAll('-','');
let db; let made=false;
try {
  await admin.$executeRawUnsafe('CREATE SCHEMA "'+schema+'"'); made=true;
  const tables=${JSON.stringify(service === 'wallet' ? ['wallets','wallet_entries','wallet_reservations','outbox_messages'] : ['ai_design_jobs','outbox_messages'])};
  for(const table of tables) await admin.$executeRawUnsafe('CREATE TABLE "'+schema+'"."'+table+'" (LIKE public."'+table+'" INCLUDING ALL)');
  const enums=${JSON.stringify(service === 'wallet' ? [['wallet_entries','type','WalletEntryType',null],['wallet_reservations','status','ReservationStatus','RESERVED']] : [['ai_design_jobs','status','AiDesignJobStatus','QUEUED']])};
  for(const [table,column,type,defaultValue] of enums) {
    const labels=await admin.$queryRawUnsafe('SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$1 AND t.typname=$2 ORDER BY e.enumsortorder','public',type);
    const literal=value=>"'"+value.replaceAll("'","''")+"'";
    await admin.$executeRawUnsafe('CREATE TYPE "'+schema+'"."'+type+'" AS ENUM ('+labels.map(row=>literal(row.enumlabel)).join(',')+')');
    const target='"'+schema+'"."'+table+'"';
    await admin.$executeRawUnsafe('ALTER TABLE '+target+' ALTER COLUMN "'+column+'" DROP DEFAULT');
    await admin.$executeRawUnsafe('ALTER TABLE '+target+' ALTER COLUMN "'+column+'" TYPE "'+schema+'"."'+type+'" USING "'+column+'"::text::"'+schema+'"."'+type+'"');
    if(defaultValue) await admin.$executeRawUnsafe('ALTER TABLE '+target+' ALTER COLUMN "'+column+'" SET DEFAULT '+literal(defaultValue));
  }
  const url=new URL(process.env.DATABASE_URL); url.searchParams.set('options','-c search_path='+schema+',public');
  db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()},{schema})});
  const owner='integration-'+randomUUID();
  if(${JSON.stringify(service)}==='ai-design') {
    process.env.AI_PROVIDER='mock'; process.env.AI_MAX_ACTIVE_PER_OWNER='1'; process.env.AI_MAX_ACTIVE_GLOBAL='1';
    const {AiDesignService}=await import('./dist/src/ai-design.service.js');
    const instance=new AiDesignService(db,{get:async()=>({version:1,document:{canvas:{},elements:[],theme:{}}})},{},{});
    const corrected=new Function('tx','Prisma','ownerSubject','return (async()=>{'+${JSON.stringify(locks(ai).join('\n'))}+'})()');
    instance.lockQuotaRows=tx=>corrected(tx,Prisma,owner);
    const event=randomUUID(),design=randomUUID();
    const results=await Promise.allSettled(['Première ambiance florale','Deuxième ambiance dorée'].map(prompt=>instance.create(event,design,owner,'test-no-network',{prompt})));
    console.log(JSON.stringify({outcomes:results.map(r=>r.status==='fulfilled'?'ok':{name:r.reason.name,code:r.reason.code,status:r.reason.getStatus?.()})}));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.getStatus(),429);
    assert.equal(await db.aiDesignJob.count(),1);
    console.log(JSON.stringify({service:'ai-design',actualServiceConcurrentCreate:'1 accepted, 1 quota rejection',database:'isolated PostgreSQL schema',paidCalls:0}));
  } else {
    const {WalletService}=await import('./dist/src/wallet.service.js');
    const instance=new WalletService(db);
    await db.wallet.create({data:{ownerSubject:owner,availableCredits:1}});
    const refs=[randomUUID(),randomUUID()],keys=[randomUUID(),randomUUID()];
    const results=await Promise.allSettled(refs.map((referenceId,i)=>instance.reserve(owner,keys[i],{credits:1,referenceId})));
    console.log(JSON.stringify({outcomes:results.map(r=>r.status==='fulfilled'?'ok':{name:r.reason.name,code:r.reason.code,status:r.reason.getStatus?.()})}));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const winning=results.findIndex(r=>r.status==='fulfilled');
    await instance.reserve(owner,keys[winning],{credits:1,referenceId:refs[winning]});
    let balance=await instance.balance(owner);assert.equal(balance.availableCredits,0);assert.equal(balance.reservedCredits,1);
    const key=randomUUID();await instance.settleReservation(owner,refs[winning],key,{consumedCredits:1});
    await instance.settleReservation(owner,refs[winning],key,{consumedCredits:1});
    balance=await instance.balance(owner);assert.equal(balance.availableCredits,0);assert.equal(balance.reservedCredits,0);
    assert.equal(await db.walletReservation.count(),1);
    console.log(JSON.stringify({service:'wallet',actualConcurrentReserve:'1 accepted, 1 rejected',replayedReserveAndSettlement:'no double debit',realBalancesModified:false}));
  }
} finally {if(db)await db.$disconnect();if(made)await admin.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE');await admin.$disconnect();}
`;
  try {
    process.stdout.write(execFileSync('docker', ['compose','exec','-T',service,'node','--input-type=module'],{input:program,encoding:'utf8',timeout:45000,stdio:['pipe','pipe','pipe']}));
  } catch (error) { if(error.stdout) process.stdout.write(error.stdout); throw new Error(`Isolated ${service} service integration failed`); }
}
