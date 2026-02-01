/**
 * TonConnect для profile.html и assets.html.
 * Показываем адрес кошелька из Tonkeeper — всегда берём conn.account (текущий выбранный в приложении).
 */
(function() {
    if (window.tonConnectSharedLoaded) return;
    window.tonConnectSharedLoaded = true;

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
                saveAddr(addr);
                return;
            }
            setTimeout(function() {
                if (!conn || !conn.connected) { saveAddr(''); return; }
                addr = getAccountAddress(conn);
                if (addr) saveAddr(addr);
            }, 200);
        }

        setTimeout(applyAddr, 0);
    });
})();
