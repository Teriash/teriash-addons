(() => {
  "use strict";
  const TA=window.TeriashAddons, B=TA?.bridge;
  if(!B || window.TeriashBattleLogs) return;
  const KEY="teriashAddons.battleLogs.settings";
  const defaults={mode:"normal",width:650,height:430,selector:""};
  let config={...defaults,...(B.getValue(KEY,{})||{})};
  let panel=null,target=null,original=null,observer=null,interval=null,pickMode=false;
  // No automatic selection of the entire combat scene: only a manually
  // identified log panel may be resized.
  const selectors=[];
  const css=document.createElement("style");
  css.id="ta-battle-logs-css";
  css.textContent=`
    #ta-bl-settings{position:fixed;z-index:2147483000;top:110px;left:110px;width:310px;box-sizing:border-box;
      background:#111b20;color:#e9f4f4;border:1px solid #267784;border-radius:12px;padding:16px;
      font:13px Arial,sans-serif;box-shadow:0 12px 35px #000a}
    #ta-bl-settings *{box-sizing:border-box}
    #ta-bl-settings .bl-head{display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:bold;margin-bottom:13px}
    #ta-bl-settings button,#ta-bl-settings select{background:#18333b;color:#e8ffff;border:1px solid #397782;border-radius:6px;padding:7px;cursor:pointer}
    #ta-bl-settings .bl-row{display:flex;align-items:center;justify-content:space-between;margin:9px 0;gap:10px}
    #ta-bl-settings input{width:90px;background:#091317;color:white;border:1px solid #397782;border-radius:5px;padding:6px}
    #ta-bl-settings .bl-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}
    #ta-bl-settings .bl-note{font-size:11px;color:#9fb8c0;margin-top:12px;line-height:1.5}
    #ta-bl-picker{position:fixed;z-index:2147483640;top:12px;left:50%;transform:translateX(-50%);
      background:#10272d;color:white;border:1px solid #32b5ad;padding:12px;border-radius:9px;pointer-events:none}
    .ta-bl-resizable{resize:both!important;min-width:320px!important;min-height:240px!important}
  `;
  document.head.appendChild(css);
  function save(){B.setValue(KEY,config)}
  function isVisible(el){const r=el.getBoundingClientRect();return r.width>180&&r.height>120&&getComputedStyle(el).display!=="none"}
  function findWindow(){
    if(config.selector){try{const el=document.querySelector(config.selector);if(el&&isVisible(el))return el}catch{}}
    // Never fall back to battle scene. Explicit selection is required.
    return null;
  }
  function restore(){
    if(target&&original){
      target.style.cssText=original.cssText;
      target.classList.remove("ta-bl-resizable");
    }
    target=null;original=null;
  }
  function apply(){
    const found=findWindow();
    if(found!==target){restore();if(found){target=found;original={cssText:found.style.cssText}}}
    if(!target||!target.isConnected)return;
    if(config.mode==="normal"){restore();return}
    const st=target.style;
    const imp=(k,v)=>st.setProperty(k,v,"important");
    imp("position","fixed");
    imp("z-index","999990");
    imp("right","auto");
    imp("bottom","auto");
    imp("max-width","none");
    imp("max-height","none");
    imp("transform","none");
    imp("margin","0");
    imp("display","flex");
    imp("flex-direction","column");
    if(config.mode==="left"){
      imp("left","12px");imp("top","12px");
      imp("width",Math.max(320,config.width)+"px");
      imp("height","calc(100vh - 24px)");
      imp("overflow","visible");
      target.classList.remove("ta-bl-resizable");
    }else{
      const x=Math.max(0,(innerWidth-config.width)/2);
      const y=Math.max(0,innerHeight-config.height-35);
      imp("left",x+"px");imp("top",y+"px");
      imp("width",config.width+"px");imp("height",config.height+"px");
      target.classList.add("ta-bl-resizable");
    }
  }
  function setMode(mode){config.mode=mode;save();restore();apply();render()}
  function selectTarget(e){
    if(!pickMode)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    const x=e.clientX,y=e.clientY;
    // Choose the compact parent surrounding the attack log, not the battle
    // background. The chosen node must contain the clicked element.
    const chain=[];
    for(let n=e.target;n&&n!==document.body;n=n.parentElement){
      if(!(n instanceof HTMLElement))continue;
      const r=n.getBoundingClientRect();
      if(r.width>=300&&r.width<=1000&&r.height>=160&&r.height<=650&&r.left<=x&&r.right>=x&&r.top<=y&&r.bottom>=y)
        chain.push({el:n,area:r.width*r.height,rect:r});
    }
    const candidate=chain.sort((a,b)=>a.area-b.area).find(c=>c.rect.width>=390&&c.rect.height>=200)?.el;
    if(!candidate){
      document.getElementById("ta-bl-picker").textContent="Nie znaleziono panelu. Kliknij tekst ataków wewnątrz dolnego okna walki (Esc = anuluj).";
      return;
    }
    if(candidate.id)config.selector="#"+CSS.escape(candidate.id);
    else {
      candidate.setAttribute("data-ta-battle-log-target","true");
      config.selector="[data-ta-battle-log-target='true']";
    }
    pickMode=false;document.getElementById("ta-bl-picker")?.remove();
    save();restore();apply();render();
  }
  document.addEventListener("click",selectTarget,true);
  function pick(){
    pickMode=true;closeSettings();
    const hint=document.createElement("div");hint.id="ta-bl-picker";
    hint.textContent="Kliknij TEKST ATAKÓW wewnątrz dolnego panelu walki (Esc = anuluj)";
    document.body.appendChild(hint);
  }
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&pickMode){pickMode=false;document.getElementById("ta-bl-picker")?.remove()}});
  function render(){
    if(!panel)return;
    panel.innerHTML=`
      <div class="bl-head"><span>Logi Walki+</span><button data-act="close">×</button></div>
      <div class="bl-row"><label>Tryb okna</label><select data-key="mode">
        <option value="normal" ${config.mode==="normal"?"selected":""}>Oryginalny</option>
        <option value="large" ${config.mode==="large"?"selected":""}>Powiększony</option>
        <option value="left" ${config.mode==="left"?"selected":""}>Panel po lewej</option>
      </select></div>
      <div class="bl-row"><label>Szerokość (px)</label><input data-key="width" type="number" min="320" max="1400" value="${config.width}"></div>
      <div class="bl-row"><label>Wysokość (px)</label><input data-key="height" type="number" min="240" max="1000" value="${config.height}" ${config.mode==="left"?"disabled":""}></div>
      <div class="bl-actions"><button data-act="apply">Zastosuj</button><button data-act="pick">Wskaż okno walki</button><button data-act="reset">Reset</button></div>
      <div class="bl-note">Kliknij „Wskaż okno walki”, a następnie tekst ataków w dolnym panelu. Nie wskazuj tła walki. W trybie lewym wysokość dopasowuje się do ekranu. Ustawienia zapisują się po F5.</div>`;
    panel.querySelector('[data-act="close"]').onclick=closeSettings;
    panel.querySelector('[data-act="pick"]').onclick=pick;
    panel.querySelector('[data-act="reset"]').onclick=()=>{config={...defaults};save();restore();render()};
    panel.querySelector('[data-act="apply"]').onclick=()=>{
      const w=Number(panel.querySelector('[data-key="width"]').value),h=Number(panel.querySelector('[data-key="height"]').value);
      config.width=Math.max(320,Math.min(1400,w||650));
      config.height=Math.max(240,Math.min(1000,h||430));
      setMode(panel.querySelector('[data-key="mode"]').value);
    };
  }
  function openSettings(){
    if(panel){closeSettings();return}
    panel=document.createElement("div");panel.id="ta-bl-settings";document.body.appendChild(panel);render();
  }
  function closeSettings(){panel?.remove();panel=null}
  function destroy(){closeSettings();restore();clearInterval(interval);observer?.disconnect();css.remove();document.removeEventListener("click",selectTarget,true);delete window.TeriashBattleLogs}
  // Periodic retry because battle windows are created/destroyed between fights.
  interval=setInterval(()=>{if(config.mode!=="normal")apply()},900);
  window.TeriashBattleLogs={openSettings,closeSettings,destroy};
  if(config.mode!=="normal")apply();
})();
