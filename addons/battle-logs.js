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

    /* Resize the actual native combat UI, not the battle background. */
    .battle-controller.ta-bl-active{
      position:fixed!important;z-index:999990!important;box-sizing:border-box!important;
      width:min(var(--ta-bl-width),calc(100vw - 24px))!important;
      height:var(--ta-bl-height)!important;max-width:none!important;max-height:none!important;
      transform:none!important;overflow:visible!important;
    }
    .battle-controller.ta-bl-large{
      left:50%!important;right:auto!important;top:auto!important;bottom:12px!important;
      transform:translateX(-50%)!important;
    }
    .battle-controller.ta-bl-left{
      left:12px!important;right:auto!important;top:12px!important;bottom:auto!important;
      height:calc(100vh - 24px)!important;
    }
    .battle-controller.ta-bl-active>.battle-content{
      position:relative!important;box-sizing:border-box!important;
      width:100%!important;height:100%!important;min-height:0!important;
      max-width:none!important;max-height:none!important;
      left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;
      transform:none!important;
    }
    .battle-controller.ta-bl-active .battle-content>.left-column,
    .battle-controller.ta-bl-active .battle-content>.right-column{
      height:calc(100% - 76px)!important;max-height:none!important;min-height:0!important;
      overflow:hidden!important;
    }
    .battle-controller.ta-bl-active .left-column>.scroll-wrapper,
    .battle-controller.ta-bl-active .right-column>.scroll-wrapper{
      height:100%!important;max-height:100%!important;
    }
    .battle-controller.ta-bl-active .left-column .scroll-pane,
    .battle-controller.ta-bl-active .right-column .scroll-pane{max-height:none!important;}
  `;
  document.head.appendChild(css);
  function save(){B.setValue(KEY,config)}
  function isVisible(el){const r=el.getBoundingClientRect();return r.width>180&&r.height>120&&getComputedStyle(el).display!=="none"}
  // Native Margonem combat panel: battle-controller > battle-content.
  function findWindow(){
    const content=document.querySelector('.battle-controller > .battle-content');
    return content?.parentElement?.classList.contains('battle-controller') ? content.parentElement : null;
  }
  function restore(){
    if(target&&original){target.style.cssText=original.cssText;target.classList.remove('ta-bl-active','ta-bl-left','ta-bl-large');}
    target=null;original=null;
  }
  function apply(){
    const found=findWindow();
    if(found!==target){restore();if(found){target=found;original={cssText:found.style.cssText}}}
    if(!target||!target.isConnected)return;
    if(config.mode==='normal'){restore();return}
    target.classList.add('ta-bl-active');
    target.classList.toggle('ta-bl-left',config.mode==='left');
    target.classList.toggle('ta-bl-large',config.mode==='large');
    target.style.setProperty('--ta-bl-width',Math.max(320,config.width)+'px');
    target.style.setProperty('--ta-bl-height',Math.max(240,config.height)+'px');
  }
  function setMode(mode){config.mode=mode;save();restore();apply();render()}
  // No manual picker needed: stable semantic classes identify the panel.
  function selectTarget(){}
  function pick(){
    window.mAlert?.('Panel walki jest teraz wykrywany automatycznie. Rozpocznij walkę i wybierz tryb.');
  }
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
      <div class="bl-note">Panel logów wykrywany jest automatycznie na podstawie battle-controller i battle-content. W trybie lewym wysokość dopasowuje się do ekranu. Ustawienia zapisują się po F5.</div>`;
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
  function destroy(){closeSettings();restore();clearInterval(interval);observer?.disconnect();css.remove();delete window.TeriashBattleLogs}
  // Periodic retry because battle windows are created/destroyed between fights.
  interval=setInterval(()=>{if(config.mode!=="normal")apply()},900);
  window.TeriashBattleLogs={openSettings,closeSettings,destroy};
  if(config.mode!=="normal")apply();
})();
