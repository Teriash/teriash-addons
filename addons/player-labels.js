(() => {
    'use strict';

    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const TILE = 32;
    const labels = new Map();

    const PROF = {
        w: 'w',
        m: 'm',
        t: 't',
        h: 'h',
        p: 'p',
        b: 'b'
    };

    function addStyles() {
        if (document.getElementById('mpl-styles')) return;

        const style = document.createElement('style');
        style.id = 'mpl-styles';
        style.textContent = `
            #mpl-layer {
                position: absolute;
                inset: 0;
                pointer-events: none;
                overflow: hidden;
            }

            .mpl-label {
                position: absolute;
                transform: translate(-50%, -100%);
                text-align: center;
                white-space: nowrap;
                pointer-events: none;
                font-family: Arial, sans-serif;
                font-size: 11px;
                line-height: 13px;
                color: #fff;
                text-shadow:
                    -1px -1px 0 #000,
                     1px -1px 0 #000,
                    -1px  1px 0 #000,
                     1px  1px 0 #000,
                     0 0 3px #000;
                will-change: left, top;
            }

            .mpl-nick {
                font-weight: 700;
            }

            .mpl-details {
                font-size: 10px;
            }

            .mpl-clan {
                color: #ddd;
            }
        `;
        document.head.appendChild(style);
    }

    function getLayer() {
        let layer = document.getElementById('mpl-layer');
        const interfaceLayer = document.querySelector('.interface-layer');
        const gameLayer = interfaceLayer?.querySelector(':scope > .game-layer');

        if (!interfaceLayer || !gameLayer) return null;

        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'mpl-layer';
        }

        if (layer.parentElement !== interfaceLayer || layer.previousElementSibling !== gameLayer) {
            gameLayer.insertAdjacentElement('afterend', layer);
        }

        return layer;
    }

    function getGameRect() {
        let expected = null;

        try {
            expected = W.Engine?.getCanvasViewSize?.();
        } catch (_) {}

        const canvases = [...document.querySelectorAll('canvas')]
            .map(canvas => ({
                canvas,
                rect: canvas.getBoundingClientRect()
            }))
            .filter(({ rect }) =>
                rect.width >= 300 &&
                rect.height >= 250 &&
                rect.right > 0 &&
                rect.bottom > 0 &&
                rect.left < innerWidth &&
                rect.top < innerHeight
            );

        let best = null;
        let score = Infinity;

        for (const entry of canvases) {
            const r = entry.rect;
            let s = 0;

            if (expected?.width && expected?.height) {
                s += Math.abs(r.width - expected.width);
                s += Math.abs(r.height - expected.height);
            } else {
                s -= r.width * r.height / 10000;
            }

            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            s += Math.abs(cx - innerWidth / 2) * 0.08;
            s += Math.abs(cy - innerHeight / 2) * 0.08;

            if (s < score) {
                score = s;
                best = r;
            }
        }

        if (best) return best;

        const positioner = document.querySelector('.game-window-positioner');
        return positioner?.getBoundingClientRect() || null;
    }

    function getOthers() {
        try {
            return W.Engine?.others?.check?.() || {};
        } catch (_) {
            return {};
        }
    }

    function getProfession(other) {
        const prof = other?.getProf?.() ?? other?.d?.prof ?? '';
        return PROF[prof] || prof || '?';
    }

    function getClan(other) {
        const clan = other?.d?.clan;
        if (!clan) return '';

        if (typeof clan === 'string') return clan;
        return clan.name || '';
    }

    function createLabel(id) {
        const el = document.createElement('div');
        el.className = 'mpl-label';
        el.dataset.playerId = id;
        el.innerHTML = `
            <div class="mpl-first-line">
                <span class="mpl-nick"></span>
                <span class="mpl-level-prof"></span>
            </div>
            <div class="mpl-clan"></div>
        `;
        getLayer().appendChild(el);
        labels.set(String(id), el);
        return el;
    }

    function updateContent(el, other) {
        const nick = other?.getNick?.() ?? other?.d?.nick ?? '';
        const lvl = other?.getLevel?.() ?? other?.d?.lvl ?? '';
        const prof = getProfession(other);
        const clan = getClan(other);

        el.querySelector('.mpl-nick').textContent = nick;
        el.querySelector('.mpl-level-prof').textContent =
            lvl !== '' ? ` [${lvl}${prof}]` : '';

        const clanEl = el.querySelector('.mpl-clan');
        clanEl.textContent = clan;
    }

    function updatePosition(el, other, gameRect) {
        const rx = Number(other?.getRX?.() ?? other?.rx ?? other?.d?.x);
        const ry = Number(other?.getRY?.() ?? other?.ry ?? other?.d?.y);

        if (!Number.isFinite(rx) || !Number.isFinite(ry)) {
            el.style.display = 'none';
            return;
        }

        const offset = W.Engine?.map?.offset || [0, 0];
        const shift = W.Engine?.mapShift?.getShift?.() || [0, 0];
        const fw = Number(other?.fw) || TILE;
        const fh = Number(other?.fh) || 48;

        const scaleX = gameRect.width / (W.Engine?.getCanvasViewSize?.()?.width || gameRect.width);
        const scaleY = gameRect.height / (W.Engine?.getCanvasViewSize?.()?.height || gameRect.height);

        const x = gameRect.left +
            (rx * TILE + TILE / 2 - Number(offset[0] || 0) - Number(shift[0] || 0)) * scaleX;

        const spriteTop = gameRect.top +
            (ry * TILE - fh + TILE - Number(offset[1] || 0) - Number(shift[1] || 0)) * scaleY;

        const y = spriteTop - 4;

        if (
            x < gameRect.left - 100 ||
            x > gameRect.right + 100 ||
            y < gameRect.top - 100 ||
            y > gameRect.bottom + 100
        ) {
            el.style.display = 'none';
            return;
        }

        const layer = getLayer();
        const parentRect = layer?.parentElement?.getBoundingClientRect();

        el.style.display = '';
        el.style.left = `${Math.round(x - (parentRect?.left || 0))}px`;
        el.style.top = `${Math.round(y - (parentRect?.top || 0))}px`;
    }

    function frame() {
        try {
            const engine = W.Engine;
            const gameRect = engine?.map ? getGameRect() : null;

            if (gameRect) {
                const layer = getLayer();
                if (!layer) {
                    requestAnimationFrame(frame);
                    return;
                }

                const interfaceRect = layer.parentElement.getBoundingClientRect();
                const top = Math.max(0, gameRect.top - interfaceRect.top);
                const left = Math.max(0, gameRect.left - interfaceRect.left);
                const right = Math.max(0, interfaceRect.right - gameRect.right);
                const bottom = Math.max(0, interfaceRect.bottom - gameRect.bottom);

                layer.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;

                const others = getOthers();
                const active = new Set();

                for (const [id, other] of Object.entries(others)) {
                    if (!other?.d || other.d.del) continue;

                    active.add(String(id));

                    const el = labels.get(String(id)) || createLabel(id);
                    updateContent(el, other);
                    updatePosition(el, other, gameRect);
                }

                for (const [id, el] of labels) {
                    if (!active.has(id)) {
                        el.remove();
                        labels.delete(id);
                    }
                }
            }
        } catch (err) {
            console.error('[Margonem Player Labels]', err);
        }

        requestAnimationFrame(frame);
    }

    function boot() {
        addStyles();
        getLayer();
        requestAnimationFrame(frame);
        console.log('[Margonem Player Labels] Uruchomiono.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
