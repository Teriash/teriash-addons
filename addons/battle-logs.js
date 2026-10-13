(() => {
  "use strict";
  const TA=window.TeriashAddons, B=TA?.bridge;
  if(!B || window.TeriashBattleLogs) return;
  const KEY="teriashAddons.battleLogs.settings";
  const defaults={mode:"normal",width:350,height:430,selector:""};
  let config={...defaults,...(B.getValue(KEY,{})||{})};
  if(config.mode==="left" && config.width===650) {config.width=350;B.setValue(KEY,config)}
  let panel=null,target=null,original=null,interval=null,endedElement=null;
  const css=document.createElement('style');
  css.id='ta-battle-logs-css';
  css.textContent=`
    #ta-bl-settings{position:fixed;z-index:2147483000;top:110px;left:110px;width:310px;box-sizing:border-box;background:#111b20;color:#e9f4f4;border:1px solid #267784;border-radius:12px;padding:16px;font:13px Arial,sans-serif;box-shadow:0 12px 35px #000a}
    #ta-bl-settings *{box-sizing:border-box}
    #ta-bl-settings .bl-head{display:flex;justify-content:space-between;align-items:center;font-size:16px;font-weight:bold;margin-bottom:13px}
    #ta-bl-settings button,#ta-bl-settings select{background:#18333b;color:#e8ffff;border:1px solid #397782;border-radius:6px;padding:7px;cursor:pointer}
    #ta-bl-settings .bl-row{display:flex;align-items:center;justify-content:space-between;margin:9px 0;gap:10px}
    #ta-bl-settings input{width:90px;background:#091317;color:white;border:1px solid #397782;border-radius:5px;padding:6px}
    #ta-bl-settings .bl-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}
    #ta-bl-settings .bl-note{font-size:11px;color:#9fb8c0;margin-top:12px;line-height:1.5}
    /* Nie zmieniamy układu całej sceny, tylko oryginalny panel. */
    .battle-controller.ta-bl-sized{box-sizing:border-box!important;max-width:none!important;max-height:none!important;z-index:9999!important}
    .battle-controller.ta-bl-sized>.battle-content{box-sizing:border-box!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}
    .battle-controller.ta-bl-sized .battle-content>.left-column,
    .battle-controller.ta-bl-sized .battle-content>.right-column{
      box-sizing:border-box!important;top:32px!important;bottom:49px!important;
      height:auto!important;max-height:none!important;overflow:hidden!important
    }
    .battle-controller.ta-bl-sized .left-column>.scroll-wrapper,
    .battle-controller.ta-bl-sized .right-column>.scroll-wrapper{
      height:100%!important;max-height:100%!important;overflow:hidden!important
    }
    .battle-controller.ta-bl-sized .battle-content>.buttons-wrapper{bottom:0!important}
    .battle-controller.ta-bl-sized .battle-content>.time-wrapper{top:0!important}

  `;
  document.head.appendChild(css);
  function save(){B.setValue(KEY,config)}
  function findWindow(){return [...document.querySelectorAll('.battle-controller')].find(el=>el.querySelector(':scope > .battle-content'))||null}
  function restore(){
    if(target){target.classList.remove('ta-bl-sized');if(original!==null)target.style.cssText=original}
    target=null;original=null;
  }
  function getChatRight(){
    const matches=[...document.querySelectorAll('.chat-window,.chat-wrapper,[class*="chat-window"],[class*="chat-panel"]')]
      .map(el=>el.getBoundingClientRect()).filter(x=>x.width>100&&x.height>150&&x.left<innerWidth*.35);
    return matches.length?Math.max(...matches.map(x=>x.right)):Math.min(270,innerWidth*.2);
  }
  function battleEnded(el){
    const end=el.querySelector('.battle-end-layer');
    return !!end && getComputedStyle(end).display!=='none' &&
      getComputedStyle(end).visibility!=='hidden' &&
      end.getClientRects().length>0;
  }
  function apply(){
    if(config.mode==='normal'){restore();return}
    const found=findWindow();
    if(found===endedElement){if(battleEnded(found))return;endedElement=null;}
    if(found!==target){restore();if(found){target=found;original=found.style.cssText}}
    if(!target || !target.isConnected)return;
    // Po zakończeniu walki oddajemy cały panel Margonem:
    // gra sama obsługuje przycisk zamknięcia i otwieranie kolejnej walki.
    if(battleEnded(target)){
      endedElement=target;
      restore();
      return;
    }
    const left=Math.max(12,Math.ceil(getChatRight()+12));
    const top=90,bottom=85;
    const width=Math.min(Math.max(300,Number(config.width)||350),Math.max(300,innerWidth-left-20));
    const height=config.mode==='left'
      ?Math.max(240,innerHeight-top-bottom)
      :Math.min(Math.max(240,Number(config.height)||430),Math.max(240,innerHeight-top-bottom));
    // Zapamiętujemy aktualne współrzędne przed zmianą rozmiaru i transformacji.
    target.classList.remove('ta-bl-sized');
    target.style.cssText=original;
    const base=target.getBoundingClientRect();
    target.classList.add('ta-bl-sized');
    target.style.setProperty('width',width+'px','important');
    target.style.setProperty('height',height+'px','important');
    const x=config.mode==='left'?left:Math.max(left,Math.round((innerWidth-width)/2));
    const y=config.mode==='left'?top:Math.max(top,innerHeight-height-bottom);
    // Oryginalny DOM i obsługa zdarzeń pozostają nietknięte.
    target.style.setProperty('transform',`translate(${Math.round(x-base.left)}px, ${Math.round(y-base.top)}px)`,'important');
  }
  function setMode(mode){config.mode=mode;save();endedElement=null;restore();apply();render()}
  function pick(){window.mAlert?.('Okno walki jest wykrywane automatycznie. Dodatek zmienia wyłącznie jego wymiary i położenie.')}
  function render(){
    if(!panel)return;
    panel.innerHTML=`
      <div class="bl-head"><span>Logi Walki+</span><button data-act="close">×</button></div>
      <div class="bl-row"><label>Tryb okna</label><select data-key="mode">
        <option value="normal" ${config.mode==="normal"?"selected":""}>Oryginalny</option>
        <option value="large" ${config.mode==="large"?"selected":""}>Powiększony</option>
        <option value="left" ${config.mode==="left"?"selected":""}>Panel po lewej</option>
      </select></div>
      <div class="bl-row"><label>Szerokość (px)</label><input data-key="width" type="number" min="300" max="1400" value="${config.width}"></div>
      <div class="bl-row"><label>Wysokość (px)</label><input data-key="height" type="number" min="240" max="1000" value="${config.height}" ${config.mode==="left"?"disabled":""}></div>
      <div class="bl-actions"><button data-act="apply">Zastosuj</button><button data-act="pick">Wskaż okno walki</button><button data-act="reset">Reset</button></div>
      <div class="bl-note">Panel pozostaje w oryginalnym kontenerze Margonem. Dodatek nie steruje zakończeniem walki ani jej przyciskami. Ustawienia zapisują się po F5.</div>`;
    panel.querySelector('[data-act="close"]').onclick=closeSettings;
    panel.querySelector('[data-act="pick"]').onclick=pick;
    panel.querySelector('[data-act="reset"]').onclick=()=>{config={...defaults};save();restore();render()};
    panel.querySelector('[data-act="apply"]').onclick=()=>{
      const w=Number(panel.querySelector('[data-key="width"]').value),h=Number(panel.querySelector('[data-key="height"]').value);
      config.width=Math.max(300,Math.min(1400,w||350));
      config.height=Math.max(240,Math.min(1000,h||430));
      setMode(panel.querySelector('[data-key="mode"]').value);
    };
  }
  function openSettings(){
    if(panel){closeSettings();return}
    panel=document.createElement("div");panel.id="ta-bl-settings";document.body.appendChild(panel);render();
  }
  function closeSettings(){panel?.remove();panel=null}
  function destroy(){closeSettings();restore();clearInterval(interval);css.remove();delete window.TeriashBattleLogs}
  interval=setInterval(()=>{if(config.mode!=="normal")apply()},850);
  window.TeriashBattleLogs={openSettings,closeSettings,destroy};
  if(config.mode!=="normal")apply();
})();
