(() => {
  "use strict";

  if (window.TeriashDepoPlus) return;

  const VERSION = "0.2.0";
  const PREFIX = "[Teriash Depozyt+]";
  let observer = null;
  let lastSnapshot = [];

  const isPrivateDepoItem = item => {
    try {
      const loc = window.Engine?.itemsFetchData?.NEW_PRIVATE_DEPO_ITEM?.loc;
      return !!item && item.loc === loc;
    } catch { return false; }
  };

  function readDepoItems() {
    const out = [];
    const seen = new Set();
    document.querySelectorAll(".depo-window .item, .depo .item, .window-depo .item").forEach(el => {
      try {
        const item = window.jQuery ? window.jQuery(el).data("item") : null;
        if (!isPrivateDepoItem(item) || seen.has(String(item.id))) return;
        seen.add(String(item.id));
        out.push({
          id: item.id,
          name: item.name,
          x: Number(item.x),
          y: Number(item.y),
          loc: item.loc,
          amount: item.getAmountStat?.() ?? null,
          cansplit: item.getCansplitStat?.() ?? null,
          capacity: item.getCapacityStat?.() ?? null,
          item
        });
      } catch {}
    });
    lastSnapshot = out;
    return out;
  }

  function printSnapshot() {
    const items = readDepoItems();
    console.group(`${PREFIX} prywatny depozyt (${items.length} przedmiotów)`);
    console.table(items.map(({ item, ...x }) => x));
    console.info("Na tym etapie dodatek niczego nie przenosi i nie wysyła eksperymentalnych requestów.");
    console.groupEnd();
    return items;
  }

  function installMarker() {
    document.querySelectorAll(".depo-window, .depo, .window-depo").forEach(root => {
      if (root.dataset.teriashDepoPlus === "1") return;
      root.dataset.teriashDepoPlus = "1";
      root.addEventListener("contextmenu", e => {
        const el = e.target.closest?.(".item");
        if (!el || !e.altKey || !window.jQuery) return;
        const item = window.jQuery(el).data("item");
        if (!isPrivateDepoItem(item)) return;
        console.info(`${PREFIX} przedmiot`, {
          id: item.id, name: item.name, x: item.x, y: item.y, loc: item.loc,
          amount: item.getAmountStat?.(), cansplit: item.getCansplitStat?.(), capacity: item.getCapacityStat?.(), item
        });
      }, true);
    });
  }


  function splitTest(id, x, y, amount = 1) {
    const item = readDepoItems().find(v => String(v.id) === String(id));
    if (!item) {
      console.error(`${PREFIX} Nie znaleziono przedmiotu ${id} w aktualnie otwartym prywatnym depozycie.`);
      return false;
    }

    const max = Number(item.amount);
    amount = Number(amount);
    x = Number(x);
    y = Number(y);
    if (!Number.isInteger(amount) || amount < 1 || (Number.isFinite(max) && amount >= max)) {
      console.error(`${PREFIX} Nieprawidłowa liczba do podziału. Stos ma ${item.amount} szt.`);
      return false;
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
      console.error(`${PREFIX} Nieprawidłowy slot docelowy x/y.`);
      return false;
    }
    if (String(item.cansplit) === "0") {
      console.error(`${PREFIX} Ten przedmiot ma cansplit=0.`);
      return false;
    }
    if (readDepoItems().some(v => String(v.id) !== String(item.id) && Number(v.x) === x && Number(v.y) === y)) {
      console.error(`${PREFIX} Slot x=${x}, y=${y} jest zajęty. Do pierwszego testu wybierz pusty slot.`);
      return false;
    }
    if (typeof window._g !== "function") {
      console.error(`${PREFIX} Brak funkcji _g.`);
      return false;
    }

    const request = `depo&move=${item.id}&x=${x}&y=${y}&split=${amount}`;
    console.group(`${PREFIX} TEST PODZIAŁU`);
    console.info("Przedmiot:", { id: item.id, name: item.name, amount: item.amount, from: {x:item.x,y:item.y}, to:{x,y}, split:amount });
    console.info("Request:", request);
    console.warn("Wysyłam dokładnie jeden eksperymentalny request. Przedmiot pozostaje w depozycie, jeśli serwer obsługuje tę operację.");
    console.groupEnd();

    window._g(request, response => {
      console.group(`${PREFIX} ODPOWIEDŹ TESTU PODZIAŁU`);
      console.log(response);
      console.info("Po odpowiedzi wykonaj TeriashDepoPlus.snapshot(), aby sprawdzić stan depozytu.");
      console.groupEnd();
    });
    return true;
  }

  function start() {
    installMarker();
    observer = new MutationObserver(() => installMarker());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    console.info(`${PREFIX} v${VERSION} uruchomiony. snapshot() pokazuje przedmioty. Test: TeriashDepoPlus.splitTest(ID, X, Y, ILOSC).`);
  }

  function destroy() {
    observer?.disconnect();
    observer = null;
  }

  window.TeriashDepoPlus = {
    version: VERSION,
    snapshot: printSnapshot,
    splitTest,
    items: () => lastSnapshot.length ? lastSnapshot : readDepoItems(),
    destroy
  };

  start();
})();
