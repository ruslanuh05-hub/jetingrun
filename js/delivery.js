// delivery.js - Модуль для выдачи товаров после оплаты
// ВАЖНО: выдача товаров (звёзды, премиум, Steam) теперь выполняется ТОЛЬКО на бэкенде через вебхуки
// Клиент только проверяет статус оплаты и показывает уведомление пользователю.

// После пополнения баланса — синхронизация с сервером (источник истины — БД)
function syncBalanceFromApiAfterDelivery() {
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) ? window.Telegram.WebApp.initData : '';
    if (!apiBase || !initData) {
        if (typeof window.updateBalanceDisplay === 'function') window.updateBalanceDisplay();
        return;
    }
    fetch(apiBase.replace(/\/$/, '') + '/api/balance', {
        method: 'GET',
        headers: { 'X-Telegram-Init-Data': initData }
    }).then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {
        if (d && typeof d.balance_rub === 'number') {
            var rub = d.balance_rub;
            try {
                var balanceKey = 'jetstore_balance_fixed';
                var cur = JSON.parse(localStorage.getItem(balanceKey) || '{}');
                cur.RUB = rub;
                cur.lastUpdate = Date.now();
                localStorage.setItem(balanceKey, JSON.stringify(cur));
            } catch (e) {}
            if (window.userData) {
                if (!window.userData.currencies) window.userData.currencies = {};
                window.userData.currencies.RUB = rub;
            }
            var headerBalanceEl = document.getElementById('headerBalance');
            if (headerBalanceEl) headerBalanceEl.textContent = rub.toFixed(2) + ' ₽';
            var profileBalanceEl = document.getElementById('profileBalance');
            if (profileBalanceEl) profileBalanceEl.textContent = rub.toFixed(2) + ' ₽';
            if (window.Database && typeof window.Database.saveBalanceFixed === 'function') {
                window.Database.saveBalanceFixed('RUB', rub);
            }
        }
        if (typeof window.updateBalanceDisplay === 'function') window.updateBalanceDisplay();
    }).catch(function() {
        if (typeof window.updateBalanceDisplay === 'function') window.updateBalanceDisplay();
    });
}

