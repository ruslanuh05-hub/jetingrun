// delivery.js - Модуль для выдачи товаров после оплаты
// ВАЖНО: выдача товаров (звёзды, премиум, Steam) теперь выполняется ТОЛЬКО на бэкенде через вебхуки
// Клиент только проверяет статус оплаты и показывает уведомление пользователю.

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
    } else {
        message += 'Товар будет выдан автоматически после обработки на сервере.';
    }
    
    var optsPending = null;
    if (purchaseType === 'stars') {
        // Для звёзд: оплата прошла, но сервер ещё отправляет — показываем "звёзды отправляются"
        optsPending = { status: 'pending_delivery' };
    }
    if (typeof recordPurchaseSuccess === 'function') recordPurchaseSuccess(data, optsPending);
    if (typeof showStoreNotification === 'function') showStoreNotification(message, 'success');
    if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
}

// Экспорт функций в глобальную область видимости
if (typeof window !== 'undefined') {
    window.runDeliveryAfterPayment = runDeliveryAfterPayment;
}
