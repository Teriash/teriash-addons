(() => {
  "use strict";
  const B=window.TeriashAddons?.bridge;
  if(!B||window.TeriashMinimapPlus)return;
  const KEY="ta.minimapPlus.v1",defaults={visible:false,size:280,x:null,y:90,zoom:1,players:true,npcs:true,objects:false,labels:false,gates:true,terrain:true,monsters:true,items:true,hoverPreview:true};
  let cfg={...defaults,...(B.getValue(KEY,{})||{})};
  let frame,canvas,ctx,menu,drag=null,raf=0,lastMap="",note="",tip=null,hoverHits=[],hoverPos=null,hoverKey="";
  const css=document.createElement("style");css.id="ta-mm-style";
  css.textContent=`
  #ta-mm{position:fixed;z-index:8500;width:280px;background:#0c181eea;color:#dceaf0;border:1px solid #286b76;
    border-radius:11px;box-shadow:0 10px 32px #0009;font:12px Arial,sans-serif;overflow:hidden;user-select:none}
  #ta-mm *{box-sizing:border-box}#ta-mm .head{height:33px;display:flex;align-items:center;justify-content:space-between;
    background:#11262c;cursor:move;padding:0 7px 0 11px;font-weight:700}
  #ta-mm button{background:#19343b;border:1px solid #386f78;border-radius:5px;color:#def;padding:3px 7px;cursor:pointer}
  #ta-mm canvas{display:block;width:100%;aspect-ratio:1;background:#132126;cursor:crosshair}
  #ta-mm .footer{font-size:11px;color:#a8c1c9;padding:6px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #ta-mm-preview{position:fixed;z-index:8502;pointer-events:none;display:none;min-width:155px;max-width:240px;
    padding:9px 11px;background:linear-gradient(#222b2e,#090d10);border:1px solid #526067;
    box-shadow:0 7px 20px #000c;color:#e8f2f5;text-align:center;font:12px Arial,sans-serif;border-radius:5px}
  #ta-mm-preview .ta-tip-title{font-weight:700;font-size:13px;margin-bottom:5px;overflow-wrap:anywhere}
  #ta-mm-preview .ta-tip-sub{color:#c4d0d5;margin:4px 0;overflow-wrap:anywhere}
  #ta-mm-preview img{display:block;max-width:125px;max-height:125px;object-fit:contain;margin:7px auto;image-rendering:auto}
  #ta-mm-preview .ta-tip-list{font-size:11px;color:#b9c8cd;margin-top:5px}
  #ta-mm-settings{position:fixed;z-index:8501;width:280px;background:#0e1d23;color:#def;padding:13px;
    border:1px solid #327582;border-radius:10px;box-shadow:0 12px 30px #000a;font:12px Arial}
  #ta-mm-settings label{display:flex;align-items:center;justify-content:space-between;margin:9px 0;gap:8px}
  #ta-mm-settings input[type=number]{width:80px;background:#071217;color:white;border:1px solid #327582;padding:5px}
  #ta-mm-settings button{background:#20464d;color:white;border:1px solid #327582;border-radius:5px;padding:7px;cursor:pointer}
  `;
  document.head.appendChild(css);
  function save(){B.setValue(KEY,cfg)}
  const engine=()=>window.Engine;
  function data(){
    const e=engine(),m=e?.map;
    const d=m?.d||m?.data||{};
    const w=Number(d.x||d.width||m?.size?.x||m?.width||d.w||0),h=Number(d.y||d.height||m?.size?.y||m?.height||d.h||0);
    const hero=e?.hero?.d||{};
    return {w,h,hero,mapName:d.name||m?.name||"",e};
  }
  function entities(raw){
    if(!raw)return [];
    if(Array.isArray(raw))return raw;
    if(typeof raw==="object")return Object.values(raw);
    return [];
  }
  function getList(e,kind){
    const sources=kind==="player"?[e?.others?.getOtherList?.(),e?.others?.d,e?.others?.list]:
      [e?.npcs?.getNpcList?.(),e?.npcs?.d,e?.npcs?.list];
    for(const s of sources){const arr=entities(s);if(arr.length)return arr}
    return [];
  }
  function coord(obj){
    const d=obj?.d||obj;
    const x=Number(d?.x??d?.rx),y=Number(d?.y??d?.ry);
    return Number.isFinite(x)&&Number.isFinite(y)?{x,y,name:String(d.nick||d.name||"")}:null;
  }
  // Margonem's native minimap is often a WebGL/DOM layer: copying a
  // canvas can return an entirely empty image. Read game state instead.
  function mapSize(d){
    const m=d.e?.map,raw=m?.d||{};
    const w=Number(raw.x??raw.width??raw.w??m?.size?.x??m?.width??0);
    const h=Number(raw.y??raw.height??raw.h??m?.size?.y??m?.height??0);
    return {w,h};
  }
  function rawList(source){
    if(!source)return [];
    if(Array.isArray(source))return source;
    if(typeof source==="object")return Object.values(source);
    return [];
  }
  function collect(e,kind){
    const o=kind==="npc"?e?.npcs:kind==="player"?e?.others:e?.map;
    const sources=kind==="npc"?[o?.d,o?.list,o?.getNpcList?.()]:
      kind==="player"?[o?.d,o?.list,o?.getOtherList?.()]:
      [o?.gateways,o?.gates,o?.d?.gateways,o?.d?.gates,o?.d?.gw,o?.d?.npcs];
    const out=[],seen=new Set();
    for(const source of sources){
      for(const item of rawList(source)){
        const q=coord(item);
        if(!q)continue;
        const key=`${q.x}:${q.y}:${item?.id??item?.d?.id??""}`;
        if(seen.has(key))continue;
        seen.add(key);out.push({...q,raw:item});
      }
    }
    return out;
  }
  // Direct map artwork: never copy the native handheld minimap canvas.
  // The native canvas includes the game's own dots and is only refreshed
  // while the native map is open.
  let bgImage=null,bgUrl="",bgState="none";
  function loadBackground(e){
    const url=typeof e?.map?.src==="string"?e.map.src:"";
    if(url===bgUrl)return;
    bgUrl=url;bgImage=null;bgState=url?"loading":"none";
    if(!url)return;
    const img=new Image();
    // Do not set crossOrigin: drawImage can display CDN artwork without
    // reading pixels. CORS failures would otherwise hide the image.
    img.onload=()=>{if(bgUrl===url){bgImage=img;bgState="ready"}};
    img.onerror=()=>{if(bgUrl===url){bgImage=null;bgState="error"}};
    img.src=url;
  }
  function safeDrawable(manager){
    try {
      const v=manager?.getDrawableList?.();
      if(Array.isArray(v))return v;
      if(v && typeof v==='object')return Object.values(v);
    }catch(error){console.warn('[Minimapa+] Lista obiektow:',error)}
    return [];
  }
  function safeGroundItems(e){
    try{const v=e?.map?.groundItems?.getDrawableItems?.();return Array.isArray(v)?v:[]}catch{return []}
  }
  function getMarkers(e){
    const players=safeDrawable(e?.others).filter(o=>o?.isPlayer===true&&o?.d&&Number.isFinite(Number(o.d.x))&&Number.isFinite(Number(o.d.y)))
      .map(o=>({...coord(o),id:o.d.id,raw:o,kind:"player",lvl:o.d.lvl,prof:o.d.prof}));
    const all=safeDrawable(e?.npcs).filter(o=>o?.d&&Number.isFinite(Number(o.d.x))&&Number.isFinite(Number(o.d.y)));
    const npcs=[],objects=[],monsters=[],recovery=[];
    for(const o of all){
      const d=o.d,p=coord(o);if(!p)continue;p.raw=o;
      let kind="";
      try{kind=String(o.getKind?.()||"").toLowerCase()}catch{}
      // Nie filtruj po lvl: niektore prawdziwe potwory (np. Krabik) maja lvl=0.
      if(kind.includes("monster")||kind.includes("elite")||kind.includes("hero")||kind.includes("titan")){
        p.lvl=Number(d.lvl)||0;p.kind=kind;monsters.push(p);
      }else if(kind==="recovery" && Number(d.type)===7){
        // Rosliny i inne przedmioty odradzajace sie sa obiektami NPC typu 7.
        recovery.push({...p,id:d.id,source:"recovery",rarity:"normal",kind:"item"});
      }else if(kind==="npcs"){
        if(Number(d.type)===5)objects.push(p);
        else if(Number(d.type)===0)npcs.push(p);
      }
    }
    const droppedItems=safeGroundItems(e).filter(o=>o?.d &&
      (o.canvasObjectType==="M_ITEM" || o.getCanvasObjectType?.()==="M_ITEM"))
      .map(o=>{
        const p=coord(o);if(!p)return null;
        const tipClass=typeof o.tip?.[2]==="string"?o.tip[2].toLowerCase():"";
        const rarity=tipClass.includes("leg")?"legendary":tipClass.includes("her")?"heroic":
          tipClass.includes("uni")?"unique":"normal";
        return {...p,rarity,id:o.d.id,source:"dropped",name:o.i?.name||p.name||"Przedmiot",raw:o,kind:"item"};
      }).filter(Boolean);
    // Unikaj podwojnych znacznikow, gdy ten sam przedmiot trafi do obu zrodel.
    const items=[],seenItems=new Set();
    for(const item of [...recovery,...droppedItems]){
      const key=`${item.x}:${item.y}:${item.id??item.name??""}`;
      if(seenItems.has(key))continue;
      seenItems.add(key);items.push(item);
    }
    let gates=[];
    try{gates=e?.map?.getGateways?.()?.getList?.()||[]}catch{}
    gates=Array.isArray(gates)?gates.map(o=>{const p=coord(o);return p?{...p,raw:o,kind:"gateway"}:null}).filter(Boolean):[];
    return {players,npcs,objects,monsters,gates,items};
  }
  function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function imageUrl(v){
    if(typeof v!=="string"||!v.trim())return "";
    const src=v.trim();
    if(/^(?:javascript|data|blob):/i.test(src))return "";
    if(/^https?:\/\//i.test(src)||src.startsWith("//")||src.startsWith("/"))return src;
    if(src.includes("..")||src.includes("\\"))return "";
    return (window.CFG?.a_npath||window.CFG?.a_ipath||"")+src;
  }
  function previewInfo(hit){
    const p=hit.p,raw=p.raw,d=raw?.d||{},type=hit.type;
    let name=p.name||d.nick||d.name||"Nieznany element",subtitle="",src="";
    if(type==="monster"){
      subtitle=[p.lvl?`Poziom: ${p.lvl}`:"",p.kind?.includes("titan")?"Tytan":p.kind?.includes("hero")?"Heros":p.kind?.includes("elite")?"Elita":"Potwór"].filter(Boolean).join(" • ");
      src=imageUrl(d.icon||d.img||raw?.icon||raw?.getIcon?.());
    }else if(type==="npc"||type==="object"){
      subtitle=type==="npc"?"NPC":"Obiekt interaktywny";
      src=imageUrl(d.icon||d.img||raw?.getIcon?.());
    }else if(type==="player"||type==="hero"){
      subtitle=[d.lvl?`Poziom: ${d.lvl}`:"",d.prof?`Profesja: ${d.prof}`:""].filter(Boolean).join(" • ")||"Gracz";
      src=imageUrl(d.icon||d.img||d.outfit||raw?.getIcon?.());
    }else if(type==="item"){
      subtitle=p.source==="recovery"?"Przedmiot odradzający się":"Przedmiot wyrzucony";
      src=imageUrl(raw?.i?.icon||d.icon||raw?.icon||raw?.getIcon?.());
    }else if(type==="gateway"){
      name=name||"Przejście";subtitle="Przejście na inną mapę";
    }
    return {name,subtitle,src};
  }
  function hidePreview(){if(tip)tip.style.display="none";hoverKey=""}
  function movePreview(x,y){
    if(!tip||tip.style.display==="none")return;
    const pad=12,w=tip.offsetWidth,h=tip.offsetHeight;
    tip.style.left=Math.max(6,Math.min(innerWidth-w-6,x+pad))+"px";
    tip.style.top=Math.max(6,Math.min(innerHeight-h-6,y+pad))+"px";
  }
  function updatePreview(){
    if(!tip||!hoverPos||cfg.hoverPreview===false||!frame){hidePreview();return}
    const rect=canvas.getBoundingClientRect();
    const x=(hoverPos.x-rect.left)*canvas.width/rect.width;
    const y=(hoverPos.y-rect.top)*canvas.height/rect.height;
    const nearby=hoverHits.filter(h=>Math.hypot(h.x-x,h.y-y)<=Math.max(6,h.radius+3));
    if(!nearby.length){hidePreview();return}
    // The last drawn marker is on top; show it first when multiple overlap.
    nearby.reverse();const primary=nearby[0],key=nearby.map(h=>`${h.type}:${h.p.id??h.p.name}:${h.p.x}:${h.p.y}`).join("|");
    if(key!==hoverKey){
      hoverKey=key;const info=previewInfo(primary);
      const img=info.src?`<img alt="" src="${escapeHtml(info.src)}" onerror="this.style.display='none'">`:"";
      const more=nearby.length>1?`<div class="ta-tip-list">W tym miejscu: ${nearby.length} elementy<br>${nearby.slice(1,5).map(h=>escapeHtml(h.p.name||h.type)).join(" · ")}</div>`:"";
      tip.innerHTML=`<div class="ta-tip-title">${escapeHtml(info.name)}</div><div class="ta-tip-sub">${escapeHtml(info.subtitle)}</div>${img}${more}`;
      tip.style.display="block";
    }
    movePreview(hoverPos.x,hoverPos.y);
  }
  function paint(){
    if(!canvas||!frame?.isConnected)return;
    const d=data(),s=canvas.width,ms=mapSize(d);
    ctx.clearRect(0,0,s,s);ctx.fillStyle='#102027';ctx.fillRect(0,0,s,s);
    const w=ms.w,h=ms.h,valid=w>0&&h>0&&w<10000&&h<10000;
    const scale=valid?Math.min(s/w,s/h)*cfg.zoom:Math.max(5,s/45)*cfg.zoom;
    const ox=valid?(s-w*scale)/2:s/2-(Number(d.hero.x)||0)*scale;
    const oy=valid?(s-h*scale)/2:s/2-(Number(d.hero.y)||0)*scale;
    loadBackground(d.e);
    let terrain=false;
    if(cfg.terrain!==false&&bgImage&&bgState==="ready"){
      try{
        // Map image spans the entire tile grid. Draw using the exact same
        // tile-space transform as the custom markers (also when zoomed).
        ctx.drawImage(bgImage,ox,oy,w*scale,h*scale);
        terrain=true;
      }catch(error){bgState="error";console.warn("[Minimapa+] Tło mapy:",error)}
    }
    if(!terrain){
      ctx.strokeStyle='#24424a';ctx.lineWidth=.7;
      if(valid){const step=Math.max(1,Math.round(5/cfg.zoom));ctx.beginPath();
        for(let x=0;x<=w;x+=step){let px=ox+x*scale;ctx.moveTo(px,oy);ctx.lineTo(px,oy+h*scale)}
        for(let y=0;y<=h;y+=step){let py=oy+y*scale;ctx.moveTo(ox,py);ctx.lineTo(ox+w*scale,py)}ctx.stroke()}
    }
    hoverHits=[];
    const mark=(p,color,radius=3.6,type="object")=>{
      if(!p)return;const x=ox+(p.x+.5)*scale,y=oy+(p.y+.5)*scale;
      if(x<0||x>s||y<0||y>s)return;
      hoverHits.push({p,x,y,radius,type});
      ctx.fillStyle=color;ctx.strokeStyle='#081217';ctx.lineWidth=1.2;
      ctx.fillRect(x-radius,y-radius,2*radius,2*radius);ctx.strokeRect(x-radius,y-radius,2*radius,2*radius);
      if(cfg.labels&&p.name){ctx.font='10px Arial';ctx.fillStyle='#fff';ctx.fillText(p.name,x+radius+3,y-4)}
    };
    const m=getMarkers(d.e);
    if(cfg.gates!==false)for(const v of m.gates)mark(v,'#ae83ff',3.6,'gateway');
    if(cfg.objects)for(const v of m.objects)mark(v,'#9ba7ae',2.5,'object');
    if(cfg.npcs)for(const v of m.npcs)mark(v,'#46d787',3,'npc');
    if(cfg.monsters!==false)for(const v of m.monsters){
      const k=v.kind;
      const color=k.includes("titan")?'#e6a5ff':k.includes("hero")?'#ffd15a':k.includes("elite")?'#ffab47':'#ef5555';
      mark(v,color,3.2,"monster");
    }
    if(cfg.items!==false)for(const v of m.items){
      const color=v.source==='recovery'?'#f3a74c':v.rarity==='legendary'?'#ffd15a':v.rarity==='heroic'?'#58d7ff':v.rarity==='unique'?'#ff9b48':'#f1f5f9';
      mark(v,color,3,"item");
    }
    if(cfg.players)for(const v of m.players)mark(v,'#63caff',3.5,'player');
    mark({...coord(d.hero),raw:{d:d.hero},kind:'hero'},'#f9dd56',5,'hero');
    note=valid?`Mapa ${w}×${h} • NPC: ${m.npcs.length} • potwory: ${m.monsters.length} • przedmioty: ${m.items.length} • gracze: ${m.players.length} • przejścia: ${m.gates.length}`:'Brak wymiarów mapy';
    updatePreview();
    const footer=frame.querySelector('.footer');
    if(footer)footer.textContent=(d.mapName||'Margonem')+' • '+(d.hero?.x??'?')+','+(d.hero?.y??'?')+' • '+note+(terrain?' • teren: grafika':` • teren: ${bgState==='loading'?'ładowanie':bgState==='error'?'błąd':'siatka'}`);
  }
  // Odczyt setek NPC co klatke nie jest potrzebny; 10 odswiezen/s wystarcza.
  let lastPaintAt=0;
  function loop(time){
    if(time-lastPaintAt>=100){lastPaintAt=time;paint()}
    raf=requestAnimationFrame(loop);
  }
  function place(){
    if(!frame)return;
    cfg.x=cfg.x==null?Math.max(5,innerWidth-cfg.size-300):Math.max(0,Math.min(innerWidth-cfg.size,cfg.x));
    cfg.y=Math.max(0,Math.min(innerHeight-50,cfg.y));
    frame.style.left=cfg.x+"px";frame.style.top=cfg.y+"px";
    frame.style.width=cfg.size+"px";
    canvas.width=cfg.size;canvas.height=cfg.size;
  }
  function render(){
    if(frame)return;
    frame=document.createElement("div");frame.id="ta-mm";
    frame.innerHTML='<div class="head"><span>MINIMAPA+</span><span><button data-act="settings" title="Ustawienia">⚙</button> <button data-act="hide" title="Ukryj">×</button></span></div><canvas></canvas><div class="footer">Ładowanie…</div>';
    document.body.appendChild(frame);canvas=frame.querySelector("canvas");ctx=canvas.getContext("2d");
    tip=document.createElement("div");tip.id="ta-mm-preview";document.body.appendChild(tip);
    canvas.addEventListener("pointermove",e=>{hoverPos={x:e.clientX,y:e.clientY};updatePreview()});
    canvas.addEventListener("pointerleave",()=>{hoverPos=null;hidePreview()});
    frame.querySelector('[data-act="settings"]').onclick=openSettings;
    frame.querySelector('[data-act="hide"]').onclick=()=>{cfg.visible=false;save();closeView()};
    const head=frame.querySelector(".head");
    head.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;drag={x:e.clientX,y:e.clientY,left:cfg.x,top:cfg.y};head.setPointerCapture(e.pointerId)});
    head.addEventListener("pointermove",e=>{if(!drag)return;cfg.x=drag.left+e.clientX-drag.x;cfg.y=drag.top+e.clientY-drag.y;place()});
    head.addEventListener("pointerup",()=>{drag=null;save()});
    canvas.addEventListener("wheel",e=>{e.preventDefault();cfg.zoom=Math.max(.5,Math.min(4,cfg.zoom+(e.deltaY<0?.2:-.2)));save()},{passive:false});
    place();loop();
  }
  function closeView(){cancelAnimationFrame(raf);tip?.remove();tip=null;hoverPos=null;hoverHits=[];hoverKey="";frame?.remove();frame=null;canvas=null;ctx=null;closeSettings()}
  function openSettings(){
    if(menu){closeSettings();return}
    menu=document.createElement("div");menu.id="ta-mm-settings";document.body.appendChild(menu);
    menu.style.top=Math.max(10,Math.min(innerHeight-300,(cfg.y||90)))+"px";
    menu.style.left=Math.max(10,Math.min(innerWidth-300,(cfg.x||100)+cfg.size+8))+"px";
    menu.innerHTML=`<strong>Minimapa+ — ustawienia</strong>
      <label>Rozmiar (px)<input type="number" data-k="size" min="160" max="550" value="${cfg.size}"></label>
      <label>Powiększenie mapy<input type="number" data-k="zoom" min=".5" max="4" step=".2" value="${cfg.zoom}"></label>
      <label>Gracze (niebieskie kwadraty)<input type="checkbox" data-k="players" ${cfg.players?"checked":""}></label>
      <label>NPC (zielone kwadraty)<input type="checkbox" data-k="npcs" ${cfg.npcs?"checked":""}></label>
      <label>Potwory (czerwone kwadraty)<input type="checkbox" data-k="monsters" ${cfg.monsters!==false?"checked":""}></label>
      <label>Przedmioty (odradzające się i wyrzucone)<input type="checkbox" data-k="items" ${cfg.items!==false?"checked":""}></label>
      <label>Teren z grafiki mapy<input type="checkbox" data-k="terrain" ${cfg.terrain!==false?"checked":""}></label>
      <label>Obiekty interaktywne<input type="checkbox" data-k="objects" ${cfg.objects?"checked":""}></label>
      <label>Przejścia (fioletowe kwadraty)<input type="checkbox" data-k="gates" ${cfg.gates!==false?"checked":""}></label>
      <label>Podgląd elementów po najechaniu<input type="checkbox" data-k="hoverPreview" ${cfg.hoverPreview!==false?"checked":""}></label>
      <label>Podpisy<input type="checkbox" data-k="labels" ${cfg.labels?"checked":""}></label>
      <button data-a="save">Zapisz</button> <button data-a="close">Zamknij</button>
      <p style="color:#9eb6bd;line-height:1.4">Teren jest pobierany bezpośrednio z Engine.map.src. Nie trzeba otwierać podręcznej mapy. Rozpoznawanie elit i rzadkości przedmiotów jest wstępne.</p>`;
    menu.querySelector('[data-a="close"]').onclick=closeSettings;
    menu.querySelector('[data-a="save"]').onclick=()=>{
      for(const k of ["players","npcs","monsters","items","gates","labels","terrain","objects","hoverPreview"])cfg[k]=menu.querySelector(`[data-k="${k}"]`).checked;
      cfg.size=Math.max(160,Math.min(550,Number(menu.querySelector('[data-k="size"]').value)||280));
      cfg.zoom=Math.max(.5,Math.min(4,Number(menu.querySelector('[data-k="zoom"]').value)||1));
      save();place();closeSettings();
    };
  }
  function closeSettings(){menu?.remove();menu=null}
  function toggle(){cfg.visible=!cfg.visible;save();cfg.visible?render():closeView()}
  // Q toggles our minimap only while playing, never while typing.
  function onKeyDown(event){
    if(event.code!=="KeyQ" || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)return;
    const el=event.target;
    if(el?.isContentEditable || el?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))return;
    if(!window.Engine)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle();
  }
  document.addEventListener("keydown",onKeyDown,true);
  function destroy(){document.removeEventListener("keydown",onKeyDown,true);closeView();css.remove();delete window.TeriashMinimapPlus}
  function diagnostics(){
    const e=engine();const raw=safeDrawable(e?.npcs);
    const groups={};for(const o of raw){
      if(!o?.d)continue;
      let kind='BRAK';try{kind=String(o.getKind?.()||'BRAK')}catch{}
      groups[kind]=(groups[kind]||0)+1;
    }
    const m=getMarkers(e);
    const result={version:'0.3.5',map:e?.map?.d?.name,rawNpcs:raw.length,
      groups,monsters:m.monsters.length,npcs:m.npcs.length,
      groundItems:safeGroundItems(e).length,items:m.items.length};
    console.table(result.groups);console.log('[Minimapa+] Diagnostyka',result);
    return result;
  }
  window.TeriashMinimapPlus={openSettings,toggle,destroy,diagnostics,version:'0.3.5'};
  if(cfg.visible)render();
})();