// Выдача товара после подтверждённой оплаты
function runDeliveryAfterPayment(data, checkResponse) {
    // Останавливаем polling, так как оплата подтверждена
    if (typeof window.stopPaymentPolling === 'function') {
        window.stopPaymentPolling();
    }
    
    var statusEl = document.getElementById('paymentDetailStatus');
    var purchaseType = (data && data.purchase && data.purchase.type) || '';
    
    // Оплата через Fragment (TonKeeper): товар уже выдан по вебхуку order.completed
    if (checkResponse && checkResponse.delivered_by_fragment === true) {
        var optsDelivered = null;
        if (purchaseType === 'stars') {
            // Для звёзд: явно фиксируем, что они выданы
            optsDelivered = { status: 'delivered' };
        }
        if (typeof recordPurchaseSuccess === 'function') recordPurchaseSuccess(data, optsDelivered);
        
        // Перезагружаем историю покупок, если мы на странице профиля
        setTimeout(function() {
            if (typeof window.loadPurchases === 'function') {
                window.loadPurchases();
            } else if (typeof loadPurchases === 'function') {
                loadPurchases();
            }
        }, 500);
        
        if (typeof showStoreNotification === 'function') showStoreNotification('Товар выдан.', 'success');
        if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
        return;
    }
    
    // Оплата через FreeKassa: товар уже выдан по вебхуку от FreeKassa
    if (checkResponse && checkResponse.delivered_by_freekassa === true) {
        if (purchaseType === 'balance') {
            var amount = parseFloat((data.purchase && data.purchase.amount) || 0) || 0;
            if (amount > 0) {
                try {
                    var balanceKey = 'jetstore_balance_fixed';
                    var balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
                    var cur = parseFloat(balanceData.RUB) || 0;
                    var newBalance = cur + amount;
                    balanceData.RUB = newBalance;
                    balanceData.lastUpdate = Date.now();
                    localStorage.setItem(balanceKey, JSON.stringify(balanceData));
                    if (window.Database && typeof window.Database.saveBalanceFixed === 'function') {
                        window.Database.saveBalanceFixed('RUB', newBalance);
                    }
                    if (window.userData) {
                        if (!window.userData.currencies) window.userData.currencies = {};
                        window.userData.currencies.RUB = newBalance;
                    }
                } catch (e) {
                    console.warn('[runDeliveryAfterPayment] balance add error:', e);
                }
            }
            if (typeof recordPurchaseSuccess === 'function') recordPurchaseSuccess(data, { status: 'delivered' });
            if (typeof showStoreNotification === 'function') showStoreNotification('Баланс пополнен на ' + (amount || 0).toLocaleString('ru-RU') + ' ₽', 'success');
            if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
            syncBalanceFromApiAfterDelivery();
            return;
        }
        var optsDelivered = null;
        if (purchaseType === 'stars') {
            optsDelivered = { status: 'delivered' };
        }
        if (typeof recordPurchaseSuccess === 'function') recordPurchaseSuccess(data, optsDelivered);
        
        setTimeout(function() {
            if (typeof window.loadPurchases === 'function') {
                window.loadPurchases();
            } else if (typeof loadPurchases === 'function') {
                loadPurchases();
            }
        }, 500);
        
        if (typeof showStoreNotification === 'function') showStoreNotification('Товар выдан.', 'success');
        if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
        return;
    }

    // Для CryptoBot и других методов: выдача выполняется на бэкенде через вебхуки
    // Клиент только показывает сообщение о том, что оплата подтверждена и товар будет выдан автоматически
    var message = 'Оплата подтверждена. ';
    
    if (purchaseType === 'stars') {
        message += 'Звёзды будут отправлены автоматически после обработки на сервере.';
    } else if (purchaseType === 'premium') {
        message += 'Premium будет активирован автоматически после обработки на сервере.';
    } else if (purchaseType === 'steam') {
        message += 'Пополнение Steam будет выполнено автоматически после обработки на сервере.';
    } else if (purchaseType === 'spin') {
        // Спин: добавляем в localStorage и перенаправляем на рулетку
        try {
            var tg = window.Telegram && window.Telegram.WebApp;
            var uid = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id)
                ? String(tg.initDataUnsafe.user.id) : (window.userData && window.userData.id ? String(window.userData.id) : 'guest');
            var key = 'jetstore_spins_' + uid;
            var cur = parseInt(localStorage.getItem(key) || '0', 10) || 0;
            localStorage.setItem(key, String(cur + 1));
            sessionStorage.setItem('jetstore_spin_added', '1');
            message = 'Спин добавлен!';
            if (typeof showStoreNotification === 'function') showStoreNotification(message, 'success');
            if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
            var spinUrl = (window.location.pathname.indexOf('/html/') >= 0) ? 'spin.html' : 'html/spin.html';
            setTimeout(function() { window.location.href = spinUrl; }, 800);
            return;
        } catch (e) {
            console.warn('[runDeliveryAfterPayment] spin add error:', e);
            message += 'Спин будет добавлен. Перезайдите на страницу рулетки.';
        }
    } else if (purchaseType === 'balance') {
        var amount = parseFloat((data.purchase && data.purchase.amount) || 0) || 0;
        if (amount > 0) {
            try {
                var balanceKey = 'jetstore_balance_fixed';
                var balanceData = JSON.parse(localStorage.getItem(balanceKey) || '{}');
                var cur = parseFloat(balanceData.RUB) || 0;
                balanceData.RUB = cur + amount;
                balanceData.lastUpdate = Date.now();
                localStorage.setItem(balanceKey, JSON.stringify(balanceData));
                if (window.userData) {
                    if (!window.userData.currencies) window.userData.currencies = {};
                    window.userData.currencies.RUB = (window.userData.currencies.RUB || 0) + amount;
                }
            } catch (e) { console.warn('[runDeliveryAfterPayment] balance sync error:', e); }
        }
        message = 'Баланс пополнен на ' + (amount || 0).toLocaleString('ru-RU') + ' ₽';
        if (typeof recordPurchaseSuccess === 'function') recordPurchaseSuccess(data, { status: 'delivered' });
        if (typeof showStoreNotification === 'function') showStoreNotification(message, 'success');
        if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
        syncBalanceFromApiAfterDelivery();
        return;
    } else {
        message += 'Товар будет выдан автоматически после обработки на сервере.';
    }
    
    // Для CryptoBot: к этому моменту /api/payment/check уже вернул paid:true,
    // а на бэке либо webhook, либо fallback доставили товар.
    // Для звёзд считаем, что они выданы.
    var opts = null;
    if (purchaseType === 'stars') {
        opts = { status: 'delivered' };
    }
    console.log('[runDeliveryAfterPayment] Вызываем recordPurchaseSuccess, data.purchase:', data && data.purchase, 'purchaseType:', purchaseType, 'opts:', opts);
    if (typeof recordPurchaseSuccess === 'function') recordPurchaseSuccess(data, opts);
    
    // Перезагружаем историю покупок, если мы на странице профиля
    setTimeout(function() {
        if (typeof window.loadPurchases === 'function') {
            window.loadPurchases();
        } else if (typeof loadPurchases === 'function') {
            loadPurchases();
        }
    }, 500);
    
    if (typeof showStoreNotification === 'function') showStoreNotification(message, 'success');
    if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
}

// Экспорт функций в глобальную область видимости
if (typeof window !== 'undefined') {
    window.runDeliveryAfterPayment = runDeliveryAfterPayment;
}
