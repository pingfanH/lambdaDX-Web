const $ = id => document.getElementById(id);
const at = (object, key) => key.split('.').reduce((v, part) => v?.[part], object);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const unsupported = new Set(['params.no_core_autoplay', 'params.judge_offset_ms']);
function unavailable(field, profile, playable) {
  if (field.key.startsWith('params.canvas_background.')) {
    const key = field.key.split('.').pop(), layout = at(profile, 'params.canvas_background.layout');
    if (key === 'tile_scale' && layout !== 'tile') return '选择「重复平铺」后可调整。';
    if (key !== 'source' && key !== 'layout' && layout === 'off') return '启用全画布背景后可调整。';
    if (key === 'pad_brightness' && !at(profile, 'params.canvas_background.pad_background')) return '开启盘内单独设置亮度后可调整。';
  }
  if (field.key === 'params.autoplay_inner_screen' && !playable && at(profile, 'params.no_core')) return '先关闭 NoCore，再使用内屏自动演奏。';
  const finale = at(profile, 'params.sdez.version') === 'Finale';
  if (field.key === 'params.sdez.finale_hard_judge' && !finale) return '选择 FiNALE 1.99 后可调整。';
  if (field.key === 'params.sdez.finale_hard_judge' && !playable && at(profile, 'params.no_core')) return '当前为 NoCore 预览；严格判定只对启用判定核心的游玩生效。';
  if (field.key.startsWith('params.guide_overflow.') && field.key !== 'params.guide_overflow.enabled'
      && !at(profile, 'params.guide_overflow.enabled')) return '开启辅助线飞出效果后调整。';
  if (field.key === 'params.guide_overflow.fixed_speed' && at(profile, 'params.guide_overflow.speed_mode') !== 'Fixed') return '固定流速模式下调整。';
  return '';
}

