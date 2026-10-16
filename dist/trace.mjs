import {address,valueOf} from './lessons.mjs';
export class Trace {
  constructor(id,title,summary,source,{kind='c',args=[],fixtureFiles={},conceptOnly=true}={}){
    Object.assign(this,{id,title,summary,kind,args,fixtureFiles,conceptOnly});
    this.code=source.trim().split('\n');this.state={cells:{},output:'',scope:kind==='c'?'main':kind,world:null,calls:kind==='c'?['main']:[]};this.steps=[];
    this.capture(0,'Ready to explore',summary,'Advance one operation at a time. The source, description, state, and terminal share the same step.','No operation has run.');
  }
  cell(id,name,type,loc,value,scope=this.state.scope,extra={}){this.state.cells[id]={id,name,type,address:address(loc),value,scope,...extra};}
  ptr(id,name,type,loc,target,scope=this.state.scope){this.cell(id,name,type,loc,this.state.cells[target].address,scope,{target});}
  set(id,value){this.state.cells[id].value=value;}
  chars(id,text,base=0x1000,name=id,scope='main',capacity=text.length+1){for(let i=0;i<capacity;i++)this.cell(id+i,`${name}[${i}]`,'char',base+i,i<text.length?text[i]:i===text.length?'\\0':undefined,scope,{group:'array',index:i});}
  ints(id,values,base=0x1000,name=id,scope='main'){values.forEach((v,i)=>this.cell(id+i,`${name}[${i}]`,'int',base+4*i,v,scope,{group:'array',index:i}));}
  enter(name){this.state.scope=name;this.state.calls.push(name);}
  leave(){const name=this.state.calls.pop();for(const [id,c]of Object.entries(this.state.cells))if(c.scope===name)delete this.state.cells[id];this.state.scope=this.state.calls.at(-1)||'main';}
  capture(line,title,what,observe,flow,reads=[],focus=[]){this.steps.push({...structuredClone(this.state),line,title,what,observe,flow,reads,focus});}
  step(at,title,what,observe,flow,mutate=()=>{},reads=[],focus=[]){const line=typeof at==='number'?at:this.code.findIndex(l=>l.trim()===at.trim())+1;if(!line)throw Error(`No source line in ${this.id}: ${at}`);mutate();this.capture(line,title,what,observe,flow,reads,focus);return this;}
  done(){return {id:this.id,title:this.title,summary:this.summary,kind:this.kind,args:this.args,fixtureFiles:this.fixtureFiles,conceptOnly:this.conceptOnly,code:this.code,steps:this.steps};}
  finish(at,output,what='Print the computed result. Reading stored data for output leaves that data unchanged.'){if(at!=='return (0);'||output)this.step(at,'Produce terminal output',what,'Only an output operation adds characters to the terminal. Read the result against the current state.','stored data → terminal',()=>this.state.output+=output);if(this.kind==='c')this.step(this.code.map(l=>l.trim()).lastIndexOf('return (0);')+1,'Example complete','main returns 0. The program has finished.','Final objects remain visible for review. In a real program, main’s automatic objects stop existing on return.','return → program ends');return this.done();}
}
export function allChanges(before,after){
  const ids=new Set([...Object.keys(before.cells),...Object.keys(after.cells)]),out=[];
  for(const id of ids){const a=before.cells[id],b=after.cells[id];if(!a||!b||a.value!==b.value||a.target!==b.target)out.push({id,name:(b||a).name,before:a?valueOf(a):'not created',after:b?valueOf(b):'out of scope',kind:!a?'created':!b?'removed':'written'});}
  if(JSON.stringify(before.world)!==JSON.stringify(after.world))out.push({id:'world',name:'Workspace / structure',before:before.world?worldSummary(before.world):'not created',after:after.world?worldSummary(after.world):'not present',kind:'written'});
  if(JSON.stringify(before.calls)!==JSON.stringify(after.calls))out.push({id:'calls',name:'Function calls',before:(before.calls||[]).join(' → ')||'none',after:(after.calls||[]).join(' → ')||'none',kind:'written'});
  return out;
}
export function worldSummary(w){if(w.kind==='files')return `cwd ${w.cwd}; `+w.files.map(f=>`${f.name} (${f.kind}${f.mode?', '+f.mode:''}${f.inode?', object '+f.inode:''}): ${f.content??''}`).join('; ')+(w.handles?'; '+w.handles.map(h=>`fd ${h.fd}: ${h.status}`).join(', '):'');if(w.kind==='git')return `work: ${w.work}; index: ${w.index}; commit: ${w.commit}; remote: ${w.remote}`;if(w.kind==='build')return `${w.phase}: ${w.items.join(', ')}`;if(w.kind==='list')return w.nodes.map(n=>`${n.id}(${n.data}) → ${n.next||'NULL'}`).join('; ');if(w.kind==='tree')return w.nodes.map(n=>`${n.id}(${n.data}): left ${n.left||'NULL'}, right ${n.right||'NULL'}`).join('; ');if(w.kind==='board')return w.rows.map(r=>r.join(' ')).join(' / ');return JSON.stringify(w);}
