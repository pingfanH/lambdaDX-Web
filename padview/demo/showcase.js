// All examples start from the same profile. Gallery controls only change this page.
async function json(url, options) {
  const response=await fetch(url, options);
  if (!response.ok) throw Error(url+'：HTTP '+response.status);
  return response.json();
}
let bundled;
export const bundledProfile=()=>bundled ||= json('./profile.json');

// All example pages mount the same controls before the settings controller attaches.
export function mountSettingsPanel(full, overview, sharedSettings) {
  document.getElementById('controls').insertAdjacentHTML('afterend', `<button id="settings-open" type="button" aria-controls="settings-panel" aria-expanded="false" disabled>播放器设置</button>
  <p id="settings-warning" role="alert" hidden></p>`);
  document.querySelector('.workbench').insertAdjacentHTML('beforeend', `  <section id="settings-panel" aria-labelledby="settings-title" hidden>
    <div class="settings-heading"><h2 id="settings-title">播放器设置</h2><button id="settings-close" type="button">关闭</button></div>
    <label><input id="settings-player" data-padview-player type="checkbox" disabled> 手动游玩（Player）</label>
    <div class="settings-filters"><label>搜索 <input id="settings-search" type="search" placeholder="流速、音量、皮肤…"></label>
      <nav id="settings-group" aria-label="设置分类"></nav></div>
    <div id="settings-fields"></div>
    <p id="settings-status" role="status"></p>
    <div class="settings-actions"><button id="settings-templates">配置模板</button><button id="settings-edit-info">编辑信息</button>
      <button id="settings-save">同步到服务器</button><button id="settings-restore">恢复谱面设置</button>
      <button id="settings-reset">恢复默认</button><button id="settings-retry" hidden>重试设置</button></div>
    <label><input id="settings-developer" data-settings-developer type="checkbox" aria-controls="settings-fields"> 开发者模式</label>
  </section>`);
  if (!full) {
    const el=id=>document.getElementById(id);
    el('settings-player').parentElement.hidden=true;
    el('settings-save').hidden=true;
    el('settings-edit-info').hidden=overview;
    el('settings-restore').textContent='恢复本页示例';
    el('settings-reset').textContent='使用载入时的统一配置';
    if(sharedSettings)el('settings-title').parentElement.insertAdjacentHTML('afterend',
      '<small>修改只在本页生效。手动游玩和保存配置请使用<a href="./player.html">Player 手动试玩</a>。</small>');
  }
  if(!sharedSettings){
    document.getElementById('settings-save').hidden=true;
    document.getElementById('settings-templates').hidden=true;
    document.getElementById('settings-title').parentElement.insertAdjacentHTML('afterend',
      '<small>当前使用随包配置。设置只在本页生效。</small>');
  }
}

export function exampleLayout(mode, saved, catalogue) {
  const p=structuredCloneSafe(saved), bg=p.params.canvas_background, info=p.params.info_blocks;
  if(mode==='transparent')bg.layout='off';
  if(mode==='cover'||mode==='pv'){
    bg.source=mode==='pv'?'video':'cover';
    if(bg.layout==='off')bg.layout='fill';
  }
  if(!['center','components','labels'].includes(mode))return p;
  info.enabled=true;info.positioned=mode==='labels';info.center_at_origin=false;
  const block=(kind,label,extra={})=>({kind,label,typeface:'original',font_size:29,...extra});
  if(mode==='center')info.blocks=catalogue.component_center_sources.map(({value,label})=>block('pad_center',label,{center_source:value}));
  else if(mode==='labels')info.blocks=[block('pad_center','',{center_source:'combo',font_size:82})];
  else {
    info.blocks=catalogue.component_types.map(({value,label})=>block(value,label,{progress_bar:['dx_score','achievement','notes'].includes(value),
      ...(value==='text'?{text:'{title} · {bpm} BPM'}:{})}));
    for(const [label,text] of [['BPM','{bpm}'],['SIMAI NEXT','{simai_next}'],['SCORE DETAILS','{score_details}']])info.blocks.push(block('text',label,{text}));
  }
  if(mode==='labels')Object.assign(info.blocks[0],{position:[.25,.5],width:.5,align:1});
  return p;
}
// structuredClone is unavailable on some LAN HTTP origins.
function structuredCloneSafe(value){return JSON.parse(JSON.stringify(value));}
