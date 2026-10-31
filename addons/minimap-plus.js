(() => {
  "use strict";
  const B=window.TeriashAddons?.bridge;
  if(!B||window.TeriashMinimapPlus)return;
  const KEY="ta.minimapPlus.v1",defaults={visible:false,size:500,x:null,y:90,zoom:1,players:true,npcs:true,objects:false,labels:false,gates:true,terrain:true,monsters:true,items:true,hoverPreview:true,respawns:true,colors:{}};
  let cfg={...defaults,...(B.getValue(KEY,{})||{})};
   // Brak zoomu: takze starsze zapisane ustawienia nie moga go przywrocic.
   cfg.zoom=1;
  const DEFAULT_COLORS={hero:'#f9dd56',player:'#63caff',npc:'#46d787',object:'#9ba7ae',gateway:'#ae83ff',respawn:'#ffad4d',monsterNormal:'#ef5555',monsterElite:'#ff9b48',monsterElite2:'#ffdf55',monsterElite3:'#ffbb66',monsterColossus:'#e657ff',monsterHero:'#a87bff',monsterTitan:'#f078df',itemRecovery:'#f3a74c',itemNormal:'#f1f5f9',itemUnique:'#ff9b48',itemHeroic:'#58d7ff',itemLegendary:'#ffd15a'};
  const COLOR_LABELS={hero:'Moja postać',player:'Inni gracze',npc:'NPC',object:'Obiekty interaktywne',gateway:'Przejścia',respawn:'Respawny herosów',monsterNormal:'Potwory zwykłe',monsterElite:'Elity',monsterElite2:'Elity II',monsterElite3:'Elity III',monsterColossus:'Kolosy',monsterHero:'Herosi',monsterTitan:'Tytani',itemRecovery:'Przedmioty odradzające się',itemNormal:'Przedmioty zwykłe',itemUnique:'Przedmioty unikatowe',itemHeroic:'Przedmioty heroiczne',itemLegendary:'Przedmioty legendarne'};
  cfg.colors={...DEFAULT_COLORS,...(cfg.colors||{})};
  function color(key){return /^#[0-9a-f]{6}$/i.test(cfg.colors[key]||'')?cfg.colors[key]:DEFAULT_COLORS[key]}
  // Zrodlo: silnik Margonem, getDescriptionOfKindMonster(wt):
  // >99 tytan, >89 kolos, >79 heros, >29 elita3, >19 elita2, >9 elita1.
  // Wartosci 0..9 to zwykle potwory (np. Slepa Strzala wt=2).
  function monsterClass(o,kind){
    const d=o?.d||{};
    const raw=o?.getWt?.()??d.wt;
    const wt=raw===null||raw===undefined||raw===''?NaN:Number(raw);
    if(Number.isFinite(wt)){
      if(wt>99)return 'monsterTitan';
      if(wt>89)return 'monsterColossus';
      if(wt>79)return 'monsterHero';
      if(wt>29)return 'monsterElite3';
      if(wt>19)return 'monsterElite2';
      if(wt>9)return 'monsterElite';
      return 'monsterNormal';
    }
    const label=String(d.rank??d.ranga??d.category??kind??'').toLowerCase();
    if(/kolos|colossus/.test(label))return 'monsterColossus';
    if(/titan|tytan/.test(label))return 'monsterTitan';
    if(/hero|heros/.test(label))return 'monsterHero';
    if(/(?:elite|elita)[ _-]?(?:iii|3)\b/.test(label))return 'monsterElite3';
    if(/(?:elite|elita)[ _-]?(?:ii|2)\b/.test(label))return 'monsterElite2';
    if(/elite|elita/.test(label))return 'monsterElite';
    return 'monsterNormal';
  }
  function isMonster(o,kind){
    const d=o?.d||{};
    const k=String(kind||'').toLowerCase();
    const wt=Number(o?.getWt?.()??d.wt);
    // Silnik klasyfikuje rangi rowniez dla NPC typu 2, 3 i 9.
    return k.includes('monster')||k.includes('elite')||k.includes('elita')||
      k.includes('hero')||k.includes('heros')||k.includes('titan')||
      k.includes('tytan')||k.includes('kolos')||k.includes('colossus')||
      Number(d.type)===3||
      ([2,9].includes(Number(d.type))&&Number.isFinite(wt)&&wt>9);
  }

  const engine=()=>window.Engine;
  let frame,canvas,ctx,menu,drag=null,raf=0,lastMap="",note="",tip=null,hoverHits=[],hoverPos=null,hoverKey="";
  // Render do 60 FPS. Probkowanie obiektow czesciej, bez czekania na
  // pelny krok animacji. Ruch jest animowany w pikselach, nie skokowo po kratkach.
  let markerSnapshot=null,lastSampleAt=0,renderMapKey=null;
  const motion=new Map();
  const SAMPLE_MS=35, MOVE_MS=165;
  function smoothPosition(p,kind,now){
    if(!p)return p;
    const id=p.id??p.raw?.d?.id;
    if(id==null)return p;
    const key=`${kind}:${id}`;
    const x=Number(p.x),y=Number(p.y);
    if(!Number.isFinite(x)||!Number.isFinite(y))return p;
    let state=motion.get(key);
    if(!state){
      state={x,y,fromX:x,fromY:y,toX:x,toY:y,start:now,seen:now};
      motion.set(key,state);
    }else{
      // Oblicz pozycje posrednia ZANIM wyznaczymy nowy cel.
      // Animacja liniowa nie zatrzymuje sie na kazdej kratce.
      const progress=Math.max(0,Math.min(1,(now-state.start)/MOVE_MS));
      state.x=state.fromX+(state.toX-state.fromX)*progress;
      state.y=state.fromY+(state.toY-state.fromY)*progress;
      if(state.toX!==x||state.toY!==y){
        // Duze skoki (teleport, zmiana lokacji) nie sa animowane.
        if(Math.hypot(x-state.toX,y-state.toY)>8){
          state.x=x;state.y=y;state.fromX=x;state.fromY=y;
        }else{
          state.fromX=state.x;state.fromY=state.y;
        }
        state.toX=x;state.toY=y;state.start=now;
      }
      state.seen=now;
    }
    const t=Math.max(0,Math.min(1,(now-state.start)/MOVE_MS));
    return {...p,x:state.fromX+(state.toX-state.fromX)*t,
                 y:state.fromY+(state.toY-state.fromY)*t};
  }
  let clickTransform=null;
  // Dane punktow respawnu pochodza z tego samego strumienia, co natywna minimapa.
  // Stan odwiedzenia istnieje tylko w pamieci i resetuje sie przy zmianie mapy.
  let respMapKey=null,respPoints=[],checkedResp=new Set(),respHookTarget=null,respHookOriginal=null;
  const respRadiusSquared=144; // Gargonem: odleglosc euklidesowa < 12 kratek
  function currentMapKey(){
    const m=engine()?.map;
    if(!m)return null;
    const id=m.getId?.()??m.d?.id??m.d?.name??m.name;
    return id==null?null:String(id);
  }
  function syncRespMap(){
    const key=currentMapKey();
    if(key!==respMapKey){respMapKey=key;respPoints=[];checkedResp.clear()}
  }
  function receiveRespawns(list){
    syncRespMap();
    if(!Array.isArray(list))return;
    respPoints=list.filter(p=>p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y)))
      .map(p=>({x:Number(p.x),y:Number(p.y),id:p.id,nick:String(p.nick||'Heros'),lvl:p.lvl,wt:p.wt}));
  }
  function installRespHook(){
    const mm=engine()?.miniMapController;
    if(!mm||typeof mm.updateWindowMiniMapRespPos!=='function')return;
    if(respHookTarget===mm&&mm.updateWindowMiniMapRespPos===respHookOriginal?.wrapped)return;
    if(respHookTarget&&respHookOriginal&&respHookTarget.updateWindowMiniMapRespPos===respHookOriginal.wrapped)
      respHookTarget.updateWindowMiniMapRespPos=respHookOriginal.fn;
    const original=mm.updateWindowMiniMapRespPos;
    const wrapped=function(list,...args){receiveRespawns(list);return original.call(this,list,...args)};
    respHookTarget=mm;respHookOriginal={fn:original,wrapped};
    mm.updateWindowMiniMapRespPos=wrapped;
  }
  function respKey(p){
    return `${p.x}:${p.y}:${p.nick}:${p.id??''}`;
  }
  // Rzeczywisty heros w punkcie respu ma pierwszenstwo przed znacznikiem respu.
  // Odczytujemy aktualne NPC z silnika, nie tylko z interpolowanego snapshotu.
  function liveHeroesAtRespawns(e){
    const occupied=new Set();
    for(const o of safeDrawable(e?.npcs)){
      const d=o?.d;if(!d)continue;
      const wt=Number(o.getWt?.()??d.wt);
      if(!Number.isFinite(wt)||wt<80||wt>=90)continue;
      const x=Number(d.x),y=Number(d.y);
      if(Number.isFinite(x)&&Number.isFinite(y))occupied.add(`${x}:${y}`);
    }
    return occupied;
  }
  function respHasHero(p,occupied){return occupied.has(`${p.x}:${p.y}`)}
  function markNearbyRespawns(hero,occupied){
    const hx=Number(hero?.x),hy=Number(hero?.y);
    if(!Number.isFinite(hx)||!Number.isFinite(hy))return;
    // Jak w Gargonem: w jednym odswiezeniu oznacz tylko najblizszy
    // jeszcze niesprawdzony resp, w promieniu mniejszym niz 12 pol.
    let closest=null,closestDist=respRadiusSquared;
    for(const p of respPoints){
      if(checkedResp.has(respKey(p))||respHasHero(p,occupied))continue;
      const dx=p.x-hx,dy=p.y-hy,dist=dx*dx+dy*dy;
      if(dist<closestDist){closestDist=dist;closest=p}
    }
    if(closest)checkedResp.add(respKey(closest));
  }
  const respSyncTimer=setInterval(()=>{syncRespMap();installRespHook()},700);
  installRespHook();

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
  #ta-mm-preview .ta-outfit{width:32px;height:48px;background-repeat:no-repeat;background-position:0 0;margin:7px auto;image-rendering:pixelated}
  #ta-mm-settings .ta-colors{max-height:225px;overflow:auto;border:1px solid #31515b;padding:3px 8px;margin:8px 0}
  #ta-mm-settings input[type=color]{width:44px;height:26px;padding:1px;background:transparent;border:1px solid #426873;cursor:pointer}
  #ta-mm-preview .ta-tip-list{font-size:11px;color:#b9c8cd;margin-top:5px}
  #ta-mm-settings{position:fixed;z-index:8501;width:280px;background:#0e1d23;color:#def;padding:13px;
    border:1px solid #327582;border-radius:10px;box-shadow:0 12px 30px #000a;font:12px Arial}
  #ta-mm-settings label{display:flex;align-items:center;justify-content:space-between;margin:9px 0;gap:8px}
  #ta-mm-settings input[type=number]{width:80px;background:#071217;color:white;border:1px solid #327582;padding:5px}
  #ta-mm-settings button{background:#20464d;color:white;border:1px solid #327582;border-radius:5px;padding:7px;cursor:pointer}
  `;
  document.head.appendChild(css);
  function save(){B.setValue(KEY,cfg)}
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
      if(isMonster(o,kind)){
        p.lvl=Number(d.lvl)||0;p.kind=kind;p.monsterClass=monsterClass(o,kind);monsters.push(p);
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
    // Silnik trzyma nazwy przejsc w gateways.townnames[id], nie w d.nick.
    const townnames=e?.map?.gateways?.townnames||{};
    gates=Array.isArray(gates)?gates.map(o=>{
      const p=coord(o);if(!p)return null;
      const gd=o?.d||o;
      const id=gd?.id;
      const rawName=townnames[id]??townnames[String(id)]??gd?.nick??gd?.name??o?.name;
      const gatewayName=typeof rawName==='string'?rawName.replace(/<[^>]*>/g,'').trim():'';
      return {...p,name:gatewayName||'Przejście',id,raw:o,kind:'gateway'};
    }).filter(Boolean):[];
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
  function outfitUrl(value){
    if(typeof value!=='string'||!value.trim())return '';
    const v=value.trim();
    if(/^(?:paid|kuf|eve|clan|premium|event|npc)\//i.test(v))return 'https://micc.garmory-cdn.cloud/obrazki/postacie/'+v;
    if(/^\/(?:paid|kuf|eve|clan|premium|event|npc)\//i.test(v))return 'https://micc.garmory-cdn.cloud/obrazki/postacie/'+v.slice(1);
    return imageUrl(v);
  }
  function previewInfo(hit){
    const p=hit.p,raw=p.raw,d=raw?.d||{},type=hit.type;
    let name=p.name||d.nick||d.name||"Nieznany element",subtitle="",src="";
    if(type==="monster"){
      const labels={monsterNormal:'Potwór',monsterElite:'Elita',monsterElite2:'Elita II',monsterElite3:'Elita III',monsterColossus:'Kolos',monsterHero:'Heros',monsterTitan:'Tytan'};
      subtitle=[p.lvl?`Poziom: ${p.lvl}`:"",labels[p.monsterClass]||'Potwór'].filter(Boolean).join(" • ");
      src=imageUrl(d.icon||d.img||raw?.icon||raw?.getIcon?.());
    }else if(type==="npc"||type==="object"){
      subtitle=type==="npc"?"NPC":"Obiekt interaktywny";
      src=imageUrl(d.icon||d.img||raw?.getIcon?.());
    }else if(type==="player"||type==="hero"){
      subtitle=[d.lvl?`Poziom: ${d.lvl}`:"",d.prof?`Profesja: ${d.prof}`:""].filter(Boolean).join(" • ")||"Gracz";
      src=outfitUrl(d.outfit||d.icon||d.img||raw?.getIcon?.());
    }else if(type==="item"){
      subtitle=p.source==="recovery"?"Przedmiot odradzający się":"Przedmiot wyrzucony";
      src=imageUrl(raw?.i?.icon||d.icon||raw?.icon||raw?.getIcon?.());
    }else if(type==="respawn"){
      subtitle=`Respawn herosa${p.lvl?` • Poziom: ${p.lvl}`:""}${checkedResp.has(`${p.x}:${p.y}:${p.nick}:${p.id??''}`)?" • Sprawdzony":""}`;
    }else if(type==="gateway"){
      name=p.name||"Przejście";subtitle="Przejście na inną mapę";
    }
    // Pozycje elementow odczytujemy z danych gry (w kratkach mapy).
    // Dla poruszajacych sie graczy pokazujemy ostatnia otrzymana pozycje,
    // a nie wspolrzedne chwilowej interpolacji graficznej.
    const position=raw?.d||raw||p;
    const px=Number(position?.x??position?.rx??p.x);
    const py=Number(position?.y??position?.ry??p.y);
    if(Number.isFinite(px)&&Number.isFinite(py)){
      const coords=`(${Number.isInteger(px)?px:px.toFixed(1)}, ${Number.isInteger(py)?py:py.toFixed(1)})`;
      subtitle=subtitle?`${subtitle} • ${coords}`:coords;
    }
    return {name,subtitle,src};
  }
  // Menu kontekstowe gracza: natywny popup Margonem, jak w Klanowicze Online.
  function playerAtPointer(event){
    if(!canvas)return null;
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    const x=(event.clientX-rect.left)*canvas.width/rect.width;
    const y=(event.clientY-rect.top)*canvas.height/rect.height;
    // Sprawdzamy tylko znaczniki graczy, nie potwory ani NPC.
    const hits=hoverHits.filter(h=>h.type==='player' && Math.hypot(h.x-x,h.y-y)<=Math.max(6,h.radius+3));
    return hits.length?hits[hits.length-1].p:null;
  }
  function showPlayerMenu(player,event){
    const eng=engine();
    if(!player||typeof eng?.interface?.showPopupMenu!=='function')return;
    const d=player.raw?.d||{};
    const nick=String(d.nick||player.name||'').trim();
    const id=Number(d.id??player.id)||0;
    if(!nick)return;
    const accountId=Number(player.raw?.getAccountId?.()||d.account||d.accountId||0)||0;
    const actions=[];
    actions.push(['Wyślij wiadomość',()=>eng.chatController?.getChatInputWrapper?.().setPrivateMessageProcedure(nick)]);
    if(id&&typeof eng.showEqManager?.update==='function'){
      actions.push(['Pokaż ekwipunek',()=>eng.showEqManager.update({
        id,account:accountId,lvl:Number(d.lvl)||0,nick,prof:String(d.prof||''),
        icon:String(d.outfit||d.icon||''),world:eng.worldConfig?.getWorldName?.()
      })]);
    }
    const encodedNick=nick.split(' ').join('_');
    actions.push(['Zaproś do przyjaciół',()=>window._g?.(`friends&a=finvite&nick=${encodedNick}`)]);
    actions.push(['Dodaj do wrogów',()=>window._g?.(`friends&a=eadd&nick=${encodedNick}`)]);
    if(id)actions.push(['Zaproś do grupy',()=>window._g?.(`party&a=inv&id=${id}`)]);
    if(accountId&&id&&typeof eng.iframeWindowManager?.newPlayerProfile==='function'){
      actions.push(['Pokaż profil',()=>eng.iframeWindowManager.newPlayerProfile({accountId,characterId:id})]);
    }
    event.preventDefault();event.stopPropagation();
    eng.interface.showPopupMenu(actions,event,{header:nick});
    requestAnimationFrame(()=>{
      document.querySelectorAll('.popup-menu-layer').forEach(layer=>{
        if(layer.querySelector('.popup-menu.show'))
          layer.style.setProperty('z-index','2147483640','important');
      });
    });
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
    if(key!==hoverKey || tip.style.display==="none" || tip.dataset.taCoordFormat!=="tuple"){
      hoverKey=key;const info=previewInfo(primary);
      const img=info.src?((primary.type==='player'||primary.type==='hero')
        ?`<div class="ta-outfit" style="background-image:url('${escapeHtml(info.src)}')"></div>`
        :`<img alt="" src="${escapeHtml(info.src)}" onerror="this.style.display='none'">`):"";
      const nearbyPlayers=nearby.filter(h=>h.type==="player");
      const more=primary.type==="player" && nearbyPlayers.length>1?`<div class="ta-tip-list">W tym miejscu: ${nearbyPlayers.length} graczy<br>${nearbyPlayers.filter(h=>h!==primary).slice(0,4).map(h=>escapeHtml(h.p.name||h.type)).join(" · ")}</div>`:"";
      tip.innerHTML=`<div class="ta-tip-title">${escapeHtml(info.name)}</div><div class="ta-tip-sub">${escapeHtml(info.subtitle)}</div>${img}${more}`;
      tip.style.display="block";tip.dataset.taCoordFormat="tuple";
    }
    movePreview(hoverPos.x,hoverPos.y);
  }
  function paint(now=performance.now()){
    if(!canvas||!frame?.isConnected)return;
    syncRespMap();installRespHook();
    const key=currentMapKey();
    if(key!==renderMapKey){renderMapKey=key;markerSnapshot=null;motion.clear();lastSampleAt=0}
    const d=data(),s=canvas.width,ms=mapSize(d);
    ctx.clearRect(0,0,s,s);ctx.fillStyle='#102027';ctx.fillRect(0,0,s,s);
    const w=ms.w,h=ms.h,valid=w>0&&h>0&&w<10000&&h<10000;
    const scale=valid?Math.min(s/w,s/h)*cfg.zoom:Math.max(5,s/45)*cfg.zoom;
    const ox=valid?(s-w*scale)/2:s/2-(Number(d.hero.x)||0)*scale;
    const oy=valid?(s-h*scale)/2:s/2-(Number(d.hero.y)||0)*scale;
    clickTransform=valid?{ox,oy,scale,w,h,mapId:String(d.e?.map?.getId?.()??d.e?.map?.d?.id??"")}:null;
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
    // Wielkosc znacznika rosnie wraz z wielkoscia pojedynczej kratki,
    // ale pozostaje czytelna i nie zajmuje calej kratki na malych mapach.
    // Na malych mapach kratki sa duze: ikony maja wyraznie rosnac,
    // ale nie zaslaniac calej kratki. Rozmiar zalezy od skali mapy.
    const markerRadius=(base)=>Math.max(base,Math.min(base*3.3,scale*.43));
    const mark=(p,color,radius=3.6,type="object")=>{
      radius=markerRadius(radius);
      if(!p)return;const x=ox+(p.x+.5)*scale,y=oy+(p.y+.5)*scale;
      if(x<0||x>s||y<0||y>s)return;
      hoverHits.push({p,x,y,radius,type});
      ctx.fillStyle=color;ctx.strokeStyle='#081217';ctx.lineWidth=1.2;
      ctx.fillRect(x-radius,y-radius,2*radius,2*radius);ctx.strokeRect(x-radius,y-radius,2*radius,2*radius);
      if(cfg.labels&&p.name){ctx.font='10px Arial';ctx.fillStyle='#fff';ctx.fillText(p.name,x+radius+3,y-4)}
    };
    if(!markerSnapshot||now-lastSampleAt>=SAMPLE_MS){
      markerSnapshot=getMarkers(d.e);lastSampleAt=now;
      // Usun nieobecne od dawna postacie, aby nie gromadzic wpisow.
      for(const [key,state] of motion)if(now-state.seen>2000)motion.delete(key);
    }
    const m=markerSnapshot;
    const occupiedHeroRespawns=liveHeroesAtRespawns(d.e);
    if(cfg.respawns!==false){
      markNearbyRespawns(d.hero,occupiedHeroRespawns);
      for(const p of respPoints){
        if(respHasHero(p,occupiedHeroRespawns))continue;
        const marker={...p,name:p.nick,kind:'respawn'};
        mark(marker,color('respawn'),4,'respawn');
      }
    }
    if(cfg.gates!==false)for(const v of m.gates)mark(v,color('gateway'),3.6,'gateway');
    if(cfg.objects)for(const v of m.objects)mark(v,color('object'),2.5,'object');
    if(cfg.npcs)for(const v of m.npcs)mark(v,color('npc'),3,'npc');
    if(cfg.monsters!==false)for(const v of m.monsters){
      if(!['monsterHero','monsterColossus','monsterTitan'].includes(v.monsterClass))
        mark(v,color(v.monsterClass||'monsterNormal'),3.2,"monster");
    }
    if(cfg.items!==false)for(const v of m.items){
      const key=v.source==='recovery'?'itemRecovery':v.rarity==='legendary'?'itemLegendary':v.rarity==='heroic'?'itemHeroic':v.rarity==='unique'?'itemUnique':'itemNormal';
      mark(v,color(key),3,"item");
    }
    // Rangi heros/kolos/tytan sa rysowane nad innymi obiektami.
    if(cfg.monsters!==false)for(const v of m.monsters){
      if(['monsterHero','monsterColossus','monsterTitan'].includes(v.monsterClass))
        mark(v,color(v.monsterClass),3.2,'monster');
    }
    if(cfg.players)for(const v of m.players)mark(smoothPosition(v,'player',now),color('player'),3.5,'player');
    const own=coord(d.hero);
    if(own)mark(smoothPosition({...own,id:d.hero.id??'self',raw:{d:d.hero},kind:'hero'},'hero',now),color('hero'),5,'hero');
    // Rysuj ramki NA KONCU, aby NPC, przedmioty i gracze ich nie zaslaniali.
    if(cfg.respawns!==false){
      for(const p of respPoints){
        const key=respKey(p);
        if(!checkedResp.has(key)||respHasHero(p,occupiedHeroRespawns))continue;
        const x=ox+(p.x+.5)*scale,y=oy+(p.y+.5)*scale;
        if(x<0||x>s||y<0||y>s)continue;
        ctx.save();
        // Ramka przylega do obwodu znacznika respa (bez duzego marginesu).
        const half=markerRadius(4)+1.2;
        ctx.strokeStyle='#64ffe9';ctx.lineWidth=2;
        ctx.shadowColor='#64ffe9';ctx.shadowBlur=1;
        ctx.strokeRect(x-half,y-half,half*2,half*2);
        ctx.restore();
      }
    }

    note=valid?`Mapa ${w}×${h} • NPC: ${m.npcs.length} • potwory: ${m.monsters.length} • przedmioty: ${m.items.length} • gracze: ${m.players.length} • przejścia: ${m.gates.length} • respy: ${respPoints.length}`:'Brak wymiarów mapy';
    updatePreview();
    const footer=frame.querySelector('.footer');
    if(footer)footer.textContent=(d.mapName||'Margonem')+' • '+(d.hero?.x??'?')+','+(d.hero?.y??'?')+' • '+note+(terrain?' • teren: grafika':` • teren: ${bgState==='loading'?'ładowanie':bgState==='error'?'błąd':'siatka'}`);
  }
  // requestAnimationFrame daje plynne odswiezanie (do 60 FPS),
  // podczas gdy kosztowne pobieranie list pozostaje ograniczone do 80 ms.
  function loop(time){
    if(!frame?.isConnected)return;
    paint(time);
    raf=requestAnimationFrame(loop);
  }
  function place(){
    if(!frame||!canvas)return;
    cfg.x=cfg.x==null?Math.max(5,innerWidth-cfg.size-300):Math.max(0,Math.min(innerWidth-cfg.size,cfg.x));
    cfg.y=Math.max(0,Math.min(innerHeight-50,cfg.y));
    frame.style.left=cfg.x+"px";frame.style.top=cfg.y+"px";
    frame.style.width=cfg.size+"px";
    // Zmiana width/height kasuje caly canvas, nawet przy tej samej wartosci.
    // Podczas przesuwania okna NIE resetujemy bufora rysowania.
    if(canvas.width!==cfg.size)canvas.width=cfg.size;
    if(canvas.height!==cfg.size)canvas.height=cfg.size;
  }
  function render(){
    if(frame)return;
    frame=document.createElement("div");frame.id="ta-mm";
    frame.innerHTML='<div class="head"><span>MINIMAPA+</span><span><button data-act="settings" title="Ustawienia">⚙</button> <button data-act="hide" title="Ukryj">×</button></span></div><canvas></canvas><div class="footer">Ładowanie…</div>';
    document.body.appendChild(frame);canvas=frame.querySelector("canvas");ctx=canvas.getContext("2d");
    tip=document.createElement("div");tip.id="ta-mm-preview";document.body.appendChild(tip);
    canvas.addEventListener("pointermove",e=>{hoverPos={x:e.clientX,y:e.clientY};updatePreview()});
    canvas.addEventListener("pointerleave",()=>{hoverPos=null;hidePreview()});
    canvas.addEventListener('contextmenu',event=>{
      const player=playerAtPointer(event);
      if(player)showPlayerMenu(player,event);
    });
    // Use exactly the same tile-space transform as paint(), including zoom.
    canvas.addEventListener("click",e=>{
      if(e.button!==0||!clickTransform)return;
      const t=clickTransform,rect=canvas.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const px=(e.clientX-rect.left)*canvas.width/rect.width;
      const py=(e.clientY-rect.top)*canvas.height/rect.height;
      const x=Math.floor((px-t.ox)/t.scale),y=Math.floor((py-t.oy)/t.scale);
      if(x<0||y<0||x>=t.w||y>=t.h)return;
      const eng=engine();
      if(typeof eng?.hero?.autoGoTo!=="function")return;
      const currentMap=String(eng?.map?.getId?.()??eng?.map?.d?.id??"");
      if(t.mapId!==currentMap)return;
      try{eng.hero.autoGoTo({x,y},false)}
      catch(error){console.warn("[Minimapa+] Nie udalo sie rozpoczac ruchu:",error)}
    });
    frame.querySelector('[data-act="settings"]').onclick=openSettings;
    frame.querySelector('[data-act="hide"]').onclick=()=>{cfg.visible=false;save();closeView()};
    const head=frame.querySelector(".head");
    head.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;drag={x:e.clientX,y:e.clientY,left:cfg.x,top:cfg.y};head.setPointerCapture(e.pointerId)});
    head.addEventListener("pointermove",e=>{if(!drag)return;cfg.x=drag.left+e.clientX-drag.x;cfg.y=drag.top+e.clientY-drag.y;place()});
    head.addEventListener("pointerup",()=>{drag=null;save()});
    // Scroll nie zmienia skali mapy; rozmiar okna reguluje tylko opcja Rozmiar (px).
    place();loop();
  }
  function closeView(){markerSnapshot=null;motion.clear();lastSampleAt=0;clickTransform=null;cancelAnimationFrame(raf);tip?.remove();tip=null;hoverPos=null;hoverHits=[];hoverKey="";frame?.remove();frame=null;canvas=null;ctx=null;closeSettings()}
  function openSettings(){
    if(menu){closeSettings();return}
    menu=document.createElement("div");menu.id="ta-mm-settings";document.body.appendChild(menu);
    menu.style.top=Math.max(10,Math.min(innerHeight-300,(cfg.y||90)))+"px";
    menu.style.left=Math.max(10,Math.min(innerWidth-300,(cfg.x||100)+cfg.size+8))+"px";
    const colorControls=Object.entries(COLOR_LABELS).map(([key,label])=>`<label>${escapeHtml(label)}<input type="color" data-color="${key}" value="${color(key)}"></label>`).join('');
    menu.innerHTML=`<strong>Minimapa+ — ustawienia</strong>
      <label>Rozmiar (px)<input type="number" data-k="size" min="160" max="1100" value="${cfg.size}"></label>
      <label>Gracze (niebieskie kwadraty)<input type="checkbox" data-k="players" ${cfg.players?"checked":""}></label>
      <label>NPC (zielone kwadraty)<input type="checkbox" data-k="npcs" ${cfg.npcs?"checked":""}></label>
      <label>Potwory (czerwone kwadraty)<input type="checkbox" data-k="monsters" ${cfg.monsters!==false?"checked":""}></label>
      <label>Przedmioty (odradzające się i wyrzucone)<input type="checkbox" data-k="items" ${cfg.items!==false?"checked":""}></label>
      <label>Teren z grafiki mapy<input type="checkbox" data-k="terrain" ${cfg.terrain!==false?"checked":""}></label>
      <label>Obiekty interaktywne<input type="checkbox" data-k="objects" ${cfg.objects?"checked":""}></label>
      <label>Respawny herosów (turkusowa ramka po podejściu)<input type="checkbox" data-k="respawns" ${cfg.respawns!==false?"checked":""}></label>
      <label>Przejścia (fioletowe kwadraty)<input type="checkbox" data-k="gates" ${cfg.gates!==false?"checked":""}></label>
      <label>Podgląd elementów po najechaniu<input type="checkbox" data-k="hoverPreview" ${cfg.hoverPreview!==false?"checked":""}></label>
      <label>Podpisy<input type="checkbox" data-k="labels" ${cfg.labels?"checked":""}></label>
      <strong>Kolory poszczególnych znaczników</strong><div class="ta-colors">${colorControls}</div>
      <button data-a="resetcolors" type="button">Przywróć domyślne kolory</button>
      <button data-a="save">Zapisz</button> <button data-a="close">Zamknij</button>
      <p style="color:#9eb6bd;line-height:1.4">Teren jest pobierany bezpośrednio z Engine.map.src. Nie trzeba otwierać podręcznej mapy. Rozpoznawanie elit i rzadkości przedmiotów jest wstępne.</p>`;
    menu.querySelector('[data-a="resetcolors"]').onclick=()=>{
      menu.querySelectorAll('[data-color]').forEach(input=>input.value=DEFAULT_COLORS[input.dataset.color]);
    };
    menu.querySelector('[data-a="close"]').onclick=closeSettings;
    menu.querySelector('[data-a="save"]').onclick=()=>{
      for(const k of ["players","npcs","monsters","items","gates","respawns","labels","terrain","objects","hoverPreview"])cfg[k]=menu.querySelector(`[data-k="${k}"]`).checked;
      cfg.size=Math.max(160,Math.min(1100,Number(menu.querySelector('[data-k="size"]').value)||500));
       cfg.zoom=1;
      menu.querySelectorAll('[data-color]').forEach(input=>{cfg.colors[input.dataset.color]=input.value});
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
  function destroy(){clearInterval(respSyncTimer);if(respHookTarget&&respHookOriginal&&respHookTarget.updateWindowMiniMapRespPos===respHookOriginal.wrapped)respHookTarget.updateWindowMiniMapRespPos=respHookOriginal.fn;document.removeEventListener("keydown",onKeyDown,true);closeView();css.remove();delete window.TeriashMinimapPlus}
  function diagnostics(){
    const e=engine();const raw=safeDrawable(e?.npcs);
    const groups={};for(const o of raw){
      if(!o?.d)continue;
      let kind='BRAK';try{kind=String(o.getKind?.()||'BRAK')}catch{}
      groups[kind]=(groups[kind]||0)+1;
    }
    const m=getMarkers(e);
    const result={version:'0.5.8',map:e?.map?.d?.name,rawNpcs:raw.length,
      groups,monsters:m.monsters.length,npcs:m.npcs.length,
      groundItems:safeGroundItems(e).length,items:m.items.length};
    console.table(result.groups);console.log('[Minimapa+] Diagnostyka',result);
    return result;
  }
  window.TeriashMinimapPlus={openSettings,toggle,destroy,diagnostics,version:'0.5.8'};
  if(cfg.visible)render();
})();
