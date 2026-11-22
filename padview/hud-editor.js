// Settings gestures preview in HTML. Only a completed edit is sent to the host.
(() => {
  const presets=[
    ['PAD CENTER','pad_center'],['ACHIEVEMENT','achievement'],['DX SCORE','dx_score'],['COMBO','combo'],['NOTES','notes'],
    ['SONG TITLE','song_title'],['BPM','text','{bpm}'],['SECONDS','seconds'],['SCORE DETAILS','text','{score_details}'],
    ['SIMAI CURRENT','simai_current'],['SIMAI NEXT','text','{simai_next}'],['SIMAI VISIBLE','simai_visible'],['TEXT','text','{title}']
  ];
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const btn=(s,fn)=>{const n=el('button',s);n.type='button';n.onclick=fn;return n;};
  const style=el('style');style.textContent=`
    .pv-tools,.pv-template-entry{position:relative;pointer-events:auto;font:13px/1.4 system-ui}
    .pv-tools:not([hidden]){display:inline-flex;align-items:center;gap:.4em;margin:4px 6px 4px 0}
    .pv-tools button,.pv-template-entry,.pv-bubble button,.pv-config-dialog button{border:1px solid #555;border-radius:5px;padding:.32em .65em;background:#252525;color:#f3f1ec;cursor:pointer}
    .pv-tools button[aria-pressed=true]{background:#4a4946}
    [data-padview-layout=overlay] .pv-tools{z-index:3;position:absolute;right:5px;top:5px}
    .padview-hud.flow.positioned{display:block;position:relative;container-type:size;height:clamp(320px,48vh,620px);width:100%}
    .padview-hud.flow.positioned [data-block]{font-size:clamp(8px,var(--block-font),36px)!important;text-align:var(--block-align)!important}
    .padview-hud[data-editing=true]{pointer-events:auto!important;outline:1px dashed #c7c6c2;outline-offset:-1px;background-color:#ffffff09}
    .padview-hud[data-editing=true] [data-block]{outline:1px dashed #969590;min-height:16px;min-width:10px;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
    .padview-hud[data-editing=true] [data-block] *{pointer-events:none;cursor:inherit}
    .padview-hud[data-editing=true] [data-selected]{outline:2px solid #f7f6f2;z-index:1}
    .padview-hud[data-editing=true] [data-block]:not(:has(.padview-text:not(:empty)))::before{content:attr(aria-label);font:10px system-ui;color:#dad9d5}
    .pv-bubble,.pv-config-dialog{border:1px solid #606060;border-radius:9px;padding:10px;background:#191919;color:#f3f1ec;font:13px/1.4 system-ui;box-shadow:0 5px 20px #0006;color-scheme:dark}
    .pv-bubble{z-index:10000;position:fixed;width:min(246px,calc(100vw - 14px));box-sizing:border-box;max-height:calc(100dvh - 12px);overflow:auto}
    .pv-bubble header,.pv-config-dialog>div{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:5px}
    .pv-bubble header{justify-content:space-between}.pv-bubble header strong{overflow-wrap:anywhere}
    .pv-bubble section,.pv-config-dialog fieldset:not([hidden]){display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .pv-bubble label{display:grid;gap:2px}.pv-bubble .wide{grid-column:1/-1}
    .pv-bubble input,.pv-bubble textarea,.pv-config-dialog input,.pv-config-dialog select{border:1px solid #535353;border-radius:4px;background:#101010;color:inherit;min-width:0;padding:4px;font:inherit}
    :is(.pv-bubble,.viewer-setting) input[type=number]{appearance:textfield;-moz-appearance:textfield}
    :is(.pv-bubble,.viewer-setting) input[type=number]::-webkit-inner-spin-button{appearance:none}
    :is(.pv-bubble,.viewer-setting) input[type=number]:enabled,.pv-scrub-grip:not([aria-disabled=true]),.viewer-setting output[data-scrub]{cursor:ew-resize;touch-action:pan-y}
    .pv-setting-choice{grid-column:1/-1;display:flex;align-items:stretch;gap:4px;min-width:0}
    .pv-setting-choice select{flex:1;min-width:0}.pv-scrub-grip{display:grid;place-items:center;min-width:32px;border:1px solid currentColor;border-radius:6px}
    .pv-scrub-grip,.viewer-setting output[data-scrub]{user-select:none;-webkit-user-select:none}.pv-scrub-grip[aria-disabled=true]{opacity:.45}
    .pv-bubble textarea{resize:vertical}.pv-bubble details{grid-column:1/-1;overflow-wrap:anywhere}.pv-bubble summary{cursor:pointer}
    .pv-bubble small{display:block;color:#b8b7b3;margin-top:6px}
    .pv-template-choices{display:grid;gap:4px}.pv-template-choices>div{display:flex;gap:4px}.pv-template-choices button:first-child{flex:1;text-align:start;overflow-wrap:anywhere}.pv-bubble button:disabled{opacity:.5}.pv-config-dialog{max-width:min(32rem,92vw);max-height:85dvh;overflow:auto}.pv-config-dialog::backdrop{background:#0009}
  `;document.head.append(style);
  // Delegate once: the sidebar can replace its fields after each committed edit.
  // Native setters let React see a single input event on release, as in the plain HTML editor.
  const numberSelector=':is(.pv-bubble,.viewer-setting) input[type=number]';
  const setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  let scrub=null;
  function preview(d,value){
    if(d.choice){d.input.selectedIndex=value;return;}
    setValue.call(d.input,String(value));
    if(d.slider)d.slider.value=String(Number(value)/d.scale);
    if(d.output)d.output.textContent=value+(d.scale===100?'%':'');
    d.input.dispatchEvent(new Event('padview-scrub'));
  }
  function finishScrub(cancel=false){
    const d=scrub;if(!d)return;
    scrub=null;
    delete document.documentElement.dataset.padviewScrubbing;
    if(d.handle.hasPointerCapture(d.id))d.handle.releasePointerCapture(d.id);
    if(!d.input.isConnected)return;
    cancel ||= d.input.matches(':disabled');
    if(!d.moved){
      if(!cancel){d.input.focus({preventScroll:true});if(!d.choice)d.input.select();}
      return;
    }
    if(cancel){
      preview(d,d.initial);
    }else if((d.choice?d.input.selectedIndex:d.input.value)!==d.initial){
      if(!d.choice)d.input.dispatchEvent(new Event('input',{bubbles:true}));
      d.input.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
  document.addEventListener('pointerdown',e=>{
    if(scrub||e.button!==0||!e.isPrimary)return;
    const handle=e.target,row=handle.closest?.('[data-setting]'),choice=handle.matches?.('.pv-scrub-grip');
    const input=choice?row?.querySelector('select'):handle.matches?.(numberSelector)?handle:
      handle.matches?.('output[data-scrub]')?row?.querySelector('input[type=number]'):null;
    if(!input||input.matches(':disabled')||input.readOnly)return;
    const value=choice?input.selectedIndex:input.valueAsNumber;
    if(!Number.isFinite(value)||(choice&&(value<0||input.options.length<2)))return;
    e.preventDefault();
    scrub={id:e.pointerId,input,handle,choice,initial:choice?value:input.value,value,x:e.clientX,moved:false,
      slider:row?.querySelector('input[type=range]'),output:row?.querySelector('output[data-scrub]'),scale:Number(input.dataset.scale)||1};
    document.documentElement.dataset.padviewScrubbing='';
    handle.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove',e=>{
    const d=scrub;if(!d||e.pointerId!==d.id)return;
    const dx=e.clientX-d.x;if(!d.moved&&Math.abs(dx)<4)return;
    d.moved=true;d.x=e.clientX;
    const input=d.input,min=d.choice?0:Number(input.min),max=d.choice?input.options.length-1:Number(input.max);
    const step=d.choice?1:Number(input.step)||1,rate=d.choice?1/16:(max-min)/400;
    d.value=clamp(d.value+dx*rate*(e.shiftKey ? 0.1 : 1),min,max);
    const value=clamp(Number((min+Math.round((d.value-min)/step)*step).toFixed(10)),min,max);
    if((d.choice?input.selectedIndex:input.valueAsNumber)!==value)preview(d,value);
  });
  document.addEventListener('pointerup',e=>{if(e.pointerId===scrub?.id)finishScrub();});
  for(const type of ['pointercancel','lostpointercapture'])document.addEventListener(type,e=>{if(e.pointerId===scrub?.id)finishScrub(true);});
  window.addEventListener('blur',()=>finishScrub(true));
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&scrub){e.preventDefault();e.stopImmediatePropagation();finishScrub(true);}
  },true);
  function create({root,container,flow,render,commit}) {
    const tools=el('div');tools.className='pv-tools';tools.hidden=true;container.insertBefore(tools,root);
    const toggle=btn('编辑信息',()=>editing(!active)),plus=btn('＋ 添加',()=>palette([.05,.05]));tools.append(toggle,plus);plus.hidden=true;
    const box=el('div');box.className='pv-bubble';box.hidden=true;box.setAttribute('role','dialog');document.body.append(box);
    let active=false,selected=null,point=null,drag=null,model=null,latest=null,catalogue=null,pending=0,anchor=null;
    const life=new AbortController(),listen={signal:life.signal};
    const blockNode=()=>selected==null?null:root.querySelector('[data-block="'+selected+'"]');
    function coords(e){const r=root.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];}
    function position(){
      if(box.hidden||box.contains(scrub?.input||null))return;
      const r=root.getBoundingClientRect(), n=blockNode()?.getBoundingClientRect();
      const x=point?r.left+point[0]*r.width:n?.left, y=point?r.top+point[1]*r.height:n?.bottom;
      if(x==null||y==null){close();return;}
      box.style.left=clamp(x,5,innerWidth-box.offsetWidth-5)+'px';
      box.style.top=clamp(y+6+box.offsetHeight>innerHeight ? (point?y:n.top)-box.offsetHeight-6:y+6,5,innerHeight-box.offsetHeight-5)+'px';
    }
    function paint(){
      for(const n of root.querySelectorAll('[data-block]')){
        if(active){n.tabIndex=0;n.setAttribute('role','button');const b=model.blocks[n.dataset.block];n.setAttribute('aria-label',b.label||nameFor(b));}
        n.toggleAttribute('data-selected',active&&String(selected)===n.dataset.block);
      }
      position();
    }
    function nameFor(b){return presets.find(([,kind,text])=>kind===b.kind&&(!text||text===b.text))?.[0]||'TEXT';}
    function close(){if(box.contains(scrub?.input||null))finishScrub(true);box.hidden=true;selected=point=anchor=null;root.querySelector('[data-selected]')?.removeAttribute('data-selected');}
    function editing(v){
      if(!model)return;
      active=v;close();root.dataset.editing=String(v);tools.hidden=!flow&&!v;plus.hidden=!v;toggle.textContent=v?'完成编辑':'编辑信息';
      toggle.setAttribute('aria-pressed',String(v));render(model);paint();
    }
    function sync(next,cat){
      latest=next;if(cat)catalogue=cat;
      if(!next){pending=0;model=null;active=false;drag=null;close();tools.hidden=true;plus.hidden=true;toggle.textContent='编辑信息';toggle.setAttribute('aria-pressed','false');root.dataset.editing='false';}
      else {if(!pending)model=next;tools.hidden=!flow&&!active;if(selected!=null&&!model?.blocks[selected]?.enabled)close();}
      return model;
    }
    async function write(blocks){
      const desired={...model,enabled:true,positioned:true,blocks};model=desired;pending++;render(desired);paint();
      try{await commit({'params.info_blocks.blocks':blocks,'params.info_blocks.enabled':true,'params.info_blocks.positioned':true});}
      finally{if(pending&&!--pending&&latest){model=latest;render(model);paint();}}
    }
    function frame(title){
      box.replaceChildren();box.hidden=false;box.setAttribute('aria-label',title);
      const head=el('header'),titleEl=el('strong',title);head.append(titleEl,btn('关闭',close));box.append(head);
      const body=el('section');box.append(body);return body;
    }
    function add(i,p){
      if(!active||!catalogue?.component_default||model.blocks.length>=32)return;
      const [label,kind,text]=presets[i],b=structuredClone(catalogue.component_default);
      Object.assign(b,{enabled:true,label:kind==='pad_center'?'':label,kind,position:p.map(v=>clamp(v,0,.99))});if(text)b.text=text;
      b.width=clamp(b.width,.02,Math.max(.02,1-b.position[0]));
      selected=model.blocks.length;point=null;void write([...model.blocks,b]);inspect(selected);
    }
    function palette(p){
      close();point=p;const body=frame('添加信息组件');
      for(const [i,[label]] of presets.entries()){
        const b=btn(label,()=>add(i,p));b.disabled=model.blocks.length>=32;b.draggable=!b.disabled;
        b.ondragstart=e=>{e.dataTransfer.setData('application/x-padview-component',String(i));e.dataTransfer.effectAllowed='copy';};
        body.append(b);
      }
      if(model.blocks.length>=32)body.append(el('small','最多 32 个组件'));position();
    }
    function inspect(index){
      const b=model?.blocks[index];if(!b)return close();
      selected=index;point=null;const body=frame(b.label||nameFor(b));anchor=index;
      function field(label,key,value,min,max,step){
        const multiline=key==='text'||key==='template';
        const wrap=el('label',label),input=el(multiline?'textarea':'input');input.dataset.field=key;
        if(min!==undefined){Object.assign(input,{type:'number',min,max,step});}else {if(multiline){input.rows=3;}else input.type='text';input.maxLength=1000;wrap.className='wide';}
        input.value=value;
        function applyField(preview){
          if(anchor!==index||!model?.blocks[index])return;
          const item={...model.blocks[index]};const v=input.type==='number'?input.valueAsNumber:input.value;
          if(input.type==='number'&&(!Number.isFinite(v)||v<min||v>max)){input.value=value;return;}
          if(key==='x'||key==='y'){item.position=[...item.position];item.position[key==='x'?0:1]=v/100;}
          else if(key==='template'){
            item.template=v===defaultTemplate?'':v;
            if(!v)input.value=defaultTemplate;
          }else item[key]=key==='width'?v/100:v;
          item.width=clamp(item.width,.02,Math.max(.02,1-item.position[0]));
          if(preview){
            const node=blockNode();if(!node)return;
            node.style.left=item.position[0]*100+'%';node.style.top=item.position[1]*100+'%';
            node.style.width=item.width*100+'%';node.style.fontSize=item.font_size/10.8+'cqh';
            node.style.setProperty('--block-font',node.style.fontSize);
          }else{const blocks=model.blocks.slice();blocks[index]=item;void write(blocks);}
          if(key==='label')box.querySelector('strong').textContent=item.label||nameFor(item);
          const width=body.querySelector('[data-field=width]');if(width)width.value=Number((item.width*100).toFixed(2));
        }
        input.onchange=()=>applyField(false);
        if(input.type==='number')input.addEventListener('padview-scrub',()=>applyField(true));
        wrap.append(input);body.append(wrap);
      }
      field('X (%)','x',Number((b.position[0]*100).toFixed(2)),0,99,.1);
      field('Y (%)','y',Number((b.position[1]*100).toFixed(2)),0,99,.1);
      field('宽度 (%)','width',Number((b.width*100).toFixed(2)),2,100,.1);
      field('字号','font_size',b.font_size,8,160,1);field('标题','label',b.label);
      if(b.kind==='pad_center'){
        const change=(key,value)=>{const blocks=model.blocks.slice();blocks[index]={...blocks[index],[key]:value};void write(blocks);};
        const select=el('select');select.dataset.field='center_source';
        for(const o of catalogue.component_center_sources)select.add(new Option(o.label,o.value));
        select.value=b.center_source;select.onchange=()=>change('center_source',select.value);
        const source=el('label','中心读数');source.className='wide';source.append(select);body.append(source);
        const titleStyle=el('select');titleStyle.dataset.field='center_label';
        for(const [v,t] of [['original','原版字图'],['text','文字'],['hidden','隐藏']])titleStyle.add(new Option(t,v));
        titleStyle.value=b.center_label||'original';titleStyle.onchange=()=>change('center_label',titleStyle.value);
        const heading=el('label','中心标题字样');heading.append(titleStyle);body.append(heading);
        const value=el('input');value.type='checkbox';value.dataset.field='center_show_value';value.checked=b.center_show_value!==false;
        value.onchange=()=>change('center_show_value',value.checked);const valueLabel=el('label','显示中心数值');valueLabel.append(value);body.append(valueLabel);
        const digits=el('input');digits.type='checkbox';digits.checked=b.center_digits!==false;digits.dataset.field='center_digits';
        digits.onchange=()=>change('center_digits',digits.checked);
        const style=el('label','默认模板使用原版数字');style.className='wide';style.append(digits);body.append(style);
      }
      const defaultTemplate=catalogue.component_types?.find(c=>c.value===b.kind)?.default_template||'';
      field('模板文字',b.kind==='text'?'text':'template',b.kind==='text'?b.text:b.template||defaultTemplate);
      const help=el('details');help.append(el('summary','可用占位符'),el('small',catalogue.component_template_fields));body.append(help);
      body.append(btn('删除组件',()=>{close();void write(model.blocks.filter((_,i)=>i!==index));}));
      box.append(el('small','左右拖动数字 · Shift 细调 · 单击输入'));paint();
    }
    root.addEventListener('contextmenu',e=>{if(active){e.preventDefault();palette(coords(e));}},listen);
    root.addEventListener('dragover',e=>{if(active&&e.dataTransfer.types.includes('application/x-padview-component'))e.preventDefault();},listen);
    root.addEventListener('drop',e=>{
      const raw=e.dataTransfer.getData('application/x-padview-component');
      if(active&&/^\d+$/.test(raw)&&presets[+raw]){e.preventDefault();add(+raw,coords(e));}
    },listen);
    root.addEventListener('pointerdown',e=>{
      if(!active||e.button!==0||!e.isPrimary)return;
      const n=e.target.closest('[data-block]');close();if(!n)return;
      e.preventDefault();selected=+n.dataset.block;const b=model.blocks[selected];
      drag={id:e.pointerId,n,start:coords(e),original:b.position};root.setPointerCapture(e.pointerId);paint();
    },listen);
    root.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const p=coords(e),r=root.getBoundingClientRect(),d=drag;
      if(!d.pos&&Math.hypot((p[0]-d.start[0])*r.width,(p[1]-d.start[1])*r.height)<3)return;
      d.pos=p.map((v,i)=>clamp(d.original[i]+v-d.start[i],0,i===0?Math.max(0,1-model.blocks[selected].width):.99));
      d.n.style.left=d.pos[0]*100+'%';d.n.style.top=d.pos[1]*100+'%';
    },listen);
    root.addEventListener('pointerup',e=>{
      if(drag?.id!==e.pointerId)return;const d=drag;drag=null;
      if(d.pos){const blocks=model.blocks.slice();blocks[selected]={...blocks[selected],position:d.pos};void write(blocks);}
      inspect(selected);
    },listen);
    root.addEventListener('lostpointercapture',()=>{if(drag){drag=null;render(model);close();}},listen);
    root.addEventListener('keydown',e=>{if(active&&['Enter',' '].includes(e.key)&&e.target.hasAttribute('data-block')){e.preventDefault();inspect(+e.target.dataset.block);}},listen);
    document.addEventListener('keydown',e=>{if(active&&e.key==='Escape'){if(!box.hidden)close();else editing(false);}},listen);
    document.addEventListener('pointerdown',e=>{if(!box.hidden&&!box.contains(e.target)&&!root.contains(e.target)&&!tools.contains(e.target))close();},listen);
    window.addEventListener('scroll',position,{...listen,capture:true});window.addEventListener('resize',position,listen);
    return {sync,paint,editing,remove(){life.abort();tools.remove();box.remove();}};
  }
  globalThis.PadviewHudEditor={create};
})();
