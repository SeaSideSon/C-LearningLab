import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCatalog} from '../dist/catalog.mjs';
import {allChanges} from '../dist/trace.mjs';
import {moduleMarkup,helpTexts} from '../dist/course-ui.mjs';
import {createLocalTutor} from '../dist/local-chat.mjs';
import {captureContext,buildChatMessages,compactMessages,MODEL_IDS} from '../dist/chat-context.mjs';
import {createChatWorker} from '../dist/local-chat-worker.mjs';
import {prebuiltAppConfig,CreateMLCEngine} from '../dist/vendor/webllm-0.2.85.mjs';

const modules=JSON.parse(readFileSync(new URL('../dist/curriculum.json',import.meta.url))),catalog=buildCatalog();
const module=modules.find(m=>m.slug==='00-c-pointers'),exercise=module.exercises[0],simulation=catalog.find(s=>s.id===exercise.simulations[0]);
function lesson(e=exercise,s=simulation,index=1){return {module,exercise:e,simulation:s,index,frame:s.steps[index],before:s.steps[Math.max(0,index-1)],diff:allChanges(s.steps[Math.max(0,index-1)],s.steps[index])};}
let lab=lesson();
const snapshot=captureContext(lab),frozen=snapshot.text;
assert.ok(snapshot.text.includes(lab.frame.what));
assert.ok(snapshot.text.includes('ALREADY executed'));
assert.ok(snapshot.text.includes('Terminal BEFORE:'));
assert.ok(snapshot.text.includes('Terminal AFTER:'));
lab=lesson(exercise,simulation,2);assert.equal(snapshot.text,frozen);
assert.ok(captureContext(lesson(exercise,simulation,0)).text.includes('No operation has executed yet'));
assert.throws(()=>buildChatMessages(snapshot,''));assert.throws(()=>buildChatMessages(snapshot,'x'.repeat(1201)));
const question='Why does writing through p change the target?';
const messages=buildChatMessages(snapshot,question);
assert.equal(messages.length,2);assert.ok(messages.at(-1).content.endsWith(question));
assert.ok(compactMessages(messages).at(-1).content.endsWith(question));
for(const m of modules)for(const e of m.exercises){const s=catalog.find(s=>s.id===e.simulations[0]);const c=captureContext({module:m,exercise:e,simulation:s,index:s.steps.length-1,frame:s.steps.at(-1),before:s.steps.at(-2),diff:[]});assert.ok(c.text&&c.label);assert.ok(c.text.length<=3301);}