function componentEditor(blocks, catalogue, disabled, change) {
  const element=(tag,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;return e;};
  const root=element('div','viewer-components');root.dataset.componentsEditor='';
  const hint=element('p');hint.textContent='左右拖动数字，按住 Shift 细调，或单击输入。位置和宽度按百分比计算；字号按 1080p 缩放。';root.append(hint);
  const patch=(index,value)=>change(blocks.map((b,i)=>i===index?{...b,...value}:b));
  const title=b=>b.label||(b.kind==='text' && {'{score_details}':'SCORE DETAILS','{bpm}':'BPM','{simai_next}':'SIMAI NEXT'}[b.text])||catalogue.component_types?.find(c=>c.value===b.kind)?.label||'信息组件';
  blocks.forEach((block,index)=>{
    const details=element('details','viewer-component');details.dataset.componentIndex=index;
    const summary=element('summary'),enabled=element('input'),name=element('span'),remove=element('button');
    enabled.dataset.componentField='enabled';enabled.type='checkbox';enabled.checked=block.enabled;enabled.disabled=disabled;enabled.setAttribute('aria-label','显示 '+title(block));
    enabled.onclick=e=>e.stopPropagation();enabled.onchange=()=>patch(index,{enabled:enabled.checked});name.textContent=title(block);
    remove.type='button';remove.textContent='删除';remove.disabled=disabled;remove.onclick=e=>{e.preventDefault();change(blocks.filter((_,i)=>i!==index));};summary.append(enabled,name,remove);details.append(summary);
    const fields=element('fieldset','viewer-component-fields');fields.disabled=disabled;
    const label=(text,input,cls)=>{input.dataset.componentField=text;const l=element('label',cls);const span=element('span');span.textContent=text;l.append(span,input);fields.append(l);return l;};
    const select=(text,value,choices,key)=>{const e=element('select');for(const c of choices||[])e.add(new Option(c.label,JSON.stringify(c.value)));e.value=JSON.stringify(value??null);e.onchange=()=>patch(index,{[key]:JSON.parse(e.value)});label(text,e);};
    select('组件内容',block.kind,catalogue.component_types,'kind');
    const nameInput=element('input');nameInput.type='text';nameInput.value=block.label;nameInput.onchange=()=>patch(index,{label:nameInput.value});label('标题',nameInput);
    select('字体',block.typeface,catalogue.component_fonts,'typeface');
    const body=element('textarea'),fallback=catalogue.component_types?.find(c=>c.value===block.kind)?.default_template||'';
    body.rows=3;body.maxLength=1000;body.value=block.kind==='text'?block.text:block.template||fallback;
    body.onchange=()=>{
      if(block.kind==='text')patch(index,{text:body.value});
      else {const template=body.value===fallback?'':body.value;if(!body.value)body.value=fallback;patch(index,{template});}
    };
    label('模板文字',body,'viewer-component-wide');
    const help=element('details','viewer-component-wide'),legend=element('summary'),tokens=element('small');
    legend.textContent='可用占位符';tokens.textContent=catalogue.component_template_fields||'';help.append(legend,tokens);fields.append(help);
    if(block.kind==='pad_center'){
      select('中心读数',block.center_source,catalogue.component_center_sources,'center_source');
      select('中心标题字样',block.center_label||'original',[{value:'original',label:'原版字图'},{value:'text',label:'文字'},{value:'hidden',label:'隐藏'}],'center_label');
      const value=element('input');value.type='checkbox';value.checked=block.center_show_value!==false;
      value.onchange=()=>patch(index,{center_show_value:value.checked});label('显示中心数值',value,'viewer-component-toggle');
      const digits=element('input');digits.type='checkbox';digits.checked=block.center_digits!==false;
      digits.onchange=()=>patch(index,{center_digits:digits.checked});label('默认模板使用原版数字',digits,'viewer-component-toggle');
    }
    if(block.kind==='achievement')select('达成率算法',block.achievement_mode,catalogue.component_achievement_modes,'achievement_mode');
    for(const [text,value,min,max,key] of [['水平位置 (%)',block.position[0]*100,0,99,'x'],['垂直位置 (%)',block.position[1]*100,0,99,'y'],['宽度 (%)',block.width*100,2,100,'width'],['字号',block.font_size,8,160,'size']]){
      const e=element('input');Object.assign(e,{type:'number',min,max,step:key==='size'?1:.1,value:Number(value.toFixed(2))});e.onchange=()=>{
        const n=e.valueAsNumber;if(!Number.isFinite(n)||n<min||n>max)return;
        if(key==='x'||key==='y'){const position=[...block.position];position[key==='x'?0:1]=n/100;patch(index,{position});}
        else patch(index,key==='width'?{width:n/100}:{font_size:n});
      };label(text,e);
    }
    select('对齐',block.align,['左对齐','居中','右对齐'].map((label,value)=>({label,value})),'align');
    const color=element('input');color.type='color';color.value='#'+block.color.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
    color.onchange=()=>patch(index,{color:[...color.value.slice(1).match(/../g).map(v=>parseInt(v,16)),block.color[3]]});label('颜色',color);
    const alpha=element('input');Object.assign(alpha,{type:'number',min:0,max:100,value:Math.round(block.color[3]/255*100)});alpha.onchange=()=>{const n=alpha.valueAsNumber;if(Number.isFinite(n)&&n>=0&&n<=100)patch(index,{color:[...block.color.slice(0,3),Math.round(n/100*255)]});};label('透明度 (%)',alpha);
    if(block.kind==='achievement'){const e=element('input');Object.assign(e,{type:'number',min:.01,max:104,step:.01,value:block.target});e.onchange=()=>{const n=e.valueAsNumber;if(Number.isFinite(n)&&n>=.01&&n<=104)patch(index,{target:n});};label('目标 (%)',e);}

    if(['notes','achievement','dx_score'].includes(block.kind)){const e=element('input');e.type='checkbox';e.checked=block.progress_bar;e.onchange=()=>patch(index,{progress_bar:e.checked});label('进度条',e,'viewer-component-toggle');}
    details.append(fields);root.append(details);
  });
  const add=element('button','viewer-component-add');add.type='button';add.textContent='添加组件';add.disabled=disabled||blocks.length>=32||!catalogue.component_default;add.onclick=()=>change([...blocks,JSON.parse(JSON.stringify(catalogue.component_default))]);root.append(add);return root;
}

