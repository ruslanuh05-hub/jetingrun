// roulette.js — новая круговая рулетка с выбором ставки
(function () {
    'use strict';

    var MIN_BET_RUB = 50;
    var MAX_BET_RUB = 10000;

    // Конфигурация сегментов: чем больше count, тем выше шанс
    var SEGMENTS_CONFIG = [
        { color: 'gray', multiplier: 0.2, count: 22 },   // серые — чаще всего
        { color: 'yellow', multiplier: 0.7, count: 10 }, // жёлтые — реже
        { color: 'red', multiplier: 2.4, count: 6 },     // красные — ещё реже
        { color: 'green', multiplier: 10, count: 2 }     // зелёные — почти джекпот
    ];

    var segments = [];
    var isSpinning = false;
    var currentBet = MIN_BET_RUB;
    var currentRotation = 0;

    function buildSegments() {
        segments = [];
        SEGMENTS_CONFIG.forEach(function (cfg) {
            for (var i = 0; i < cfg.count; i++) {
                segments.push({
                    color: cfg.color,
                    multiplier: cfg.multiplier
                });
            }
        });

        // Перемешиваем порядок сегментов, чтобы цвета шли по кругу в рандомном порядке
        for (var i = segments.length - 1; i > 0; i--) {
            var j = getRandomInt(i + 1);
            var tmp = segments[i];
            segments[i] = segments[j];
            segments[j] = tmp;
        }
    }

    function getRandomInt(max) {
        if (!max || max <= 0) return 0;
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            try {
                var arr = new Uint32Array(1);
                crypto.getRandomValues(arr);
                return arr[0] % max;
            } catch (e) {}
        }
        return Math.floor(Math.random() * max);
    }

    function getApiBase() {
        return (window.getJetApiBase && window.getJetApiBase()) ||
            window.JET_API_BASE ||
            localStorage.getItem('jet_api_base') ||
            '';
    }

    function getBalanceRub() {
        try {
            var key = 'jetstore_balance_fixed';
            var d = JSON.parse(localStorage.getItem(key) || '{}');
            return parseFloat(d.RUB) || 0;
        } catch (e) { return 0; }
    }

    function setBalanceRub(val) {
        try {
            var key = 'jetstore_balance_fixed';
            var d = JSON.parse(localStorage.getItem(key) || '{}');
            d.RUB = val;
            d.lastUpdate = Date.now();
            localStorage.setItem(key, JSON.stringify(d));
            if (window.Database && typeof window.Database.saveBalanceFixed === 'function') {
                window.Database.saveBalanceFixed('RUB', val);
            }
        } catch (e) {}
    }

    function syncBalanceFromApi(cb) {
        var apiBase = getApiBase();
        var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)
            ? window.Telegram.WebApp.initData
            : '';
        if (!apiBase || !initData) {
            if (cb) cb();
            return;
        }
        fetch(apiBase.replace(/\/$/, '') + '/api/balance', {
            method: 'GET',
            headers: { 'X-Telegram-Init-Data': initData }
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
            if (d && typeof d.balance_rub === 'number') {
                setBalanceRub(d.balance_rub);
            }
            if (cb) cb();
        }).catch(function () {
            if (cb) cb();
        });
    }

    function updateBalanceDisplay() {
        var el = document.getElementById('balanceValue');
        if (el) {
            el.textContent = getBalanceRub().toFixed(2) + ' ₽';
        }
    }

    function clampBet(v) {
        if (isNaN(v) || !isFinite(v)) v = 1;
        v = Math.max(0, Math.floor(Number(v)));
        if (v > MAX_BET_RUB) v = MAX_BET_RUB;
        return v;
    }

    function updateBetDisplay() {
        var betInput = document.getElementById('betInput');
        var betCenter = document.getElementById('rouletteBetDisplay');
        if (betInput) betInput.value = String(currentBet);
        if (betCenter) betCenter.textContent = currentBet.toFixed(0) + ' ₽';
    }

    function renderWheel() {
        var wheel = document.getElementById('rouletteWheel');
        if (!wheel) return;
        wheel.innerHTML = '';
        var total = segments.length || 1;

        // Радиус подставляем динамически, чтобы на разных телефонах сегменты шли ровно по кругу
        var rect = wheel.getBoundingClientRect();
        // Ещё ближе к внешней границе — кольцо наград выглядит крупнее
        var radius = Math.max(40, rect.width / 2 - 12);

        for (var i = 0; i < total; i++) {
            var segCfg = segments[i];
            var seg = document.createElement('div');
            seg.className = 'roulette-segment roulette-' + segCfg.color;
            var angle = (360 / total) * i;
            seg.style.transform = 'rotate(' + angle + 'deg)';
            seg.style.transformOrigin = 'center -' + radius + 'px';
            seg.dataset.multiplier = String(segCfg.multiplier);
            wheel.appendChild(seg);
        }
        // Сбрасываем поворот
        wheel.style.transition = 'none';
        wheel.style.transform = 'rotate(0deg)';
        currentRotation = 0;
    }

    function adjustBet(delta) {
        var betInput = document.getElementById('betInput');
        if (betInput) currentBet = parseInt(betInput.value, 10) || 0;
        currentBet = clampBet(currentBet + delta);
        if (currentBet < 1) currentBet = 1;
        updateBetDisplay();
    }

    function creditWin(amount, cb) {
        var maxWin = MAX_BET_RUB * 10;
        if (!amount || amount <= 0 || !isFinite(amount) || amount > maxWin) {
            if (cb) cb();
            return;
        }
        var apiBase = getApiBase();
        var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)
            ? window.Telegram.WebApp.initData
            : '';
        if (!apiBase || !initData) {
            var cur = getBalanceRub();
            setBalanceRub(cur + amount);
            if (cb) cb();
            return;
        }
        fetch(apiBase.replace(/\/$/, '') + '/api/balance/credit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({ reason: 'spin_win', currency: 'RUB', amount: amount })
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (d) {
            if (d && d.success && typeof d.balance_rub === 'number') {
                setBalanceRub(d.balance_rub);
            } else {
                var cur = getBalanceRub();
                setBalanceRub(cur + amount);
            }
            if (cb) cb();
        }).catch(function () {
            var cur = getBalanceRub();
            setBalanceRub(cur + amount);
            if (cb) cb();
        });
    }

    function startSpin() {
        if (isSpinning) return;

        var betInput = document.getElementById('betInput');
        if (betInput) currentBet = clampBet(parseInt(betInput.value, 10) || 0);
        syncBalanceFromApi(function () {
            doSpin();
        });
    }

    function doSpin() {
        var balance = getBalanceRub();
        if (currentBet < MIN_BET_RUB) {
            (window.jetShowAlert || alert)('Минимальная ставка: 50 ₽');
            return;
        }
        if (balance < currentBet) {
            (window.jetShowAlert || alert)('Недостаточно средств на балансе.');
            return;
        }

        isSpinning = true;

        var apiBase = getApiBase();
        var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)
            ? window.Telegram.WebApp.initData
            : '';

        function afterDeduct() {
            updateBalanceDisplay();
            runWheelAnimation();
        }

        if (apiBase && initData) {
            fetch(apiBase.replace(/\/$/, '') + '/api/balance/deduct', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Init-Data': initData
                },
                body: JSON.stringify({ type: 'spin', currency: 'RUB', amount: currentBet })
            }).then(function (r) {
                return r.json().then(function (d) {
                    return { ok: r.ok, status: r.status, data: d || {} };
                }).catch(function () { return { ok: false, status: r.status, data: {} }; });
            }).then(function (res) {
                if (res.ok && res.data && res.data.success) {
                    if (typeof res.data.balance_rub === 'number') setBalanceRub(res.data.balance_rub);
                    afterDeduct();
                    return;
                }
                if (res.status === 400 && res.data && res.data.error === 'insufficient_funds') {
                    (window.jetShowAlert || alert)('Недостаточно средств на балансе.');
                    isSpinning = false;
                    updateBalanceDisplay();
                    return;
                }
                // если бэк не ответил нормально — списываем локально
                setBalanceRub(Math.max(0, balance - currentBet));
                afterDeduct();
            }).catch(function () {
                setBalanceRub(Math.max(0, balance - currentBet));
                afterDeduct();
            });
        } else {
            // Нет API — работаем только с локальным балансом
            setBalanceRub(Math.max(0, balance - currentBet));
            afterDeduct();
        }
    }

    function runWheelAnimation() {
        var wheel = document.getElementById('rouletteWheel');
        var resultOverlay = document.getElementById('resultOverlay');
        var resultValueEl = document.getElementById('resultValue');
        var resultHintEl = document.getElementById('resultHint');
        var multDisplay = document.getElementById('rouletteMultiplierDisplay');

        if (!wheel || !segments.length) {
            isSpinning = false;
            return;
        }

        var total = segments.length;
        var winIndex = getRandomInt(total);
        var winSeg = segments[winIndex];

        // 3 секунды — колесо крутится по часовой стрелке (положительный rotate)
        // Сегмент 0 смотрит вниз (6ч), стрелка сверху (12ч) — смещение 180°
        var spins = 4;
        var anglePer = 360 / total;
        var targetAngle = 180 - winIndex * anglePer;
        var finalRotation = currentRotation + spins * 360 + targetAngle;
        currentRotation = finalRotation % 360;

        wheel.style.transition = 'none';
        wheel.style.transform = 'rotate(' + currentRotation + 'deg)';

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                wheel.style.transition = 'transform 3s cubic-bezier(0.23, 1, 0.32, 1)';
                wheel.style.transform = 'rotate(' + finalRotation + 'deg)';
            });
        });

        if (multDisplay) multDisplay.textContent = winSeg.multiplier.toFixed(1) + 'x';

        var winAmount = Math.round(currentBet * winSeg.multiplier);

        setTimeout(function () {
            if (resultValueEl) resultValueEl.textContent = winAmount.toFixed(2) + ' ₽';
            if (resultHintEl) {
                resultHintEl.textContent = 'Выпало ' + winSeg.multiplier.toFixed(1) + 'x. Выигрыш зачислен на баланс.';
            }
            if (resultOverlay) resultOverlay.classList.add('show');

            creditWin(winAmount, function () {
                isSpinning = false;
                updateBalanceDisplay();
            });
        }, 3100);
    }

    function init() {
        buildSegments();
        renderWheel();

        var betInput = document.getElementById('betInput');
        var minusBtn = document.getElementById('betMinusBtn');
        var plusBtn = document.getElementById('betPlusBtn');
        var spinBtn = document.getElementById('spinBtn');
        var closeResultBtn = document.getElementById('resultCloseBtn');

        if (betInput) {
            betInput.value = String(MIN_BET_RUB);
            betInput.addEventListener('input', function () {
                var val = parseInt(betInput.value, 10);
                if (isNaN(val)) val = 0;
                currentBet = clampBet(val);
                if (currentBet < 1) currentBet = 1;
                var bc = document.getElementById('rouletteBetDisplay');
                if (bc) bc.textContent = currentBet.toFixed(0) + ' ₽';
            });
            betInput.addEventListener('blur', function () {
                var val = parseInt(String(betInput.value || '').trim(), 10);
                if (isNaN(val)) val = 0;
                currentBet = clampBet(val);
                if (currentBet < 1) currentBet = 1;
                updateBetDisplay();
                if (val >= 1 && val <= 49) {
                    (window.jetShowAlert || alert)('Минимальная сумма ставки — 50 ₽');
                }
            });
        }
        if (minusBtn) minusBtn.addEventListener('click', function () { adjustBet(-10); });
        if (plusBtn) plusBtn.addEventListener('click', function () { adjustBet(10); });
        if (spinBtn) spinBtn.addEventListener('click', startSpin);
        if (closeResultBtn) {
            closeResultBtn.addEventListener('click', function () {
                var ov = document.getElementById('resultOverlay');
                if (ov) ov.classList.remove('show');
            });
        }

        updateBetDisplay();
        updateBalanceDisplay();
        syncBalanceFromApi(updateBalanceDisplay);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

