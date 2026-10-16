import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildCatalog,groups} from '../dist/catalog.mjs';
import {allChanges} from '../dist/trace.mjs';
import {helpTexts,moduleMarkup} from '../dist/course-ui.mjs';
import {mountApp} from '../dist/course-app.mjs';
const modules=JSON.parse(readFileSync(new URL('../dist/curriculum.json',import.meta.url),'utf8')),catalog=buildCatalog();
assert.equal(modules.length,22);assert.equal(new Set(catalog.map(s=>s.id)).size,catalog.length);assert.equal(groups.length,9);
let entries=0,operations=0,compiled=0;
for(const m of modules){assert.ok(groups.some(g=>g[0]===m.group));assert.ok(existsSync(new URL('../dist/sources/'+m.source,import.meta.url)));assert.ok(m.statedGoals.every(g=>g.text&&g.page>0));assert.ok(m.interpretation&&m.why);assert.equal(new Set(m.exercises.map(e=>e.id)).size,m.exercises.length);for(const e of m.exercises){entries++;assert.ok(e.goal&&e.connection&&e.observe);assert.ok(e.page>0);assert.ok(Array.isArray(e.requirements));assert.ok(e.simulations.length>0);for(const id of e.simulations)assert.ok(catalog.some(s=>s.id===id),`${m.slug}/${e.id} has simulation ${id}`);const markup=moduleMarkup(m,e,catalog);assert.ok(markup.includes('OUR INTERPRETATION'));assert.ok(markup.includes('EXPLICITLY STATED'));assert.ok(markup.includes(`${m.source}#page=${e.page}`));for(const key of [...markup.matchAll(/data-help="([^"]+)"/g)].map(m=>m[1]))assert.ok(helpTexts[key]);}}
assert.equal(entries,122);assert.deepEqual(modules.filter(m=>m.group==='03-memory-management').map(m=>m.slug),['00-c-pointers','01-c-simple-strings','02-c-memory-management','03-c-strings','04-c-system-interface']);

const tmp=mkdtempSync('/tmp/course-verified-');
try{for(const s of catalog){operations+=s.steps.length-1;if(s.kind==='c'){compiled++;writeFileSync(tmp+'/example.c',s.code.join('\n'));for(const [f,content]of Object.entries(s.fixtureFiles||{}))writeFileSync(tmp+'/'+f,content);execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-pedantic','example.c','-o','example'],{cwd:tmp});const out=execFileSync('./example',s.args||[],{cwd:tmp,encoding:'utf8'});if(s.id==='basic'){const lines=out.trim().split('\n');assert.deepEqual(lines.slice(0,2),['a = 7','*p = 7']);assert.equal(lines[2].split(' = ')[1],lines[3].split(' = ')[1]);assert.notEqual(lines[3].split(' = ')[1],lines[4].split(' = ')[1]);}else assert.equal(out,s.steps.at(-1).output,s.id+' output agrees with native C');}
 for(let i=0;i<s.steps.length;i++){const f=s.steps[i],prev=s.steps[Math.max(i-1,0)];assert.ok(f.line>=0&&f.line<=s.code.length,s.id+' source line exists');for(const key of ['title','what','observe','flow'])assert.ok(f[key]);assert.equal(new Set(Object.values(f.cells).map(c=>c.address)).size,Object.keys(f.cells).length,s.id+' objects have distinct addresses');for(const c of Object.values(f.cells))if(c.target){assert.ok(f.cells[c.target],s.id+' live target exists');assert.equal(c.value,f.cells[c.target].address);}for(const id of f.reads){const c=f.cells[id]||prev.cells[id];assert.ok(c,s.id+' read target exists before or after operation '+i+' '+id);assert.notEqual(c.value,undefined,s.id+' never reads an uninitialized '+id);}assert.ok(f.output.startsWith(prev.output));if(s.kind==='c'&&i&&f.output!==prev.output)assert.match(s.code[f.line-1],/printf|putchar|write/,'Only output calls add terminal text');assert.ok(Array.isArray(f.calls));}
 }}finally{rmSync(tmp,{recursive:true,force:true});}

// Semantic intermediate states and lifetimes.
const find=id=>catalog.find(s=>s.id===id);
const alloc=find('allocation'),freed=alloc.steps.find(f=>f.title==='Release the heap block');assert.ok(!freed.cells.heap0);assert.equal(freed.cells.p.value,'0x5000');assert.ok(freed.cells.p.invalid);assert.equal(alloc.steps.at(-1).cells.p.value,'NULL');
const io=find('file-read'),closed=io.steps.find(f=>f.title==='Close the descriptor');assert.equal(closed.cells.fd.value,3);assert.equal(closed.world.handles[0].status,'closed');assert.equal(closed.cells.b3.value,undefined);
assert.ok(find('backtracking').steps.some(f=>f.title==='Undo the unsuccessful trial'));assert.equal(find('tree-prefix').steps.at(-1).output,'2 1 3 \n');assert.equal(find('tree-infix').steps.at(-1).output,'1 2 3 \n');assert.equal(find('tree-suffix').steps.at(-1).output,'1 3 2 \n');assert.equal(find('tree-level').steps.at(-1).output,'2 1 3 \n');
const macro=find('preprocessor');assert.equal(macro.steps[1].calls.length,0);assert.equal(Object.keys(macro.steps[1].cells).length,0);assert.ok(!macro.steps.some(f=>f.calls.includes('ABS')));
const git=find('git');assert.equal(git.steps[3].world.work,'v2');assert.equal(git.steps[3].world.index,'v1');assert.equal(git.steps[4].world.commit,'v1');

// Instrumented DOM: actual shipped event handlers, no browser claims.
const nodes={};
class Element{
 constructor(id,tag='DIV'){this.id=id;this.tagName=tag;this.listeners={};this.attrs={};this.dataset={};this.style={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this._html='';this.scrollTop=0;this.clientHeight=400;}
 set innerHTML(s){this._html=s;parseElements(s);}
 get innerHTML(){return this._html;}
 setAttribute(k,v){this.attrs[k]=v;}
 getAttribute(k){return this.attrs[k];}
 addEventListener(k,fn){(this.listeners[k]||=[]).push(fn);}
 dispatch(k,event={}){for(const fn of [...(this.listeners[k]||[])])fn({target:this,preventDefault(){},stopPropagation(){},...event});}
 click(){if(!this.disabled)this.dispatch('click');}
 querySelector(){return null;}
 closest(selector){if(selector==='[data-help]'&&this.dataset.help)return this;return null;}
 getBoundingClientRect(){return {left:900,top:40,bottom:56,height:70};}
}
function parseElements(s){for(const m of s.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)){const el=new Element(m[2],m[1].toUpperCase());el.hidden=/\bhidden\b/.test(m[0]);nodes[m[2]]=el;}}
parseElements(readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
const doc=new Element('document');doc.getElementById=id=>nodes[id]||null;
const timers=new Map(),store=new Map([['pointerlab-notes',JSON.stringify({function:'An earlier pointer note'})]]);let timerID=0;
const win={innerWidth:1000,innerHeight:800,location:{hash:''},history:{replaceState(_,__,hash){win.location.hash=hash;}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setInterval:(fn,ms)=>{const id=++timerID;timers.set(id,{fn,ms});return id;},clearInterval:id=>timers.delete(id),addEventListener:()=>{}};
await mountApp(doc,win,modules);
const lab=()=>win.LearningLab;
function assertSync(){const l=lab(),f=l.frame;if(!f)return;assert.equal(nodes.what.textContent,f.what);assert.equal(nodes.observe.textContent,f.observe);assert.equal(nodes.flow.textContent,f.flow);assert.equal(nodes.terminal.textContent,f.output);assert.equal(Number(nodes.timeline.value),l.index);assert.equal(nodes.prev.disabled,l.index===0);assert.equal(nodes.next.disabled,l.index===l.simulation.steps.length-1);assert.equal(nodes.code.innerHTML.match(/class="code-line active"/g)?.length||0,f.line?1:0);for(const c of Object.values(f.cells))assert.ok(nodes.memory.innerHTML.includes(`data-cell="${c.id}"`));for(const c of l.diff.filter(c=>c.kind!=='removed'&&!['world','calls'].includes(c.id)))assert.match(nodes.memory.innerHTML,new RegExp(`class="cell written[^"\\n]*" data-cell="${c.id}"`));}
assert.ok(nodes.content.innerHTML.includes('Small steps.'));assert.ok(nodes.lessons.innerHTML.includes('Rushes'));
// All 122 entries render with working mapping, source, and concept selection.
for(const m of modules)for(const e of m.exercises){lab().selectModule(m.slug,e.id);assert.equal(lab().module.slug,m.slug);assert.equal(lab().exercise.id,e.id);assertSync();assert.ok(nodes.content.innerHTML.includes(e.title));}
// Each unique simulation is stepped completely forward and back through the actual UI.
let UIframes=0;
for(const sim of catalog){let owner;for(const m of modules){const e=m.exercises.find(e=>e.simulations.includes(sim.id));if(e){owner={m,e};break;}}if(!owner)continue;lab().selectModule(owner.m.slug,owner.e.id,sim.id);for(let i=1;i<sim.steps.length;i++){nodes.next.click();assert.equal(lab().index,i);assertSync();UIframes++;}const last=JSON.stringify(lab().frame);nodes.next.click();assert.equal(JSON.stringify(lab().frame),last);assert.ok(nodes.play.disabled);for(let i=sim.steps.length-2;i>=0;i--){nodes.prev.click();assert.equal(lab().index,i);assertSync();}nodes.prev.click();assert.equal(lab().index,0);}
const pointerModule='00-c-pointers';lab().selectModule(pointerModule,'ex0');assert.equal(nodes.notes.value,'An earlier pointer note');nodes.notes.value='I follow one stored address.';nodes.notes.dispatch('input');lab().selectModule(pointerModule,'ex1');assert.equal(nodes.notes.value,'');lab().selectModule(pointerModule,'ex0');assert.equal(nodes.notes.value,'I follow one stored address.');
nodes.next.click();nodes.play.click();assert.equal(timers.size,1);assert.equal(nodes.play.attrs['aria-pressed'],'true');nodes.speed.value='1500';nodes.speed.dispatch('change');assert.equal(timers.size,1);assert.equal(timers.values().next().value.ms,1500);timers.values().next().value.fn();assertSync();nodes.play.click();assert.equal(timers.size,0);
nodes.play.click();nodes.prev.click();assert.equal(timers.size,0);nodes.reset.click();assert.equal(lab().index,0);nodes.timeline.value='3';nodes.timeline.dispatch('input');assert.equal(lab().index,3);assertSync();nodes.timeline.value='1';nodes.timeline.dispatch('input');assert.equal(lab().index,1);assertSync();
nodes.play.click();while(timers.size)timers.values().next().value.fn();assert.equal(lab().index,lab().simulation.steps.length-1);assert.equal(timers.size,0);nodes.reset.click();nodes.play.click();nodes.exerciseSelect.value='ex2';nodes.exerciseSelect.dispatch('change');assert.equal(timers.size,0);assert.equal(lab().exercise.id,'ex2');assert.equal(lab().index,0);
doc.dispatch('keydown',{target:{tagName:'DIV'},key:'ArrowRight'});assert.equal(lab().index,1);doc.dispatch('keydown',{target:{tagName:'DIV'},key:'ArrowLeft'});assert.equal(lab().index,0);doc.dispatch('keydown',{target:{tagName:'TEXTAREA'},key:'ArrowRight'});assert.equal(lab().index,0);
nodes.search.value='btree_apply_by_level';nodes.search.dispatch('input');assert.ok(nodes.lessons.innerHTML.includes('01-c-binary-trees'));assert.ok(!nodes.lessons.innerHTML.includes('00-shell-fundamentals'));nodes.search.value='';nodes.search.dispatch('input');
// Hover, keyboard focus, touch pin/unpin, Escape, and outside click tooltip behavior.
for(const key of Object.keys(helpTexts)){const b=new Element('help-'+key,'BUTTON');b.dataset.help=key;doc.dispatch('pointerover',{target:b});assert.equal(nodes.contextTip.hidden,false);assert.equal(nodes.contextTip.textContent,helpTexts[key]);assert.equal(b.attrs['aria-expanded'],'true');doc.dispatch('pointerout',{target:b});assert.equal(nodes.contextTip.hidden,true);doc.dispatch('focusin',{target:b});assert.equal(nodes.contextTip.hidden,false);doc.dispatch('focusout',{target:b});assert.equal(nodes.contextTip.hidden,true);doc.dispatch('click',{target:b});assert.equal(nodes.contextTip.hidden,false);doc.dispatch('pointerout',{target:b});assert.equal(nodes.contextTip.hidden,false);doc.dispatch('click',{target:b});assert.equal(nodes.contextTip.hidden,true);doc.dispatch('click',{target:b});doc.dispatch('keydown',{key:'Escape',target:b});assert.equal(nodes.contextTip.hidden,true);doc.dispatch('click',{target:b});doc.dispatch('click',{target:new Element('outside')});assert.equal(nodes.contextTip.hidden,true);}
nodes.helpButton.click();assert.equal(nodes.guide.hidden,false);nodes.helpButton.click();assert.equal(nodes.guide.hidden,true);nodes.play.click();doc.hidden=true;doc.dispatch('visibilitychange');assert.equal(timers.size,0);doc.hidden=false;
const hostile='</textarea><script>alert(1)</script>';nodes.notes.value=hostile;nodes.notes.dispatch('input');lab().selectModule('00-shell-fundamentals');lab().selectModule(pointerModule,'ex2');assert.equal(nodes.notes.value,hostile);assert.ok(!nodes.content.innerHTML.includes(hostile));nodes.homeButton.click();assert.equal(lab().module,null);assert.equal(lab().frame,null);
console.log(JSON.stringify({status:'passed',source_PDFs:modules.length,learning_entries:entries,simulations:catalog.length,compiled_C_programs:compiled,operations,UI_frames_checked_forward_and_backward:UIframes,controls:'module/exercise/example selection, Next, Back, Reset, seeking, Play/Pause, pace, boundaries, keyboard, search, notes, progress, legacy-note migration',tooltips:'hover, keyboard focus, tap pin/unpin, Escape, outside click; matching section-specific guidance',browser_visual_QA:'Unavailable: the required control-browser skill is absent.'},null,2));
