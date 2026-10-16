import {buildLessons, Controller, changes, valueOf} from './lessons.mjs';

export const escapeHTML = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function colorLine(line) {
  const pattern=/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:int|char|void|return|while|if)\b|\b\d+\b|\b(?:printf|putchar|ft_\w+)\b)/g;
  let result='',last=0;
  for(const match of line.matchAll(pattern)){
    result+=escapeHTML(line.slice(last,match.index));
    const token=match[0], kind=/^["']/.test(token)?'string':/^\d/.test(token)?'num':/^(printf|putchar|ft_)/.test(token)?'function':'key';
    result+=`<span class="tok-${kind}">${escapeHTML(token)}</span>`;last=match.index+token.length;
  }
  return result+escapeHTML(line.slice(last));
}
export function mountApp(doc=globalThis.document, win=globalThis.window) {
  const $=id=>doc.getElementById(id), lessons=buildLessons(), controller=new Controller(lessons);
  let timer=null, selected=null, savedNotes={};
  const completed=new Set();
  try {const stored=JSON.parse(win.localStorage.getItem('pointerlab-progress')||'[]'); if(Array.isArray(stored))for(const id of stored) if(lessons.some(l=>l.id===id)) completed.add(id);}catch{}
  try {const stored=JSON.parse(win.localStorage.getItem('pointerlab-notes')||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))savedNotes=stored;}catch{}
  const persistProgress=()=>{try{win.localStorage.setItem('pointerlab-progress',JSON.stringify([...completed]));}catch{}};
  function stop(){if(timer!==null)win.clearInterval(timer);timer=null;$('play').innerHTML='<span aria-hidden="true">▷</span> Play';$('play').setAttribute('aria-label','Play automatic steps');$('play').setAttribute('aria-pressed','false');}
  function drawNav(){
    $('lessons').innerHTML=lessons.map((l,i)=>`${i===0?'<div class="lesson-group">THE FOUNDATIONS</div>':i===4?'<div class="lesson-group">YOUR 42 EXERCISES</div>':''}<button class="lesson-item" data-lesson="${l.id}" ${controller.lesson.id===l.id?'aria-current="page"':''} aria-label="Lesson ${i+1}: ${escapeHTML(l.title)}"><span class="lesson-number">${String(i+1).padStart(2,'0')}</span><span class="lesson-text">${escapeHTML(l.title.split(' · ')[0])}<span class="lesson-subtitle">${escapeHTML(l.title.split(' · ')[1]||l.tag)}</span></span><span class="lesson-check">${completed.has(l.id)?'✓':''}</span></button>`).join('');
    $('courseCount').textContent=`${completed.size} of ${lessons.length} explored`;
  }
  function drawInspector(frame){
    const c=frame.cells[selected];
    if(!c){$('inspector').innerHTML='<span class="inspector-icon">⌖</span><p>Choose a variable to compare its address, stored value, and target.</p>';return;}
    let text=`<strong>${escapeHTML(c.name)}</strong> lives at <strong>${c.address}</strong> and stores <strong>${escapeHTML(valueOf(c))}</strong>.`;
    if(c.target){const target=frame.cells[c.target];text+=` Following <strong>*${escapeHTML(c.name)}</strong> reaches <strong>${escapeHTML(target.name)}</strong> at ${target.address}, which stores <strong>${escapeHTML(valueOf(target))}</strong>.`;}
    else if(c.type.includes('*'))text+=' It has no initialized target; do not dereference it.';
    else text+=` <strong>&amp;${escapeHTML(c.name)}</strong> is its address; assignment copies its stored value.`;
    $('inspector').innerHTML=`<span class="inspector-icon">⌖</span><p>${text}</p>`;
  }
  function drawMemory(frame,diff){
    const writeIds=new Set(diff.filter(c=>c.kind!=='removed').map(c=>c.id));
    const cells=Object.values(frame.cells);
    if(!frame.cells[selected])selected=null;
    if(!cells.length)$('memory').innerHTML='<div class="empty-memory"><strong>{ }</strong><span>No variables created yet.</span><span>Take the first step to see memory.</span></div>';
    else {
      const scopes=[...new Set(cells.map(c=>c.scope))];
      $('memory').innerHTML=scopes.map(scope=>`<div class="scope-heading"><span>${escapeHTML(scope)}${scope==='main'?' · CALLER':' · FUNCTION LOCALS'}</span><span>${cells.filter(c=>c.scope===scope).length} OBJECTS</span></div>`+cells.filter(c=>c.scope===scope).map(c=>`<button class="cell ${writeIds.has(c.id)?'written':frame.reads.includes(c.id)?'read':''} ${selected===c.id?'selected':''}" data-cell="${c.id}" aria-label="${escapeHTML(c.name)}, ${escapeHTML(c.type)}, address ${c.address}, stores ${escapeHTML(valueOf(c))}${c.target?', points to '+escapeHTML(frame.cells[c.target].name):''}${writeIds.has(c.id)?', changed this step':frame.reads.includes(c.id)?', read this step':''}" aria-pressed="${selected===c.id}"><span class="cell-name">${escapeHTML(c.name)} <span class="cell-type">${escapeHTML(c.type)}</span></span><span class="cell-address">${c.address}</span><span class="cell-value ${c.value===undefined?'empty':''}">${escapeHTML(valueOf(c))}</span><span class="cell-target">${c.target?'→ '+escapeHTML(frame.cells[c.target].name):''}</span></button>`).join('')).join('');
    }
    const ptrs=cells.filter(c=>c.target);
    $('graph').innerHTML=ptrs.length?ptrs.map(p=>{const t=frame.cells[p.target];return `<div class="connection"><div class="node ${frame.focus.includes(p.id)?'focus':''}">${escapeHTML(p.name)}<small>stores ${p.value}</small></div><span class="connection-arrow" aria-hidden="true">→</span><div class="node ${frame.focus.includes(t.id)?'focus':''}">${escapeHTML(t.name)} = ${escapeHTML(valueOf(t))}<small>at ${t.address}</small></div></div>`;}).join(''):'<p class="connection-empty">No initialized pointer connection at this step.</p>';
    drawInspector(frame);
  }
  function render({scrollCode=true}={}) {
    const lesson=controller.lesson,frame=controller.frame,before=controller.before,diff=controller.index?changes(before,frame):[];
    if(controller.atEnd){completed.add(lesson.id);persistProgress();stop();}
    drawNav();
    $('lessonTag').textContent=lesson.tag==='Foundations'?'FOUNDATIONS':`${lesson.tag.toUpperCase()} · 42 C POINTERS`;
    $('lessonNumber').textContent=`LESSON ${String(controller.lessonIndex+1).padStart(2,'0')}`;
    $('lessonTitle').textContent=lesson.title;$('lessonSummary').textContent=lesson.summary;
    $('stepLabel').textContent=controller.index===0?'Ready to run':`Step ${controller.index} / ${lesson.steps.length-1}`;
    $('operationCount').textContent=`${lesson.steps.length-1} operations`;
    $('timeline').max=lesson.steps.length-1;$('timeline').value=controller.index;
    $('timeline').setAttribute('aria-valuetext',controller.index===0?'Ready to run':`Step ${controller.index}: ${frame.title}`);
    $('prev').disabled=controller.index===0;$('next').disabled=controller.atEnd;$('play').disabled=controller.atEnd;
    $('fileName').textContent=lesson.tag==='Foundations'?`${lesson.id}.c`:`${lesson.id==='function'?'ft_ft':lesson.id==='ultimate'?'ft_ultimate_ft':lesson.id==='swap'?'ft_swap':lesson.id==='divmod'?'ft_div_mod':lesson.id==='ultdiv'?'ft_ultimate_div_mod':lesson.id==='reverse'?'ft_rev_int_tab':'ft_sort_int_tab'}.c`;
    $('scopeLabel').textContent=`${frame.scope}()`;
    const codeEl=$('code'),previousScroll=codeEl.scrollTop||0;
    codeEl.innerHTML=lesson.code.map((l,i)=>`<div class="code-line ${frame.line===i+1?'active':''}" ${frame.line===i+1?'aria-current="step"':''} data-line="${i+1}"><span class="line-num" aria-hidden="true">${i+1}</span><span class="line-text">${colorLine(l)||' '}</span></div>`).join('');
    codeEl.scrollTop=previousScroll;
    if(scrollCode && frame.line){const active=codeEl.querySelector('.active');if(active && (active.offsetTop<codeEl.scrollTop || active.offsetTop+active.offsetHeight>codeEl.scrollTop+codeEl.clientHeight))codeEl.scrollTop=Math.max(0,active.offsetTop-codeEl.clientHeight/2);}
    $('lineLabel').textContent=frame.line?`Line ${frame.line} · ${frame.scope}()${controller.atEnd?' · finished':''}`:'Execution starts in main()';
    $('coachStep').textContent=controller.index===0?'BEFORE EXECUTION':controller.atEnd?'EXAMPLE COMPLETE':`OPERATION ${String(controller.index).padStart(2,'0')}`;
    $('stepTitle').textContent=frame.title;$('what').textContent=frame.what;$('flow').textContent=frame.flow;$('observe').textContent=frame.observe;
    const outputChanged=before.output!==frame.output;
    $('eventBadge').textContent=controller.atEnd?'DONE':controller.index===0?'READY':outputChanged?'OUTPUT':diff.length?'MEMORY':'READ / CHECK';
    $('eventBadge').className=`event-badge ${diff.length||outputChanged?'changed':''}`;
    $('changeCount').textContent=diff.length?`${diff.length} object${diff.length===1?'':'s'}`:outputChanged?'output only':'no memory change';
    $('changes').innerHTML=diff.map(c=>`<div class="change-row"><div class="change-name">${escapeHTML(c.name)}<span class="change-kind">${c.kind==='written'?'value changed':c.kind==='created'?'created':'left scope'}</span></div><div class="change-values"><span class="old-value">${escapeHTML(c.before)}</span><span class="change-arrow" aria-hidden="true">→</span><span class="new-value">${escapeHTML(c.after)}</span></div></div>`).join('');
    if(outputChanged){const addition=frame.output.slice(before.output.length);$('changes').innerHTML+=`<div class="change-row terminal-change"><div class="change-name">terminal<span class="change-kind">appended output</span></div><div class="change-values"><span class="old-value">${before.output.length?'existing output':'empty'}</span><span class="change-arrow" aria-hidden="true">→</span><span class="new-value">+ ${escapeHTML(addition.replace(/\n/g,' ↵\n'))}</span></div></div>`;}
    if(!diff.length&&!outputChanged)$('changes').innerHTML=`<div class="no-change">${controller.index===0?'No operation has executed yet.':'Stored values and terminal output stay unchanged.'}</div>`;
    drawMemory(frame,diff);
    $('terminal').textContent=frame.output;$('terminalEmpty').hidden=!!frame.output;$('terminalStatus').textContent=outputChanged?'OUTPUT ADDED THIS STEP':frame.output?'CURRENT OUTPUT':'WAITING FOR OUTPUT';
    // Expose current state for deterministic integration checks and learning integrations.
    win.PointerLab={controller,lessons,frame,before,diff,render};
  }
  function loadNotes(){const note=savedNotes[controller.lesson.id];$('notes').value=typeof note==='string'?note:'';$('notesStatus').textContent='';}
  function selectLesson(id){stop();controller.select(id);selected=null;$('code').scrollTop=0;loadNotes();render();}
  function move(delta){stop();delta>0?controller.next():controller.previous();render();}
  function start(){
    if(controller.atEnd)return;
    $('play').innerHTML='<span aria-hidden="true">Ⅱ</span> Pause';$('play').setAttribute('aria-label','Pause automatic steps');$('play').setAttribute('aria-pressed','true');
    timer=win.setInterval(()=>{controller.next();render();if(controller.atEnd)stop();},Number($('speed').value)||4000);
  }
  $('lessons').addEventListener('click',e=>{const button=e.target.closest('[data-lesson]');if(button)selectLesson(button.dataset.lesson);});
  $('memory').addEventListener('click',e=>{const button=e.target.closest('[data-cell]');if(button){selected=button.dataset.cell;drawMemory(controller.frame,controller.index?changes(controller.before,controller.frame):[]);}});
  $('prev').addEventListener('click',()=>move(-1));$('next').addEventListener('click',()=>move(1));
  $('reset').addEventListener('click',()=>{stop();controller.reset();selected=null;$('code').scrollTop=0;render();});
  $('timeline').addEventListener('input',()=>{stop();controller.seek($('timeline').value);render();});
  $('play').addEventListener('click',()=>{timer===null?start():stop();});
  $('speed').addEventListener('change',()=>{if(timer!==null){stop();start();}});
  $('helpButton').addEventListener('click',()=>{$('guide').hidden=!$('guide').hidden;$('helpButton').setAttribute('aria-expanded',String(!$('guide').hidden));});
  $('notes').addEventListener('input',()=>{savedNotes[controller.lesson.id]=$('notes').value;try{win.localStorage.setItem('pointerlab-notes',JSON.stringify(savedNotes));$('notesStatus').textContent='Saved locally';}catch{$('notesStatus').textContent='Saving unavailable in this browser';}});
  doc.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.altKey||e.metaKey||['INPUT','SELECT','TEXTAREA','BUTTON','SUMMARY'].includes(e.target.tagName)||e.target.isContentEditable)return;
    if(e.key==='ArrowRight'){e.preventDefault();move(1);}
    else if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}
    else if(e.key.toLowerCase()==='r'){e.preventDefault();$('reset').click();}
    else if(e.code==='Space'){e.preventDefault();timer===null?start():stop();}
  });
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();});
  win.addEventListener('pagehide',stop);
  loadNotes();render();
  return {controller,lessons,render,selectLesson,stop};
}
if(typeof document!=='undefined'&&typeof window!=='undefined')mountApp();
