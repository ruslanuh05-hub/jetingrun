// payment.js - Модуль для работы с платежами
// Функции: создание инвойсов, проверка оплаты, управление состоянием платежей

// Подтвердить оплату: проверка платёжки, при успехе — выдача товара
function confirmPayment() {
    if (!window.paymentData) return;
    var data = window.paymentData;
    var statusEl = document.getElementById('paymentDetailStatus');
    var confirmBtn = document.getElementById('paymentWaitingConfirmBtn');
    var apiBase = (window.getJetApiBase ? window.getJetApiBase() : '') || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    if (!apiBase) {
        var url = typeof prompt !== 'undefined' ? prompt('Введите URL бота (Railway):\n\nПример: https://jet-store-bot-production.up.railway.app') : '';
        if (url && (url = url.trim().replace(/\/$/, ''))) {
            try { localStorage.setItem('jet_api_base', url); } catch (e) {}
            window.JET_API_BASE = url;
            if (typeof showStoreNotification === 'function') showStoreNotification('Адрес API сохранён. Нажмите «Подтвердить оплату» снова.', 'success');
        } else {
            if (typeof showStoreNotification === 'function') showStoreNotification('Укажите адрес API бота (сервер, где запущен бот).', 'error');
        }
        return;
    }
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Проверяем...';
    }
    if (statusEl) statusEl.textContent = 'Проверка оплаты...';

    var purchase = data.purchase || {};
    var checkPayload = {
        method: data.method
    };
    // Для CryptoBot отправляем ТОЛЬКО invoice_id - вся критичная информация хранится на бэке
    if (data.method === 'cryptobot') {
        if (!data.invoice_id) {
            if (statusEl) statusEl.textContent = 'Ожидание...';
            if (typeof showStoreNotification === 'function') {
                showStoreNotification('Ошибка: invoice_id не найден. Создайте счёт заново.', 'error');
            }
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Подтвердить оплату';
            }
            return;
        }
        checkPayload.invoice_id = data.invoice_id;
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
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Подтвердить оплату';
            }
            if (!result.ok) {
                if (statusEl) statusEl.textContent = 'Ожидание...';
                var errorMsg = res.error || res.message || ('HTTP ' + result.status);
                if (typeof showStoreNotification === 'function') {
                    showStoreNotification('Ошибка проверки оплаты: ' + errorMsg + '. Проверьте адрес API в настройках.', 'error');
                }
                console.error('[Payment Check] HTTP error:', result.status, 'response:', res);
                return;
            }
            // Проверяем явно на true, так как может быть undefined или false
            if (res.paid === true) {
                if (statusEl) statusEl.textContent = res.delivered_by_fragment ? 'Оплата подтверждена.' : 'Оплата подтверждена. Выдача...';
                console.log('[Payment Check] Payment confirmed, invoice_id:', res.invoice_id || data.invoice_id);
                if (typeof runDeliveryAfterPayment === 'function') {
                    runDeliveryAfterPayment(data, res);
                }
            } else {
                // Оплата ещё не найдена - это нормально, пользователь может попробовать ещё раз
                if (statusEl) statusEl.textContent = 'Ожидание...';
                if (typeof showStoreNotification === 'function') {
                    showStoreNotification('Оплата ещё не найдена. Если вы уже оплатили, подождите несколько секунд и попробуйте снова.', 'info');
                }
                console.log('[Payment Check] Payment not found yet, invoice_id:', res.invoice_id || data.invoice_id);
            }
        })
        .catch(function(err) {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Подтвердить оплату';
            }
            if (statusEl) statusEl.textContent = 'Ожидание...';
            var errMsg = (err && err.message) ? err.message : String(err || 'Неизвестная ошибка');
            if (typeof showStoreNotification === 'function') {
                showStoreNotification('Ошибка связи с сервером: ' + errMsg + '. Проверьте адрес API в настройках.', 'error');
            }
            console.error('[Payment Check] Network error:', err);
        });
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
        // Показываем экран ожидания с возможностью снова открыть оплату и подтвердить
        if (typeof showPaymentWaiting === 'function') {
            showPaymentWaiting();
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
}
