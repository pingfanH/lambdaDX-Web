// Owned by the primary pane. Comparisons consume its effective presentation.
(() => {
  const url='/api/padview/config', equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  const button=(s,fn)=>{const b=element('button',s);b.type='button';b.onclick=fn;return b;};
  function create({container,transparent,apply,notify,readOnly=false,canPlay=true}) {
    let remote=null, queue=Promise.resolve(), conflicted=false, disposed=false, ui=null, settings=null, playable=false, chart=false;
    const lifetime=new AbortController(), listen={signal:lifetime.signal};
    const serial=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
    async function read() {
      const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('配置服务不可用（HTTP '+response.status+'）');
      const result=await response.json();
      if(!Number.isSafeInteger(result.revision)||!Array.isArray(result.templates))throw Error('配置服务响应无效');
      return result;
    }
    function show(message){if(!disposed){notify(message);if(ui)ui.status.textContent=message;}}
    async function load() {
      return serial(async()=>{const previous=remote;
        try {remote=await read();conflicted=false;render();return remote.profile;}
        catch(e){remote=previous;show('未能读取统一配置：'+e.message);return previous?.profile;}
      });
    }
    async function write(key,value) {
      if(readOnly)return false;
      return serial(async()=>{
        try {
          if(conflicted)throw Error('其他设备已修改同一配置，请重新载入后再编辑。');
          if(!remote){const latest=await read();if(key==='profile'&&latest.profile || key==='templates'&&latest.templates.length){conflicted=true;throw Error('请重新载入统一配置后再编辑。');}remote=latest;}
          const before=remote[key];
          if(equal(before,value))return true;
          for(let attempt=0;attempt<2;attempt++){
            const response=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({revision:remote.revision,[key]:value}),signal:AbortSignal.timeout(6000)});
            if(response.status===409){
              const latest=await read();
              if(!equal(before,latest[key])){conflicted=true;throw Error('其他设备已修改同一配置，请重新载入后再编辑。');}
              remote=latest;continue;
            }
            if(!response.ok)throw Error('HTTP '+response.status);
            remote={...remote,[key]:value,revision:(await response.json()).revision};render();return true;
          }
          throw Error('配置正在被修改，请重试。');
        }catch(e){show('未同步：'+e.message);return false;}
      });
    }
    const templates=()=>remote?.templates||[];
    // A Viewer can edit the shared display without changing the Player input preference.
    const profileValue=(presentation,manual)=>({presentation,playable:canPlay?manual:remote?.profile?.playable===true});
    const saveProfile=(presentation,manual)=>write('profile',profileValue(presentation,manual));
    function render(){
      if(!ui)return;
      ui.choices.replaceChildren();
      const option=(id,name,custom=false)=>{
        const row=element('div'),use=button(name,()=>switchTo(id));use.dataset.template=id;row.append(use);
        if(custom&&!readOnly){const remove=button('删除',()=>write('templates',templates().filter(t=>'user:'+t.name!==id)));
          remove.setAttribute('aria-label','删除 '+name);row.append(remove);}
        ui.choices.append(row);
      };
      option('classic','旧框外观');option('modern','原版外观');
      for(const t of templates())option('user:'+t.name,t.name+(t.kind==='patch'?' · 增量':''),true);
    }
    function switchTo(id){
      const t=templates().find(t=>'user:'+t.name===id);
      if(id==='classic'||id==='modern')apply({patch:{'params.classic_visuals':id==='classic'}});
      else if(t?.kind==='full'){apply({presentation:t.value.presentation,templatePlayable:t.value.playable});}
      else if(t)apply({patch:t.value});
    }
    function open(){
      if(!settings)return;
      if(readOnly)void load();
      if(ui){if(!ui.box.open)ui.box.showModal();return;}
      const box=element('dialog');box.className='pv-config-dialog';box.setAttribute('aria-label','配置模板');
      const head=element('h3','配置模板'),choices=element('section');choices.className='pv-template-choices';
      const status=element('small');status.setAttribute('role','status');
      const close=button('关闭',()=>box.close());
      function showDialog(){document.body.append(box);ui={box,status,choices};render();box.showModal();}
      if(readOnly){box.append(head,choices,close,status);showDialog();return;}
      const name=element('input');name.maxLength=64;name.placeholder='新模板名称';name.setAttribute('aria-label','新模板名称');
      const kind=element('select');kind.setAttribute('aria-label','保存范围');kind.add(new Option('完整配置','full'));kind.add(new Option('增量：只保存勾选的分类','patch'));
      const groups=element('fieldset');groups.hidden=true;
      for(const group of settings.catalogue.groups){
        const label=element('label'),input=element('input');input.type='checkbox';input.value=group.id;label.append(input,group.label);groups.append(label);
      }
      kind.onchange=()=>{groups.hidden=kind.value!=='patch';};
      const save=button('新建模板',async()=>{
        const n=name.value.trim();if(!n||templates().some(t=>t.name===n)){status.textContent='请输入未使用的模板名称。';return;}
        if(templates().length>=24){status.textContent='最多保存 24 个模板。';return;}
        let value=profileValue(settings.presentation,playable);
        if(kind.value==='patch'){
          const selected=new Set([...groups.querySelectorAll(':checked')].map(e=>e.value));value={};
          for(const f of settings.catalogue.items)if(selected.has(f.group)&&!f.native_only){
            const v=f.key.split('.').reduce((o,k)=>o?.[k],settings.presentation);
            if(v!==undefined)value[f.key]=v;
          }
          if(!Object.keys(value).length){status.textContent='请至少选择一个分类。';return;}
        }
        if(await write('templates',[...templates(),{name:n,kind:kind.value,value}])){name.value='';status.textContent='模板已保存到服务器。';}
      });
      const line=(...nodes)=>{const d=element('div');d.append(...nodes);return d;};
      box.append(head,choices,element('hr'),line(name,kind),groups,line(save,close),status);
      showDialog();
    }
    const entry=button('配置模板',open);entry.className='pv-template-entry';entry.hidden=true;container.insertBefore(entry,container.querySelector('.padview-hud'));
    const refresh=()=>{if(!chart||document.hidden||disposed||ui?.box.open)return;
      // Serialize the read behind outstanding edits and don't interrupt a chart if only templates changed.
      void serial(async()=>{try{
        const old=remote,latest=await read();if(disposed||conflicted)return;
        remote=latest;render();
        if(latest.profile&&!equal(old?.profile,latest.profile)){apply({presentation:latest.profile.presentation,templatePlayable:latest.profile.playable,remote:true});}
      }catch(e){show('未能刷新统一配置：'+e.message);}});
    };
    if(!readOnly){
      window.addEventListener('focus',refresh,listen);
      document.addEventListener('visibilitychange',refresh,listen);
    }
    return {load,saveProfile,open,set(s,manual){settings=s;playable=manual;entry.hidden=transparent||!s;},
      mode(v){playable=v;},chart(v){chart=v;},remove(){disposed=true;lifetime.abort();entry.remove();ui?.box.remove();}};
  }
  globalThis.PadviewProfiles={create};
})();
