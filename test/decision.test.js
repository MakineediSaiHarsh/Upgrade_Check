import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, compare, safeModelOutput, SYSTEM_PROMPT } from '../lib/decision.js';
import { POST } from '../api/check.js';
import { POST as POST_LABEL, parseLabel } from '../api/label.js';
import { GET as GET_STATS } from '../api/stats.js';
import { GET as GET_MODELS } from '../api/models.js';
import { geminiFailure } from '../lib/server.js';
import '../payback.js';

const base={oldModel:'Old fridge',newModel:'Preferred fridge',oldUnits:400,newUnits:120,newPrice:25000,tradeIn:0,rateLow:7,rateHigh:10,concern:''};

function mockDatabase(next, records = []) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'sb_secret_test';
  return async (url, options = {}) => {
    if (!String(url).includes('.supabase.co/rest/v1/')) return next(url, options);
    assert.equal(options.headers.apikey, 'sb_secret_test');
    assert.equal(options.headers.Authorization, undefined);
    if (String(url).includes('/gemini_calls')) {
      if (options.method === 'POST') {
        const row = { id: '00000000-0000-4000-8000-' + String(records.length + 1).padStart(12, '0'), ...JSON.parse(options.body) };
        records.push(row);
        return Response.json([{ id: row.id }]);
      }
      if (options.method === 'PATCH') {
        const row = records.find(r => url.endsWith('eq.' + r.id));
        Object.assign(row, JSON.parse(options.body));
        return new Response(null, { status: 204 });
      }
      if (options.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Content-Range': '0-0/' + records.length } });
    }
    return next(url, options);
  };
}

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
  assert.match(SYSTEM_PROMPT,/source of proxy/);
  assert.equal(parseInput({...base,oldSource:'proxy'}).oldSource,'proxy');
  assert.throws(()=>safeModelOutput(JSON.stringify({summary:'UpgradeCheck is officially BEE certified.',caveat:'x',next_step:'x'})),/unsupported/);
  assert.doesNotThrow(()=>safeModelOutput(JSON.stringify({summary:'This is a label scenario.',caveat:'UpgradeCheck is not BEE endorsed.',next_step:'Check your label.'})));
});

test('AI route records one call with measured tokens and keeps secrets server-side',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.GEMINI_API_KEY='test-secret';
  const calls=[];
  const records=[];
  globalThis.fetch=mockDatabase(async(url,options)=>{
    calls.push({url,options});
    if(url.includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({summary:'The selected labels imply savings.',caveat:'Actual home use may differ.',next_step:'Confirm both labels.'})}]}}],usageMetadata:{promptTokenCount:92,candidatesTokenCount:38}});
    throw new Error(`Unexpected URL: ${url}`);
  },records);
  const response=await POST(new Request('https://example.vercel.app/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(base)}));
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.figures.annualUnitsSaved,280);
  assert.equal(calls.length,1);
  assert.equal(records.length,1);
  assert.equal(records[0].status,'success');
  assert.equal(records[0].feature,'result_explanation');
  assert.equal(records[0].input_tokens,92);
  assert.equal(records[0].output_tokens,38);
  assert.equal((await (await GET_STATS()).json()).recordedCalls,1);
  assert.match(calls[0].url,/models\/gemini-3\.5-flash-lite:generateContent/);
  assert.equal(calls[0].options.headers['x-goog-api-key'],'test-secret');
  const payload=JSON.parse(calls[0].options.body);
  assert.deepEqual(payload.generationConfig.thinkingConfig,{thinkingLevel:'minimal'});
  assert.deepEqual(JSON.parse(payload.contents[0].parts[0].text).currentFridge,{name:'Old fridge',type:'other',capacityLitres:null,source:'unknown'});
});

test('missing Gemini configuration prevents an external call',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  delete process.env.GEMINI_API_KEY;
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(false);};
  const response=await POST(new Request('https://example.vercel.app/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(base)}));
  assert.equal(response.status,503);assert.equal(calls,0);
  process.env.GEMINI_API_KEY='"quoted-test-key"';
  const quoted=await POST(new Request('https://example.vercel.app/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(base)}));
  assert.equal(quoted.status,503);
  assert.match((await quoted.json()).error,/without quotation marks/);
  assert.equal(calls,0);
});

test('label reading logs metadata and extracted details without photo bytes',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.GEMINI_API_KEY='test-secret';
  const calls=[];
  const records=[];
  globalThis.fetch=mockDatabase(async(url,options)=>{
    calls.push({url,options});
    if(url.includes('generativelanguage'))return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({brand:'LG',model:'GLD235',type:'direct_cool',capacity:'224',annualUnits:'118'})}]}}],usageMetadata:{promptTokenCount:300,candidatesTokenCount:40}});
    throw new Error('Unexpected '+url);
  },records);
  const photo=Buffer.from('test-photo').toString('base64');
  const response=await POST_LABEL(new Request('https://example.vercel.app/api/label',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mime:'image/png',side:'old',image:photo})}));
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.details.annualUnits,118);
  assert.equal(data.details.type,'direct_cool');
  assert.equal(calls.length,1);
  assert.equal(records[0].status,'success');
  assert.equal(records[0].feature,'photo_identification');
  assert.equal(records[0].input_tokens,300);
  assert.equal(records[0].response_summary.details.annualUnits,118);
  assert.doesNotMatch(JSON.stringify(records[0]),/dGVzdC1waG90bw==/);
  assert.match(calls[0].url,/models\/gemini-3\.5-flash-lite:generateContent/);
  assert.equal(calls[0].options.headers['x-goog-api-key'],'test-secret');
  assert.deepEqual(JSON.parse(calls[0].options.body).generationConfig.thinkingConfig,{thinkingLevel:'minimal'});
  assert.equal(parseLabel(JSON.stringify({brand:'',model:'',type:'',capacity:'',annualUnits:'5 stars'})).annualUnits,null);
  assert.deepEqual(parseLabel(JSON.stringify({brand:'LG',model:'',type:'direct_cool',capacity:'',annualUnits:''})),
    {brand:'LG',model:'',type:'direct_cool',capacity:null,annualUnits:null});
  assert.match(JSON.parse(calls[0].options.body).systemInstruction.parts[0].text,/model number must be legible in the photo, never inferred from exterior design/i);
});

