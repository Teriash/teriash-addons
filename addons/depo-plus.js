(() => {
  "use strict";
  if (window.TeriashDepoPlus) return;

  const VERSION = "0.5.2";
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

  async function splitViaBag(id) {
    if (busy) return console.warn(`${PREFIX} Inna operacja jest jeszcze wykonywana.`), false;
    const src = readDepoItems().find(v => String(v.id) === String(id));
    if (!src) return console.error(`${PREFIX} Nie znaleziono przedmiotu w depozycie.`), false;
    const total = Number(src.amount);
    if (!Number.isFinite(total) || total <= 1) return false;
    if (String(src.cansplit) === "0") return console.error(`${PREFIX} Tego przedmiotu nie można dzielić.`), false;
    if (typeof window._g !== "function") return console.error(`${PREFIX} Brak _g.`), false;

    const freeDepo = findFreeDepoSlot(src.x, src.y);
    if (!freeDepo) return console.error(`${PREFIX} Brak wolnego slotu na tej zakładce depozytu.`), false;

    busy = true;
    const originalPos = {x: src.x, y: src.y};
    console.group(`${PREFIX} PODZIAŁ ${src.name}`);
    try {
      await request(`depo&get=${src.id}`);
      const inBag = await waitFor(() => readBagItems().find(v => String(v.id) === String(src.id)));
      if (!inBag) throw new Error("Nie udało się wyjąć przedmiotu do torby.");

      const beforeSplit = new Set(readBagItems().map(v => String(v.id)));
      const originalG = window._g;
      let resolveSent;
      const sentPromise = new Promise(resolve => resolveSent = resolve);
      let restored = false;
      const restoreG = () => {
        if (restored) return;
        restored = true;
        window._g = originalG;
      };

      window._g = function(task, cb, ...rest) {
        if (typeof task === "string" &&
            task.startsWith("moveitem") &&
            task.includes(`id=${src.id}`) &&
            task.includes("&split=")) {
          restoreG();
          const result = originalG.call(this, task, cb, ...rest);
          resolveSent(true);
          return result;
        }
        return originalG.call(this, task, cb, ...rest);
      };

      // Oryginalny mechanizm Margonem. Wyświetla natywne okno
      // „Podziel przedmiot, maksymalna ilość: ...”.
      Engine.heroEquipment.splitItem(inBag.item, inBag.x, inBag.y, true);

      // Czekamy na zatwierdzenie albo zamknięcie natywnego okna.
      let appeared = false;
      const dialogClosed = (async () => {
        const until = Date.now() + 60000;
        while (Date.now() < until) {
          const dlg = document.querySelector(".askAlert");
          if (dlg) appeared = true;
          if (appeared && !dlg) return false;
          await sleep(100);
        }
        return false;
      })();

      const sent = await Promise.race([sentPromise, dialogClosed]);
      restoreG();

      if (!sent) {
        // Anulowano: odkładamy niezmieniony stos z powrotem.
        await request(`depo&put=${src.id}&x=${originalPos.x}&y=${originalPos.y}`);
        await waitFor(() => readDepoItems().some(v => String(v.id) === String(src.id)), 5000);
        return false;
      }

      const newPart = await waitFor(() => {
        const now = readBagItems();
        return now.find(v => !beforeSplit.has(String(v.id)) && (v.tpl === src.tpl || v.name === src.name));
      });
      if (!newPart) throw new Error("Podział w torbie nie utworzył wykrywalnego nowego stosu.");

      await request(`depo&put=${src.id}&x=${originalPos.x}&y=${originalPos.y}`);
      await waitFor(() => readDepoItems().some(v => String(v.id) === String(src.id)), 5000);
      await request(`depo&put=${newPart.id}&x=${freeDepo.x}&y=${freeDepo.y}`);
      const returned = await waitFor(() => readDepoItems().some(v => String(v.id) === String(newPart.id)), 5000);
      if (!returned) throw new Error("Nowy stos nie wrócił automatycznie do depozytu.");

      console.info(`${PREFIX} Gotowe. Nowy stos:`, newPart.id, `slot ${freeDepo.x},${freeDepo.y}`);
      return true;
    } catch (e) {
      console.error(`${PREFIX} Operacja przerwana:`, e);
      console.warn(`${PREFIX} Jeśli przedmiot pozostał w torbie, włóż go ręcznie do depozytu.`);
      return false;
    } finally {
      busy = false;
      console.groupEnd();
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


  function isBagStackItem(item) {
    return !!item && item.loc === equipLoc() && Number(item.getAmountStat?.()) > 0;
  }

  function sameStackTemplate(a, b) {
    if (!a || !b || String(a.id) === String(b.id)) return false;
    if (Number(a.getAmountStat?.()) <= 0 || Number(b.getAmountStat?.()) <= 0) return false;
    if (a.tpl != null && b.tpl != null) return String(a.tpl) === String(b.tpl);
    return a.name === b.name;
  }

  function stackAmount(item) {
    return Number(item?.getAmountStat?.() ?? item?._cachedStats?.amount ?? 0) || 0;
  }

  function stackCapacity(item) {
    const raw = item?.getCapacityStat?.() ?? item?._cachedStats?.capacity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function targetStackIsFull(item) {
    const capacity = stackCapacity(item);
    return capacity > 0 && stackAmount(item) >= capacity;
  }


  async function mergeBagIntoDepo(sourceId, targetId) {
    if (busy) return console.warn(`${PREFIX} Inna operacja jest jeszcze wykonywana.`), false;
    const src = readBagItems().find(v => String(v.id) === String(sourceId));
    const dst = readDepoItems().find(v => String(v.id) === String(targetId));
    if (!src || !dst) return console.error(`${PREFIX} Nie znaleziono stosu w torbie lub depozycie.`), false;
    if (!sameStackTemplate(src.item, dst.item)) return console.warn(`${PREFIX} To nie są zgodne stosy.`), false;
    if (targetStackIsFull(dst.item)) {
      console.info(`${PREFIX} Stos docelowy jest już pełny (${stackAmount(dst.item)}/${stackCapacity(dst.item)}). Operacja anulowana.`);
      return false;
    }

    busy = true;
    const dstPos = {x: dst.x, y: dst.y};
    const srcStart = {x: src.x, y: src.y};
    console.group(`${PREFIX} TORBA → STOS W DEPO: ${src.name}`);
    try {
      // Stos docelowy chwilowo wyjmujemy do torby.
      await request(`depo&get=${dst.id}`);
      const dstBag = await waitFor(() => readBagItems().find(v => String(v.id) === String(dst.id)));
      if (!dstBag) throw new Error("Nie udało się wyjąć docelowego stosu z depozytu.");

      const srcBag = readBagItems().find(v => String(v.id) === String(src.id));
      if (!srcBag) throw new Error("Stos źródłowy zniknął z torby.");

      const srcAmount = Number(srcBag.amount);
      const dstAmount = Number(dstBag.amount);

      // Natywne łączenie w torbie: źródło kładziemy na slot stosu wyjętego z depo.
      await request(`moveitem&st=0&id=${src.id}&x=${dstBag.x}&y=${dstBag.y}`);
      await sleep(250);
      await waitFor(() => {
        const bag = readBagItems();
        const a = bag.find(v => String(v.id) === String(src.id));
        const b = bag.find(v => String(v.id) === String(dst.id));
        return !a || !b || Number(a.amount) !== srcAmount || Number(b.amount) !== dstAmount;
      }, 4000, 100);

      const bagNow = readBagItems();
      const srcAfter = bagNow.find(v => String(v.id) === String(src.id));
      const dstAfter = bagNow.find(v => String(v.id) === String(dst.id));

      if (srcAfter && dstAfter &&
          Number(srcAfter.amount) === srcAmount && Number(dstAfter.amount) === dstAmount)
        throw new Error("Natywne moveitem nie scaliło tych stosów.");

      // Docelowy/ocalały stos wraca dokładnie na poprzednie miejsce w depozycie.
      const result = dstAfter || srcAfter;
      if (!result) throw new Error("Po scalaniu nie znaleziono wynikowego stosu w torbie.");
      await request(`depo&put=${result.id}&x=${dstPos.x}&y=${dstPos.y}`);
      const returned = await waitFor(() => readDepoItems().some(v => String(v.id) === String(result.id)), 5000);
      if (!returned) throw new Error("Wynikowy stos nie wrócił do depozytu.");

      // Jeżeli capacity zostało osiągnięte, reszta źródłowego stosu ma zostać w torbie.
      // Niczego z nią nie robimy — to odpowiada gestowi „torba → depozyt”.
      console.info(`${PREFIX} Gotowe. Wynik wrócił na slot ${dstPos.x},${dstPos.y}.`);
      return true;
    } catch (e) {
      console.error(`${PREFIX} Operacja przerwana:`, e);
      console.warn(`${PREFIX} Jeśli docelowy stos został w torbie, włóż go ręcznie do depozytu.`);
      return false;
    } finally {
      busy = false;
      console.groupEnd();
    }
  }

  // Native depozyt ma własny pointerDroppable na całej siatce. Zagnieżdżony
  // droppable na ikonie przedmiotu nie dostawał zdarzenia drop, dlatego v0.4.1
  // rozpoznaje gest na poziomie dokumentu, zanim siatka depozytu go przejmie.
  let mergeDrag = null;

  function depoItemFromElement(el) {
    if (!window.jQuery || !el) return null;
    const itemEl = el.closest?.(".depo-window .item, .depo .item, .window-depo .item");
    if (!itemEl) return null;
    try { return window.jQuery(itemEl).data("item") || null; } catch { return null; }
  }

  function bagItemFromElement(el) {
    if (!window.jQuery || !el) return null;
    const itemEl = el.closest?.(".inventory-item, .inventory-grid .item, .equipment-window .item");
    if (!itemEl) return null;
    try { return window.jQuery(itemEl).data("item") || null; } catch { return null; }
  }

  function onMergePointerDown(event) {
    if (event.button !== 0) return;
    const depoItem = depoItemFromElement(event.target);
    if (isPrivateDepoItem(depoItem) && isStackItem(depoItem)) {
      mergeDrag = { item: depoItem, origin: "depo", x: event.clientX, y: event.clientY };
      return;
    }
    const bagItem = bagItemFromElement(event.target);
    if (isBagStackItem(bagItem)) {
      mergeDrag = { item: bagItem, origin: "bag", x: event.clientX, y: event.clientY };
    }
  }

  function onMergePointerUp(event) {
    const drag = mergeDrag;
    mergeDrag = null;
    if (!drag || event.button !== 0) return;
    const moved = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
    if (moved < 8) return;

    // elementFromPoint jest pewniejsze niż event.target przy helperze drag&drop.
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const target = depoItemFromElement(under);
    if (!target || !isPrivateDepoItem(target)) return;

    if (drag.origin === "depo") {
      if (!sameStackKind(drag.item, target)) return;
      // Zawsze przejmujemy drop na zgodny stos. Jeśli cel jest pełny, nic nie wysyłamy
      // do gry — zapobiega to zamianie slotów albo wyjęciu obu stosów do torby.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (targetStackIsFull(target)) {
        console.info(`${PREFIX} Stos docelowy jest pełny (${stackAmount(target)}/${stackCapacity(target)}).`);
        return;
      }
      mergeViaBag(drag.item.id, target.id);
      return;
    }

    // Stos z torby upuszczony bezpośrednio na zgodny stos w depozycie.
    if (drag.origin === "bag" && sameStackTemplate(drag.item, target)) {
      // Również dla pełnego stosu blokujemy natywny depo&put.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (targetStackIsFull(target)) {
        console.info(`${PREFIX} Stos docelowy jest pełny (${stackAmount(target)}/${stackCapacity(target)}).`);
        return;
      }
      mergeBagIntoDepo(drag.item.id, target.id);
    }
  }

  function installMergeGesture() {
    if (document.documentElement.dataset.teriashDepoPlusMergeGesture === "1") return;
    document.documentElement.dataset.teriashDepoPlusMergeGesture = "1";
    document.addEventListener("mousedown", onMergePointerDown, true);
    document.addEventListener("mouseup", onMergePointerUp, true);
  }

  function askSplit(item) {
    const total = Number(item.getAmountStat?.());
    if (!Number.isFinite(total) || total <= 1 || String(item.getCansplitStat?.()) === "0") {
      window.mAlert ? window.mAlert("Tego przedmiotu nie można podzielić.") : console.warn(`${PREFIX} Tego przedmiotu nie można podzielić.`);
      return;
    }
    splitViaBag(item.id);
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
      } catch {}
    });
  }

  function start(){
    installMergeGesture(); installMarker(); observer=new MutationObserver(installMarker); observer.observe(document.documentElement,{childList:true,subtree:true});
    console.info(`${PREFIX} v${VERSION} uruchomiony. „Podziel” działa z PPM. Scalanie działa depo→depo oraz torba→stos w depozycie. Pełny stos docelowy jest blokowany bez wykonywania ruchu. „Podziel” używa natywnego okna Margonem.`);
  }
  function destroy(){observer?.disconnect();observer=null; document.removeEventListener("mousedown",onMergePointerDown,true);document.removeEventListener("mouseup",onMergePointerUp,true);delete document.documentElement.dataset.teriashDepoPlusMergeGesture;}

  window.TeriashDepoPlus={version:VERSION,snapshot:printSnapshot,splitViaBag,mergeViaBag,mergeBagIntoDepo,items:()=>lastSnapshot.length?lastSnapshot:readDepoItems(),destroy};
  start();
})();
