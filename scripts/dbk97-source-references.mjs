#!/usr/bin/env node
// DBK-97 source reference inventory. Read-only. Identifies current Sanity
// direct inventoryMovement reads/writers; human must review before sale purge.
import { readdir, readFile } from 'node:fs/promises';
import { join,relative } from 'node:path';
const root=process.cwd();
const dirs=['app','lib','components','sanity','scripts'];
const skips=new Set(['node_modules','.git','.next','.open-next','dist','build','coverage']);
const entries=[];
async function scan(base) {
  let found=[];try{found=await readdir(base,{withFileTypes:true});}catch{return;}
  for(const dirent of found){if(skips.has(dirent.name)||dirent.name.startsWith('.env'))continue;
    const file=join(base,dirent.name);
    if(dirent.isDirectory())await scan(file);
    else if(dirent.isFile()&&/\.(mjs|js|jsx|ts|tsx)$/.test(dirent.name)){
      const s=await readFile(file,'utf8');
      const lines=s.split('\n');
      for(let i=0;i<lines.length;i++) if(/_type\s*==\s*["'`]inventoryMovement["'`]|\bSALE\b.*inventoryMovement|inventoryMovement.*\bSALE\b/.test(lines[i]))
        entries.push({file:relative(root,file),line:i+1,text:lines[i].trim().slice(0,180)});
    }
  }
}
for(const d of dirs) await scan(join(root,d));
console.log(JSON.stringify({mode:'READ_ONLY_SOURCE_REFERENCE_MAP',inventoryMovementDirectUses:entries},null,2));
