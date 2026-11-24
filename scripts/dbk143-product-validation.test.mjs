import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dbk143ProductCreatePreflight as validate } from '../lib/products/dbk143-product-create-validation.ts';

const request = (changes = {}) => ({retailPrice:1500, wholesalePrice:'1200', wholesaleMinQuantity:'2',requiresInventoryLocation:true,storeLocationId:'store.main',...changes});

test('1500 retail and 1200 wholesale with threshold 2 can proceed',()=>{
  assert.equal(validate(request()),null);
});
test('minimum wholesale quantity cannot be omitted silently',()=>{
  assert.deepEqual(validate(request({wholesaleMinQuantity:''})),{
    field:'wholesaleMinQuantity',message:'Enter the minimum wholesale quantity (2 or more) when you set a wholesale price.'
  });
});
test('wholesale fields can both be empty for retail-only products',()=>{
  assert.equal(validate(request({wholesalePrice:'',wholesaleMinQuantity:''})),null);
});
test('a threshold without a wholesale price is rejected',()=>{
  assert.equal(validate(request({wholesalePrice:''}))?.field,'wholesalePrice');
});
test('wholesale price must be below retail; minimum must be an integer >= 2',()=>{
  assert.equal(validate(request({wholesalePrice:'1600'}))?.field,'wholesalePrice');
  for(const wholesaleMinQuantity of ['1','1.5','foo']) {
    assert.equal(validate(request({wholesaleMinQuantity}))?.field,'wholesaleMinQuantity');
  }
});
test('an inventory-authoritative new product must choose a store',()=>{
  assert.equal(validate(request({storeLocationId:''}))?.field,'storeLocationId');
  assert.equal(validate(request({storeLocationId:'',requiresInventoryLocation:false})),null);
});
test('client provides actionable messages, while API logs validation codes',()=>{
  const client=readFileSync(new URL('../components/backoffice/ProductCreatePage.tsx',import.meta.url),'utf8');
  const server=readFileSync(new URL('../app/api/backoffice/products/route.ts',import.meta.url),'utf8');
  assert.match(client,/dbk143ProductCreatePreflight/);
  assert.match(client,/response\.status === 400/);
  assert.match(client,/console\.warn\('\[Product save rejected\]'/);
  assert.match(server,/DBK143_WHOLESALE_MINIMUM/);
  assert.match(server,/DBK143_LOCATION_REQUIRED/);
  assert.match(server,/\[DBK product create validation\]/);
});
