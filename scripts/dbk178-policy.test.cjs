const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.equal(out.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);new Function('require','module','exports',out.outputText)(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);return m.exports;}
const policy=load(path.join(root,'lib/whatsapp/dbk178-policy.ts')),intent=load(path.join(root,'lib/whatsapp/dbk165-checkout-intent.ts')),core=load(path.join(root,'lib/whatsapp/dbk36-production-core.ts'));
const expected={"Baringo": 300, "Bomet": 300, "Bungoma": 350, "Busia": 350, "Elgeyo-Marakwet": 300, "Embu": 250, "Garissa": 600, "Homa Bay": 350, "Isiolo": 300, "Kajiado": 250, "Kakamega": 300, "Kericho": 300, "Kiambu": 150, "Kilifi": 350, "Kirinyaga": 250, "Kisii": 300, "Kisumu": 350, "Kitui": 300, "Kwale": 350, "Laikipia": 300, "Lamu": 350, "Machakos": 200, "Makueni": 300, "Mandera": 600, "Marsabit": 300, "Meru": 250, "Migori": 350, "Mombasa": 350, "Murang'a": 250, "Nairobi": 150, "Nakuru": 250, "Nandi": 300, "Narok": 250, "Nyamira": 300, "Nyandarua": 250, "Nyeri": 250, "Samburu": 350, "Siaya": 350, "Taita-Taveta": 350, "Tana River": 300, "Tharaka-Nithi": 250, "Trans Nzoia": 350, "Turkana": 300, "Uasin Gishu": 300, "Vihiga": 350, "Wajir": 600, "West Pokot": 300};
const published=Object.entries(expected).map(([county,fee],i)=>`${i+1}. ${county} = ${fee} Shillings${county==='Nairobi'?' (Can request for a rider and the rider to charge )':''}`).join('\n');
for(const [county,fee] of Object.entries(expected))test(`DBK178 published ${county} rate is KES ${fee}`,()=>assert.equal(policy.countyDeliveryFee(published,county),fee));
test('missing, malformed and contradictory county rates fail closed; a new published version changes the quote',()=>{
 assert.equal(policy.countyDeliveryFee('Machakos: staff quote required','Machakos'),null);
 assert.equal(policy.countyDeliveryFee('Machakos = 200\nMachakos = 250','Machakos'),null);
 assert.equal(policy.countyDeliveryFee('Tala = 200','Machakos'),null);
 assert.equal(policy.countyDeliveryFee('Machakos = 225','Machakos'),225);
 assert.equal(policy.countyDeliveryFee('Machakos = -200','Machakos'),null);
});
test('location aliases and contradictory county labels',()=>{
 assert.equal(intent.knownCounty('Tala'),'Machakos');assert.equal(intent.knownCounty('Tala,Machakos'),'Machakos');assert.equal(intent.knownCounty('Tala, Kiambu'),undefined);assert.equal(intent.knownCounty('Murang’a county'),'Muranga');assert.equal(intent.knownCounty('Thika'),undefined);assert.equal(intent.knownCounty('Thika, Kiambu'),'Kiambu');assert.equal(intent.knownCounty('Thika, Muranga'),'Muranga');
});
test('Kenyan local and international payment numbers, invalid and multi-number input',()=>{
 for(const input of ['0712345678','+254712345678','254712345678','0712 345 678'])assert.equal(policy.payerNumber(input),'254712345678');
 for(const input of ['0112345678','+254112345678','254112345678'])assert.equal(policy.payerNumber(input),'254112345678');
 for(const input of ['12345','07123456789','00712345678','0712345678 or 0112345678','+441234567890'])assert.equal(policy.payerNumber(input),null);
});
test('delivery timing comes from the published text',()=>{
 const input='Delivery takes 24hrs for all production items  after Payment is Confirmed\nFor all flowers delivery takes place within the same day';assert.equal(policy.deliveryTiming(input),input);assert.equal(policy.deliveryTiming('Not approved'),null);
});
test('alternate payer proof requires exact persisted payer; owner identity remains separate; legacy orders still verify',()=>{
 const owner='254700000000',payer='254112345678',order={wa_id:owner,payer_phone:payer,checkout_id:'checkout-test',merchant_id:'merchant-test',amount_kes:180};
 const cb={checkoutRequestId:'checkout-test',merchantRequestId:'merchant-test',resultCode:0,phone:payer,amount:180,receiptNumber:'RECEIPT123',transactionDate:'20261127180000'};const query={CheckoutRequestID:'checkout-test',MerchantRequestID:'merchant-test',ResultCode:0};
 assert.equal(core.matchedProviderProof(order,cb,query),true);assert.equal(core.matchedProviderProof(order,{...cb,phone:owner},query),false);assert.equal(core.matchedProviderProof(order,{...cb,amount:179},query),false);assert.equal(core.matchedProviderProof({...order,payer_phone:null},{...cb,phone:owner},query),true);
});
