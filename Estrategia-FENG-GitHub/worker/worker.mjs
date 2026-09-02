const encoder=new TextEncoder();
const clubNames=new Map([['regras-fluminense','Fluminense'],['regras-flamengo','Flamengo'],['regras-botafogo','Botafogo'],['regras-sao-paulo','São Paulo'],['regras-vasco','Vasco']]);
const fields=['arrears_grace','renewal_grace','finalization','advance_renewal'];
const nowSeconds=()=>Math.floor(Date.now()/1000);
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const hex=buffer=>[...new Uint8Array(buffer)].map(n=>n.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g)||[],c=>parseInt(c,16));
async function digest(s){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));}
export async function checkPassword(password,encoded){
  const [version,iterations,salt,expected]=String(encoded||'').split('$');
  if(version!=='v1'||iterations!=='100000'||!/^([a-f0-9]{2}){16}$/.test(salt||'')||!/^([a-f0-9]{2}){32}$/.test(expected||''))throw new HttpError(503,'A edição ainda não foi configurada.');
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations:Number(iterations),hash:'SHA-256'},key,256));
  const expectedBytes=unhex(expected);let difference=0;for(let i=0;i<actual.length;i++)difference|=actual[i]^expectedBytes[i];return difference===0;
}
export function validateBody(body){
  if(!body||!Number.isInteger(body.version)||body.version<1)throw new HttpError(400,'Versão inválida. Atualize a consulta.');
  if(typeof body.change_note!=='string'||!body.change_note.trim()||body.change_note.length>300)throw new HttpError(400,'Descreva a mudança em até 300 caracteres.');
  if(!Array.isArray(body.clubs)||body.clubs.length!==clubNames.size)throw new HttpError(400,'Informe as regras dos cinco clubes.');
  const seen=new Set();
  const clubs=body.clubs.map(input=>{
    if(!input||!clubNames.has(input.id)||clubNames.get(input.id)!==input.club||seen.has(input.id))throw new HttpError(400,'Lista de clubes inválida.');
    seen.add(input.id);const out={id:input.id,club:input.club};
    for(const f of fields){const n=input[f];if(f==='advance_renewal'&&n===null){out[f]=null;continue;}if(!Number.isInteger(n)||n<0||n>3650)throw new HttpError(400,'Os prazos devem ser números inteiros de 0 a 3650 dias.');out[f]=n;}
    for(const [f,max,required] of [['termination',500,true],['reference',500,true],['notes',1000,false],['effective_from',10,false]]){
      if(typeof input[f]!=='string'||input[f].length>max||(required&&!input[f].trim()))throw new HttpError(400,'Preencha os campos obrigatórios e respeite o tamanho máximo.');out[f]=input[f].trim();
    }
    const date=out.effective_from;
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw new HttpError(400,'Data de vigência inválida.');
    return out;
  });
  return {clubs,version:body.version,change_note:body.change_note.trim()};
}
async function readJson(request){
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw new HttpError(415,'Envie os dados no formato JSON.');
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Dados ausentes.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new HttpError(413,'Conteúdo muito grande.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'Dados inválidos.');}
}
function serialize(row){return {version:row.version,clubs:JSON.parse(row.clubs_json),updated_at:row.updated_at,change_note:row.change_note};}
async function requireSession(request,env){
  const match=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'');
  if(!match||!env.ADMIN_PASSWORD_HASH)throw new HttpError(401,'Digite sua senha para editar.');
  const tokenHash=await digest(match[1]);
  const session=await env.DB.prepare('SELECT password_version,expires_at FROM sessions WHERE token_hash = ?').bind(tokenHash).first();
  if(!session||session.expires_at<=nowSeconds()||session.password_version!==await digest(env.ADMIN_PASSWORD_HASH))throw new HttpError(401,'Seu acesso expirou. Digite a senha novamente.');
  return tokenHash;
}
async function handle(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/rules'&&method==='GET'){
    const row=await env.DB.prepare('SELECT version,clubs_json,updated_at,change_note FROM rules WHERE id=1').first();
    if(!row)throw new HttpError(503,'Regras iniciais ainda não cadastradas.');return serialize(row);
  }
  if(path==='/api/login'&&method==='POST'){
    const now=nowSeconds(),window=Math.floor(now/900),ip=request.headers.get('CF-Connecting-IP')||'unknown';
    const key=await digest(ip+':'+window);
    const attempt=await env.DB.prepare('INSERT INTO login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,(window+1)*900).first();
    if(attempt.attempts>10)throw new HttpError(429,'Muitas tentativas. Aguarde até 15 minutos e tente novamente.');
    await env.DB.batch([env.DB.prepare('DELETE FROM login_attempts WHERE expires_at <= ?').bind(now),env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now)]);
    const body=await readJson(request);
    if(typeof body.password!=='string'||body.password.length<1||body.password.length>256)throw new HttpError(401,'Senha incorreta.');
    if(!await checkPassword(body.password,env.ADMIN_PASSWORD_HASH))throw new HttpError(401,'Senha incorreta.');
    const token=hex(crypto.getRandomValues(new Uint8Array(32))),expires=now+3600;
    await env.DB.prepare('INSERT INTO sessions(token_hash,password_version,expires_at) VALUES(?,?,?)').bind(await digest(token),await digest(env.ADMIN_PASSWORD_HASH),expires).run();
    return {token,expires_at:expires};
  }
  if(path==='/api/logout'&&method==='POST'){
    const tokenHash=await requireSession(request,env);await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(tokenHash).run();return {ok:true};
  }
  if(path==='/api/history'&&method==='GET'){
    await requireSession(request,env);const {results}=await env.DB.prepare('SELECT version,clubs_json,updated_at,change_note FROM rules_history ORDER BY version DESC LIMIT 30').all();return {versions:results.map(serialize)};
  }
  if(path==='/api/rules'&&method==='PUT'){
    await requireSession(request,env);const body=validateBody(await readJson(request));
    const row=await env.DB.prepare('UPDATE rules SET clubs_json=?,version=version+1,updated_at=?,change_note=? WHERE id=1 AND version=? RETURNING version,clubs_json,updated_at,change_note').bind(JSON.stringify(body.clubs),new Date().toISOString(),body.change_note,body.version).first();
    if(!row)throw new HttpError(409,'Já existe uma versão mais recente. Atualize a consulta antes de salvar.');return serialize(row);
  }
  throw new HttpError(404,'Endereço não encontrado.');
}
export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin');
    const allowed=String(env.ALLOWED_ORIGIN||'');
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    function response(data,status=200){return new Response(JSON.stringify(data),{status,headers});}
    try{
      if(!/^https:\/\/[^/]+$/.test(allowed))throw new HttpError(503,'Origem da página ainda não configurada.');
      if(origin===allowed)headers['Access-Control-Allow-Origin']=allowed;
      else if(origin||request.method!=='GET')throw new HttpError(403,'Origem não permitida.');
      if(new URL(request.url).protocol!=='https:')throw new HttpError(403,'Use uma conexão HTTPS.');
      if(request.method==='OPTIONS'){
        headers['Access-Control-Allow-Methods']='GET, POST, PUT, OPTIONS';headers['Access-Control-Allow-Headers']='Content-Type, Authorization';headers['Access-Control-Max-Age']='600';return new Response(null,{status:204,headers});
      }
      return response(await handle(request,env));
    }catch(error){return response({error:error instanceof HttpError?error.message:'Serviço indisponível. Não foi possível confirmar a operação.'},error instanceof HttpError?error.status:503);}
  }
};
