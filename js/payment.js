// payment.js - Модуль для работы с платежами
// Функции: создание инвойсов, проверка оплаты, управление состоянием платежей

// Глобальная переменная для хранения интервала polling
var paymentPollingInterval = null;

// Подтвердить оплату: проверка платёжки, при успехе — выдача товара
function confirmPayment() {
    if (!window.paymentData) return;
    var data = window.paymentData;
    var statusEl = document.getElementById('paymentDetailStatus');
    var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) {
        var url = typeof prompt !== 'undefined' ? prompt('Введите URL бота (Railway):\n\nПример: https://jet-store-bot-production.up.railway.app') : '';
        if (url && (url = url.trim().replace(/\/$/, ''))) {
            try { localStorage.setItem('jet_api_base', url); } catch (e) {}
            window.JET_API_BASE = url;
            if (typeof showStoreNotification === 'function') showStoreNotification('Адрес API сохранён. Проверка оплаты продолжится автоматически.', 'success');
        } else {
            if (typeof showStoreNotification === 'function') showStoreNotification('Укажите адрес API бота (сервер, где запущен бот).', 'error');
            stopPaymentPolling();
        }
        return;
    }
    if (statusEl) statusEl.textContent = 'Проверка оплаты...';

    var purchase = data.purchase || {};
    var checkPayload = {
        method: data.method
    };
    // Для CryptoBot отправляем ТОЛЬКО invoice_id - вся критичная информация хранится на бэке
    if (data.method === 'cryptobot') {
        if (!data.invoice_id) {
            // Если invoice_id отсутствует, просто не проверяем оплату (возможно, инвойс ещё не создан)
            if (statusEl) statusEl.textContent = 'Ожидание создания счёта...';
            console.log('[Payment Check] invoice_id not found yet, skipping check');
            return;
        }
        checkPayload.invoice_id = data.invoice_id;
    } else if (data.method === 'platega') {
        if (!data.transaction_id) {
            if (statusEl) statusEl.textContent = 'Ожидание создания платежа...';
            console.log('[Payment Check] transaction_id not found for Platega, skipping check');
            return;
        }
        checkPayload.transaction_id = data.transaction_id;
    } else {
        // Для других методов (Fragment, TON) используем старую логику
        checkPayload.totalAmount = data.totalAmount;
        checkPayload.baseAmount = data.baseAmount;
        checkPayload.purchase = purchase;
        if (data.order_id) checkPayload.order_id = data.order_id;
        if (data.transaction_id) checkPayload.transaction_id = data.transaction_id;
        if (data.invoice_id) checkPayload.invoice_id = data.invoice_id;
    }
    var url = (apiBase.replace(/\/$/, '') + '/api/payment/check');
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkPayload)
    })
        .then(function(r) {
            return r.json().catch(function() { return {}; }).then(function(json) {
                return { ok: r.ok, status: r.status, json: json };
            });
        })
        .then(function(result) {
            var res = result.json || {};
            if (!result.ok) {
                if (statusEl) statusEl.textContent = 'Ожидание оплаты...';
                console.error('[Payment Check] HTTP error:', result.status, 'response:', res);
                // Не показываем пользователю ошибку (в т.ч. про invoice_id) — только логируем, продолжаем polling
                return;
            }
            // Проверяем явно на true, так как может быть undefined или false
            if (res.paid === true) {
                // Оплата подтверждена - останавливаем polling
                stopPaymentPolling();
                if (statusEl) statusEl.textContent = res.delivered_by_fragment ? 'Оплата подтверждена.' : 'Оплата подтверждена. Выдача...';
                console.log('[Payment Check] Payment confirmed, invoice_id:', res.invoice_id || data.invoice_id);
                if (typeof runDeliveryAfterPayment === 'function') {
                    runDeliveryAfterPayment(data, res);
                }
            } else {
                // Оплата ещё не найдена - продолжаем polling
                if (statusEl) statusEl.textContent = 'Ожидание оплаты...';
                console.log('[Payment Check] Payment not found yet, invoice_id:', res.invoice_id || data.invoice_id);
            }
        })
        .catch(function(err) {
            if (statusEl) statusEl.textContent = 'Ожидание оплаты...';
            var errMsg = (err && err.message) ? err.message : String(err || 'Неизвестная ошибка');
            console.error('[Payment Check] Network error:', err);
            // Не останавливаем polling при ошибке сети - продолжаем попытки
        });
}

