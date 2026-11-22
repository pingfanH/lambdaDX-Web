// Each pane owns its decoder, transport and temporary URLs. Only decoded video
// frames cross into WebGL in disc mode; stage backgrounds use the same decoder.
'use strict';
globalThis.PadviewMedia = (() => {
  const coverLimit = 16 * 1024 * 1024;
  function source(value, kind) {
    if (value == null) return null;
    if (value.localName === 'input' && value.type === 'file') return value.files?.[0] || null;
    if (value.localName === (kind === 'cover' ? 'img' : 'video')) value = value.currentSrc || value.src || value.querySelector?.('source')?.src || '';
    if (typeof value === 'string' || value instanceof URL) {
      if (!String(value)) throw Error('媒体地址为空');
      const url = new URL(value, document.baseURI);
      if (!['https:', 'http:', 'blob:', 'data:'].includes(url.protocol)) throw Error('不支持的媒体 URL');
      return url.href;
    }
    if (value instanceof Blob) return value;
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return new Blob([value]);
    throw Error('不支持的媒体来源');
  }
  async function coverBytes(input, signal) {
    if (input instanceof Blob) {
      if (input.size > coverLimit) throw Error('封面不能超过 16 MiB');
      return new Uint8Array(await input.arrayBuffer());
    }
    const response = await fetch(input, {signal});
    if (!response.ok) throw Error('封面读取失败：HTTP ' + response.status);
    if (+response.headers.get('content-length') > coverLimit) {
      await response.body?.cancel(); throw Error('封面不能超过 16 MiB');
    }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      if ((size += value.length) > coverLimit) { await reader.cancel(); throw Error('封面不能超过 16 MiB'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let pos = 0;
    for (const chunk of chunks) { bytes.set(chunk,pos); pos += chunk.length; }
    return bytes;
  }
  function create({container, cover, dirty, error}) {
    let fetchCover, video, blobUrl, serial=0, uploaded=-1, texture=0, lastFrame, pendingPlay=false;
    let time=0, playing=false, rate=1, maxSize=0;
    let config={source:'auto',layout:'off',brightness:0.4,tile_scale:0.5,pad_background:true,pad_brightness:0.65};
    let radius, layer, image, tiles, ctx, observer, coverData, coverUrl, showing='', tileFrame=0;
    const wantsVideo=()=>config.source==='video'||config.source==='auto';
    function ensureLayer() {
      if(layer)return;
      layer=document.createElement('div');layer.className='padview-backdrop';
      layer.setAttribute('aria-hidden','true');
      if(radius)layer.style.setProperty('--pv-mask-ratio',radius);
      image=document.createElement('div');tiles=document.createElement('canvas');
      layer.append(image,tiles);container.append(layer);
      observer=new ResizeObserver(scheduleTile);observer.observe(layer);
    }
    function scheduleTile() {
      if(showing==='tiles' && !tileFrame)tileFrame=requestAnimationFrame(drawTiles);
    }
    function drawTiles() {
      tileFrame=0;
      if(showing!=='tiles'||!video||video.readyState<2)return;
      const dpr=Math.min(devicePixelRatio||1,2);
      const w=Math.round(layer.clientWidth*dpr), h=Math.round(layer.clientHeight*dpr);
      if(!w||!h)return;
      if(tiles.width!==w)tiles.width=w;
      if(tiles.height!==h)tiles.height=h;
      ctx ||= tiles.getContext('2d',{alpha:false});
      // One decoded frame, repeated from the top left at the Editor's tile height.
      const pattern=ctx.createPattern(video,'repeat');
      if(!pattern)return;
      const scale=h*config.tile_scale/video.videoHeight;
      ctx.setTransform(scale,0,0,scale,0,0);
      ctx.fillStyle=pattern;ctx.fillRect(0,0,w/scale,h/scale);
    }
    function refresh() {
      if(config.layout==='off'){
        if(layer)layer.hidden=true;
        showing='';return;
      }
      ensureLayer();layer.hidden=false;
      const movie=wantsVideo() && video?.readyState>=2;
      showing=movie?(config.layout==='tile'?'tiles':'video'):
        (config.source==='auto'||config.source==='cover')&&coverData?'image':'black';
      if(showing==='image'&&!coverUrl)coverUrl=URL.createObjectURL(new Blob([coverData]));
      image.hidden=showing!=='image';tiles.hidden=showing!=='tiles';
      layer.style.setProperty('--pv-outer-dim',1-config.brightness);
      layer.style.setProperty('--pv-inner-dim',1-config.pad_brightness);
      layer.toggleAttribute('data-pad-brightness',config.pad_background && config.pad_brightness!==config.brightness);
      if(!image.hidden) {
        image.style.backgroundImage='url("'+coverUrl+'")';
        image.style.backgroundSize=config.layout==='tile'?'auto '+(config.tile_scale*100)+'%':config.layout==='fill'?'cover':'contain';
        image.style.backgroundPosition=config.layout==='tile'?'left top':'center';
        image.style.backgroundRepeat=config.layout==='tile'?'repeat':'no-repeat';
      }
      if(video){
        video.hidden=showing!=='video';
        video.style.objectFit=config.layout==='fill'?'cover':'contain';
        if(video.parentElement!==layer)layer.append(video);
      }
      scheduleTile();
    }
    function configure(next) {
      if(!next||Object.keys(config).every(k=>next[k]===config[k]))return;
      config=next;refresh();sync(true);dirty();
    }
    function releaseCover() {
      if(image)image.style.backgroundImage='none';
      if(coverUrl)URL.revokeObjectURL(coverUrl);
      coverUrl=coverData=null;
    }
    const invalidate=()=>{
      serial++;
      if(config.layout==='off')dirty();
      else if(wantsVideo()) {
        if(showing!=='tiles'&&showing!=='video')refresh();
        else scheduleTile();
      }
    };
    async function setCover(value) {
      fetchCover?.abort();
      const request=fetchCover=new AbortController();
      releaseCover();refresh();cover(new Uint8Array());
      try {
        const input=source(value,'cover');
        if (!input) return;
        const bytes=await coverBytes(input,request.signal);
        if (!request.signal.aborted) {
          if (!bytes.length) throw Error('封面文件为空');
          coverData=bytes;refresh();cover(bytes);
        }
      } catch(e) { if(!request.signal.aborted)error('cover',e); }
    }
    function dropVideo() {
      const old=video; video=null;
      if(old) {
        if(lastFrame!=null)old.cancelVideoFrameCallback(lastFrame);
        old.onloadedmetadata=old.onloadeddata=old.onseeked=old.onerror=null;
        old.pause();old.remove();old.removeAttribute('src');old.load();
      }
      if(blobUrl)URL.revokeObjectURL(blobUrl);
      lastFrame=blobUrl=null; uploaded=-1; texture=0; pendingPlay=false; refresh();dirty();
    }
    function sync(seek=false) {
      try { syncVideo(seek); }
      catch (e) { dropVideo(); error('video', e); }
    }
    function syncVideo(seek) {
      const v=video;
      if (!v || v.readyState<1) return;
      if(!wantsVideo()){if(!v.paused)v.pause();return;}
      if(!v.requestVideoFrameCallback)scheduleTile();
      const end=Number.isFinite(v.duration)?v.duration:Infinity;
      const at=Math.max(0,Math.min(end,time)), run=playing && time>=0 && time<end && !document.hidden;
      if (!run && !v.paused) v.pause();
      if (Math.abs(v.currentTime-at)>(seek || !run ? 0.012 : 0.18)) v.currentTime=at;
      if(v.playbackRate!==rate)v.playbackRate=rate;
      if(run && v.paused && !pendingPlay) {
        pendingPlay=true;
        v.play().catch(e=>{if(video===v && e.name!=='AbortError'){dropVideo();error('video',e);}})
          .finally(()=>{if(video===v)pendingPlay=false;});
      }
    }
    function setVideo(value) {
      dropVideo();
      try {
        const input=source(value,'video'); if(!input)return;
        const v=video=document.createElement('video');
        v.muted=true;v.playsInline=true;v.preload='auto';v.crossOrigin='anonymous';
        v.onloadedmetadata=()=>sync(true);
        v.onseeked=v.onloadeddata=invalidate;
        v.onerror=()=>{if(video===v){const detail=v.error?.message || '不支持的编码或无法访问地址';dropVideo();error('video',detail);}};
        if(v.requestVideoFrameCallback) {
          const frame=()=>{if(v===video){invalidate();lastFrame=v.requestVideoFrameCallback(frame);}};
          lastFrame=v.requestVideoFrameCallback(frame);
        }
        v.src=typeof input==='string'?input:(blobUrl=URL.createObjectURL(input));
      }catch(e){dropVideo();error('video',e);}
    }
    function size() {
      const v=video;
      if(!v || v.readyState<2)return 0;
      if(!maxSize)maxSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if(v.videoWidth>maxSize || v.videoHeight>maxSize || v.videoWidth>65535 || v.videoHeight>65535) {
        dropVideo();error('video','PV 分辨率超过设备纹理上限');return 0;
      }
      return v.videoWidth*65536+v.videoHeight;
    }
    function upload(id) {
      const v=video;
      if(!v)return 0;
      const frame=v.requestVideoFrameCallback?serial:(v.getVideoPlaybackQuality?.().totalVideoFrames ?? v.currentTime)+serial;
      if(texture===id && uploaded===frame)return 1;
      const previous=gl.getParameter(gl.TEXTURE_BINDING_2D);
      try {
        gl.bindTexture(gl.TEXTURE_2D,GL.textures[id]);
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,v);
        texture=id;uploaded=frame;return 1;
      }catch(e){dropVideo();error('video',e);return 0;}
      finally{gl.bindTexture(gl.TEXTURE_2D,previous);}
    }
    function setRadius(value) {
      if(radius!=null && Math.abs(value-radius)<0.00001)return;
      radius=value;layer?.style.setProperty('--pv-mask-ratio',value);
    }
    return {setCover,setVideo,size,upload,sync,configure,setRadius,
      transport(t,p,r,seek){time=t;playing=p;if(Number.isFinite(r)&&r>0)rate=r;sync(seek);},
      dispose(){fetchCover?.abort();config={...config,layout:'off'};dropVideo();releaseCover();
        observer?.disconnect();cancelAnimationFrame(tileFrame);layer?.remove();}};
  }
  return {create};
})();
