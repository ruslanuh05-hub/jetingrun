/**
 * TonConnect для profile.html и assets.html.
 * Показываем адрес кошелька из Tonkeeper — всегда берём conn.account (текущий выбранный в приложении).
 * Raw-формат (0:hex...) конвертируем в читаемый UQA/EQ.
 */
(function() {
    if (window.tonConnectSharedLoaded) return;
    window.tonConnectSharedLoaded = true;

    function isRawAddress(addr) {
        if (!addr || typeof addr !== 'string') return false;
        var s = addr.trim();
        var parts = s.split(':');
        if (parts.length !== 2) return false;
        var wc = parseInt(parts[0], 10);
        if (isNaN(wc) || wc < -128 || wc > 127) return false;
        var hash = parts[1];
        return /^[0-9a-fA-F]{64}$/.test(hash);
    }

    function crc16bytes(data) {
        var poly = 0x1021, reg = 0, i, byte, mask;
        for (i = 0; i < data.length + 2; i++) {
            byte = i < data.length ? data[i] : 0;
            for (mask = 0x80; mask > 0; mask >>= 1) {
                reg = reg << 1;
                if (byte & mask) reg += 1;
                if (reg > 0xffff) { reg &= 0xffff; reg ^= poly; }
            }
        }
        return [Math.floor(reg / 256), reg % 256];
    }

    function rawToUserFriendly(addr) {
        try {
            var s = addr.trim(), parts = s.split(':');
            var wc = parseInt(parts[0], 10);
            var hashHex = parts[1];
            var hash = [];
            for (var i = 0; i < 64; i += 2) hash.push(parseInt(hashHex.substr(i, 2), 16));
            var wcByte = (wc < 0) ? (wc + 256) : wc;
            var addrBuf = [0x11, wcByte].concat(hash);
            var crc = crc16bytes(addrBuf);
            var total = addrBuf.concat(crc);
            var b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            var str = '', n = total.length, i, j;
            for (i = 0; i < n; i += 3) {
                j = (total[i] << 16) | ((total[i + 1] || 0) << 8) | (total[i + 2] || 0);
                str += b64[j >> 18] + b64[(j >> 12) & 63] + b64[(j >> 6) & 63] + b64[j & 63];
            }
            str = str.slice(0, (n * 4 + 2) / 3).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            return str;
        } catch (e) { return addr; }
    }

    function toUserFriendlyAddress(addr, onDone) {
        if (!addr || !onDone) return;
        var s = addr.trim();
        if (!isRawAddress(s)) { onDone(s); return; }
        var result = rawToUserFriendly(s);
        onDone(result || s);
    }

    function getTgUserId() {
        try {
            var tg = window.Telegram && window.Telegram.WebApp;
            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) return String(tg.initDataUnsafe.user.id);
            var saved = sessionStorage.getItem('jet_tg_user');
            if (saved) { var u = JSON.parse(saved); if (u && u.id) return String(u.id); }
            if (window.userData && window.userData.id && window.userData.id !== 'test_user_default') return String(window.userData.id);
        } catch (e) {}
        return '';
    }
    var tgId = getTgUserId();
    window.getTonkeeperStorageKey = function(base) { return tgId ? (base + '_' + tgId) : base; };

    var TonConnectClass = (typeof TonConnectSDK !== 'undefined' && TonConnectSDK.TonConnect) ? TonConnectSDK.TonConnect : (typeof TonConnect !== 'undefined' ? TonConnect : null);
    if (!TonConnectClass) { console.error('[TonConnect] SDK не загружен!'); return; }

    var origin = window.location.origin || 'https://jetstoreapp.ru';
    var pathname = window.location.pathname || '';
    var repoPath = (origin.indexOf('github.io') !== -1 && pathname.indexOf('/') !== -1) ? ('/' + (pathname.split('/').filter(Boolean)[0] || '')) : '';
    var manifestUrl = origin + repoPath + '/tonconnect-manifest.json';

    try {
        window.tonConnectConnector = new TonConnectClass({ manifestUrl: manifestUrl });
    } catch (e) {
        console.error('[TonConnect] Ошибка создания connector:', e);
        return;
    }

    var addrKey = window.getTonkeeperStorageKey('jetstore_tonkeeper_address');
    var connectedKey = window.getTonkeeperStorageKey('jetstore_tonkeeper_connected');
    var balanceKey = window.getTonkeeperStorageKey('jetstore_tonkeeper_balance');

    function getAccountAddress(conn) {
        if (!conn || !conn.connected) return '';
        var acc = conn.account || (conn.wallet && conn.wallet.account);
        if (acc && typeof acc.address === 'string') return acc.address.trim();
        return '';
    }

    window.getTonkeeperAddress = function() {
        var conn = window.tonConnectConnector;
        var addr = getAccountAddress(conn);
        if (!addr) { var s = localStorage.getItem(addrKey) || ''; if (s && s.trim()) addr = s.trim(); }
        return addr || '';
    };

    window.ensureUserFriendlyAddress = function(addr, callback) {
        if (!addr) { if (callback) callback(''); return; }
        if (!isRawAddress(addr)) { if (callback) callback(addr); return; }
        toUserFriendlyAddress(addr, callback || function() {});
    };

    window.tonConnectConnector.restoreConnection().then(function() {
        if (typeof window.updateTonkeeperButton === 'function') window.updateTonkeeperButton();
    }).catch(function() {});

    window.tonConnectConnector.onStatusChange(function(wallet) {
        var conn = window.tonConnectConnector;

        function saveAddr(addr) {
            if (addr) {
                try {
                    localStorage.setItem(connectedKey, 'true');
                    localStorage.setItem(addrKey, addr);
                    if (!localStorage.getItem(balanceKey)) localStorage.setItem(balanceKey, '0');
                } catch (e) {}
            } else {
                try {
                    localStorage.removeItem(connectedKey);
                    localStorage.removeItem(addrKey);
                    localStorage.removeItem(balanceKey);
                } catch (e) {}
            }
            if (typeof window.updateTonkeeperButton === 'function') window.updateTonkeeperButton();
            try { window.dispatchEvent(new CustomEvent('tonkeeperAddressUpdated')); } catch (e) {}
        }

        function applyAddr() {
            if (!conn || !conn.connected) { saveAddr(''); return; }
            var addr = getAccountAddress(conn);
            if (addr) {
                toUserFriendlyAddress(addr, function(friendly) { saveAddr(friendly); });
                return;
            }
            setTimeout(function() {
                if (!conn || !conn.connected) { saveAddr(''); return; }
                addr = getAccountAddress(conn);
                if (addr) toUserFriendlyAddress(addr, function(friendly) { saveAddr(friendly); });
            }, 200);
        }

        setTimeout(applyAddr, 0);
    });
})();