// Instrument the shipped controller: no browser or real GPU is implied.
const nodes={},created=[];let doc;
class Element{
  constructor(id='',tag='DIV'){this.id=id;this.tagName=tag;this.listeners={};this.attrs={};this.children=[];this.style={};this.dataset={};this.value='';this.hidden=false;this.disabled=false;this.scrollTop=0;this.scrollHeight=300;this.clientHeight=300;this._text='';this._html='';}
  set innerHTML(s){this._html=s;this._text='';this.children=[];parse(s);}
  get innerHTML(){return this._html;}
  set textContent(s){this._text=String(s);this.children=[];this._html='';}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  appendChild(n){this.children.push(n);return n;}
  setAttribute(k,v){this.attrs[k]=String(v);}
  addEventListener(k,fn){(this.listeners[k]||=[]).push(fn);}
  dispatch(k,e={}){for(const fn of this.listeners[k]||[])fn({target:this,preventDefault(){},...e});}
  click(){if(!this.disabled)this.dispatch('click');}
  focus(){doc.activeElement=this;}
}
function parse(s){for(const m of s.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/gi)){const n=new Element(m[2],m[1].toUpperCase());n.hidden=/\bhidden\b/.test(m[0]);n.disabled=/\bdisabled\b/.test(m[0]);nodes[n.id]=n;}}
doc=new Element('document');doc.getElementById=id=>nodes[id]||null;doc.createElement=tag=>{created.push(tag.toUpperCase());return new Element('',tag.toUpperCase());};
function mount(){parse(moduleMarkup(lab.module,lab.exercise,catalog));}
const workers=[];class FakeWorker{
  constructor(){this.sent=[];this.terminated=false;workers.push(this);}
  postMessage(m){this.sent.push(structuredClone(m));}
  terminate(){this.terminated=true;}
  emit(m){this.onmessage?.({data:m});}
}
const winEvents={};
const win={navigator:{gpu:{}},isSecureContext:true,Worker:FakeWorker,addEventListener(name,fn){(winEvents[name]||=[]).push(fn);}};
let paused=0;lab=lesson();mount();const tutor=createLocalTutor({doc,win,getLesson:()=>lab,pause:()=>paused++,workerFactory:()=>new FakeWorker()});tutor.sync();
assert.equal(workers.length,0,'No downloads/worker creation until explicit Load');
assert.equal(nodes.chatSend.disabled,true);assert.equal(nodes.chatLoad.disabled,false);
nodes.chatLoad.click();assert.equal(tutor.phase,'loading');const w=workers.at(-1),loadId=w.sent[0].id;
w.emit({type:'progress',id:loadId,progress:0.5,text:'Loading model files'});assert.equal(nodes.chatProgress.value,0.5);
w.emit({type:'ready',id:loadId,modelId:MODEL_IDS.f16});assert.equal(tutor.phase,'ready');
nodes.chatExplain.click();assert.ok(nodes.chatQuestion.value.startsWith('Explain'));assert.equal(doc.activeElement,nodes.chatQuestion);assert.equal(nodes.chatSend.disabled,false);
const originalIndex=lab.index;
nodes.chatForm.dispatch('submit');assert.equal(paused,1);assert.equal(tutor.phase,'generating');
const request=w.sent.at(-1);assert.equal(request.type,'generate');assert.match(request.messages.at(-1).content,new RegExp('Step '+originalIndex));
assert.ok(request.messages.at(-1).content.includes(lab.frame.what));assert.equal(nodes.chatQuestion.value,'');
lab=lesson(exercise,simulation,Math.min(originalIndex+1,simulation.steps.length-1));tutor.sync();assert.ok(nodes.chatContext.textContent.includes('step '+lab.index));
const hostile='Literal <img src=x onerror=alert(1)>\n```c\n*p = 20;\n```';
w.emit({type:'token',id:request.id,text:hostile});assert.ok(nodes.chatMessages.textContent.includes('<img src=x'));assert.ok(created.includes('PRE'));assert.ok(!created.includes('IMG'));assert.ok(nodes.chatMessages.textContent.includes('Step '+originalIndex));
const beforeStale=nodes.chatMessages.textContent;w.emit({type:'token',id:request.id+999,text:'STALE'});assert.equal(nodes.chatMessages.textContent,beforeStale);
w.emit({type:'done',id:request.id,stopped:false});assert.equal(tutor.phase,'ready');
nodes.chatQuestion.value='What happens next?';nodes.chatQuestion.dispatch('input');nodes.chatForm.dispatch('submit');
const second=w.sent.at(-1);assert.equal(second.messages.length,4);assert.ok(second.messages[2].content.includes('<img src=x'));
w.emit({type:'token',id:second.id,text:'Partial reply'});nodes.chatStop.click();assert.equal(w.sent.at(-1).type,'stop');w.emit({type:'done',id:second.id,stopped:true});assert.ok(nodes.chatMessages.textContent.includes('Stopped'));
// A late answer is stored in its original exercise, never in the newly selected one.
nodes.chatQuestion.value='Finish explaining this step.';nodes.chatQuestion.dispatch('input');nodes.chatForm.dispatch('submit');const third=w.sent.at(-1);
const firstLesson=lab,other=module.exercises[1],otherSim=catalog.find(s=>s.id===other.simulations[0]);lab=lesson(other,otherSim,1);mount();tutor.sync();
assert.equal(nodes.chatSend.disabled,true);assert.ok(nodes.chatStatus.textContent.includes('another exercise'));
w.emit({type:'token',id:third.id,text:'ORIGINAL EXERCISE ANSWER'});w.emit({type:'done',id:third.id,stopped:false});assert.ok(!nodes.chatMessages.textContent.includes('ORIGINAL EXERCISE ANSWER'));
nodes.chatQuestion.value='My second exercise draft';nodes.chatQuestion.dispatch('input');lab=firstLesson;mount();tutor.sync();assert.ok(nodes.chatMessages.textContent.includes('ORIGINAL EXERCISE ANSWER'));
nodes.chatNew.click();assert.ok(!nodes.chatMessages.textContent.includes('ORIGINAL EXERCISE ANSWER'));
lab=lesson(other,otherSim,1);mount();tutor.sync();assert.equal(nodes.chatQuestion.value,'My second exercise draft');
nodes.chatRelease.click();assert.equal(w.terminated,true);assert.equal(tutor.phase,'unloaded');
nodes.chatLoad.click();const w2=workers.at(-1);assert.equal(tutor.phase,'loading');w.onerror({message:'old worker error',preventDefault(){}});assert.equal(tutor.phase,'loading','Old worker cannot cancel a replacement');
nodes.chatStop.click();assert.equal(w2.terminated,true);assert.equal(tutor.phase,'unloaded');
nodes.chatLoad.click();const w3=workers.at(-1);w3.emit({type:'error',id:w3.sent[0].id,message:'Failed to fetch weights'});assert.equal(tutor.phase,'error');assert.ok(nodes.chatStatus.textContent.includes('could not download'));assert.equal(nodes.chatLoad.disabled,false);
nodes.chatLoad.click();const w4=workers.at(-1);w4.emit({type:'ready',id:w4.sent[0].id,modelId:MODEL_IDS.f16});
nodes.chatQuestion.value='Can you explain?';nodes.chatQuestion.dispatch('input');nodes.chatForm.dispatch('submit');w4.emit({type:'done',id:w4.sent.at(-1).id,stopped:false});assert.ok(nodes.chatMessages.textContent.includes('returned no text'));
winEvents.pagehide[0]();assert.equal(w4.terminated,true);assert.equal(tutor.phase,'unloaded');nodes.chatLoad.click();assert.equal(tutor.phase,'loading','A restored page can reload without rebinding the chat');
tutor.dispose();
mount();const unsupported=createLocalTutor({doc,win:{...win,navigator:{}},getLesson:()=>lab,workerFactory:()=>{throw Error('must not start');}});unsupported.sync();assert.equal(nodes.chatLoad.disabled,true);assert.ok(nodes.chatStatus.textContent.includes('WebGPU'));unsupported.dispose();

