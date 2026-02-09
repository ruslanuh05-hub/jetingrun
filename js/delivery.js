// delivery.js - Модуль для выдачи товаров после оплаты
// ВАЖНО: выдача товаров (звёзды, премиум, Steam) теперь выполняется ТОЛЬКО на бэкенде через вебхуки
// Клиент только проверяет статус оплаты и показывает уведомление пользователю.

// Выдача товара после подтверждённой оплаты
function runDeliveryAfterPayment(data, checkResponse) {
    var statusEl = document.getElementById('paymentDetailStatus');
    
    // Оплата через Fragment (TonKeeper): товар уже выдан по вебхуку order.completed
    if (checkResponse && checkResponse.delivered_by_fragment === true) {
        if (typeof recordPurchaseSuccess === 'function') recordPurchaseSuccess(data);
        if (typeof showStoreNotification === 'function') showStoreNotification('Товар выдан.', 'success');
        if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
        return;
    }

    // Для CryptoBot и других методов: выдача выполняется на бэкенде через вебхуки
    // Клиент только показывает сообщение о том, что оплата подтверждена и товар будет выдан автоматически
    var purchaseType = (data.purchase && data.purchase.type) || '';
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
    
    if (typeof recordPurchaseSuccess === 'function') recordPurchaseSuccess(data);
    if (typeof showStoreNotification === 'function') showStoreNotification(message, 'success');
    if (typeof closePaymentWaiting === 'function') closePaymentWaiting();
}

// Экспорт функций в глобальную область видимости
if (typeof window !== 'undefined') {
    window.runDeliveryAfterPayment = runDeliveryAfterPayment;
}
