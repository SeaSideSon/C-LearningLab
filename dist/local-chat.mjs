import {MODEL_LABEL,MAX_QUESTION,lessonKey,captureContext,buildChatMessages} from './chat-context.mjs';

export function localChatMarkup(helpButton=''){
  return `<details id="localChat" class="local-chat panel" open>
  <summary><span>Ask about this step ${helpButton}</span><span class="local-chat-badge">Local AI · no API fees</span></summary>
  <div class="local-chat-body">
   <div class="local-chat-intro"><div><h3>${MODEL_LABEL}</h3><p>Answers run on your device. No AI subscription, API key, or paid fallback. First load downloads about 0.9–1 GB of public model files, then caches them when browser storage is available.</p></div><div class="local-chat-model-actions"><button id="chatLoad" class="button primary" type="button">Load local model</button><button id="chatRelease" class="button" type="button" hidden>Release model</button></div></div>
   <p id="chatStatus" class="local-chat-status" role="status" aria-live="polite">Model not loaded. Requires a WebGPU-compatible browser and roughly 2 GB of available GPU memory.</p>
   <progress id="chatProgress" class="local-chat-progress" max="1" value="0" aria-label="Local model loading progress" hidden></progress>
   <p id="chatContext" class="local-chat-context"></p>
   <div id="chatMessages" class="local-chat-thread" aria-label="Conversation for this exercise" aria-busy="false"></div>
   <div class="local-chat-prompts" aria-label="Question starters"><button id="chatExplain" class="button" type="button">Explain this line</button><button id="chatChange" class="button" type="button">Why did this change?</button><button id="chatHint" class="button" type="button">Give me a hint</button></div>
   <form id="chatForm"><label for="chatQuestion">Your coding question</label><textarea id="chatQuestion" rows="3" maxlength="${MAX_QUESTION}" placeholder="Ask about the current line, memory, output, or another programming concept…" aria-describedby="chatInputHelp"></textarea><div class="local-chat-send-row"><span id="chatInputHelp">Ctrl/⌘ + Enter to send · max 1,200 characters</span><div><button id="chatNew" class="button" type="button">New chat</button><button id="chatStop" class="button" type="button" hidden>Stop reply</button><button id="chatSend" class="button primary" type="submit" disabled>Ask local tutor</button></div></div></form>
   <p class="local-chat-footnote">Each question includes the current step and nearby code. Replies keep their original step label. Chat stays in this tab; reloading clears it. This small model can make mistakes—compare its answer with the simulator and source assignment. <a href="https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct" target="_blank" rel="noopener">Model &amp; Apache 2.0 license ↗</a></p>
  </div></details>`;
}

export function friendlyChatError(message){
  const s=String(message||'');
  if(/context|window|prompt.*long|tokens.*exceed/i.test(s))return 'The question and code exceed this small model’s context. Start a new chat or ask a shorter, more focused question.';
  if(/memory|allocat|buffer.*size|device.*lost/i.test(s))return 'The browser could not keep enough GPU memory available. Release the model, close other GPU-heavy tabs, and try loading again.';
  if(/fetch|network|download|load.*module|import.*module/i.test(s))return 'A local model file could not download. Check your connection, allow model downloads, and try loading again.';
  if(/webgpu|compatible gpu|hardware acceleration/i.test(s))return 'Local chat needs a WebGPU-compatible browser with hardware acceleration. Try a current Chrome or Edge on a desktop or laptop.';
  return 'The local tutor could not complete this task. Release the model and load it again. '+s.slice(0,200);
}