// Verify the actual worker contract with controlled GPU and engine implementations.
assert.equal(typeof CreateMLCEngine,'function');
for(const id of Object.values(MODEL_IDS))assert.ok(prebuiltAppConfig.model_list.some(m=>m.model_id===id));
function workerHarness({f16=true,create}={}){
  const events=[],calls=[];
  const engine={interruptGenerate(){engine.interrupted=true;},chat:{completions:{create:create||async function*(request){calls.push(request);yield {choices:[{delta:{content:'A copied address still reaches the caller’s object.'}}]};}}}};
  const handle=createChatWorker({send:m=>events.push(m),gpu:{requestAdapter:async()=>({features:new Set(f16?['shader-f16']:[])})},loadRuntime:async()=>({prebuiltAppConfig,CreateMLCEngine:async(id,config,options)=>{calls.push({id,config,options});config.initProgressCallback({progress:0.5,text:'Half loaded'});return engine;}})});
  return {events,calls,handle,engine};
}
for(const f16 of [true,false]){
  const h=workerHarness({f16});await h.handle({data:{type:'load',id:1}});
  assert.equal(h.events.at(-1).type,'ready');assert.equal(h.events.at(-1).modelId,f16?MODEL_IDS.f16:MODEL_IDS.f32);assert.equal(h.calls[0].options.context_window_size,4096);assert.equal(h.calls[0].config.appConfig.model_list.length,1);
  await h.handle({data:{type:'generate',id:2,messages}});assert.ok(h.events.some(m=>m.type==='token'));assert.equal(h.events.at(-1).type,'done');assert.equal(h.calls.at(-1).max_tokens,640);
}
const gpuEvents=[];let runtimeLoads=0;
await createChatWorker({send:m=>gpuEvents.push(m),gpu:{requestAdapter:async()=>null},loadRuntime:async()=>{runtimeLoads++;}})({data:{type:'load',id:1}});
assert.equal(runtimeLoads,0);assert.equal(gpuEvents.at(-1).type,'error');
let attempts=0;const overflowInputs=[];
const overflow=workerHarness({create:async function*(request){overflowInputs.push(request.messages);if(++attempts===1)throw Error('Context window limit exceeded');yield {choices:[{delta:{content:'Short answer'}}]};}});
await overflow.handle({data:{type:'load',id:1}});await overflow.handle({data:{type:'generate',id:2,messages:buildChatMessages({...snapshot,text:'x'.repeat(3000)},'Explain this')}});
assert.equal(attempts,2);assert.ok(overflowInputs[1].at(-1).content.length<overflowInputs[0].at(-1).content.length);assert.equal(overflow.events.at(-1).type,'done');
let resume,started;const gate=new Promise(r=>resume=r),firstToken=new Promise(r=>started=r);
const cancellable=workerHarness({create:async function*(){yield {choices:[{delta:{content:'Beginning'}}]};started();await gate;}});
await cancellable.handle({data:{type:'load',id:1}});const pending=cancellable.handle({data:{type:'generate',id:2,messages}});await firstToken;
await cancellable.handle({data:{type:'stop',id:2}});assert.equal(cancellable.engine.interrupted,true);resume();await pending;assert.equal(cancellable.events.at(-1).stopped,true);
await cancellable.handle({data:{type:'generate',id:3,messages:[{role:'tool',content:'invalid'}]}});assert.equal(cancellable.events.at(-1).type,'error');
const html=moduleMarkup(module,exercise,catalog);assert.ok(html.indexOf('terminal-panel')<html.indexOf('id="localChat"'));assert.ok(html.indexOf('id="localChat"')<html.indexOf('bottom-grid'));assert.ok(helpTexts.chat);
console.log(JSON.stringify({status:'passed',model:'Qwen2.5-Coder-1.5B-Instruct',runtime:'WebLLM 0.2.85 (real module exports and registry checked)',checks:'explicit loading, progress, f16/f32 selection, GPU rejection before download, streaming, safe rendering, pause-on-send, detached execution context, original step labels, exercise isolation, drafts, stop/cancel/release, stale-worker events, errors, compact-context retry, no paid fallback',real_GPU_inference:'Not verified: no supported browser/GPU surface is available here.'},null,2));