// The primary viewer validates settings in Rust. Its effective profile is then
// applied to the other viewers, including unsaved edits and newly opened panes.
export class ViewerSettings {
  constructor({frame, stop, changed, transport}) {
    Object.assign(this, {primary: frame, stop, changed, transport});
    this.frames = new Map(); this.group = ''; this.attach(frame);
    $('settings-player').onchange=()=>frame.padview?.setPlayable($('settings-player').checked);
    this.developer = false;
    $('settings-developer').checked = false;
    $('settings-developer').onchange = () => { this.developer = $('settings-developer').checked; this.renderFields(); };
    const setOpen=open=>{
      $('settings-panel').hidden=!open;
      const sidebar=$('review-sidebar');if(sidebar)sidebar.hidden=open;
      document.querySelector('.workbench').classList.toggle('settings-open',open);
      $('settings-open').setAttribute('aria-expanded',String(open));
      if(open){this.render();requestAnimationFrame(()=>{
        const pane=$('settings-panel');
        const target=getComputedStyle(pane).position==='relative'?pane:document.querySelector('.workbench');
        target.scrollIntoView({block:'start',behavior:'smooth'});
      });}
    };
    $('settings-open').onclick=()=>setOpen($('settings-panel').hidden);
    $('settings-close').onclick=()=>{setOpen(false);$('settings-open').focus();};
    $('settings-panel').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);$('settings-open').focus();}});
    $('settings-search').oninput = () => this.renderFields(true);
    $('settings-fields').onscroll = () => this.updateGroup();
    $('settings-templates').onclick=()=>frame.padview?.openTemplates();
    $('settings-edit-info').onclick=()=>{setOpen(false);frame.padview?.editInfo();};
    $('settings-save').onclick = () => this.configure({save: true});
    $('settings-reset').onclick = () => this.configure({reset: true});
    $('settings-restore').onclick = () => this.configure({restoreChart: true});
    $('settings-retry').onclick = () => {
      this.stop();
      for (const [frame, state] of this.frames) if (state.error && state.last) this.send(frame, state.last);
      this.refresh();
    };
    window.addEventListener('padview-message', event => this.message(event));
  }

  attach(frame) { this.frames.set(frame, {busy: true, loaded: false, hasChart: false}); }
  detach(frame) { this.frames.delete(frame); this.refresh(); }
  beforeLoad(frame) {
    const state = this.frames.get(frame);
    if (state) Object.assign(state, {busy: true, loaded: false, hasChart: true, error: null});
    this.refresh();
    return this.profile;
  }
  get ready() { return [...this.frames.values()].every(s => s.loaded && !s.busy && !s.error); }
  get busy() { return [...this.frames.values()].some(s => s.busy); }
  send(frame, message) {
    const state = this.frames.get(frame); if (!state) return;
    Object.assign(state, {busy: true, error: null, last: message});
    if (message.save) frame.padview?.saveSettings();
    else frame.padview?.configure(message);
  }
  configure(message) {
    if (!this.profile) return;
    const keys=Object.keys(message.patch||{});
    const volume=keys.length>0 && keys.every(key=>/^params\.(music_volume|hit_sfx_volume|answer_sfx_volume)$/.test(key)||/^params\.sdez\.values\.\w+Volume$/.test(key));
    if(this.busy){if(volume)this.pendingVolumes={...this.pendingVolumes,...message.patch};else if(keys.length===1&&keys[0]==='params.info_blocks.blocks')this.pendingComponents=message.patch;return;}
    if(!volume)this.stop(); this.notice = '';
    this.send(this.primary, message); this.refresh();
  }
  patch(patch) { this.configure({patch}); }
  synchronize() {
    if (!this.profile) return;
    for (const [frame, state] of this.frames) if (frame !== this.primary && state.loaded && !state.busy && !state.error && !same(state.profile, this.profile)) {
      this.send(frame, {presentation: this.profile});
    }
  }
  message(event) {

    if (event.target === this.primary) {
      if (event.detail?.type==='padview:ready') $('settings-player').disabled=!event.detail.capabilities?.playable;
      if (event.detail?.type==='padview:input-mode') {
        this.playable=$('settings-player').checked=event.detail.playable;
        if (!$('settings-panel').hidden) this.renderFields();
        return;
      }
    }
    const entry = [...this.frames].find(([frame]) => frame === event.target);
    if (!entry) return;
    const [frame, state] = entry, m = event.detail;
    if(m?.type==='padview:sync-status' && frame===this.primary){this.notice=m.message;this.render();return;}
    if (!m?.type?.startsWith('padview:settings')) return;
    if (m.type === 'padview:settings') {
      if (frame === this.primary) this.catalogue = m.catalogue;
      // Startup reports defaults before the chart and saved preferences load.
      if (state.hasChart && (m.busy || state.loaded)) {
        state.profile = m.presentation;
        if (frame === this.primary) {
          this.profile = m.presentation;
          this.transport(this.profile);
        }
      }
    } else if (m.type === 'padview:settings-busy') state.busy = true;
    else if (m.type === 'padview:settings-idle') {
      state.busy = false; state.loaded = state.hasChart && !!state.profile;
      this.synchronize();
    } else if (m.type === 'padview:settings-error') {
      state.error = m.message || '设置未能应用'; this.stop();
    } else if (m.type === 'padview:settings-saved') this.notice = '设置已同步到服务器。';
    this.refresh();
  }
  refresh() {
    if(!this.busy&&this.pendingComponents&&![...this.frames.values()].some(state=>state.error)){
      const patch=this.pendingComponents;this.pendingComponents=null;this.patch(patch);return;
    }
    if(!this.busy&&!this.pendingComponents&&![...this.frames.values()].some(state=>state.error))this.componentDraft=null;
    if(!this.busy&&this.pendingVolumes&&![...this.frames.values()].some(state=>state.error)){
      const patch=this.pendingVolumes;this.pendingVolumes=null;this.patch(patch);return;
    }
    this.render(); this.changed();
  }
  render() {
    $('settings-open').disabled = !this.profile;
    for (const id of ['settings-save', 'settings-reset', 'settings-restore']) $(id).disabled = !this.profile || this.busy;
    const errors = [...this.frames.values()].filter(s => s.error);
    $('settings-retry').hidden = !errors.length;
    $('settings-retry').disabled = this.busy;
    const status = this.busy && this.profile ? '正在应用设置，首次切换皮肤或音效需要下载…' : errors.map(s => s.error).join('；') || this.notice || '音量可在播放中调整，其他设置修改时暂停并保留进度。';
    $('settings-status').textContent = status;
    $('settings-warning').hidden = !errors.length;
    $('settings-warning').textContent = errors.length ? '预览设置未能同步，请打开「播放器设置」重试或恢复默认。' : '';
    this.renderFields();
  }
  updateGroup() {
    const container = $('settings-fields'), top = container.getBoundingClientRect().top + 24;
    const sections = [...container.querySelectorAll('[data-settings-group]')];
    const current = sections.filter(section => section.getBoundingClientRect().top <= top).at(-1) || sections[0];
    if (current) this.group = current.dataset.settingsGroup;
    for (const button of $('settings-group').children) button.setAttribute('aria-pressed', String(button.dataset.group === this.group));
  }
  jumpTo(id) {
    const container = $('settings-fields'), section = [...container.children].find(section => section.dataset.settingsGroup === id);
    if (!section) return;
    this.group = id;
    for (const button of $('settings-group').children) button.setAttribute('aria-pressed', String(button.dataset.group === id));
    container.scrollTo({top: container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top, behavior: 'smooth'});
  }
  renderFields(resetScroll = false) {
    if ($('settings-panel').hidden || !this.catalogue || !this.profile) return;
    const active=document.activeElement,focused=active?.closest('[data-component-index]');
    const focus=focused&&active.dataset.componentField?{index:focused.dataset.componentIndex,field:active.dataset.componentField,start:active.selectionStart,end:active.selectionEnd}:null;
    const groups = this.catalogue.groups;
    const search = $('settings-search').value.trim().toLowerCase();
    const fields = this.catalogue.items.filter(f => !f.native_only && (this.developer || !f.developer) && !unsupported.has(f.key) &&
      `${f.label} ${f.key} ${f.kind==='components'?'曲名 歌曲名称 SONG TITLE 达成率 秒数 SECONDS BPM Simai Combo DX Note PAD CENTER 盘内 中心 连击 生命值 文本 组件':''}`.toLowerCase().includes(search));
    const sections = groups.map(group => ({...group, fields: fields.filter(field => field.group === group.id)})).filter(group => group.fields.length);
    if (!sections.some(g => g.id === this.group)) this.group = sections[0]?.id;
    $('settings-group').replaceChildren(...groups.map(group => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = group.label;
      button.dataset.group = group.id; button.disabled = !sections.some(section => section.id === group.id);
      button.setAttribute('aria-pressed', String(group.id === this.group)); button.setAttribute('aria-controls', 'settings-group-' + group.id);
      button.onclick = () => this.jumpTo(group.id); return button;
    }));
    const container = $('settings-fields'), scroll = resetScroll ? 0 : container.scrollTop;
    const expanded=new Set([...container.querySelectorAll('[data-component-index][open]')].map(e=>e.dataset.componentIndex));
    container.replaceChildren(); container.setAttribute('aria-busy', String(this.busy));
    for (const group of sections) {
      const section = document.createElement('section'), heading = document.createElement('h3');
      section.id = 'settings-group-' + group.id; section.dataset.settingsGroup = group.id; section.className = 'settings-section';
      heading.id = 'settings-heading-' + group.id; heading.textContent = group.label;
      section.setAttribute('aria-labelledby', heading.id); section.append(heading);
    for (const field of group.fields) {
      const row = document.createElement('div'), label = document.createElement('label');
      row.className = 'viewer-setting'; row.dataset.setting = field.key;
      if (field.developer) row.dataset.developer = 'true';
      const value = at(this.profile, field.key), reason = unavailable(field, this.profile, this.playable), controlled = !!reason;
      const id = 'setting-' + field.key; label.htmlFor = id; label.textContent = field.label;
      row.append(label);
      if(field.kind==='components'){
        row.classList.add('viewer-setting-components');row.replaceChildren(componentEditor(this.componentDraft||value||[],this.catalogue,false,blocks=>{this.componentDraft=blocks;this.patch({[field.key]:blocks});}));
        section.append(row);continue;
      }
      let input;
      if (field.kind === 'choice') {
        input = document.createElement('select');
        for (const choice of field.choices || []) {
          const option = new Option(choice.label, JSON.stringify(choice.value));
          if (choice.help) option.title = choice.help;
          input.add(option);
        }
        input.value = JSON.stringify(value ?? null);
        input.onchange = () => this.patch({[field.key]: JSON.parse(input.value)});
      } else {
        input = document.createElement('input');
        input.type = field.kind === 'toggle' ? 'checkbox' : field.kind === 'range' ? 'range' : 'text';
        if (field.kind === 'toggle') { input.checked = value === true; input.onchange = () => this.patch({[field.key]: input.checked}); }
        else if (field.kind === 'range') {
          Object.assign(input, {min: field.min, max: field.max, step: field.step, value: Number(value) || 0});
          const number = document.createElement('input'); number.type = 'number'; number.setAttribute('aria-label', field.label + '数值'); number.title = '左右拖动调整，单击输入';
          Object.assign(number, {min: field.min, max: field.max, step: field.step, value: input.value, disabled: this.busy || controlled});
          number.onchange = () => {
            if (number.value !== '' && number.checkValidity()) this.patch({[field.key]: number.valueAsNumber});
            else number.value = input.value;
          };
          input.oninput = () => { number.value = input.value; };
          input.onchange = () => this.patch({[field.key]: Number(input.value)});
          row.append(number);
        } else { input.value = value || ''; input.onchange = () => this.patch({[field.key]: input.value}); }
      }
      input.id = id; input.disabled = this.busy || controlled;
      if(field.kind==='choice'){
        const wrap=document.createElement('div'),grip=document.createElement('span');
        wrap.className='pv-setting-choice';grip.className='pv-scrub-grip';grip.textContent='↔';
        grip.title='左右拖动切换选项';grip.setAttribute('aria-hidden','true');grip.setAttribute('aria-disabled',String(input.disabled));
        wrap.append(input,grip);row.append(wrap);
      }else row.append(input);
      const hint = reason || [field.help, field.choices?.find(choice => choice.value === value)?.help].filter(Boolean).join(' ') || (field.key === 'params.sdez.version' ? 'FiNALE 1.99 切换原生音符的判定与计分。画面和流速沿用 SDEZ。' : '');
      if (hint) { const help = document.createElement('small'); help.textContent = hint; help.title=hint; row.append(help); }
      section.append(row);
    }
      container.append(section);
    }
    if (!fields.length) container.textContent = '没有匹配的设置。';
    for(const e of container.querySelectorAll('[data-component-index]'))e.open=expanded.has(e.dataset.componentIndex);
    container.scrollTop = scroll;
    if(focus){const replacement=[...container.querySelectorAll('[data-component-index="'+focus.index+'"] [data-component-field]')].find(e=>e.dataset.componentField===focus.field);
      if(replacement&&!replacement.disabled){replacement.focus({preventScroll:true});if(focus.start!=null&&replacement.setSelectionRange)replacement.setSelectionRange(focus.start,focus.end);}}

  }
}