function appendReplyText(doc,container,text){
  // Model and user content never enter innerHTML. Fenced code is display-only.
  const parts=String(text).split(/```[a-zA-Z0-9_+.-]*\n?/);
  parts.forEach((part,i)=>{
    if(!part)return;
    const node=doc.createElement(i%2?'pre':'div');
    node.className=i%2?'local-chat-code':'local-chat-prose';node.textContent=part;container.appendChild(node);
  });
}

export function createLocalTutor({doc,win,getLesson,pause=()=>{},workerFactory=()=>new win.Worker(new URL('./local-chat-worker.mjs',import.meta.url),{type:'module'})}){
  const sessions=new Map();let worker=null,phase='unloaded',serial=0,loadingId=null,job=null,view=null,viewKey=null,notice='',progress=0;
  const $=id=>doc.getElementById(id);
  const supported=()=>win.isSecureContext!==false&&!!win.navigator?.gpu&&typeof win.Worker==='function';
  const session=key=>{if(!sessions.has(key))sessions.set(key,{messages:[],draft:''});return sessions.get(key);};
  const currentKey=()=>lessonKey(getLesson());
  function status(){
    if(notice)return notice;
    if(!supported())return 'Local chat needs WebGPU and hardware acceleration. Try a current desktop Chrome or Edge. Your lessons and simulator still work here.';
    if(phase==='loading')return 'Loading the local coding model… You can cancel while it downloads.';
    if(phase==='generating')return job?.key===currentKey()?'Writing a reply on your device…':'Finishing a reply in another exercise. Stop it to ask here.';
    if(phase==='ready')return 'Ready · replies are generated on this device · no inference API charges.';
    return 'Model not loaded. First load downloads about 0.9–1 GB. Requires roughly 2 GB of available GPU memory.';
  }
  function controls(){
    if(!view||!$('chatStatus'))return;
    $('chatStatus').textContent=status();
    $('chatLoad').hidden=['ready','generating'].includes(phase);
    $('chatLoad').disabled=!supported()||phase==='loading';
    $('chatLoad').textContent=phase==='error'?'Retry loading':'Load local model';
    $('chatRelease').hidden=!['ready','generating'].includes(phase);
    $('chatStop').hidden=!['loading','generating'].includes(phase);
    $('chatStop').textContent=phase==='loading'?'Cancel loading':'Stop reply';
    $('chatSend').disabled=phase!=='ready'||!$('chatQuestion').value.trim();
    $('chatNew').disabled=['loading','generating'].includes(phase);
    $('chatProgress').hidden=phase!=='loading';$('chatProgress').value=progress;
    $('chatMessages').setAttribute('aria-busy',String(phase==='generating'&&job?.key===viewKey));
  }
  function renderMessages(){
    if(!view||viewKey!==currentKey())return;
    const list=$('chatMessages'),nearEnd=list.scrollHeight-list.scrollTop-list.clientHeight<80;
    list.innerHTML='';
    const messages=session(viewKey).messages;
    if(!messages.length){list.textContent='Load the model, then ask a question. The current execution step will be included.';list.className='local-chat-thread is-empty';return;}
    list.className='local-chat-thread';
    for(const m of messages){
      const article=doc.createElement('article');article.className='local-chat-message '+m.role;
      const heading=doc.createElement('div');heading.className='local-chat-message-label';heading.textContent=m.role==='user'?'You':'Local tutor';article.appendChild(heading);
      const label=doc.createElement('div');label.className='local-chat-message-context';label.textContent=m.label;article.appendChild(label);
      appendReplyText(doc,article,m.text||(m.status==='writing'?'Thinking…':m.status==='stopped'?'Reply stopped.':'No reply was generated.'));
      if(m.status==='stopped'||m.status==='error'){
        const note=doc.createElement('div');note.className='local-chat-message-note';note.textContent=m.status==='stopped'?'Stopped · partial reply':m.error||'The local model could not answer.';article.appendChild(note);
      }
      list.appendChild(article);
    }
    if(nearEnd)list.scrollTop=list.scrollHeight;
  }
  function receive(event){
    const m=event.data;
    if(!m)return;
    if(m.id===loadingId){
      if(m.type==='progress'){progress=Math.max(0,Math.min(1,Number(m.progress)||0));notice=m.text?String(m.text).slice(0,230):'';}
      else if(m.type==='ready'){phase='ready';loadingId=null;notice='';progress=1;}
      else if(m.type==='error'){worker?.terminate();worker=null;phase='error';loadingId=null;notice=friendlyChatError(m.message);}
      controls();return;
    }
    if(!job||m.id!==job.id)return;
    if(m.type==='token'){job.reply.text+=String(m.text||'');if(job.reply.text.length>14000){stop();}renderMessages();}
    else if(m.type==='done'||m.type==='error'){
      const empty=m.type==='done'&&!m.stopped&&!job.reply.text.trim();
      job.reply.status=m.type==='error'||empty?'error':m.stopped?'stopped':'complete';
      if(m.type==='error'||empty){job.reply.error=empty?'The local model returned no text. Try a shorter question or release and reload the model.':friendlyChatError(m.message);notice=job.reply.error;}
      else notice=m.stopped?'Reply stopped. You can ask another question.':'';
      job=null;phase='ready';renderMessages();
      if($('chatStatus'))$('chatStatus').setAttribute('aria-live','polite');
    }
    controls();
  }
  function release(message='Model released from GPU memory. Downloaded files may remain cached for next time.'){
    if(job){job.reply.status='stopped';job=null;}
    worker?.terminate();worker=null;loadingId=null;phase='unloaded';notice=message;progress=0;
    renderMessages();controls();
  }
  function load(){
    if(['loading','generating','ready'].includes(phase))return;
    if(!supported()){notice=status();controls();return;}
    notice='Checking your GPU…';phase='loading';progress=0;loadingId=++serial;controls();
    try{
      const instance=workerFactory();worker=instance;
      instance.onmessage=e=>{if(worker===instance)receive(e);};
      instance.onerror=e=>{if(worker!==instance)return;e.preventDefault?.();release();phase='error';notice=friendlyChatError(e.message||'The model worker failed.');controls();};
      instance.onmessageerror=()=>{if(worker!==instance)return;release();phase='error';notice='The local tutor’s worker connection failed. Try loading again.';controls();};
      worker.postMessage({type:'load',id:loadingId});
    }catch(e){release();phase='error';notice=friendlyChatError(e.message);controls();}
  }
  function send(){
    if(phase!=='ready')return;
    const lab=getLesson(),key=lessonKey(lab);if(!key)return;
    const s=session(key),question=$('chatQuestion').value.trim();
    if(!question||question.length>MAX_QUESTION){notice='Write a question of 1–1,200 characters.';controls();return;}
    pause();
    const snapshot=captureContext(getLesson());let messages;
    try{messages=buildChatMessages(snapshot,question,s.messages);}catch(e){notice=e.message;controls();return;}
    const reply={role:'assistant',text:'',label:snapshot.label,status:'writing'};
    s.messages.push({role:'user',text:question,label:snapshot.label,status:'complete'},reply);
    s.draft='';$('chatQuestion').value='';phase='generating';notice='';
    job={id:++serial,key,reply};renderMessages();controls();
    try{worker.postMessage({type:'generate',id:job.id,messages});}
    catch(e){receive({data:{type:'error',id:job.id,message:e.message}});}
  }
  function stop(){
    if(phase==='loading'){release('Loading cancelled. No paid service was contacted.');return;}
    if(job){notice='Stopping the local reply…';worker?.postMessage({type:'stop',id:job.id});controls();}
  }
  function bind(key){
    const s=session(key);$('chatQuestion').value=s.draft;
    $('chatLoad').addEventListener('click',load);$('chatRelease').addEventListener('click',()=>release());$('chatStop').addEventListener('click',stop);
    $('chatForm').addEventListener('submit',e=>{e.preventDefault();send();});
    $('chatQuestion').addEventListener('input',()=>{s.draft=$('chatQuestion').value;controls();});
    $('chatQuestion').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send();}});
    $('chatNew').addEventListener('click',()=>{if(['loading','generating'].includes(phase))return;s.messages=[];s.draft='';$('chatQuestion').value='';notice='New chat for this exercise. The loaded model stays ready.';renderMessages();controls();});
    for(const [id,text] of [['chatExplain','Explain the highlighted line in simple English. What happens and why?'],['chatChange','Explain what changed before and after this step, and what stayed the same.'],['chatHint','Give me one small hint to understand this exercise, without giving the full solution.']]){
      $(id).addEventListener('click',()=>{s.draft=text;$('chatQuestion').value=text;$('chatQuestion').focus();controls();});
    }
    renderMessages();
  }
  function sync(){
    const lab=getLesson(),key=lessonKey(lab);
    if(!lab?.simulation||!key){view=null;viewKey=null;return;}
    const root=$('localChat');if(!root)return;
    if(view!==root||viewKey!==key){view=root;viewKey=key;bind(key);}
    $('chatContext').textContent='Next question includes: '+lab.module.title+' · '+lab.exercise.id+' · '+(lab.index===0?'starting state':'step '+lab.index)+(lab.frame?.line?' · line '+lab.frame.line:'');
    controls();
  }
  function dispose(){release('Local tutor closed.');view=null;viewKey=null;}
  // Keep DOM bindings for back/forward-cache restores while freeing GPU resources.
  win.addEventListener?.('pagehide',()=>release('Local tutor closed. Load the model again to continue.'));
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&phase==='generating')stop();});
  return {sync,dispose,get phase(){return phase;}};
}
