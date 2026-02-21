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

    function renderTickets() {
        var container = document.getElementById('spinTickets');
        if (!container) return;
        var prizes = currentCurrency === 'RUB' ? PRIZES_RUB : PRIZES_USDT;
        var currencyLabel = currentCurrency === 'RUB' ? 'Рубли' : 'Tether';
        var highThreshold = currentCurrency === 'RUB' ? 500 : 25;
        container.innerHTML = prizes.map(function(v, i) {
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
        if (currencyName) currencyName.textContent = currentCurrency === 'RUB' ? 'Рубли' : 'USDT';

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

    function buyWithRubles() {
        var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (!apiBase) {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                window.Telegram.WebApp.showAlert('API бота не настроен. Укажите URL в настройках.');
            } else {
                alert('API бота не настроен.');
            }
            return;
        }
        var userId = (window.userData && window.userData.id) ? String(window.userData.id) : (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user && window.Telegram.WebApp.initDataUnsafe.user.id) ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : 'unknown';
        var purchase = {
            type: 'spin',
            amount: SPIN_PRICE_RUB,
            amount_rub: SPIN_PRICE_RUB,
            productName: '1 спин рулетки',
            order_id: '#' + Date.now().toString(36).toUpperCase()
        };
        sessionStorage.setItem('spin_pay_data', JSON.stringify({ currency: 'RUB', userId: userId, purchase: purchase }));
        sessionStorage.setItem('spin_return_url', window.location.href);
        var path = (window.location.pathname || '').replace(/spin\.html.*$/, 'index.html');
        if (!path || path === (window.location.pathname || '')) path = 'index.html';
        var payUrl = window.location.origin + (path.startsWith('/') ? path : '/' + path) + '?pay=spin&currency=RUB';
        window.location.href = payUrl;
    }

    function buyWithUsdt() {
        var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
        if (!apiBase) {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
                window.Telegram.WebApp.showAlert('API бота не настроен.');
            } else {
                alert('API бота не настроен.');
            }
            return;
        }
        var userId = (window.userData && window.userData.id) ? String(window.userData.id) : (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user && window.Telegram.WebApp.initDataUnsafe.user.id) ? String(window.Telegram.WebApp.initDataUnsafe.user.id) : 'unknown';
        var purchase = {
            type: 'spin',
            amount: SPIN_PRICE_USDT,
            amount_usdt: SPIN_PRICE_USDT,
            productName: '1 спин рулетки'
        };
        sessionStorage.setItem('spin_pay_data', JSON.stringify({ currency: 'USDT', userId: userId, purchase: purchase }));
        sessionStorage.setItem('spin_return_url', window.location.href);
        var path = (window.location.pathname || '').replace(/spin\.html.*$/, 'index.html');
        if (!path || path === (window.location.pathname || '')) path = 'index.html';
        var payUrl = window.location.origin + (path.startsWith('/') ? path : '/' + path) + '?pay=spin&currency=USDT';
        window.location.href = payUrl;
    }

    function doSpin() {
        if (isSpinning || spinsCount <= 0) return;
        isSpinning = true;
        var prizes = currentCurrency === 'RUB' ? PRIZES_RUB : PRIZES_USDT;
        var idx = Math.floor(Math.random() * prizes.length);
        var won = prizes[idx];

        var tickets = document.querySelectorAll('.spin-ticket');
        tickets.forEach(function(t) { t.classList.remove('highlight'); });
        var ticket = tickets[idx];
        if (ticket) {
            ticket.classList.add('highlight');
            ticket.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        setTimeout(function() {
            spinsCount = Math.max(0, spinsCount - 1);
            saveSpins(spinsCount);
            var countEl = document.getElementById('spinsCount');
            if (countEl) countEl.textContent = spinsCount;

            var resultVal = document.getElementById('resultValue');
            var overlay = document.getElementById('resultOverlay');
            if (resultVal) resultVal.textContent = won + (currentCurrency === 'RUB' ? ' ₽' : ' USDT');
            if (overlay) overlay.classList.add('show');
            isSpinning = false;
        }, 1500);
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
        });

        var drum = document.querySelector('.spin-drum');
        if (drum) {
            drum.addEventListener('wheel', function(e) { e.preventDefault(); }, { passive: false });
        }

        updateUI();

        var checkReturn = function() {
            var added = sessionStorage.getItem('jetstore_spin_added');
            if (added === '1') {
                sessionStorage.removeItem('jetstore_spin_added');
                spinsCount = loadSpins() + 1;
                saveSpins(spinsCount);
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
