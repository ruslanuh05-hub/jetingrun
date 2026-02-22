/**
 * spin.js — логика рулетки JET Store
 * Дизайн по мотивам Crypto Bot, в тонах JET (голубой/бирюзовый)
 */

(function() {
    'use strict';

    const SPIN_PRICE_RUB = 100;
    const SPIN_PRICE_USDT = 1.5;
    const PRIZES_RUB = [5, 10, 25, 50, 75, 100, 150, 200, 300, 500];
    const PRIZES_USDT = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25];

    let currentCurrency = 'RUB';
    let spinsCount = 0;
    let isSpinning = false;

    function getStorageKey() {
        try {
            var tg = window.Telegram && window.Telegram.WebApp;
            var uid = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id)
                ? String(tg.initDataUnsafe.user.id) : (window.userData && window.userData.id ? String(window.userData.id) : 'guest');
            return 'jetstore_spins_' + uid;
        } catch (e) { return 'jetstore_spins_guest'; }
    }

    function loadSpins() {
        try {
            var v = parseInt(localStorage.getItem(getStorageKey()) || '0', 10);
            return isNaN(v) ? 0 : Math.max(0, v);
        } catch (e) { return 0; }
    }

    function saveSpins(n) {
        try {
            localStorage.setItem(getStorageKey(), String(Math.max(0, n)));
        } catch (e) {}
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
            var db = window.Database;
            if (db && typeof db.getBalanceFixed === 'function') {
                var usdt = db.getBalanceFixed('USDT');
                if (typeof usdt === 'number') return usdt;
            }
            var key = 'jetstore_balance_fixed';
            var d = JSON.parse(localStorage.getItem(key) || '{}');
            return parseFloat(d.USDT) || 0;
        } catch (e) { return 0; }
    }

    function shuffleArray(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
        return a;
    }

    function renderTickets() {
        var container = document.getElementById('spinTickets');
        if (!container) return;
        var prizes = currentCurrency === 'RUB' ? PRIZES_RUB : PRIZES_USDT;
        var shuffled = shuffleArray(prizes.slice());
        var currencyLabel = currentCurrency === 'RUB' ? 'Рублей' : 'Tether';
        var highThreshold = currentCurrency === 'RUB' ? 500 : 25;
        container.innerHTML = shuffled.map(function(v, i) {
            var highClass = v >= highThreshold ? ' prize-high' : '';
            return '<div class="spin-ticket' + highClass + '" data-index="' + i + '" data-value="' + v + '">' +
                '<div class="spin-ticket-icon"><i class="fas fa-gem"></i></div>' +
                '<div class="spin-ticket-content"><div class="spin-ticket-value">' + v + '</div><div class="spin-ticket-currency">' + currencyLabel + '</div></div>' +
                '</div>';
        }).join('');
    }

    function updateUI() {
        spinsCount = loadSpins();
        renderTickets();

        var countEl = document.getElementById('spinsCount');
        if (countEl) countEl.textContent = spinsCount;

        var currencyName = document.getElementById('currencyName');
        if (currencyName) currencyName.textContent = currentCurrency === 'RUB' ? 'Рублей' : 'USDT';

        var balanceEl = document.getElementById('balanceValue');
        if (balanceEl) balanceEl.textContent = (currentCurrency === 'RUB' ? getBalanceRub() : getBalanceUsdt()).toFixed(2) + (currentCurrency === 'RUB' ? ' ₽' : ' USDT');

        var buyBtn = document.getElementById('buySpinBtn');
        if (buyBtn) {
            buyBtn.textContent = currentCurrency === 'RUB' ? 'Крутить за ' + SPIN_PRICE_RUB + ' ₽' : 'Крутить за ' + SPIN_PRICE_USDT + ' USDT';
        }

        var spinBtn = document.getElementById('spinBtn');
        if (spinBtn) {
            spinBtn.textContent = 'Авто-спин';
            spinBtn.disabled = isSpinning || spinsCount <= 0;
        }
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

    function syncBalanceFromApi(cb) {
        var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp.initData : '';
        if (!apiBase || !initData) { if (cb) cb(); return; }
        fetch(apiBase.replace(/\/$/, '') + '/api/balance', {
            method: 'GET',
            headers: { 'X-Telegram-Init-Data': initData }
        }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
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
        }).catch(function() { if (cb) cb(); });
    }

    function buyWithRubles() {
        var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp.initData : '';
        if (apiBase && initData) {
            fetch(apiBase.replace(/\/$/, '') + '/api/balance/deduct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
                body: JSON.stringify({ type: 'spin', currency: 'RUB' })
            }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, status: r.status, data: d || {} }; }).catch(function() { return { ok: false, status: r.status, data: {} }; }); }).then(function(res) {
                if (res.ok && res.data && res.data.success) {
                    if (typeof res.data.balance_rub === 'number') setBalanceRub(res.data.balance_rub);
                    saveSpins(loadSpins() + 1);
                    updateUI();
                    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showPopup) {
                        window.Telegram.WebApp.showPopup({ title: 'Готово', message: 'Спин куплен за счёт баланса. Крутите!' });
                    } else { alert('Спин куплен за счёт баланса. Крутите!'); }
                    return;
                }
                if (res.status === 400 && (res.data && res.data.error === 'insufficient_funds')) {
                    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                        window.Telegram.WebApp.showAlert('Недостаточно средств на балансе. Пополните баланс или оплатите спин.');
                    } else { alert('Недостаточно средств на балансе.'); }
                    return;
                }
                redirectToPaySpin('RUB');
            }).catch(function() { redirectToPaySpin('RUB'); });
            return;
        }
        var balance = getBalanceRub();
        if (balance >= SPIN_PRICE_RUB) {
            setBalanceRub(balance - SPIN_PRICE_RUB);
            saveSpins(loadSpins() + 1);
            updateUI();
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showPopup) {
                window.Telegram.WebApp.showPopup({ title: 'Готово', message: 'Спин куплен за счёт баланса. Крутите!' });
            } else { alert('Спин куплен за счёт баланса. Крутите!'); }
            return;
        }
        if (!apiBase) {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                window.Telegram.WebApp.showAlert('API бота не настроен. Укажите URL в настройках.');
            } else { alert('API бота не настроен.'); }
            return;
        }
        redirectToPaySpin('RUB');
    }

    function redirectToPaySpin(currency) {
        var userId = (window.userData && window.userData.id) ? String(window.userData.id) : (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user && window.Telegram.WebApp.initDataUnsafe.user.id) ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : 'unknown';
        var purchase = currency === 'RUB'
            ? { type: 'spin', amount: SPIN_PRICE_RUB, amount_rub: SPIN_PRICE_RUB, productName: '1 спин рулетки', order_id: '#' + Date.now().toString(36).toUpperCase() }
            : { type: 'spin', amount: SPIN_PRICE_USDT, amount_usdt: SPIN_PRICE_USDT, productName: '1 спин рулетки' };
        sessionStorage.setItem('spin_pay_data', JSON.stringify({ currency: currency, userId: userId, purchase: purchase }));
        sessionStorage.setItem('spin_return_url', window.location.href);
        var path = (window.location.pathname || '').replace(/spin\.html.*$/, 'index.html');
        if (!path || path === (window.location.pathname || '')) path = 'index.html';
        var payUrl = window.location.origin + (path.startsWith('/') ? path : '/' + path) + '?pay=spin&currency=' + currency;
        window.location.href = payUrl;
    }

    function buyWithUsdt() {
        var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp.initData : '';
        if (apiBase && initData) {
            fetch(apiBase.replace(/\/$/, '') + '/api/balance/deduct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
                body: JSON.stringify({ type: 'spin', currency: 'USDT' })
            }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, status: r.status, data: d || {} }; }).catch(function() { return { ok: false, status: r.status, data: {} }; }); }).then(function(res) {
                if (res.ok && res.data && res.data.success) {
                    if (typeof res.data.balance_usdt === 'number') setBalanceUsdt(res.data.balance_usdt);
                    saveSpins(loadSpins() + 1);
                    updateUI();
                    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showPopup) {
                        window.Telegram.WebApp.showPopup({ title: 'Готово', message: 'Спин куплен за счёт баланса. Крутите!' });
                    } else { alert('Спин куплен за счёт баланса. Крутите!'); }
                    return;
                }
                if (res.status === 400 && (res.data && res.data.error === 'insufficient_funds')) {
                    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                        window.Telegram.WebApp.showAlert('Недостаточно средств на балансе. Пополните баланс или оплатите спин.');
                    } else { alert('Недостаточно средств на балансе.'); }
                    return;
                }
                redirectToPaySpin('USDT');
            }).catch(function() { redirectToPaySpin('USDT'); });
            return;
        }
        var balance = getBalanceUsdt();
        if (balance >= SPIN_PRICE_USDT) {
            setBalanceUsdt(balance - SPIN_PRICE_USDT);
            saveSpins(loadSpins() + 1);
            updateUI();
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showPopup) {
                window.Telegram.WebApp.showPopup({ title: 'Готово', message: 'Спин куплен за счёт баланса. Крутите!' });
            } else { alert('Спин куплен за счёт баланса. Крутите!'); }
            return;
        }
        if (!apiBase) {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                window.Telegram.WebApp.showAlert('API бота не настроен.');
            } else { alert('API бота не настроен.'); }
            return;
        }
        redirectToPaySpin('USDT');
    }

    function easeOutExpo(t) {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function animateDrumScroll(container, targetScroll, durationMs, onComplete) {
        var startScroll = container.scrollTop;
        var startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        function step() {
            var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            var elapsed = now - startTime;
            var progress = Math.min(elapsed / durationMs, 1);
            var eased = easeOutExpo(progress);
            container.scrollTop = startScroll + (targetScroll - startScroll) * eased;
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                if (onComplete) onComplete();
            }
        }
        requestAnimationFrame(step);
    }

    function getCenterTicket(container, tickets) {
        if (!container || !tickets || tickets.length === 0) return null;
        var containerRect = container.getBoundingClientRect();
        var containerCenterY = containerRect.top + (containerRect.height / 2);
        var closestTicket = null;
        var closestDistance = Infinity;
        for (var i = 0; i < tickets.length; i++) {
            var ticket = tickets[i];
            var ticketRect = ticket.getBoundingClientRect();
            var ticketCenterY = ticketRect.top + (ticketRect.height / 2);
            var distance = Math.abs(ticketCenterY - containerCenterY);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestTicket = ticket;
            }
        }
        return closestTicket;
    }

    function doSpin() {
        if (isSpinning || spinsCount <= 0) return;
        isSpinning = true;
        spinsCount = loadSpins();
        var tickets = document.querySelectorAll('.spin-ticket');
        var container = document.getElementById('spinTickets');
        tickets.forEach(function(t) { t.classList.remove('highlight'); });

        if (!container || !tickets.length) {
            isSpinning = false;
            updateUI();
            return;
        }

        var idx = Math.floor(Math.random() * tickets.length);
        var targetTicket = tickets[idx];
        var targetWon = parseFloat(targetTicket.getAttribute('data-value')) || 0;

        var containerHeight = container.clientHeight;
        var ticketHeight = targetTicket.offsetHeight;
        var gap = 36;
        var ticketWithGap = ticketHeight + gap;
        var totalHeight = ticketWithGap * tickets.length;
        var laps = 3 + Math.floor(Math.random() * 2);
        var offsetToWin = idx * ticketWithGap;
        var centerOffset = (containerHeight / 2) - (ticketHeight / 2);
        var targetScroll = laps * totalHeight + offsetToWin - centerOffset;
        targetScroll = Math.max(0, targetScroll);
        container.scrollTop = 0;
        var durationMs = 6000;
        animateDrumScroll(container, targetScroll, durationMs, function() {
            setTimeout(function() {
                var actualCenterTicket = getCenterTicket(container, tickets);
                var won = targetWon;
                if (actualCenterTicket) {
                    won = parseFloat(actualCenterTicket.getAttribute('data-value')) || targetWon;
                    var ticketRect = actualCenterTicket.getBoundingClientRect();
                    var containerRect = container.getBoundingClientRect();
                    var currentCenterY = containerRect.top + (containerRect.height / 2);
                    var ticketCenterY = ticketRect.top + (ticketRect.height / 2);
                    var offset = ticketCenterY - currentCenterY;
                    if (Math.abs(offset) > 5) {
                        container.scrollTop += offset;
                    }
                    actualCenterTicket.classList.add('highlight');
                } else {
                    targetTicket.classList.add('highlight');
                }
                finishSpin(won);
            }, 100);
        });

        function finishSpin(won) {
            spinsCount = Math.max(0, loadSpins() - 1);
            saveSpins(spinsCount);
            var countEl = document.getElementById('spinsCount');
            if (countEl) countEl.textContent = spinsCount;

            var resultVal = document.getElementById('resultValue');
            var overlay = document.getElementById('resultOverlay');
            if (resultVal) resultVal.textContent = won + (currentCurrency === 'RUB' ? ' ₽' : ' USDT');
            if (overlay) overlay.classList.add('show');

            var done = function() {
                isSpinning = false;
                updateUI();
            };
            creditWinToBalance(won, done);
            setTimeout(function() { if (isSpinning) done(); }, 8000);
        }
    }

    function creditWinToBalance(won, onDone) {
        var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp.initData : '';
        if (!apiBase || !initData) {
            var cur = currentCurrency === 'RUB' ? getBalanceRub() : getBalanceUsdt();
            if (currentCurrency === 'RUB') setBalanceRub(cur + won); else setBalanceUsdt(cur + won);
            if (onDone) onDone();
            return;
        }
        fetch(apiBase.replace(/\/$/, '') + '/api/balance/credit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
            body: JSON.stringify({ reason: 'spin_win', currency: currentCurrency, amount: won })
        }).then(function(r) { return r.json().catch(function() { return {}; }); }).then(function(d) {
            if (d && d.success) {
                if (typeof d.balance_rub === 'number') setBalanceRub(d.balance_rub);
                if (typeof d.balance_usdt === 'number') setBalanceUsdt(d.balance_usdt);
            } else {
                var cur = currentCurrency === 'RUB' ? getBalanceRub() : getBalanceUsdt();
                if (currentCurrency === 'RUB') setBalanceRub(cur + won); else setBalanceUsdt(cur + won);
            }
            if (onDone) onDone();
        }).catch(function() {
            var cur = currentCurrency === 'RUB' ? getBalanceRub() : getBalanceUsdt();
            if (currentCurrency === 'RUB') setBalanceRub(cur + won); else setBalanceUsdt(cur + won);
            if (onDone) onDone();
        });
    }

    function init() {
        var backBtn = document.getElementById('backBtn');
        if (backBtn) backBtn.href = 'index.html';

        document.querySelectorAll('.spin-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('.spin-tab').forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                currentCurrency = this.getAttribute('data-currency') || 'RUB';
                updateUI();
            });
        });

        document.getElementById('changeCurrencyBtn').addEventListener('click', function() {
            var tabs = document.querySelectorAll('.spin-tab');
            var next = currentCurrency === 'RUB' ? tabs[1] : tabs[0];
            if (next) next.click();
        });

        var buyBtn = document.getElementById('buySpinBtn');
        if (buyBtn) {
            buyBtn.addEventListener('click', function() {
                if (currentCurrency === 'RUB') buyWithRubles();
                else buyWithUsdt();
            });
        }

        var spinBtn = document.getElementById('spinBtn');
        if (spinBtn) spinBtn.addEventListener('click', doSpin);

        document.getElementById('resultCloseBtn').addEventListener('click', function() {
            document.getElementById('resultOverlay').classList.remove('show');
            updateUI();
        });

        var drum = document.querySelector('.spin-drum');
        if (drum) {
            drum.addEventListener('wheel', function(e) { e.preventDefault(); }, { passive: false });
        }

        updateUI();
        syncBalanceFromApi(updateUI);

        var checkReturn = function() {
            var added = sessionStorage.getItem('jetstore_spin_added');
            if (added === '1') {
                sessionStorage.removeItem('jetstore_spin_added');
                updateUI();
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showPopup) {
                    window.Telegram.WebApp.showPopup({ title: 'Готово', message: 'Спин добавлен! Можете крутить.' });
                }
            }
        };
        setTimeout(checkReturn, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
