(() => {
  "use strict";
  const B=window.TeriashAddons?.bridge;
  if(!B||window.TeriashMinimapPlus)return;
  const KEY="ta.minimapPlus.v1",defaults={visible:true,size:280,x:null,y:90,zoom:1,players:true,npcs:true,labels:false,gates:true};
  let cfg={...defaults,...(B.getValue(KEY,{})||{})};
  let frame,canvas,ctx,menu,drag=null,raf=0,lastMap="",note="";
  const css=document.createElement("style");css.id="ta-mm-style";
  css.textContent=`
  #ta-mm{position:fixed;z-index:8500;width:280px;background:#0c181eea;color:#dceaf0;border:1px solid #286b76;
    border-radius:11px;box-shadow:0 10px 32px #0009;font:12px Arial,sans-serif;overflow:hidden;user-select:none}
  #ta-mm *{box-sizing:border-box}#ta-mm .head{height:33px;display:flex;align-items:center;justify-content:space-between;
    background:#11262c;cursor:move;padding:0 7px 0 11px;font-weight:700}
  #ta-mm button{background:#19343b;border:1px solid #386f78;border-radius:5px;color:#def;padding:3px 7px;cursor:pointer}
  #ta-mm canvas{display:block;width:100%;aspect-ratio:1;background:#132126;cursor:crosshair}
  #ta-mm .footer{font-size:11px;color:#a8c1c9;padding:6px 9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
    const w=Number(d.x||d.width||m?.width||d.w||0),h=Number(d.y||d.height||m?.height||d.h||0);
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
    const w=Number(raw.x??raw.width??raw.w??m?.width??0);
    const h=Number(raw.y??raw.height??raw.h??m?.height??0);
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
  function terrainSource(){
    // Read the same image source as the native minimap, if it is an
    // image/background element. Do not copy a blank WebGL canvas.
    const els=[...document.querySelectorAll(
      '.mini-map img,.mini-map-controller img,[class*="mini-map"] img,'+
      '.mini-map [style*="background-image"],.mini-map-controller [style*="background-image"]'
    )].filter(el=>!el.closest('#ta-mm'));
    for(const el of els){
      const url=el.tagName==='IMG'?el.currentSrc||el.src:
        getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
      if(url&&url!=='none')return url;
    }
    return null;
  }
  let bgImage=null,bgUrl="",bgFailed=false;
  function loadBackground(){
    const url=terrainSource();
    if(!url||url===bgUrl)return;
    bgUrl=url;bgFailed=false;bgImage=new Image();
    bgImage.onload=()=>{bgFailed=false};
    bgImage.onerror=()=>{bgFailed=true;bgImage=null};
    bgImage.src=url;
  }
  function paint(){
    if(!canvas||!frame?.isConnected)return;
    const d=data(),s=canvas.width,ms=mapSize(d);
    ctx.clearRect(0,0,s,s);
    ctx.fillStyle="#102027";ctx.fillRect(0,0,s,s);
    loadBackground();
    const w=ms.w,h=ms.h,valid=w>0&&h>0&&w<10000&&h<10000;
    const scale=valid?Math.min(s/w,s/h)*cfg.zoom:Math.max(5,s/45)*cfg.zoom;
    const ox=valid?(s-w*scale)/2: s/2-(Number(d.hero.x)||0)*scale;
    const oy=valid?(s-h*scale)/2: s/2-(Number(d.hero.y)||0)*scale;
    // Render native map image only when available. It may be a small
    // cropped preview, so use it as a background rather than geometry.
    if(bgImage?.complete&&bgImage.naturalWidth&&!bgFailed){
      try{ctx.globalAlpha=.35;ctx.drawImage(bgImage,0,0,s,s);ctx.globalAlpha=1}catch{ctx.globalAlpha=1}
    }
    ctx.strokeStyle="#24424a";ctx.lineWidth=.7;
    const step=Math.max(1,Math.round(5/cfg.zoom));
    if(valid){
      const max=Math.min(w*h,120000);
      if(max>0){
        ctx.beginPath();
        for(let x=0;x<=w;x+=step){const px=ox+x*scale;ctx.moveTo(px,oy);ctx.lineTo(px,oy+h*scale)}
        for(let y=0;y<=h;y+=step){const py=oy+y*scale;ctx.moveTo(ox,py);ctx.lineTo(ox+w*scale,py)}
        ctx.stroke();
      }
    }else{
      for(let i=0;i<s;i+=20){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,s);ctx.moveTo(0,i);ctx.lineTo(s,i);ctx.stroke()}
    }
    const mark=(p,color,shape='square',radius=4)=>{
      if(!p)return;
      const x=ox+(p.x+.5)*scale,y=oy+(p.y+.5)*scale;
      if(x<0||x>s||y<0||y>s)return;
      ctx.fillStyle=color;ctx.strokeStyle="#081217";ctx.lineWidth=1.5;
      ctx.beginPath();
      if(shape==='circle')ctx.arc(x,y,radius,0,Math.PI*2);
      else ctx.rect(x-radius,y-radius,radius*2,radius*2);
      ctx.fill();ctx.stroke();
      if(cfg.labels&&p.name){ctx.font="10px Arial";ctx.fillStyle="#fff";ctx.fillText(p.name,x+radius+3,y-4)}
    };
    const npc=collect(d.e,"npc"),players=collect(d.e,"player"),gates=collect(d.e,"gate");
    if(cfg.gates!==false)for(const v of gates)mark(v,"#ae83ff","square",4);
    if(cfg.npcs)for(const v of npc)mark(v,"#e97457","square",3);
    if(cfg.players)for(const v of players)mark(v,"#63caff","circle",3.5);
    mark(coord(d.hero),"#f9dd56","circle",5);
    note=valid?`Mapa ${w}×${h} • NPC: ${npc.length} • gracze: ${players.length} • przejścia: ${gates.length}`:
      "Brak rozmiaru mapy w Engine.map — tryb awaryjny";
    const footer=frame.querySelector(".footer");
    if(footer)footer.textContent=(d.mapName||"Margonem")+" • "+(d.hero?.x??"?")+","+(d.hero?.y??"?")+" • "+note;
  }
  function loop(){paint();raf=requestAnimationFrame(loop)}
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
    frame.querySelector('[data-act="settings"]').onclick=openSettings;
    frame.querySelector('[data-act="hide"]').onclick=()=>{cfg.visible=false;save();closeView()};
    const head=frame.querySelector(".head");
    head.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;drag={x:e.clientX,y:e.clientY,left:cfg.x,top:cfg.y};head.setPointerCapture(e.pointerId)});
    head.addEventListener("pointermove",e=>{if(!drag)return;cfg.x=drag.left+e.clientX-drag.x;cfg.y=drag.top+e.clientY-drag.y;place()});
    head.addEventListener("pointerup",()=>{drag=null;save()});
    canvas.addEventListener("wheel",e=>{e.preventDefault();cfg.zoom=Math.max(.5,Math.min(4,cfg.zoom+(e.deltaY<0?.2:-.2)));save()},{passive:false});
    place();loop();
  }
  function closeView(){cancelAnimationFrame(raf);frame?.remove();frame=null;canvas=null;ctx=null;closeSettings()}
  function openSettings(){
    if(menu){closeSettings();return}
    menu=document.createElement("div");menu.id="ta-mm-settings";document.body.appendChild(menu);
    menu.style.top=Math.max(10,Math.min(innerHeight-300,(cfg.y||90)))+"px";
    menu.style.left=Math.max(10,Math.min(innerWidth-300,(cfg.x||100)+cfg.size+8))+"px";
    menu.innerHTML=`<strong>Minimapa+ — ustawienia</strong>
      <label>Rozmiar (px)<input type="number" data-k="size" min="160" max="550" value="${cfg.size}"></label>
      <label>Zoom siatki<input type="number" data-k="zoom" min=".5" max="4" step=".2" value="${cfg.zoom}"></label>
      <label>Gracze (niebieskie kółka)<input type="checkbox" data-k="players" ${cfg.players?"checked":""}></label>
      <label>Potwory (pomarańczowe kwadraty)<input type="checkbox" data-k="npcs" ${cfg.npcs?"checked":""}></label>
      <label>Przejścia (fioletowe kwadraty)<input type="checkbox" data-k="gates" ${cfg.gates!==false?"checked":""}></label>
      <label>Podpisy<input type="checkbox" data-k="labels" ${cfg.labels?"checked":""}></label>
      <button data-a="save">Zapisz</button> <button data-a="close">Zamknij</button>
      <p style="color:#9eb6bd;line-height:1.4">Mapa jest budowana ze współrzędnych udostępnionych przez klienta gry. Kolory i kształty znaczników są niezależne od oryginalnej minimapy. Jeżeli klient nie udostępnia danych przejść, nie pojawią się ich znaczniki.</p>`;
    menu.querySelector('[data-a="close"]').onclick=closeSettings;
    menu.querySelector('[data-a="save"]').onclick=()=>{
      for(const k of ["players","npcs","gates","labels"])cfg[k]=menu.querySelector(`[data-k="${k}"]`).checked;
      cfg.size=Math.max(160,Math.min(550,Number(menu.querySelector('[data-k="size"]').value)||280));
      cfg.zoom=Math.max(.5,Math.min(4,Number(menu.querySelector('[data-k="zoom"]').value)||1));
      save();place();closeSettings();
    };
  }
  function closeSettings(){menu?.remove();menu=null}
  function toggle(){cfg.visible=!cfg.visible;save();cfg.visible?render():closeView()}
  function destroy(){closeView();css.remove();delete window.TeriashMinimapPlus}
  window.TeriashMinimapPlus={openSettings,toggle,destroy};
  if(cfg.visible)render();
})();
