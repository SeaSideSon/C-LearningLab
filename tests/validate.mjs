import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildLessons,Controller,changes} from '../dist/lessons.mjs';
import {mountApp} from '../dist/app.mjs';

const lessons=buildLessons();
assert.equal(lessons.length,11);
const expected={basic:['a = 7','*p = 7'],modify:'a = 20\n',arithmetic:'10\n30\n10 99 30\n',string:'Hel\n',function:'a = 42\n',ultimate:'n = 42\n',swap:'9 3\n',divmod:'3 2\n',ultdiv:'3 2\n',reverse:'5 4 3 2 1\n',sort:'1 2 3 4\n'};
const scratch=mkdtempSync(join(tmpdir(),'pointerlab-c-'));
try{
  for(const lesson of lessons){
    const filename=join(scratch,lesson.id+'.c'),binary=join(scratch,lesson.id);
    writeFileSync(filename,lesson.code.join('\n')+'\n');
    execFileSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-pedantic',filename,'-o',binary]);
    const actual=execFileSync(binary,{encoding:'utf8'});
    if(lesson.id==='basic'){
      const lines=actual.trim().split('\n');
      assert.deepEqual(lines.slice(0,2),expected.basic);
      assert.equal(lines[2].split(' = ')[1],lines[3].split(' = ')[1]);
      assert.notEqual(lines[3].split(' = ')[1],lines[4].split(' = ')[1]);
    }else{assert.equal(actual,expected[lesson.id]);assert.equal(actual,lesson.steps.at(-1).output);}
    for(let i=0;i<lesson.steps.length;i++){
      const frame=lesson.steps[i],before=lesson.steps[Math.max(0,i-1)];
      assert.ok(frame.line>=0&&frame.line<=lesson.code.length);
      for(const key of ['what','observe','flow','title'])assert.ok(frame[key].length>0);
      const cells=Object.values(frame.cells);
      assert.equal(new Set(cells.map(c=>c.address)).size,cells.length,'Each active object has a distinct address');
      for(const cell of cells){
        if(cell.target){assert.ok(frame.cells[cell.target]);assert.equal(cell.value,frame.cells[cell.target].address);}
      }
      for(const id of frame.reads){assert.ok(frame.cells[id],`${lesson.id} step ${i} read ${id} exists`);assert.notEqual(frame.cells[id].value,undefined,`Never read an uninitialized ${id}`);}
      if(i){
        assert.ok(frame.output.startsWith(before.output),'Output is appended, never silently replaced');
        if(frame.output!==before.output)assert.match(lesson.code[frame.line-1],/printf|putchar/,'Only an actual output call adds terminal output');
        const diff=changes(before,frame);
        for(const c of diff.filter(c=>c.kind==='written'))assert.notEqual(c.before,c.after,'Write highlight means a stored value changed');
      }
    }
  }
}finally{rmSync(scratch,{recursive:true,force:true});}

// Trace semantics: verify intermediate behavior, not only final answers.
const find=id=>lessons.find(l=>l.id===id);
let trace=find('modify');
assert.equal(trace.steps[2].cells.p.value,trace.steps[3].cells.p.value);
assert.deepEqual(changes(trace.steps[2],trace.steps[3]).map(c=>c.id),['a']);
trace=find('arithmetic');
const moved=trace.steps.find(s=>s.title==='Move the pointer');
assert.equal(moved.cells.p.value,'0x1004');assert.equal(moved.cells.t1.value,20);
const temporary=trace.steps.find(s=>s.title==='Calculate a temporary address');
assert.equal(temporary.cells.p.value,'0x1004');assert.equal(temporary.output,'10\n30\n');
trace=find('swap');
const duplicate=trace.steps.find(s=>s.title==='Copy second into first');
assert.equal(duplicate.cells.first.value,9);assert.equal(duplicate.cells.second.value,9);assert.equal(duplicate.cells.tmp.value,3);
trace=find('ultimate');
const nine=trace.steps.find(s=>s.title==='Follow nine addresses, then write');
let id='nbr',levels=0;
while(nine.cells[id].target){id=nine.cells[id].target;levels++;}
assert.equal(levels,9);assert.equal(id,'n');assert.equal(nine.cells.n.value,42);
trace=find('reverse');
assert.equal(trace.steps.filter(s=>s.title==='Check the loop condition').length,2);
assert.equal(trace.steps.find(s=>s.title==='Stop at the middle').cells.t2.value,3);
trace=find('sort');
assert.equal(trace.steps.filter(s=>s.title==='Compare the two values').length,6);
assert.equal(trace.steps.filter(s=>s.title==='Save the left value').length,4);
assert.ok(trace.steps.some(s=>s.title==='Compare the two values'&&s.what.includes('false')));

