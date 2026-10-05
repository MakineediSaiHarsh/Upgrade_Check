import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, compare, safeModelOutput, SYSTEM_PROMPT } from '../lib/decision.js';
import { POST } from '../api/check.js';
import { POST as POST_LABEL, parseLabel } from '../api/label.js';
import '../payback.js';

const base={oldModel:'Old fridge',newModel:'Preferred fridge',oldUnits:400,newUnits:120,newPrice:25000,tradeIn:0,rateLow:7,rateHigh:10,concern:''};

test('the selected fridges produce a payback range from energy savings and price',()=>{
  const result=compare(parseInput(base));
  assert.equal(result.annualUnitsSaved,280);
  assert.deepEqual(result.annualRupeesSaved,[1960,2800]);
  assert.ok(Math.abs(result.paybackYears[0]-25000/2800)<1e-10);
  assert.ok(Math.abs(result.paybackYears[1]-25000/1960)<1e-10);
  assert.equal(result.status,'payback');
});

test('higher-use new fridge never claims electricity profit',()=>{
  const result=compare(parseInput({...base,oldUnits:220,newUnits:310}));
  assert.equal(result.annualUnitsSaved,-90);
  assert.deepEqual(result.annualRupeesSaved,[-900,-630]);
  assert.equal(result.paybackYears,null);
  assert.equal(result.status,'no_electricity_payback');
});

test('missing label or purchase price gives a partial result, not invented payback',()=>{
  assert.equal(compare(parseInput({...base,oldUnits:null})).status,'missing_energy');
  const noPrice=compare(parseInput({...base,newPrice:null}));
  assert.equal(noPrice.status,'missing_price');
  assert.deepEqual(noPrice.annualRupeesSaved,[1960,2800]);
  assert.equal(noPrice.paybackYears,null);
  assert.equal(compare(parseInput({...base,tradeIn:5000})).netPurchaseCost,20000);
  const threshold=compare(parseInput({...base,oldUnits:null}));
  assert.deepEqual(threshold.fiveYearOldUnits,[620,120+25000/35]);
  assert.equal(compare(parseInput({...base,currentUsable:false})).status,'replacement_required');
  assert.equal(compare(parseInput({...base,currentUsable:false})).paybackYears,null);
});

test('the browser calculation and server calculation agree for representative cases',()=>{
  for(const scenario of [base,{...base,oldUnits:220,newUnits:310},{...base,oldUnits:null},{...base,newPrice:null},{...base,tradeIn:5000}]){
    const input=parseInput(scenario);
    const server=compare(input);
    const browser=globalThis.UpgradePayback.compare(input);
    for(const key of ['netPurchaseCost','annualUnitsSaved','annualRupeesSaved','paybackYears','fiveYearOldUnits','status']) assert.deepEqual(browser[key],server[key],key);
  }
});

test('input validation and model output guardrails reject unsupported claims',()=>{
  assert.throws(()=>parseInput({...base,oldUnits:'400'}),/Check/);
  assert.throws(()=>parseInput({...base,newPrice:10000,tradeIn:20000}),/Check/);
  assert.match(SYSTEM_PROMPT,/explicitly refuse/);
  assert.throws(()=>safeModelOutput(JSON.stringify({summary:'UpgradeCheck is officially BEE certified.',caveat:'x',next_step:'x'})),/unsupported/);
  assert.doesNotThrow(()=>safeModelOutput(JSON.stringify({summary:'This is a label scenario.',caveat:'UpgradeCheck is not BEE endorsed.',next_step:'Check your label.'})));
});

test('AI route logs model input and output while leaving the local calculator independent',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.GEMINI_API_KEY='test-secret';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY='test-db-secret';
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/rpc/claim_upgradecheck'))return Response.json(true);
    if(url.includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({summary:'The selected labels imply savings.',caveat:'Actual home use may differ.',next_step:'Confirm both labels.'})}]}}],usageMetadata:{promptTokenCount:92,candidatesTokenCount:38}});
    if(url.endsWith('/upgrade_checks'))return new Response(null,{status:201});
    if(url.includes('select=id'))return new Response(null,{status:200,headers:{'content-range':'0-0/5'}});
    throw new Error(`Unexpected URL: ${url}`);
  };
  const response=await POST(new Request('https://example.vercel.app/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(base)}));
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.figures.annualUnitsSaved,280);
  assert.equal(data.total,5);
  assert.equal(calls.length,4);
  const payload=JSON.parse(calls[1].options.body);
  assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text).currentFridge,{name:'Old fridge',type:'other',capacityLitres:null,source:'unknown'});
  assert.equal(JSON.parse(calls[2].options.body).output_tokens,38);
});

test('quota rejection prevents Gemini call',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.GEMINI_API_KEY='test';process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_KEY='test';
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(false);};
  const response=await POST(new Request('https://example.vercel.app/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(base)}));
  assert.equal(response.status,429);assert.equal(calls,1);
});

test('label reading returns reviewable fields without storing image bytes',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.GEMINI_API_KEY='test-secret';process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_KEY='test-db-secret';
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/rpc/claim_upgradecheck'))return Response.json(true);
    if(url.includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({brand:'LG',model:'GLD235',type:'direct_cool',capacity:'224',annualUnits:'118'})}]}}],usageMetadata:{promptTokenCount:300,candidatesTokenCount:40}});
    if(url.endsWith('/upgrade_checks'))return new Response(null,{status:201});
    if(url.includes('select=id'))return new Response(null,{status:200,headers:{'content-range':'0-0/7'}});
    throw new Error('Unexpected '+url);
  };
  const photo=Buffer.from('test-photo').toString('base64');
  const response=await POST_LABEL(new Request('https://example.vercel.app/api/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mime:'image/png',side:'old',image:photo})}));
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.details.annualUnits,118);
  assert.equal(data.details.type,'direct_cool');
  const saved=JSON.parse(calls[2].options.body);
  assert.equal(saved.input.task,'label_extract');
  assert.equal(saved.input.image_bytes,10);
  assert.equal(JSON.stringify(saved).includes(photo),false);
  assert.equal(parseLabel(JSON.stringify({brand:'',model:'',type:'',capacity:'',annualUnits:'5 stars'})).annualUnits,null);
});
