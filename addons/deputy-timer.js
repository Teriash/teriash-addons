const unsafeWindow = window;
(() => {
    'use strict';

    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const CONFIG = {
        badgeText: 'Z',
        badgeTitle: 'Zastępca',
        addBorder: false,
        debug: false
    };

    const log = (...args) => {
        if (CONFIG.debug) {
            console.log('[EliteTimer Z]', ...args);
        }
    };

    const isDeputy = () => {
        try {
            const guest = W.Engine?.hero?.d?.guest;
            return guest !== undefined &&
                   guest !== null &&
                   guest !== '' &&
                   Number.parseInt(guest, 10) > 0;
        } catch (_) {
            return false;
        }
    };

    const getTimerStorageKey = () => {
        return W.Engine?.windowsData?.name?.addon_17 || 'addon_17';
    };

    const getWorld = () => {
        try {
            return W.Engine?.worldConfig?.getWorldName?.() || '';
        } catch (_) {
            return '';
        }
    };

    const entryKey = (entry) => {
        if (!entry || entry.user || entry.type === 'hero') return null;
        return `${entry.id}|${entry.heroData?.world || getWorld()}`;
    };

    const clonePlain = (value) => {
        if (value === undefined || value === null) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return value;
        }
    };

    function installStyles() {
        if (document.getElementById('elite-timer-deputy-style')) return;

        const style = document.createElement('style');
        style.id = 'elite-timer-deputy-style';
        style.textContent = `
            .elite-timer .deputy-timer-row {
                box-shadow: inset 3px 0 0 #d7b24a !important;
            }

            .elite-timer .deputy-timer-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
                min-width: 16px;
                height: 16px;
                margin-right: 4px;
                padding: 0 3px;
                border: 1px solid #d7b24a;
                border-radius: 3px;
                color: #f2d675;
                background: rgba(0, 0, 0, .35);
                font-size: 10px;
                font-weight: 700;
                line-height: 14px;
                vertical-align: middle;
                cursor: help;
            }
        `;
        document.head.appendChild(style);
    }

    
    function hookServerStorage() {
        const storage = W.Engine?.serverStorage;
        if (!storage?.sendData || storage.sendData.__eliteTimerDeputyHook) {
            return false;
        }

        const originalSendData = storage.sendData;

        function wrappedSendData(payload, ...rest) {
            try {
                const timerKey = getTimerStorageKey();
                const timerPayload = payload?.[timerKey];

                if (timerPayload && Array.isArray(timerPayload.data)) {
                    const oldTimer = storage.get?.(timerKey) || {};
                    const oldData = Array.isArray(oldTimer.data) ? oldTimer.data : [];

                    const oldByKey = new Map();

                    for (const oldEntry of oldData) {
                        const key = entryKey(oldEntry);
                        if (key) oldByKey.set(key, oldEntry);
                    }

                    const deputyNow = isDeputy();

                    for (const entry of timerPayload.data) {
                        const key = entryKey(entry);
                        if (!key) continue;

                        const oldEntry = oldByKey.get(key);

                        const isNewOrUpdated =
                            !oldEntry ||
                            Number(oldEntry.presp) !== Number(entry.presp) ||
                            Number(oldEntry.minResp) !== Number(entry.minResp);

                        if (isNewOrUpdated) {
                            entry.deputy = deputyNow ? 1 : 0;
                            log(
                                deputyNow ? 'Timer oznaczony jako zastępca:' : 'Timer oznaczony jako właściciel:',
                                entry.name,
                                entry.id
                            );
                        } else if (oldEntry && oldEntry.deputy !== undefined) {
                            entry.deputy = oldEntry.deputy ? 1 : 0;
                        }
                    }
                }
            } catch (err) {
                console.error('[EliteTimer Z] Błąd podczas oznaczania danych minutnika:', err);
            }

            return originalSendData.call(this, payload, ...rest);
        }

        wrappedSendData.__eliteTimerDeputyHook = true;
        wrappedSendData.__original = originalSendData;
        storage.sendData = wrappedSendData;

        log('Podpięto Engine.serverStorage.sendData');
        return true;
    }

    function getStoredDeputyMap() {
        const result = new Map();

        try {
            const storage = W.Engine?.serverStorage;
            const timerKey = getTimerStorageKey();
            const timer = storage?.get?.(timerKey) || {};
            const data = Array.isArray(timer.data) ? timer.data : [];

            for (const entry of data) {
                const key = entryKey(entry);
                if (!key) continue;
                result.set(key, !!Number(entry.deputy));
            }
        } catch (err) {
            log('Nie udało się odczytać minutnika:', err);
        }

        return result;
    }

    function getRowTimerObject(row) {
        try {
            if (W.jQuery) {
                return W.jQuery(row).data('obj') || null;
            }
        } catch (_) {}

        return null;
    }

    function setRowState(row, deputy) {
        const nameCell = row.querySelector('.name-val');
        if (!nameCell) return;

        let badge = nameCell.querySelector('.deputy-timer-badge');

        if (deputy) {
            row.classList.add('deputy-timer-row');

            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'deputy-timer-badge';
                badge.textContent = CONFIG.badgeText;
                badge.title = CONFIG.badgeTitle;
                badge.setAttribute('data-tip', CONFIG.badgeTitle);

                nameCell.prepend(badge);
            }

            if (!CONFIG.addBorder) {
                row.classList.remove('deputy-timer-row');
            }
        } else {
            row.classList.remove('deputy-timer-row');
            badge?.remove();
        }
    }

    function decorateTimer() {
        const timerWindow = document.querySelector('.elite-timer');
        if (!timerWindow) return;

        const deputyMap = getStoredDeputyMap();
        const world = getWorld();

        timerWindow.querySelectorAll('.npc-list .row').forEach((row) => {
            const obj = getRowTimerObject(row);

            if (!obj || obj.user || obj.type === 'hero' || obj.id === undefined) {
                setRowState(row, false);
                return;
            }

            const key = `${obj.id}|${obj.heroData?.world || world}`;
            setRowState(row, deputyMap.get(key) === true);
        });
    }

    function startDecorator() {
        installStyles();

        let scheduled = false;

        const scheduleDecorate = () => {
            if (scheduled) return;
            scheduled = true;

            requestAnimationFrame(() => {
                scheduled = false;
                decorateTimer();
            });
        };

        const observer = new MutationObserver(scheduleDecorate);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });

        setInterval(decorateTimer, 1000);

        scheduleDecorate();
    }

    function boot() {
        const startedAt = Date.now();

        const interval = setInterval(() => {
            if (!W.Engine?.serverStorage || !W.Engine?.hero?.d) {
                if (Date.now() - startedAt > 60000) {
                    clearInterval(interval);
                    console.warn('[EliteTimer Z] Nie znaleziono Engine/serverStorage.');
                }
                return;
            }

            if (!hookServerStorage()) return;

            clearInterval(interval);
            startDecorator();

            console.log(
                `[EliteTimer Z] Uruchomiono. Tryb: ${isDeputy() ? 'ZASTĘPCA' : 'WŁAŚCICIEL'}`
            );
        }, 250);
    }

    boot();
})();
