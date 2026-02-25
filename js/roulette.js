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
    var currentCurrency = 'RUB'; // 'RUB' | 'USDT'

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

    function getBalanceUsdt() {
        try {
            var key = 'jetstore_balance_fixed';
            var d = JSON.parse(localStorage.getItem(key) || '{}');
            return parseFloat(d.USDT) || 0;
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

    function setBalanceUsdt(val) {
        try {
            var key = 'jetstore_balance_fixed';
            var d = JSON.parse(localStorage.getItem(key) || '{}');
            d.USDT = val;
            d.lastUpdate = Date.now();
            localStorage.setItem(key, JSON.stringify(d));
            if (window.Database && typeof window.Database.saveBalanceFixed === 'function') {
                window.Database.saveBalanceFixed('USDT', val);
            }
        } catch (e) {}
    }

    function getCurrentBalance() {
        return currentCurrency === 'RUB' ? getBalanceRub() : getBalanceUsdt();
    }

    function setCurrentBalance(val) {
        if (currentCurrency === 'RUB') setBalanceRub(val); else setBalanceUsdt(val);
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
            if (d && (typeof d.balance_rub === 'number' || typeof d.balance_usdt === 'number')) {
                try {
                    var key = 'jetstore_balance_fixed';
                    var cur = JSON.parse(localStorage.getItem(key) || '{}');
                    if (typeof d.balance_rub === 'number') cur.RUB = d.balance_rub;
                    if (typeof d.balance_usdt === 'number') cur.USDT = d.balance_usdt;
                    cur.lastUpdate = Date.now();
                    localStorage.setItem(key, JSON.stringify(cur));
                } catch (e) {}
            }
            if (cb) cb();
        }).catch(function () {
            if (cb) cb();
        });
    }

    function updateBalanceDisplay() {
        var el = document.getElementById('balanceValue');
        if (el) {
            var bal = getCurrentBalance();
            if (currentCurrency === 'RUB') {
                el.textContent = bal.toFixed(2) + ' ₽';
            } else {
                el.textContent = bal.toFixed(2) + ' USDT';
            }
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
        if (betCenter) {
            var suffix = currentCurrency === 'RUB' ? ' ₽' : ' USDT';
            betCenter.textContent = currentBet.toFixed(0) + suffix;
        }
    }

    function renderWheel() {
        var wheel = document.getElementById('rouletteWheel');
        if (!wheel) return;
        wheel.innerHTML = '';
        var total = segments.length || 1;

        // Радиус подставляем динамически, чтобы на разных телефонах сегменты шли ровно по кругу
        var rect = wheel.getBoundingClientRect();
        // Чуть уменьшаем радиус, чтобы вокруг сегментов был запас фона
        var radius = Math.max(40, rect.width / 2 - 20);

        for (var i = 0; i < total; i++) {
            var segCfg = segments[i];
            var seg = document.createElement('div');
            seg.className = 'roulette-segment roulette-' + segCfg.color;
            // Базовый угол от 0°, сегмент 0 смотрит вниз (6 часов)
            var angle = (360 / total) * i;
            seg.style.transform = 'rotate(' + angle + 'deg)';
            seg.style.transformOrigin = 'center -' + radius + 'px';
            seg.dataset.multiplier = String(segCfg.multiplier);
            wheel.appendChild(seg);
        }
        // Сбрасываем поворот
        wheel.style.transition = 'none';
        // Жёстко фиксируем ось вращения ровно по центру колеса
        wheel.style.transformOrigin = '50% 50%';
        wheel.style.transform = 'rotate(0deg)';
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
        // Если нет API / Telegram-данных — работаем чисто локально
        if (!apiBase || !initData) {
            var cur = getCurrentBalance();
            setCurrentBalance(cur + amount);
            if (cb) cb();
            return;
        }

        fetch(apiBase.replace(/\/$/, '') + '/api/balance/credit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData
            },
            body: JSON.stringify({ reason: 'spin_win', currency: currentCurrency, amount: amount })
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).then(function (d) {
            if (d && d.success) {
                if (currentCurrency === 'RUB' && typeof d.balance_rub === 'number') {
                    setBalanceRub(d.balance_rub);
                } else if (currentCurrency === 'USDT' && typeof d.balance_usdt === 'number') {
                    setBalanceUsdt(d.balance_usdt);
                } else {
                    var cur = getCurrentBalance();
                    setCurrentBalance(cur + amount);
                }
            } else {
                // Если бэк вернул ошибку / отказал, ничего локально не меняем,
                // чтобы не было "фантомного" баланса, который пропадает после обновления.
                (window.jetShowAlert || alert)('Не удалось зачислить выигрыш. Попробуйте позже.');
            }
            if (cb) cb();
        }).catch(function () {
            // Ошибка сети — тоже не трогаем локальный баланс при наличии API.
            (window.jetShowAlert || alert)('Ошибка сети при зачислении выигрыша. Попробуйте позже.');
            if (cb) cb();
        });
    }

    function startSpin() {
        if (isSpinning) return;

        var betInput = document.getElementById('betInput');
        if (betInput) {
            // форсим blur, чтобы сработала проверка минимальной ставки один раз
            betInput.blur();
            currentBet = clampBet(parseInt(betInput.value, 10) || 0);
        }
        // Баланс синхронизируем только периодически (при заходе на страницу),
        // чтобы не "откатывать" локально зачисленный выигрыш.
        doSpin();
    }

    function doSpin() {
        var balance = getCurrentBalance();
        // Если ставка меньше минимума — просто не крутим
        // (уведомление уже показал обработчик blur поля ввода)
        if (currentBet < MIN_BET_RUB) {
            return;
        }
        // Нормализуем до 2 знаков после запятой, чтобы из‑за плавающей
        // точки не было ситуации, когда на экране 50 ₽, а внутри 49.999...
        var normBalance = Math.round(balance * 100) / 100;
        var normBet = Math.round(currentBet * 100) / 100;
        if (normBalance + 1e-6 < normBet) {
            (window.jetShowAlert || alert)('Недостаточно средств на балансе.');
            return;
        }

        isSpinning = true;

        // Полностью локальное списание без API:
        // сразу уменьшаем баланс и запускаем анимацию спина.
        var newBal = Math.max(0, balance - currentBet);
        setCurrentBalance(newBal);
        updateBalanceDisplay();
        runWheelAnimation();
    }

    // opts (необязательно): { winIndex, winAmount, multiplier, alreadyCredited }
    function runWheelAnimation(opts) {
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
        var winIndex;
        if (opts && typeof opts.winIndex === 'number' && opts.winIndex >= 0 && opts.winIndex < total) {
            winIndex = opts.winIndex;
        } else {
            winIndex = getRandomInt(total);
        }
        var winSeg = segments[winIndex];

        // 3 секунды — колесо крутится по часовой стрелке (положительный rotate)
        // Сегмент 0 смотрит вниз (6ч), стрелка наверху (12ч) — смещение 180°
        var spins = 4;
        var anglePer = 360 / total;
        // Всегда считаем вращение от нуля, чтобы не накапливать ошибку
        var finalRotation = spins * 360 + (180 - winIndex * anglePer);

        wheel.style.transition = 'none';
        // Стартуем каждый спин из 0°
        wheel.style.transform = 'rotate(0deg)';

        // Пока крутится — множитель скрыт
        if (multDisplay) {
            multDisplay.classList.remove('revealed');
            multDisplay.textContent = 'x?';
        }

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                wheel.style.transition = 'transform 3s cubic-bezier(0.23, 1, 0.32, 1)';
                wheel.style.transform = 'rotate(' + finalRotation + 'deg)';
            });
        });

        var winAmount = (opts && typeof opts.winAmount === 'number')
            ? opts.winAmount
            : Math.round(currentBet * winSeg.multiplier);

        setTimeout(function () {
            var shownMultiplier = (opts && typeof opts.multiplier === 'number')
                ? opts.multiplier
                : winSeg.multiplier;
            if (multDisplay) {
                multDisplay.textContent = shownMultiplier.toFixed(1) + 'x';
                multDisplay.classList.add('revealed');
            }
            if (resultValueEl) {
                var suffix = currentCurrency === 'RUB' ? ' ₽' : ' USDT';
                resultValueEl.textContent = winAmount.toFixed(2) + suffix;
            }
            if (resultHintEl) {
                resultHintEl.textContent = 'Выпало ' + shownMultiplier.toFixed(1) + 'x. Выигрыш зачислен на баланс.';
            }
            if (resultOverlay) resultOverlay.classList.add('show');
            
            // Если выигрыш уже зачислен на сервере (режим безопасной рулетки),
            // локально баланс не трогаем, только обновляем отображение.
            if (opts && opts.alreadyCredited) {
                isSpinning = false;
                updateBalanceDisplay();
                return;
            }

            // Оффлайн‑режим / тесты: зачисляем выигрыш локально.
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
        var oneClickToggle = document.getElementById('oneClickSpinToggle');
        var currencyRubBtn = document.getElementById('currencyRubBtn');
        var currencyUsdtBtn = document.getElementById('currencyUsdtBtn');

        if (betInput) {
            betInput.value = String(MIN_BET_RUB);
            betInput.addEventListener('input', function () {
                var val = parseInt(betInput.value, 10);
                if (isNaN(val)) val = 0;
                currentBet = clampBet(val);
                if (currentBet < 1) currentBet = 1;
                updateBetDisplay();
            });
            betInput.addEventListener('blur', function () {
                var val = parseInt(String(betInput.value || '').trim(), 10);
                if (isNaN(val)) val = 0;
                currentBet = clampBet(val);
                if (currentBet < 1) currentBet = 1;
                updateBetDisplay();
                if (val >= 1 && val <= 49) {
                    var hintText = 'Минимальная сумма ставки — ' + MIN_BET_RUB + (currentCurrency === 'RUB' ? ' ₽' : ' USDT');
                    (window.jetShowAlert || alert)(hintText);
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
                if (oneClickToggle && oneClickToggle.checked) {
                    startSpin();
                }
            });
        }

        if (currencyRubBtn && currencyUsdtBtn) {
            currencyRubBtn.addEventListener('click', function () {
                if (currentCurrency === 'RUB') return;
                currentCurrency = 'RUB';
                currencyRubBtn.classList.add('active');
                currencyUsdtBtn.classList.remove('active');
                updateBetDisplay();
                updateBalanceDisplay();
            });
            currencyUsdtBtn.addEventListener('click', function () {
                if (currentCurrency === 'USDT') return;
                currentCurrency = 'USDT';
                currencyUsdtBtn.classList.add('active');
                currencyRubBtn.classList.remove('active');
                updateBetDisplay();
                updateBalanceDisplay();
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

