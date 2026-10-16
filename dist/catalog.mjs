import {buildLessons} from './lessons.mjs';
import {buildCoreSimulations} from './simulations.mjs';
import {buildAdvancedSimulations} from './advanced.mjs';
import {buildStructureSimulations} from './structures.mjs';
import {buildSystemSimulations} from './systems.mjs';
import {buildRushSimulations} from './rushes.mjs';
import {treeLevel} from './tree-level.mjs';
import {buildExtraSimulations} from './extras.mjs';
export const groups=[['00-tutorial','00 · Tutorial'],['01-shell','01 · Shell'],['02-imperative-programming','02 · Imperative programming'],['03-memory-management','03 · Memory management'],['04-data-structures','04 · Data structures'],['05-compilation-and-preprocessing','05 · Compilation & preprocessing'],['06-system-interface','06 · System interface'],['07-dynamic-data-structures','07 · Dynamic data structures'],['rushes','Rushes']];
export function buildCatalog(){const catalog=[...buildLessons().map(s=>({...s,kind:'c',conceptOnly:true,args:[],fixtureFiles:{},steps:s.steps.map(f=>({...f,calls:f.scope&&f.scope!=='main'?['main',f.scope]:['main'],world:null}))})),...buildCoreSimulations(),...buildAdvancedSimulations(),...buildStructureSimulations(),...buildSystemSimulations(),...buildRushSimulations(),...buildExtraSimulations(),treeLevel()];
 for(const s of catalog)for(const f of s.steps){
  if(f.scope!=='main'&&f.calls.length>1&&s.code[f.line-1]?.trim().startsWith('return')){
   const leaving=f.scope; for(const [id,c]of Object.entries(f.cells))if(c.scope===leaving)delete f.cells[id];
   f.calls=f.calls.slice(0,-1);f.scope=f.calls.at(-1)||'main';f.what+=' This call’s automatic local objects leave scope now.';
  }
 }
 return catalog;}
