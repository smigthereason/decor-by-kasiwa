import {NextRequest,NextResponse} from 'next/server';
import {getApiStaff} from '@/lib/auth/api-authorization';
import {knowledgeHistory,publishKnowledge,answerKnowledge} from '@/lib/whatsapp/dbk155-knowledge';
import {defaultKnowledge,validKnowledge} from '@/lib/whatsapp/dbk155-sales-core';
export const runtime='nodejs';export const dynamic='force-dynamic';
const out=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
export async function GET(){try{const staff=await getApiStaff(['ADMIN']);if(!staff.ok)return out({error:'ACCESS_DENIED'},staff.status);
 const history=await knowledgeHistory();return out({content:history[0]?.content||defaultKnowledge,history:history.map(r=>({version:r.version,createdAt:r.created_at}))});}catch{return out({error:'KNOWLEDGE_UNAVAILABLE'},503);}}
export async function POST(req:NextRequest){try{const staff=await getApiStaff(['ADMIN']);if(!staff.ok)return out({error:'ACCESS_DENIED'},staff.status);
 if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return out({error:'ORIGIN_DENIED'},403);
 const raw=await req.text();if(raw.length>35000)return out({error:'TOO_LARGE'},413);let content:unknown;try{content=JSON.parse(raw);}catch{return out({error:'INVALID_JSON'},400);}
 if(content&&typeof content==='object'&&'publishedQuestion' in content){
   if(typeof content.publishedQuestion!=='string'||!content.publishedQuestion.trim()||content.publishedQuestion.length>400)return out({error:'INVALID_PREVIEW'},400);
   const history=await knowledgeHistory();const latest=history[0];
   if(!latest||!validKnowledge(latest.content))return out({error:'NO_VALID_PUBLISHED_KNOWLEDGE'},409);
   const answer=await answerKnowledge(content.publishedQuestion,latest.content);return answer?out({answer,version:latest.version}):out({error:'PREVIEW_UNAVAILABLE'},503);
 }
 if(content&&typeof content==='object'&&'previewQuestion' in content&&'draft' in content){
   if(typeof content.previewQuestion!=='string'||!content.previewQuestion.trim()||content.previewQuestion.length>400||!validKnowledge(content.draft))return out({error:'INVALID_PREVIEW'},400);
   const answer=await answerKnowledge(content.previewQuestion,content.draft);return answer?out({answer}):out({error:'PREVIEW_UNAVAILABLE'},503);
 }
 if(!validKnowledge(content))return out({error:'INVALID_KNOWLEDGE'},400);return out({version:await publishKnowledge(content,staff.customerId)});
 }catch{return out({error:'PUBLISH_FAILED'},503);}}
