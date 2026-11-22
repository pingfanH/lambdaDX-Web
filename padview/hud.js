// Shared by the player and the transparent HUD document (which has no renderer or WASM).
(() => {
  const fonts = new Set();
  // A single optional sprite sheet shared by every pane. Keep a real text reading for
  // copying, screen readers and hosts where the optional image cannot be loaded.
  const atlas=new URL('center-digits.png',document.currentScript.src);
  atlas.search=new URL(document.currentScript.src).search;
  let digitsReady;
  function loadDigits(){
    if(digitsReady)return;
    const image=new Image();image.src=atlas.href;
    digitsReady=image.decode().then(()=>document.documentElement.classList.add('pv-center-glyphs')).catch(()=>{digitsReady=null;});
  }
  const titles=new Map();
  function nativeTitle(row,el) {
    const score=parseFloat(row.value);
    const key={combo:'combo',life:'life',dx_score:'dx_score',achievement:'achievement-'+(score<80?0:score<100?1:2),
      dx_star:/^DX STAR [1-5]$/.test(row.label)?'dx_star-'+row.label.slice(-1):null,
      border:({'BORDER S':'border_s','BORDER SS':'border_ss','BORDER SSS':'border_sss','BORDER BEST':'best'})[row.label]}[row.kind];
    if(!key)return;
    let art=titles.get(key);
    if(!art){
      const image=new Image();const url=new URL('center-labels/'+key+'.png',atlas);url.search=atlas.search;
      image.src=url.href;art=image.decode().then(()=> {
        style.sheet.insertRule('.pv-title-'+key+'{display:inline-block;vertical-align:top;height:1em;width:'+image.naturalWidth/image.naturalHeight+'em;white-space:nowrap;color:transparent;background:url("'+url.href+'") center/contain no-repeat}',style.sheet.cssRules.length);
        if(key==='life')document.documentElement.classList.add('pv-life-ready');
      }).catch(()=>{});titles.set(key,art);
    }
    const token={combo:'COMBO',life:'LIFE',dx_score:'DX SCORE',achievement:'ACHIEVEMENT',border:row.label,dx_star:row.label}[row.kind];
    const index=row.label.indexOf(token);if(index<0)return;
    const sprite=document.createElement('span');sprite.textContent=token;sprite.className='pv-title-'+key;
    el.replaceChildren(row.label.slice(0,index),sprite,row.label.slice(index+token.length));
  }
  function digitRow(row,block={},origin=false){
    const group=document.createElement('span'), label=document.createElement('small'), number=document.createElement(origin?'output':'span');
    group.className='pv-stat';label.textContent=row.label;number.className='pv-stat-number';if(block.center_label!=='hidden'){
      if((block.center_label||'original')==='original'){
        nativeTitle(row,label);
        if(row.kind==='life')group.classList.add('life-gauge');
      }
      group.append(label);
    }
    if(block.center_show_value===false)return group;
    group.append(number);
    const glyphs='0123456789+-,.%';
    const rate=parseFloat(row.value), decimal=row.kind==='achievement'||row.kind==='border';
    // Atlas rows follow tools/build_padview_digits.py: decimals have a second,
    // smaller set of glyphs; Life has its own single-layer font.
    const stars=Number(row.label.slice(-1));
    const base={combo:0,dx_score:1,achievement:rate<80?2:rate<100?4:6,life:8,border:9,
      dx_star:stars>=1&&stars<=5?10+stars:1,score:0}[row.kind];
    if(block.center_digits===false||base==null||![...row.value].every(c=>glyphs.includes(c))) {
      number.textContent=row.value;return group;
    }
    loadDigits();
    let fraction=false;
    for(const ch of row.value){
      fraction ||= decimal && ch==='.';
      const digit=document.createElement('span');digit.textContent=ch;digit.className='pv-glyph';
      digit.style.backgroundPosition=(100*glyphs.indexOf(ch)/14)+'% '+(100*(base+Number(fraction))/15)+'%';
      if(fraction)digit.classList.add('fraction');number.append(digit);
    }
    return group;
  }
  const style = document.createElement('style');
  style.textContent = `
    .padview-info{padding:.7rem 1rem;color:#e4ebf3;overflow-wrap:anywhere}
    .padview-info,.padview-hud{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}
    .padview-hud .padview-text{cursor:text}
    .padview-hud.flow:not(.positioned) [data-kind=song_title]{order:-1;grid-column:1/-1}
    .padview-hud.flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));gap:.65rem 1rem}
    .padview-hud.flow:not(:empty){margin-top:.5rem}
    .padview-hud.flow [data-block]{text-align:start!important;font-size:clamp(12px,var(--block-size),24px)!important}
    .padview-hud [data-kind=seconds]>output{text-align:right;font-variant-numeric:tabular-nums}
    .padview-hud.flow progress{height:4px!important}
    .pv-stat,.pv-stat small,.pv-stat-number{display:block;line-height:1}.pv-stat small{font-size:55%;align-self:end}.pv-stat-number{white-space:nowrap}
    /* At the Pad origin the number sits on the anchor, with its title immediately above.
       Without a number, the title itself occupies the anchor. */
    .pv-stat:not(.life-gauge):has(>small + .pv-stat-number){display:var(--pv-stat-layout,block);grid-template-rows:0 auto}
    .pv-center-glyphs .pv-glyph{display:inline-block;width:.85227em;height:1em;vertical-align:top;color:transparent;
      background-image:url("${atlas.href}");background-size:1500% 1600%;margin-right:-.23em}
    .pv-center-glyphs .pv-glyph.fraction{margin-right:-.43em}.pv-center-glyphs .pv-glyph:last-child{margin-right:0}
    .pv-life-ready .life-gauge{display:inline-grid;place-items:center;vertical-align:middle}
    .pv-life-ready .life-gauge>*{grid-area:1/1}
    .pv-life-ready .life-gauge>small{font-size:2.95em;line-height:1}
    .pv-life-ready .life-gauge .pv-stat-number{transform:translateY(.24em)}
    .padview-center{position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:.25em;
      text-align:center;color:#e4ebf3;pointer-events:none;font:600 3.5cqh/1 system-ui;font-variant-numeric:tabular-nums}
    .padview-board>.padview-center{font-size:3.5cqw}
    .padview-center>.pv-stat:only-child{--pv-stat-layout:grid}
    .padview-center:empty,.padview-info:not(:has([data-block],.pv-tools:not([hidden]),.pv-template-entry:not([hidden]))){display:none}
    .padview-center small,.padview-center output{display:block}
    .padview-captions{pointer-events:none;position:absolute;inset:0;container-type:size;overflow:hidden;color:white}
    .padview-captions span{position:absolute;white-space:pre-wrap;line-height:1.2;text-shadow:.04em .04em #000}
    [data-padview-layout=overlay] .padview-info{position:absolute;inset:0;pointer-events:none;padding:0}
    .padview-hud:not(.flow) .padview-text,.padview-center>.padview-text{pointer-events:auto}
    [data-padview-layout=overlay]:has(canvas[data-playable=true]) .padview-text,.padview-board:has(canvas[data-playable=true])>.padview-center>.padview-text{pointer-events:none}
  `;
  document.head.append(style);
  function create(container, getFont, {flow=false, board=null, commit=null, blocksContainer=null}={}) {
    flow ||= !!blocksContainer;
    const root = document.createElement('div');
    root.className = 'padview-hud';
    if (flow) root.classList.add('flow');
    else root.style.cssText = 'position:absolute;inset:0;overflow:hidden;container-type:size;pointer-events:none';
    (blocksContainer || container).append(root);
    const center=document.createElement('div'), captions=document.createElement('div');
    center.className='padview-center'; captions.className='padview-captions';
    if(board)board.append(center);
    (board || container).append(captions);
    let latestState=null, centerAtOrigin=true;
    const nodes = new Map();
    function textRun(parent) {
      const span = document.createElement('span'); span.className='padview-text'; parent.append(span); return span;
    }
    // Holding a selection must keep that reading available for the browser's Copy command.
    const deferred = new Map();
    let pendingRows=false;
    function setText(el, text, selection) {
      if (el.textContent === text) { deferred.delete(el); return; }
      if (selection && !selection.isCollapsed && selection.containsNode(el,true)) { deferred.set(el,text); return; }
      deferred.delete(el); el.textContent=text;
    }
    function selectionChanged() {
      if (!deferred.size && !pendingRows) return;
      const selection=document.getSelection();
      for (const [el,text] of deferred) setText(el,text,selection);
      if(pendingRows&&latestState)update(latestState);
    }
    document.addEventListener('selectionchange',selectionChanged);
    const editor=commit && !blocksContainer ? PadviewHudEditor.create({root,container,flow,render,commit}) : null;
    function layout(settings,catalogue) {
      render(editor?editor.sync(settings,catalogue):settings);
      editor?.paint();
    }
    function render(settings) {
      centerAtOrigin=settings?.center_at_origin!==false;
      const positioned=flow&&!blocksContainer&&(settings?.positioned||root.dataset.editing==='true');
      root.classList.toggle('positioned',!!positioned);
      nodes.clear(); deferred.clear();
      const fragment = document.createDocumentFragment();
      if (settings?.enabled) for (const [index,b] of settings.blocks.entries()) {
        if (!b.enabled) continue;
        const block = document.createElement('div'), label = document.createElement('div');
        const value = document.createElement('output'), progress = document.createElement('progress');
        const family = b.typeface === 'rounded_medium' ? 'PadviewRoundedMedium' : b.typeface === 'rounded' ? 'PadviewRounded' : '';
        if (family && getFont && !fonts.has(family)) {
          fonts.add(family);
          const suffix = b.typeface === 'rounded_medium' ? 'M' : 'R';
          Promise.resolve().then(() => getFont('fonts/GenSenRounded2TW-' + suffix + '.otf', 'font-' + suffix.toLowerCase()))
            .then(bytes => new FontFace(family, bytes).load()).then(face => document.fonts.add(face))
            .catch(error => { fonts.delete(family); console.warn('[Padview 字体]', family, error); });
        }
        block.dataset.block = index;
        block.dataset.kind = b.kind;
        Object.assign(block.style, {position:'absolute',left:b.position[0]*100+'%',top:b.position[1]*100+'%',
          width:b.width*100+'%', fontSize:b.font_size/10.8+'cqh', fontFamily:(family ? family+', ' : '')+'system-ui, sans-serif',
          fontWeight:b.typeface==='rounded_medium'?'500':'400',lineHeight:'1.3',textAlign:['left','center','right'][b.align],
          whiteSpace:'pre-wrap',overflowWrap:'anywhere', color:'rgba('+b.color.slice(0,3).join(',')+','+b.color[3]/255+')'});
        if (positioned) {block.style.setProperty('--block-align',block.style.textAlign);block.style.setProperty('--block-font',b.font_size/10.8+'cqh');}
        else if (flow) { Object.assign(block.style,{position:'static',width:'auto'}); block.style.setProperty('--block-size',b.font_size/2+'px'); }
        label.style.cssText='font-size:55%;margin-bottom:.5556cqh'; textRun(label).textContent=b.label; label.hidden=!b.label;
        value.style.display='block';
        progress.max=1; progress.hidden=true; progress.setAttribute('aria-label',b.label || b.kind);
        progress.style.cssText='width:100%;height:.463cqh;accent-color:currentColor;color:inherit;vertical-align:top';
        block.append(label,value,progress); fragment.append(block); nodes.set(index,{value:textRun(value),progress,block:b});
      }
      if(!board)fragment.append(center); // The standalone transparent HUD uses its own viewport.
      root.replaceChildren(fragment);
      if(latestState)update(latestState);
    }
    function update(state) {
      latestState=state;pendingRows=false;
      const stats=!centerAtOrigin ? [] : board ? (state.center || []).filter(s=>s.kind!=='combo') : (state.center || []);
      const subs=state.subtitles || [], warnings=state.warnings || [], selection=document.getSelection();
      while (center.childElementCount>stats.length) center.lastChild.remove();
      stats.forEach((s,i)=>{
        const prev=center.children[i], key=JSON.stringify([s.kind,s.label,s.value]);
        if(prev?.dataset.reading===key)return;
        if(prev && selection && !selection.isCollapsed && selection.containsNode(prev,true)){pendingRows=true;return;}
        const next=digitRow(s,{},true);next.dataset.reading=key;next.classList.add('padview-text');
        if(prev)prev.replaceWith(next);else center.append(next);
      });
      while (captions.childElementCount>subs.length+warnings.length) captions.lastChild.remove();
      function caption(i,text,x,y,size,opacity,font) {
        const span=captions.children[i] || captions.appendChild(document.createElement('span'));
        setText(span,text);Object.assign(span.style,{left:x+'%',top:y+'%',fontSize:size/10.8+'cqh',opacity,fontFamily:font||'system-ui'});
      }
      subs.forEach((s,i)=>caption(i,s.text,28/10.8+s.position[0]*100,22/10.8+s.position[1]*100,s.size,s.opacity,s.font));
      warnings.forEach((s,i)=>caption(subs.length+i,s,2,85+i*4,22,1));
      for (const item of state.blocks) {
        const node=nodes.get(item.index); if (!node) continue;
        if(Array.isArray(item.center)){
          const key=JSON.stringify(item.center.map(r=>[r.kind,r.label,r.value]));
          if(key===node.rows)continue;
          if(selection&&!selection.isCollapsed&&selection.containsNode(node.value,true)){pendingRows=true;}else{
            node.value.replaceChildren(...item.center.map(row=>digitRow(row,node.block)));node.rows=key;deferred.delete(node.value);
          }
        }else{delete node.rows;setText(node.value,item.text,selection);}
        const hide=item.progress == null;
        if (node.progress.hidden !== hide) node.progress.hidden=hide;
        if (!hide && node.progress.value !== item.progress) node.progress.value=item.progress;
      }
    }
    return {layout,update,edit(){editor?.editing(true);},clear(){latestState=null;layout(null);center.replaceChildren();captions.replaceChildren();},remove(){document.removeEventListener('selectionchange',selectionChanged);editor?.remove();root.remove();center.remove();captions.remove();nodes.clear();deferred.clear();}};
  }
  globalThis.PadviewHud = {create};
})();
