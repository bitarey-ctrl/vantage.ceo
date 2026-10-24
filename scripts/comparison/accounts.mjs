import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
const { createServerClient } = createRequire(import.meta.url)('@supabase/ssr');
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!url?.includes('odahuetnflsqkligzwpm'))throw new Error('Unexpected backend');
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const fixtureFile=process.env.COMPARISON_QA_FIXTURES||'/tmp/vantage-comparison-fixtures.json';
if(process.argv[2]==='setup'){
 if(process.env.COMPARISON_AUTHORIZE_QA!=='true')throw new Error('Set COMPARISON_AUTHORIZE_QA=true only for an authorized QA run.');
 const records=[];
 for(const label of ['A','B']){
  const email='comparison-'+label.toLowerCase()+'-'+Date.now()+'@vantage.invalid',password=randomBytes(28).toString('base64url');
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;
  const id=data.user.id;records.push({id,email,password,label});writeFileSync(fixtureFile,JSON.stringify(records),{mode:0o600});
  const p=await admin.from('profiles').upsert({id,email,full_name:'Comparison QA '+label,company_name:'Comparison QA '+label,industry:'SaaS',onboarding_completed:true,plan:'pro'});if(p.error)throw p.error;
  const c=await admin.from('ceo_context').upsert({profile_id:id,product_description:'Synthetic workspace for verifying the comparison design. Not a real company.',target_customer:'Synthetic evaluation',additional_context:'Temporary QA account; no customer records.'},{onConflict:'profile_id'});if(c.error)throw c.error;
 }
 console.log('Created two temporary QA accounts; credentials retained only in a private temporary file.');
}else if(process.argv[2]==='read-check'){
 const base=process.argv[3]||'http://127.0.0.1:8890';const anonymous=await fetch(base+'/test',{redirect:'manual'});if(anonymous.status!==307||!anonymous.headers.get('location')?.includes('/login'))throw new Error('Anonymous route was not protected');
 const unauth=await fetch(base+'/api/test/workspace');if(unauth.status!==401)throw new Error('Anonymous API was not protected');
 const records=JSON.parse(readFileSync(fixtureFile,'utf8'));
 for(const row of records){let jar=[];const sb=createServerClient(url,key,{cookies:{getAll:()=>jar,setAll:items=>{for(const item of items){jar=jar.filter(x=>x.name!==item.name);jar.push(item);}}}});const login=await sb.auth.signInWithPassword({email:row.email,password:row.password});if(login.error)throw login.error;const cookie=jar.map(x=>x.name+'='+encodeURIComponent(x.value)).join('; ');const page=await fetch(base+'/test',{headers:{cookie}});if(page.status!==200)throw new Error('Authenticated route failed');const response=await fetch(base+'/api/test/workspace',{headers:{cookie}}),body=await response.json();if(response.status!==200||body.userId!==row.id||body.profile.company_name!=='Comparison QA '+row.label)throw new Error('Account data isolation failed');if(body.errors&&Object.keys(body.errors).length)throw new Error('Workspace section failed: '+JSON.stringify(body.errors));row.cookie=cookie;}
 writeFileSync(fixtureFile,JSON.stringify(records),{mode:0o600});console.log('PASS: logged-out protection; both existing-account logins; authenticated /test; account-specific profile and workspace reads.');
}else if(process.argv[2]==='cleanup'){
 for(const row of JSON.parse(readFileSync(fixtureFile,'utf8'))){if(row.signalId){const signal=await admin.from('signals').delete().eq('id',row.signalId).like('title','QA fixture:%');if(signal.error)throw signal.error;}const {error}=await admin.auth.admin.deleteUser(row.id);if(error)throw error;}console.log('Removed the two task-created QA accounts.');
}
