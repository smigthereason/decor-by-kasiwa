/** DBK123: Preserve the reused legacy category ID; create a distinct canonical category only when approved. */
import { createClient } from '@sanity/client';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim();
const dataset = (process.env.NEXT_PUBLIC_SANITY_DATASET || 'production').trim();
const token = process.env.SANITY_API_WRITE_TOKEN?.trim().replace(/^["']|["']$/g, '');
if (projectId !== 'g34n810u' || dataset !== 'production') {
  throw new Error('Unexpected Sanity project/dataset. No request sent.');
}
if (!token) throw new Error('SANITY_API_WRITE_TOKEN missing.');
const client = createClient({ projectId, dataset, token, apiVersion: '2026-08-27', useCdn: false, perspective: 'raw' });
const legacyId = 'dbk-category-bathroom-and-kitchen';
const candidateId = 'dbk-category-bathroom-kitchen-2026';
const desiredTitle = 'Bathroom & Kitchen';
const desiredSlug = 'bathroom-and-kitchen';
const norm = v => String(v ?? '').trim().toLowerCase();
const categories = await client.fetch(`*[_type == "category"]{_id,title,"slug":slug.current,active,showInNavigation}`);
const legacy = categories.find(c => c._id === legacyId) ?? null;
const candidate = categories.find(c => c._id === candidateId) ?? null;
const matching = categories.filter(c => norm(c.title) === norm(desiredTitle) || norm(c.slug) === desiredSlug);
const refCount = await client.fetch(`count(*[_type == "product" && (primaryCategory._ref == $legacyId || $legacyId in categories[]._ref)])`, {legacyId});
const sample = await client.fetch(`*[_type == "product" && (primaryCategory._ref == $legacyId || $legacyId in categories[]._ref)][0...12]{_id,name,"primaryCategoryId":primaryCategory._ref}`, {legacyId});
let action = 'CREATE_SEPARATE_CATEGORY_AFTER_APPROVAL';
if (!legacy) action = 'REVIEW_MISSING_LEGACY_ID';
if (matching.length > 0) action = matching.every(c => norm(c.title) === norm(desiredTitle) && norm(c.slug) === desiredSlug) ? 'DESIRED_CATEGORY_ALREADY_EXISTS' : 'STOP_CONFLICTING_NAME_OR_SLUG';
if (candidate && (norm(candidate.title) !== norm(desiredTitle) || norm(candidate.slug) !== desiredSlug)) action = 'STOP_CANDIDATE_ID_COLLISION';
const summary = {
  stage:'DBK123_CATEGORY_COLLISION_AUDIT', mode:process.argv.includes('--apply')?'APPLY':'PLAN', projectId, dataset,
  categoryCount:categories.length, legacyId, legacyRecord:legacy,
  newCategoryId:candidateId, matchingCategoryRecords:matching, action,
  productReferencesToLegacyId:refCount, sampleProducts:sample,
  changesExistingCategories:false, changesProductAssignments:false, stockAndPaymentsChanged:false,
};
console.log(JSON.stringify(summary,null,2));
if (!process.argv.includes('--apply')) process.exit(0);
if (action === 'DESIRED_CATEGORY_ALREADY_EXISTS') { console.log('Category exists; no write performed.'); process.exit(0); }
if (action !== 'CREATE_SEPARATE_CATEGORY_AFTER_APPROVAL') throw Error(`Refusing creation: ${action}`);
if (process.env.DBK123_CREATE_CATEGORY_APPROVED !== 'YES') throw Error('Set DBK123_CREATE_CATEGORY_APPROVED=YES after reviewing this plan.');
if (legacy?._id !== legacyId || norm(legacy.title) !== 'home & lifestyle' || norm(legacy.slug) !== 'home-lifestyle') {
  throw Error('Legacy category changed since diagnosis; stopping without write.');
}
await client.createIfNotExists({
  _id:candidateId, _type:'category', title:desiredTitle,
  slug:{_type:'slug',current:desiredSlug}, description:'Bathroom and kitchen products and accessories',
  displayOrder:100,showInNavigation:true,active:true,
});
const verified = await client.fetch(`*[_id == $id][0]{_id,title,"slug":slug.current,active,showInNavigation}`,{id:candidateId});
if (!verified || norm(verified.title) !== norm(desiredTitle) || norm(verified.slug) !== desiredSlug) throw Error('Created category did not verify; inspect Sanity.');
console.log(JSON.stringify({stage:'DBK123_CATEGORY_CREATED',category:verified,productReferencesStillPointToLegacyId:refCount,productAssignmentsChanged:false,stockChanged:false,paymentsChanged:false},null,2));