test('photo route returns visible details without inventing a model from catalogue text',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.GEMINI_API_KEY='test-secret';
  let payload;
  globalThis.fetch=mockDatabase(async(url,options)=>{
    assert.match(url,/generativelanguage/);
    payload=JSON.parse(options.body);
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({
      brand:'LG',model:'',type:'direct_cool',capacity:'',annualUnits:''
    })}]}}]});
  });
  const response=await POST_LABEL(new Request('https://example.vercel.app/api/label',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mime:'image/png',side:'old',image:Buffer.from('test-photo').toString('base64')})}));
  const data=await response.json();
  assert.equal(response.status,200);
  assert.equal(data.details.annualUnits,null);
  assert.equal(data.details.model,'');
  assert.equal(data.suggestion,undefined);
  assert.doesNotMatch(payload.contents[0].parts[0].text,/GLD235/);
});

test('Gemini key and quota failures are distinguishable from an unreadable photo',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.GEMINI_API_KEY='test-secret';
  const request=(candidates=[])=>new Request('https://example.vercel.app/api/label',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mime:'image/png',side:'old',image:Buffer.from('test-photo').toString('base64'),candidates})});
  globalThis.fetch=mockDatabase(async()=>new Response(null,{status:403}));
  const invalid=await POST_LABEL(request());
  assert.equal(invalid.status,503);
  assert.match((await invalid.json()).error,/denied Gemini API access.*403/);
  globalThis.fetch=mockDatabase(async()=>new Response(null,{status:404}));
  const unavailable=await POST_LABEL(request());
  assert.equal(unavailable.status,503);
  assert.match((await unavailable.json()).error,/model is not available.*404/);
  const checkUnavailable=await POST(new Request('https://example.vercel.app/api/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(base)}));
  assert.equal(checkUnavailable.status,503);
  assert.match((await checkUnavailable.json()).error,/model is not available.*404/);
  globalThis.fetch=mockDatabase(async()=>new Response(null,{status:429}));
  const quota=await POST_LABEL(request());
  assert.equal(quota.status,429);
  assert.match((await quota.json()).error,/quota/);
  globalThis.fetch=mockDatabase(async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({
    brand:'',model:'',type:'',capacity:'',annualUnits:'',candidateIndex:0
  })}]}}]}));
  const noClues=await POST_LABEL(request([{brand:'LG',model:'GLD235',type:'direct_cool'}]));
  assert.equal(noClues.status,422);
  assert.match((await noClues.json()).error,/did not show a recognizable/);
});

test('Gemini permission errors report a safe cause without returning upstream text',async()=>{
  const upstream=message=>Response.json({error:{message,code:403,status:'PERMISSION_DENIED'}},{status:403});
  const leaked=await geminiFailure(upstream('Your API key was reported as leaked. Secret: DO_NOT_ECHO'));
  assert.match(leaked.error,/blocked.*leaked/);
  assert.doesNotMatch(leaked.error,/DO_NOT_ECHO/);
  const project=await geminiFailure(upstream('Your project has been denied access. Please contact support.'));
  assert.match(project.error,/denied this project access/);
  const restricted=await geminiFailure(upstream('Requests from referer <empty> are blocked.'));
  assert.match(restricted.error,/application restrictions.*Vercel/);
  const invalid=await geminiFailure(upstream('A 403 without a recognized reason.'));
  assert.match(invalid.error,/key or project/);
  const unrestricted=await geminiFailure(upstream('Unrestricted standard key is not permitted.'));
  assert.match(unrestricted.error,/unrestricted standard key/);
});

test('model proxy restricts query and never returns the database key',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY='sb_secret_test';
  let calledUrl;
  globalThis.fetch=async(url,options)=>{
    calledUrl=new URL(url);
    assert.equal(options.headers.apikey,'sb_secret_test');
    return Response.json([{brand:'LG',model_number:'GLD235',fridge_type:'Direct Cool',annual_kwh:118}]);
  };
  const invalid=await GET_MODELS(new Request('https://site.test/api/models?type=other'));
  assert.equal(invalid.status,400);
  const valid=await GET_MODELS(new Request('https://site.test/api/models?type=direct_cool&brand=LG&model=GLD235'));
  assert.equal(valid.status,200);
  assert.equal((await valid.json())[0].model_number,'GLD235');
  assert.equal(calledUrl.searchParams.get('limit'),'60');
  assert.equal(calledUrl.searchParams.get('brand'),'ilike.*LG*');
});

test('Gemini is not called if the database cannot create its audit row',async t=>{
  const oldFetch=globalThis.fetch;const oldEnv={...process.env};
  t.after(()=>{globalThis.fetch=oldFetch;process.env=oldEnv;});
  process.env.GEMINI_API_KEY='test-secret';
  process.env.SUPABASE_URL='https://example.supabase.co';
  process.env.SUPABASE_SERVICE_KEY='sb_secret_test';
  let calls=0;
  globalThis.fetch=async url=>{calls++;assert.match(url,/supabase\.co/);return new Response(null,{status:503});};
  const response=await POST(new Request('https://site.test/api/check',{method:'POST',body:JSON.stringify(base)}));
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/AI logging is unavailable/);
  assert.equal(calls,1);
});
