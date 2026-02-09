// Конфиг: сайт на GitHub Pages / jetstoreapp.ru, бот на Railway.
// URL бота — для API (CryptoBot, курс TON, Fragment и т.д.)
window.JET_BOT_API_URL = 'https://jet-store-bot-production.up.railway.app';
window.JET_API_BASE = '';
window.JET_BOT_API_FALLBACK = 'https://jet-store-bot-production.up.railway.app';
window.getJetApiBase = function() {
    var url = (window.JET_BOT_API_URL || window.JET_API_BASE || localStorage.getItem('jet_bot_api_url') || localStorage.getItem('jet_api_base') || '').trim();
    if (!url) {
        var host = (window.location && window.location.hostname || '').toLowerCase();
        var proto = (window.location && window.location.protocol || '').toLowerCase();
        if (!host || host === 'null' || proto === 'file:' || proto === '') {
            url = window.JET_BOT_API_FALLBACK || window.JET_BOT_API_URL || '';
        } else if (host !== 'localhost' && host !== '127.0.0.1') {
            url = window.JET_BOT_API_FALLBACK || '';
        }
    }
    if (!url) return '';
    url = String(url).replace(/\/$/, '');
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
};

// Конвертация raw-адреса TON (0:hex или -1:hex) в user-friendly (UQA...)
window.rawToUserFriendly = function(raw) {
    if (!raw || typeof raw !== 'string') return raw || '';
    var s = raw.trim();
    if (!/^(-1|0):[0-9a-fA-F]{32,64}$/.test(s)) return s;
    var parts = s.split(':');
    var wc = parseInt(parts[0], 10);
    var hash = parts[1].toLowerCase();
    while (hash.length < 64) hash = '0' + hash;
    hash = hash.slice(-64);
    var hex = hash.match(/.{1,2}/g).map(function(b) { return parseInt(b, 16); });
    function crc16(data) {
        var poly = 0x1021, reg = 0;
        for (var i = 0; i < data.length; i++) {
            reg ^= ((data[i] || 0) << 8) & 0xffff;
            for (var j = 0; j < 8; j++) {
                var bit = reg & 0x8000;
                reg = (reg << 1) & 0xffff;
                if (bit) reg ^= poly;
            }
        }
        return reg & 0xffff;
    }
    var payload = [0x51, wc === -1 ? 0xff : 0];
    for (var k = 0; k < 32; k++) payload.push(hex[k] || 0);
    var crc = crc16(payload);
    payload.push((crc >> 8) & 0xff, crc & 0xff);
    var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var bin = payload;
    var out = '', i = 0;
    while (i < bin.length) {
        var n = (bin[i] << 16) | ((bin[i + 1] || 0) << 8) | (bin[i + 2] || 0);
        out += b64[(n >> 18) & 63] + b64[(n >> 12) & 63] + (i + 1 < bin.length ? b64[(n >> 6) & 63] : '=') + (i + 2 < bin.length ? b64[n & 63] : '=');
        i += 3;
    }
    return out.replace(/=/g, '');
};
window.ensureUserFriendlyAddress = function(addr) {
    if (!addr) return addr || '';
    var s = String(addr).trim();
    if (!/^(-1|0):[0-9a-fA-F]{32,64}$/.test(s)) return addr;
    return window.rawToUserFriendly ? window.rawToUserFriendly(addr) : addr;
};
window.fetchUserFriendlyAddress = function(rawAddr, callback) {
    if (!rawAddr || !/^(-1|0):[0-9a-fA-F]{32,64}$/.test(String(rawAddr).trim())) {
        if (callback) callback(rawAddr);
        return;
    }
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || '';
    if (apiBase) {
        fetch(apiBase.replace(/\/$/, '') + '/api/ton/pack-address?address=' + encodeURIComponent(rawAddr))
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data && data.address) { if (callback) callback(data.address); return; }
                if (callback) callback(window.rawToUserFriendly ? window.rawToUserFriendly(rawAddr) : rawAddr);
            })
            .catch(function() {
                if (callback) callback(window.rawToUserFriendly ? window.rawToUserFriendly(rawAddr) : rawAddr);
            });
    } else {
        if (callback) callback(window.rawToUserFriendly ? window.rawToUserFriendly(rawAddr) : rawAddr);
    }
};

// Ключ localStorage для Tonkeeper, изолированный по Telegram user ID
window.getTonkeeperStorageKey = window.getTonkeeperStorageKey || function(base) {
    try {
        var tg = window.Telegram && window.Telegram.WebApp;
        var tgId = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) ? String(tg.initDataUnsafe.user.id) : null;
        if (!tgId) {
            var saved = sessionStorage.getItem('jet_tg_user');
            if (saved) { var u = JSON.parse(saved); if (u && u.id) tgId = String(u.id); }
        }
        if (!tgId && window.userData && window.userData.id && window.userData.id !== 'test_user_default') tgId = String(window.userData.id);
        return tgId ? (base + '_' + tgId) : base;
    } catch (e) { return base; }
};

// Курс TON ↔ RUB: источник CoinPaprika (агрегация с бирж, бесплатный API).
// Документация: https://api.coinpaprika.com/
window.TON_RATE_API_URL = 'https://api.coinpaprika.com/v1/tickers/ton-toncoin?quotes=RUB';

/**
 * Загружает курс 1 TON в рублях. Сначала пробует бэкенд (обход CORS в Telegram),
 * затем CoinPaprika напрямую.
 * @returns {Promise<number|null>} курс TON→RUB или null при ошибке
 */
window.fetchTonToRubRateFromApi = function() {
    var apiBase = (window.getJetApiBase && window.getJetApiBase()) || window.JET_API_BASE || localStorage.getItem('jet_api_base') || '';
    var urls = [];
    if (apiBase) urls.push({ url: apiBase.replace(/\/$/, '') + '/api/ton-rate', direct: false });
    urls.push({ url: window.TON_RATE_API_URL || 'https://api.coinpaprika.com/v1/tickers/ton-toncoin?quotes=RUB', direct: true });

    function saveAndReturn(rate) {
        if (!rate || rate <= 0) return null;
        try {
            var db = window.Database;
            var existing = (db && typeof db.getCurrencyRates === 'function') ? db.getCurrencyRates() : {};
            var saved = {};
            try { saved = JSON.parse(localStorage.getItem('jetstore_currency_rates') || '{}'); } catch (e) {}
            var rubToTon = 1 / rate;
            var merged = Object.assign({}, existing, saved, { TON: rate, RUB_TON: rubToTon });
            localStorage.setItem('jetstore_currency_rates', JSON.stringify(merged));
            if (db && typeof db.updateCurrencyRates === 'function') db.updateCurrencyRates(merged);
        } catch (e) { console.warn('TON rate save:', e); }
        return rate;
    }

    function tryNext(i) {
        if (i >= urls.length) return Promise.resolve(null);
        var item = urls[i];
        return fetch(item.url)
            .then(function(res) { return res.ok ? res.json() : Promise.reject(new Error('API error')); })
            .then(function(data) {
                var rate = null;
                if (item.direct) {
                    var rubPrice = data && data.quotes && data.quotes.RUB && data.quotes.RUB.price;
                    rate = rubPrice != null ? parseFloat(rubPrice) : null;
                } else {
                    rate = data && data.TON != null ? parseFloat(data.TON) : null;
                }
                if (rate && rate > 0) return saveAndReturn(rate);
                return tryNext(i + 1);
            })
            .catch(function(err) {
                console.warn('TON rate fetch attempt', i + 1, err);
                return tryNext(i + 1);
            });
    }
    return tryNext(0);
};
