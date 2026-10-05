(() => {
  "use strict";
  if (window.TeriashDepoPlus) return;

  const VERSION = "0.4.0";
  const PREFIX = "[Teriash Depozyt+]";
  let observer = null;
  let lastSnapshot = [];
  let busy = false;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const privateLoc = () => window.Engine?.itemsFetchData?.NEW_PRIVATE_DEPO_ITEM?.loc;
  const equipLoc = () => window.Engine?.itemsFetchData?.NEW_EQUIP_ITEM?.loc;
  const isPrivateDepoItem = item => !!item && item.loc === privateLoc();

  function itemData(item) {
    return {
      id: item.id, name: item.name, x: Number(item.x), y: Number(item.y), loc: item.loc,
      amount: item.getAmountStat?.() ?? null, cansplit: item.getCansplitStat?.() ?? null,
      capacity: item.getCapacityStat?.() ?? null, tpl: item.tpl ?? null, item
    };
  }

  function readDepoItems() {
    const out = [], seen = new Set();
    document.querySelectorAll(".depo-window .item, .depo .item, .window-depo .item").forEach(el => {
      try {
        const item = window.jQuery ? window.jQuery(el).data("item") : null;
        if (!isPrivateDepoItem(item) || seen.has(String(item.id))) return;
        seen.add(String(item.id)); out.push(itemData(item));
      } catch {}
    });
    lastSnapshot = out;
    return out;
  }

  function readBagItems() {
    const out = [], seen = new Set();
    document.querySelectorAll(".inventory-item, .inventory-grid .item, .equipment-window .item").forEach(el => {
      try {
        const item = window.jQuery ? window.jQuery(el).data("item") : null;
        if (!item || item.loc !== equipLoc() || seen.has(String(item.id))) return;
        seen.add(String(item.id)); out.push(itemData(item));
      } catch {}
    });
    return out;
  }

  function printSnapshot() {
    const items = readDepoItems();
    console.group(`${PREFIX} prywatny depozyt (${items.length} przedmiotów)`);
    console.table(items.map(({item, ...x}) => x));
    console.groupEnd();
    return items;
  }

  function findFreeDepoSlot(sourceX, sourceY) {
    const items = readDepoItems();
    const occupied = new Set(items.map(v => `${v.x}:${v.y}`));
    const cols = 14, rows = 7;
    const startX = Math.floor(Number(sourceX) / cols) * cols;
    // Najpierw sloty obok źródła, potem reszta tej samej zakładki.
    const candidates = [];
    for (let d = 1; d < cols; d++) {
      candidates.push([Number(sourceX) + d, Number(sourceY)], [Number(sourceX) - d, Number(sourceY)]);
    }
    for (let y = 0; y < rows; y++) for (let x = startX; x < startX + cols; x++) candidates.push([x,y]);
    for (const [x,y] of candidates) {
      if (x < startX || x >= startX + cols || y < 0 || y >= rows) continue;
      if (!occupied.has(`${x}:${y}`)) return {x,y};
    }
    return null;
  }

  async function waitFor(fn, timeout=6000, interval=100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn(); if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  function request(q) {
    return new Promise(resolve => window._g(q, r => resolve(r)));
  }

  async function splitViaBag(id, amount) {
    if (busy) return console.warn(`${PREFIX} Inna operacja jest jeszcze wykonywana.`), false;
    const src = readDepoItems().find(v => String(v.id) === String(id));
    if (!src) return console.error(`${PREFIX} Nie znaleziono przedmiotu w depozycie.`), false;
    const total = Number(src.amount), split = Number(amount);
    if (!Number.isInteger(split) || split < 1 || !Number.isFinite(total) || split >= total)
      return console.error(`${PREFIX} Nieprawidłowa liczba. Stos ma ${src.amount} szt.`), false;
    if (String(src.cansplit) === "0") return console.error(`${PREFIX} Tego przedmiotu nie można dzielić.`), false;
    if (typeof window._g !== "function") return console.error(`${PREFIX} Brak _g.`), false;

    const freeDepo = findFreeDepoSlot(src.x, src.y);
    if (!freeDepo) return console.error(`${PREFIX} Brak wolnego slotu na tej zakładce depozytu.`), false;

    busy = true;
    const originalPos = {x: src.x, y: src.y};
    console.group(`${PREFIX} PODZIAŁ ${src.name}`);
    console.info(`Dzielę ${src.amount} na ${total-split} + ${split}. Technicznie: depozyt → torba → podział → depozyt.`);
    try {
      const bagBefore = new Set(readBagItems().map(v => String(v.id)));

      await request(`depo&get=${src.id}`);
      const inBag = await waitFor(() => readBagItems().find(v => String(v.id) === String(src.id)));
      if (!inBag) throw new Error("Nie udało się wyjąć przedmiotu do torby (brak miejsca albo brak aktualizacji klienta).");

      const beforeSplit = new Set(readBagItems().map(v => String(v.id)));
      const splitReq = `moveitem&findslot=1&st=0&id=${src.id}&x=${inBag.x}&y=${inBag.y}&split=${split}`;
      await request(splitReq);

      const newPart = await waitFor(() => {
        const now = readBagItems();
        return now.find(v => !beforeSplit.has(String(v.id)) && (v.tpl === src.tpl || v.name === src.name));
      });
      if (!newPart) throw new Error("Podział w torbie nie utworzył wykrywalnego nowego stosu.");

      // Oryginał wraca dokładnie na swoje miejsce, wydzielona część do wolnego slotu tej samej zakładki.
      await request(`depo&put=${src.id}&x=${originalPos.x}&y=${originalPos.y}`);
      await waitFor(() => readDepoItems().some(v => String(v.id) === String(src.id)), 5000);
      await request(`depo&put=${newPart.id}&x=${freeDepo.x}&y=${freeDepo.y}`);
      const returned = await waitFor(() => readDepoItems().some(v => String(v.id) === String(newPart.id)), 5000);
      if (!returned) throw new Error("Nowy stos nie wrócił automatycznie do depozytu.");

      console.info(`${PREFIX} Gotowe. Nowy stos:`, newPart.id, `slot ${freeDepo.x},${freeDepo.y}`);
      return true;
    } catch (e) {
      console.error(`${PREFIX} Operacja przerwana:`, e);
      console.warn(`${PREFIX} Jeśli przedmiot pozostał w torbie, włóż go ręcznie do depozytu. Dodatek nie będzie wysyłał kolejnych requestów po błędzie.`);
      return false;
    } finally {
      busy = false; console.groupEnd();
    }
  }


  function isStackItem(item) {
    return !!item && Number(item.getAmountStat?.()) > 0;
  }

  function sameStackKind(a, b) {
    if (!isPrivateDepoItem(a) || !isPrivateDepoItem(b) || String(a.id) === String(b.id)) return false;
    if (!isStackItem(a) || !isStackItem(b)) return false;
    if (a.tpl != null && b.tpl != null) return String(a.tpl) === String(b.tpl);
    return a.name === b.name;
  }

  async function mergeViaBag(sourceId, targetId) {
    if (busy) return console.warn(`${PREFIX} Inna operacja jest jeszcze wykonywana.`), false;
    const items = readDepoItems();
    const src = items.find(v => String(v.id) === String(sourceId));
    const dst = items.find(v => String(v.id) === String(targetId));
    if (!src || !dst) return console.error(`${PREFIX} Nie znaleziono obu stosów w depozycie.`), false;
    if (!sameStackKind(src.item, dst.item)) return console.warn(`${PREFIX} Te przedmioty nie wyglądają na ten sam rodzaj stosu.`), false;
    if (typeof window._g !== "function") return console.error(`${PREFIX} Brak _g.`), false;

    busy = true;
    const srcPos = {x: src.x, y: src.y};
    const dstPos = {x: dst.x, y: dst.y};
    console.group(`${PREFIX} SCALANIE ${src.name}`);
    console.info(`Technicznie: oba stosy → torba → natywne moveitem → depozyt.`);
    try {
      await request(`depo&get=${dst.id}`);
      const dstBag = await waitFor(() => readBagItems().find(v => String(v.id) === String(dst.id)));
      if (!dstBag) throw new Error("Nie udało się wyjąć stosu docelowego do torby.");

      await request(`depo&get=${src.id}`);
      const srcBag = await waitFor(() => readBagItems().find(v => String(v.id) === String(src.id)));
      if (!srcBag) throw new Error("Nie udało się wyjąć przeciąganego stosu do torby.");

      // Dokładnie ten sam mechanizm, którego klient używa przy przeciągnięciu stosu na stos w torbie.
      await request(`moveitem&st=0&id=${src.id}&x=${dstBag.x}&y=${dstBag.y}`);
      await sleep(250);
      await waitFor(() => {
        const bag = readBagItems();
        const a = bag.find(v => String(v.id) === String(src.id));
        const b = bag.find(v => String(v.id) === String(dst.id));
        return !a || !b || Number(a.amount) !== Number(src.amount) || Number(b.amount) !== Number(dst.amount);
      }, 4000, 100);

      const bagNow = readBagItems();
      const srcAfter = bagNow.find(v => String(v.id) === String(src.id));
      const dstAfter = bagNow.find(v => String(v.id) === String(dst.id));
      if (srcAfter && dstAfter && Number(srcAfter.amount) === Number(src.amount) && Number(dstAfter.amount) === Number(dst.amount))
        throw new Error("Natywne moveitem nie scaliło tych stosów.");

      // Stos docelowy (albo jedyny ocalały) wraca w miejsce, na które upuszczono przedmiot.
      if (dstAfter) {
        await request(`depo&put=${dstAfter.id}&x=${dstPos.x}&y=${dstPos.y}`);
        await waitFor(() => readDepoItems().some(v => String(v.id) === String(dstAfter.id)), 5000);
      } else if (srcAfter) {
        await request(`depo&put=${srcAfter.id}&x=${dstPos.x}&y=${dstPos.y}`);
        await waitFor(() => readDepoItems().some(v => String(v.id) === String(srcAfter.id)), 5000);
      }

      // Przy przekroczeniu capacity część źródłowego stosu może zostać. Wraca na swoje stare miejsce.
      if (srcAfter && dstAfter) {
        await request(`depo&put=${srcAfter.id}&x=${srcPos.x}&y=${srcPos.y}`);
        await waitFor(() => readDepoItems().some(v => String(v.id) === String(srcAfter.id)), 5000);
      }

      console.info(`${PREFIX} Scalanie zakończone.`);
      return true;
    } catch (e) {
      console.error(`${PREFIX} Scalanie przerwane:`, e);
      console.warn(`${PREFIX} Jeśli któryś stos pozostał w torbie, włóż go ręcznie do depozytu.`);
      return false;
    } finally {
      busy = false; console.groupEnd();
    }
  }

  function installMergeDrop(el, targetItem) {
    if (!window.jQuery || !isStackItem(targetItem)) return;
    const $el = window.jQuery(el);
    if ($el.data("teriash-depo-plus-merge-drop")) return;
    $el.data("teriash-depo-plus-merge-drop", true);
    if (typeof $el.pointerDroppable !== "function") return;
    $el.pointerDroppable({
      accept: ".item:not(.shop-item)",
      drop: function(event, ui) {
        const source = ui?.draggable?.data?.("item");
        if (!sameStackKind(source, targetItem)) return;
        event?.preventDefault?.();
        event?.stopPropagation?.();
        mergeViaBag(source.id, targetItem.id);
        return false;
      }
    });
  }

  function askSplit(item) {
    const total = Number(item.getAmountStat?.());
    if (!Number.isFinite(total) || total <= 1 || String(item.getCansplitStat?.()) === "0") {
      window.mAlert ? window.mAlert("Tego przedmiotu nie można podzielić.") : alert("Tego przedmiotu nie można podzielić.");
      return;
    }
    const raw = prompt(`Podziel stos „${item.name}” (${total} szt.)\nIle sztuk wydzielić?`, "1");
    if (raw == null) return;
    const amount = Number(String(raw).replace(/\s/g, ""));
    splitViaBag(item.id, amount);
  }

  function canSplitDepoItem(item) {
    return isPrivateDepoItem(item) &&
      Number(item.getAmountStat?.()) > 1 &&
      String(item.getCansplitStat?.()) === "1";
  }

  function patchDepoItem(item) {
    if (!isPrivateDepoItem(item) || item.__teriashDepoPlusMenuPatched) return;
    const original = item.createOptionMenu;
    if (typeof original !== "function") return;

    Object.defineProperty(item, "__teriashDepoPlusMenuPatched", {
      value: true, configurable: true
    });

    item.createOptionMenu = function(event, extraOptions, disabledOptions, context) {
      let extra = extraOptions;
      if (canSplitDepoItem(this)) {
        const splitOption = {
          txt: (typeof window._t === "function" ? window._t("split", null, "menu") : "Podziel"),
          f: () => askSplit(this)
        };
        if (!extra) extra = [splitOption];
        else if (Array.isArray(extra)) extra = [...extra, splitOption];
        else extra = [extra, splitOption];
      }
      return original.call(this, event, extra, disabledOptions, context);
    };
  }

  function installMarker() {
    document.querySelectorAll(".depo-window .item, .depo .item, .window-depo .item").forEach(el => {
      try {
        const item = window.jQuery ? window.jQuery(el).data("item") : null;
        patchDepoItem(item);
        if (isPrivateDepoItem(item) && isStackItem(item)) installMergeDrop(el, item);
      } catch {}
    });
  }

  function start(){
    installMarker(); observer=new MutationObserver(installMarker); observer.observe(document.documentElement,{childList:true,subtree:true});
    console.info(`${PREFIX} v${VERSION} uruchomiony. „Podziel” działa z PPM, a przeciągnięcie stosu na taki sam stos uruchamia scalanie przez torbę.`);
  }
  function destroy(){observer?.disconnect();observer=null;}

  window.TeriashDepoPlus={version:VERSION,snapshot:printSnapshot,splitViaBag,mergeViaBag,items:()=>lastSnapshot.length?lastSnapshot:readDepoItems(),destroy};
  start();
})();
