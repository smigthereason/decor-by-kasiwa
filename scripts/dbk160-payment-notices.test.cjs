const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const ref='DBKWA123ABCD',wa='254700000000';
function harness({paid=true,verified=true,busy=false,window=true,uncertain=false}={}){
 let attempt=false,locked=busy,sends=0;const queries=[];const sql=async(strings,...values)=>{const q=strings.join('?');queries.push(q);
 if(q.includes('SELECT o.reference'))return paid&&verified&&window&&!locked&&!attempt?[{reference:ref}]:[];
 if(q.includes('SELECT o.wa_id'))return paid&&verified&&!attempt?[{wa_id:wa,amount_kes:30}]:[];
 if(q.includes('WITH locked AS')){if(locked||attempt||!window)return [];locked=true;attempt=true;return [{request_id:'payment:'+ref}];}
 if(q.includes('SET reply_lock=NULL')){locked=false;return [];}
 throw Error('Unexpected SQL '+q);};
 const m={exports:{}};const code=ts.transpileModule(fs.readFileSync('lib/whatsapp/dbk160-payment-notices.ts','utf8'),{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});assert.equal(code.diagnostics.length,0);
 const req=k=>k==='server-only'?{}:k==='@neondatabase/serverless'?{neon:()=>sql}:k==='./dbk36-production-messages'?{deliverRecordedWhatsApp:async(w,id,text)=>{assert.equal(w,wa);assert.equal(id,'payment:'+ref);assert.match(text,/verified your M-PESA payment of KES 30/);assert.match(text,/confirm when your order is ready/);assert.match(text,/don't pay again/);sends++;if(uncertain)throw Error('unknown');}}:require(k);
 new Function('require','module','exports',code.outputText)(req,m,m.exports);return {api:m.exports,queries,get sends(){return sends;},get locked(){return locked;},release(){locked=false;}};
}
test('only independently verified paid orders qualify; no success message for failed orders',async()=>{for(const o of [{paid:false},{verified:false}]){const h=harness(o);await h.api.notifyVerifiedPayment(ref);await h.api.recoverVerifiedPaymentNotices();assert.equal(h.sends,0);}const h=harness();await h.api.notifyVerifiedPayment(ref);assert.equal(h.sends,1);assert.ok(h.queries.some(q=>q.includes("verification_mode='daraja_api_verified'")&&q.includes("o.status='paid'")));});
test('concurrent callbacks and recovery only attempt one notification',async()=>{const h=harness();await Promise.all([h.api.notifyVerifiedPayment(ref),h.api.notifyVerifiedPayment(ref)]);await h.api.recoverVerifiedPaymentNotices();assert.equal(h.sends,1);assert.equal(h.locked,false);});
test('defer to existing conversation lock; recover after it releases',async()=>{const h=harness({busy:true});await h.api.notifyVerifiedPayment(ref);assert.equal(h.sends,0);h.release();await h.api.recoverVerifiedPaymentNotices();assert.equal(h.sends,1);});
test('uncertain delivery is not retried; closed service window is not sent to',async()=>{const h=harness({uncertain:true});await h.api.notifyVerifiedPayment(ref);await h.api.recoverVerifiedPaymentNotices();assert.equal(h.sends,1);assert.equal(h.locked,false);const closed=harness({window:false});await closed.api.notifyVerifiedPayment(ref);assert.equal(closed.sends,0);});