// Event-level UI integration. This instrumented DOM checks the actual shipped
// event handlers and rendered view state without pretending to be browser QA.
class Element{
  constructor(id){this.id=id;this.listeners={};this.attrs={};this._html='';this.textContent='';this.value='';this.hidden=false;this.disabled=false;this.scrollTop=0;this.clientHeight=400;this.dataset={};this.tagName='DIV';}
  set innerHTML(s){this._html=s;}
  get innerHTML(){return this._html;}
  setAttribute(k,v){this.attrs[k]=v;}
  getAttribute(k){return this.attrs[k];}
  addEventListener(k,f){(this.listeners[k]||=[]).push(f);}
  dispatch(k,event={}){for(const f of this.listeners[k]||[])f({target:this,...event});}
  click(){if(!this.disabled)this.dispatch('click');}
  querySelector(){return null;}
}
const html=readFileSync(new URL('./legacy.html',import.meta.url),'utf8');
const nodes=Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element(m[1])]));
nodes.guide.hidden=true;nodes.speed.value='4000';
const doc=new Element('document');doc.getElementById=id=>{assert.ok(nodes[id],'UI references an existing HTML element: '+id);return nodes[id];};
const storage=new Map(),timers=new Map();let timerSequence=0;
const win={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setInterval:(f,ms)=>{const id=++timerSequence;timers.set(id,{f,ms});return id;},clearInterval:id=>timers.delete(id),addEventListener:()=>{}};
const app=mountApp(doc,win),c=app.controller;
const delegated=(element,attribute,id)=>element.dispatch('click',{target:{closest:selector=>selector===`[data-${attribute}]`?{dataset:{[attribute]:id}}:null}});
function assertSynchronized(){
  const frame=c.frame;
  assert.equal(nodes.what.textContent,frame.what);assert.equal(nodes.observe.textContent,frame.observe);assert.equal(nodes.flow.textContent,frame.flow);
  assert.equal(nodes.terminal.textContent,frame.output);assert.equal(Number(nodes.timeline.value),c.index);
  assert.equal(nodes.prev.disabled,c.index===0);assert.equal(nodes.next.disabled,c.atEnd);
  assert.equal(nodes.code.innerHTML.match(/class="code-line active"/g)?.length||0,frame.line?1:0);
  for(const cell of Object.values(frame.cells))assert.ok(nodes.memory.innerHTML.includes(`data-cell="${cell.id}"`));
  const diff=c.index?changes(c.before,c.frame):[];
  for(const cell of diff.filter(d=>d.kind!=='removed'))assert.match(nodes.memory.innerHTML,new RegExp(`class="cell written[^"\\n]*" data-cell="${cell.id}"`));
}
assertSynchronized();nodes.next.click();assert.equal(c.index,1);assertSynchronized();nodes.prev.click();assert.equal(c.index,0);assertSynchronized();
for(const lesson of lessons){
  delegated(nodes.lessons,'lesson',lesson.id);assert.equal(c.lesson.id,lesson.id);assert.equal(c.index,0);
  for(let i=1;i<lesson.steps.length;i++){nodes.next.click();assert.equal(c.index,i);assertSynchronized();}
  const final=JSON.stringify(c.frame);nodes.next.click();assert.equal(JSON.stringify(c.frame),final);
  for(let i=lesson.steps.length-2;i>=0;i--){nodes.prev.click();assert.equal(c.index,i);assertSynchronized();}
}
assert.equal(JSON.parse(storage.get('pointerlab-progress')).length,11);
delegated(nodes.lessons,'lesson','swap');nodes.timeline.value='6';nodes.timeline.dispatch('input');assert.equal(c.index,6);assertSynchronized();
delegated(nodes.memory,'cell','pa');assert.ok(nodes.inspector.innerHTML.includes('first'));assert.ok(nodes.inspector.innerHTML.includes('0x1000'));
nodes.notes.value='My independent note';nodes.notes.dispatch('input');delegated(nodes.lessons,'lesson','basic');assert.equal(nodes.notes.value,'');delegated(nodes.lessons,'lesson','swap');assert.equal(nodes.notes.value,'My independent note');
nodes.timeline.value='6';nodes.timeline.dispatch('input');
nodes.play.click();assert.equal(timers.size,1);assert.equal(nodes.play.attrs['aria-pressed'],'true');
timers.values().next().value.f();assert.equal(c.index,7);assertSynchronized();
nodes.play.click();assert.equal(timers.size,0);nodes.play.click();nodes.prev.click();assert.equal(timers.size,0);assert.equal(c.index,6);
nodes.play.click();nodes.speed.value='1500';nodes.speed.dispatch('change');assert.equal(timers.size,1);assert.equal(timers.values().next().value.ms,1500);
nodes.reset.click();assert.equal(timers.size,0);assert.equal(c.index,0);assertSynchronized();
nodes.play.click();delegated(nodes.lessons,'lesson','modify');assert.equal(timers.size,0);assert.equal(c.index,0);
nodes.play.click();while(timers.size)timers.values().next().value.f();assert.ok(c.atEnd);assert.equal(nodes.play.attrs['aria-pressed'],'false');
nodes.reset.click();nodes.timeline.value='3';nodes.timeline.dispatch('input');assert.equal(c.frame.cells.a.value,20);nodes.timeline.value='2';nodes.timeline.dispatch('input');assert.equal(c.frame.cells.a.value,7);assertSynchronized();
doc.dispatch('keydown',{key:'ArrowRight',target:{tagName:'DIV'},preventDefault:()=>{}});assert.equal(c.index,3);
doc.dispatch('keydown',{key:'ArrowLeft',target:{tagName:'DIV'},preventDefault:()=>{}});assert.equal(c.index,2);
doc.dispatch('keydown',{key:'ArrowRight',target:{tagName:'TEXTAREA'},preventDefault:()=>{}});assert.equal(c.index,2);
nodes.helpButton.click();assert.equal(nodes.guide.hidden,false);assert.equal(nodes.helpButton.attrs['aria-expanded'],'true');nodes.helpButton.click();assert.equal(nodes.guide.hidden,true);
nodes.play.click();doc.hidden=true;doc.dispatch('visibilitychange');assert.equal(timers.size,0);
const hostile='</textarea><script>alert(1)</script>';nodes.notes.value=hostile;nodes.notes.dispatch('input');delegated(nodes.lessons,'lesson','basic');delegated(nodes.lessons,'lesson','modify');assert.equal(nodes.notes.value,hostile);assert.equal(nodes.notes.innerHTML,'');

console.log(JSON.stringify({status:'passed',lessons:lessons.length,operations:lessons.reduce((n,l)=>n+l.steps.length-1,0),compiled_C_examples:lessons.length,UI:'Next, Back, Reset, lesson selection, timeline, memory inspection, Play/Pause, speed, end boundaries, keyboard, notes, local progress, synchronized views',browser_QA:'Unavailable: control-browser skill is not installed.'},null,2));