// Запуск автоматического polling для проверки оплаты
function startPaymentPolling() {
    // Останавливаем предыдущий polling, если он был
    stopPaymentPolling();
    
    // Проверяем, есть ли данные для проверки
    if (!window.paymentData) {
        console.log('[Payment Polling] No paymentData, skipping');
        return;
    }
    
    // Для CryptoBot проверяем наличие invoice_id перед запуском polling
    if (window.paymentData.method === 'cryptobot' && !window.paymentData.invoice_id) {
        console.log('[Payment Polling] invoice_id not found for CryptoBot, will start after invoice creation');
        return;
    }
    // Для Platega проверяем наличие transaction_id
    if (window.paymentData.method === 'platega' && !window.paymentData.transaction_id) {
        console.log('[Payment Polling] transaction_id not found for Platega, will start after create-transaction');
        return;
    }
    
    // Проверяем сразу при запуске
    confirmPayment();
    
    // Затем проверяем каждые 3 секунды
    paymentPollingInterval = setInterval(function() {
        if (!window.paymentData) {
            stopPaymentPolling();
            return;
        }
        // Для CryptoBot проверяем наличие invoice_id перед каждой проверкой
        if (window.paymentData.method === 'cryptobot' && !window.paymentData.invoice_id) {
            console.log('[Payment Polling] invoice_id not found, skipping check');
            return;
        }
        confirmPayment();
    }, 3000); // Проверка каждые 3 секунды
    
    console.log('[Payment Polling] Started');
}

// Остановка автоматического polling
function stopPaymentPolling() {
    if (paymentPollingInterval) {
        clearInterval(paymentPollingInterval);
        paymentPollingInterval = null;
        console.log('[Payment Polling] Stopped');
    }
}

// Сохранение незавершённого счёта (например, CryptoBot) в localStorage
function savePendingPayment() {
    try {
        if (!window.paymentData || window.paymentData.method !== 'cryptobot') return;
        if (!window.paymentData.invoice_id) return;
        const userId = (window.userData && window.userData.id) ? String(window.userData.id) : null;
        const payload = {
            ...window.paymentData,
            userId: userId,
            createdAt: Date.now()
        };
        localStorage.setItem('jetstore_pending_payment_order', JSON.stringify(payload));
    } catch (e) {
        console.warn('Ошибка сохранения незавершённого счёта:', e);
    }
}

// Восстановление незавершённого счёта при повторном открытии мини‑приложения
function restorePendingPayment() {
    try {
        const raw = localStorage.getItem('jetstore_pending_payment_order');
        if (!raw) return;
        const pending = JSON.parse(raw);
        if (!pending || pending.method !== 'cryptobot' || !pending.invoice_id) return;
        const userId = (window.userData && window.userData.id) ? String(window.userData.id) : null;
        if (pending.userId && userId && String(pending.userId) !== String(userId)) {
            // Чужой счёт — не показываем
            return;
        }
        // Опционально ограничиваем «жизнь» счёта, например, 24 часа
        if (typeof pending.createdAt === 'number') {
            const ONE_DAY_MS = 24 * 60 * 60 * 1000;
            if (Date.now() - pending.createdAt > ONE_DAY_MS) {
                localStorage.removeItem('jetstore_pending_payment_order');
                return;
            }
        }
        window.paymentData = pending;
        // Показываем экран ожидания
        if (typeof showPaymentWaiting === 'function') {
            showPaymentWaiting();
        }
        // Запускаем polling для проверки оплаты восстановленного счёта
        // (startPaymentPolling сам проверит наличие invoice_id)
        if (typeof window.startPaymentPolling === 'function') {
            window.startPaymentPolling();
        }
    } catch (e) {
        console.warn('Ошибка восстановления незавершённого счёта:', e);
    }
}

// Экспорт функций в глобальную область видимости
if (typeof window !== 'undefined') {
    window.confirmPayment = confirmPayment;
    window.savePendingPayment = savePendingPayment;
    window.restorePendingPayment = restorePendingPayment;
    window.startPaymentPolling = startPaymentPolling;
    window.stopPaymentPolling = stopPaymentPolling;
}
