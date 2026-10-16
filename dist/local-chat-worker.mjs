import {MODEL_IDS,compactMessages} from './chat-context.mjs';

// Only public model/runtime assets are fetched. Prompts are processed locally.
export function createChatWorker({send,gpu,loadRuntime=()=>import('./vendor/webllm-0.2.85.mjs')}){
  let engine=null,busy=false,active=null;
  const error=(id,message)=>send({type:'error',id,message:String(message)});
  async function load(id){
    if(busy)return error(id,'The model is still busy. Stop the current task first.');
    busy=true;
    try{
      if(!gpu)throw Error('WebGPU is unavailable. Use a compatible browser with hardware acceleration.');
      const adapter=await gpu.requestAdapter();
      if(!adapter)throw Error('No compatible GPU was found. Enable browser hardware acceleration and try again.');
      send({type:'progress',id,progress:0,text:'Preparing the local coding model…'});
      const runtime=await loadRuntime();
      const modelId=adapter.features.has('shader-f16')?MODEL_IDS.f16:MODEL_IDS.f32;
      const record=runtime.prebuiltAppConfig.model_list.find(m=>m.model_id===modelId);
      if(!record)throw Error('The coding model is missing from this runtime.');
      engine=await runtime.CreateMLCEngine(modelId,{
        appConfig:{...runtime.prebuiltAppConfig,model_list:[record]},
        initProgressCallback:p=>send({type:'progress',id,progress:p.progress,text:p.text}),
        logLevel:'ERROR'
      },{context_window_size:4096});
      send({type:'ready',id,modelId});
    }catch(e){engine=null;error(id,e.message||e);}
    finally{busy=false;}
  }
  async function generate(id,messages){
    if(!engine)return error(id,'Load the local model first.');
    if(busy)return error(id,'The model is still busy. Wait for the current reply.');
    if(!Array.isArray(messages)||messages.length<2||messages.length>4||messages.some(m=>!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')||messages.reduce((n,m)=>n+m.content.length,0)>8500)return error(id,'The question or context is too long.');
    busy=true;active={id,stopped:false};let sentText=false;
    try{
      const run=async input=>{
        const chunks=await engine.chat.completions.create({messages:input,stream:true,temperature:0.3,top_p:0.9,max_tokens:640});
        for await(const chunk of chunks){
          const text=chunk.choices?.[0]?.delta?.content;
          if(text){sentText=true;send({type:'token',id,text});}
        }
      };
      try{await run(messages);}catch(e){
        if(!sentText&&!active.stopped&&/context|window|prompt.*long|tokens.*exceed/i.test(String(e.message||e)))await run(compactMessages(messages));
        else throw e;
      }
      send({type:'done',id,stopped:active.stopped});
    }catch(e){
      if(active.stopped)send({type:'done',id,stopped:true});
      else error(id,e.message||e);
    }finally{active=null;busy=false;}
  }
  return async event=>{
    const message=event.data;
    if(!message||typeof message.id!=='number')return;
    if(message.type==='load')await load(message.id);
    else if(message.type==='generate')await generate(message.id,message.messages);
    else if(message.type==='stop'&&active?.id===message.id){active.stopped=true;engine?.interruptGenerate();}
  };
}
if(typeof self!=='undefined'&&typeof document==='undefined'){
  const handle=createChatWorker({send:message=>self.postMessage(message),gpu:self.navigator?.gpu});
  self.onmessage=event=>{void handle(event);};
}
