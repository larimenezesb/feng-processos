import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import worker from '../worker.mjs';
const schema=readFileSync(new URL('../migrations/0001_rules.sql',import.meta.url),'utf8');
const seedSql=readFileSync(new URL('../seed.sql',import.meta.url),'utf8');
const clubs=JSON.parse(readFileSync(new URL('../seed.json',import.meta.url),'utf8'));
// Test-only randomly generated secret; no production password or token is committed.
const password=randomBytes(24).toString('hex'),salt=randomBytes(16);
const encoded='v1$100000$'+salt.toString('hex')+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
function adapter(sqlite){
  return {prepare(sql){let values=[];return {bind(...x){values=x;return this;},async first(){return sqlite.prepare(sql).get(...values)||null;},async run(){const info=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(info.changes)}};},async all(){return {results:sqlite.prepare(sql).all(...values)};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
function fixture(file=':memory:',initialize=true){
  const sqlite=new DatabaseSync(file);if(initialize){sqlite.exec(schema);sqlite.exec(seedSql);}
  const env={DB:adapter(sqlite),ALLOWED_ORIGIN:'https://feng-test.github.io',ADMIN_PASSWORD_HASH:encoded};
  async function call(path,method='GET',body,token='',extra={}){
    const headers={Origin:env.ALLOWED_ORIGIN,'CF-Connecting-IP':'192.0.2.1',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...extra};
    const response=await worker.fetch(new Request('https://feng-test.workers.dev'+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
    const data=response.status===204?null:await response.json();return {status:response.status,data,headers:response.headers};
  }
  async function login(){const result=await call('/api/login','POST',{password});assert.equal(result.status,200);return result.data.token;}
  return {sqlite,env,call,login};
}
const changed=()=>({version:1,clubs:structuredClone(clubs),change_note:'Ajuste de teste'});
test('initial rules include advance renewal and Flamengo text, independently from renewal finalization',async()=>{
  const f=fixture();const r=await f.call('/api/rules');assert.equal(r.status,200);
  const by=Object.fromEntries(r.data.clubs.map(c=>[c.club,c]));
  assert.equal(by.Flamengo.advance_renewal,45);assert.equal(by['São Paulo'].advance_renewal,60);assert.equal(by.Fluminense.advance_renewal,30);assert.equal(by.Vasco.advance_renewal,75);assert.equal(by.Botafogo.advance_renewal,null);
  assert.equal(by.Flamengo.termination,'Não existe desligamento. O Sócio fica Inativo Inadimplente com 3 parcelas em aberto até quitar');assert.equal(by.Flamengo.finalization,91);assert.equal(r.headers.get('Cache-Control'),'no-store');f.sqlite.close();
});
test('anonymous and forged-token writes are rejected; history requires authentication',async()=>{
  const f=fixture();assert.equal((await f.call('/api/rules','PUT',changed())).status,401);assert.equal((await f.call('/api/rules','PUT',changed(),'a'.repeat(64))).status,401);assert.equal((await f.call('/api/history')).status,401);f.sqlite.close();
});
test('wrong password is rejected and repeated attempts are rate limited',async()=>{
  const f=fixture();for(let i=0;i<10;i++)assert.equal((await f.call('/api/login','POST',{password:'wrong'})).status,401);assert.equal((await f.call('/api/login','POST',{password})).status,429);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sessions').get().n,0);f.sqlite.close();
});
test('writes persist after closing/reopening the database and public readers see them',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'feng-rules-')),file=join(dir,'rules.sqlite');
  const f=fixture(file);const token=await f.login();const body=changed();body.clubs[0].advance_renewal=40;body.clubs[1].termination='Condição atualizada pelo teste';const saved=await f.call('/api/rules','PUT',body,token);assert.equal(saved.status,200);assert.equal(saved.data.version,2);assert.ok(saved.data.updated_at);f.sqlite.close();
  const reopened=fixture(file,false),read=await reopened.call('/api/rules');assert.equal(read.data.clubs[0].advance_renewal,40);assert.equal(read.data.clubs[1].termination,body.clubs[1].termination);reopened.sqlite.exec(seedSql);assert.equal((await reopened.call('/api/rules')).data.version,2);reopened.sqlite.close();rmSync(dir,{recursive:true});
});
test('stale writes cannot overwrite saved changes; trigger preserves both versions',async()=>{
  const f=fixture(),token=await f.login();const b=changed();b.clubs[0].advance_renewal=44;assert.equal((await f.call('/api/rules','PUT',b,token)).status,200);b.clubs[0].advance_renewal=99;assert.equal((await f.call('/api/rules','PUT',b,token)).status,409);const h=await f.call('/api/history','GET',undefined,token);assert.equal(h.data.versions.length,2);assert.equal(h.data.versions[0].clubs[0].advance_renewal,44);assert.equal(h.data.versions[1].clubs[0].advance_renewal,30);f.sqlite.close();
});
test('all protected routes enforce origin, valid session, logout and expiry',async()=>{
  const f=fixture(),token=await f.login();assert.equal((await f.call('/api/rules','PUT',changed(),token,{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.call('/api/logout','POST',{},token)).status,200);assert.equal((await f.call('/api/rules','PUT',changed(),token)).status,401);
  const token2=await f.login();f.sqlite.exec('UPDATE sessions SET expires_at=1');assert.equal((await f.call('/api/history','GET',undefined,token2)).status,401);f.sqlite.close();
});
test('password rotation invalidates existing sessions',async()=>{
  const f=fixture(),token=await f.login();f.env.ADMIN_PASSWORD_HASH=encoded.slice(0,-1)+(encoded.endsWith('0')?'1':'0');assert.equal((await f.call('/api/history','GET',undefined,token)).status,401);f.sqlite.close();
});
test('CORS and missing origin cannot bypass write access',async()=>{
  const f=fixture();const preflight=await f.call('/api/rules','OPTIONS');assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),f.env.ALLOWED_ORIGIN);assert.equal((await f.call('/api/login','POST',{password},'',{Origin:'null'})).status,403);
  const response=await worker.fetch(new Request('https://feng-test.workers.dev/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})}),f.env);assert.equal(response.status,403);f.sqlite.close();
});
test('bad numbers, missing clubs, duplicate clubs, malformed dates and empty notes are rejected without writes',async()=>{
  const f=fixture(),token=await f.login();
  for(const mutate of [b=>b.clubs[0].advance_renewal=-1,b=>b.clubs[0].arrears_grace=1.5,b=>b.clubs[0].finalization='90',b=>b.clubs.pop(),b=>b.clubs[1]=b.clubs[0],b=>b.clubs[0].effective_from='2026-02-30',b=>b.clubs[0].termination='',b=>b.change_note='',b=>b.clubs[0].notes='x'.repeat(1001)]){const b=changed();mutate(b);assert.equal((await f.call('/api/rules','PUT',b,token)).status,400);}
  assert.equal((await f.call('/api/rules')).data.version,1);f.sqlite.close();
});
test('free text, apostrophes, null advance, zero and valid effective date remain data',async()=>{
  const f=fixture(),token=await f.login();const b=changed();b.clubs[0].notes="D'água <script>alert(1)</script>";b.clubs[0].effective_from='2026-09-02';b.clubs[0].advance_renewal=null;b.clubs[0].arrears_grace=0;assert.equal((await f.call('/api/rules','PUT',b,token)).status,200);const read=await f.call('/api/rules');assert.equal(read.data.clubs[0].notes,b.clubs[0].notes);assert.equal(read.data.clubs[0].advance_renewal,null);f.sqlite.close();
});
test('oversized payload and wrong content type fail closed',async()=>{
  const f=fixture(),token=await f.login();assert.equal((await f.call('/api/rules','PUT',{...changed(),unused:'x'.repeat(40000)},token)).status,413);assert.equal((await f.call('/api/rules','PUT',changed(),token,{'Content-Type':'text/plain'})).status,415);f.sqlite.close();
});
test('unconfigured password refuses login and database errors do not leak internals',async()=>{
  const f=fixture();delete f.env.ADMIN_PASSWORD_HASH;assert.equal((await f.call('/api/login','POST',{password})).status,503);f.sqlite.close();const r=await f.call('/api/rules');assert.equal(r.status,503);assert.doesNotMatch(r.data.error,/sqlite|SELECT|stack/i);
});
