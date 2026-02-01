/**
 * Общая инициализация TonConnect для profile.html и assets.html.
 * Единый источник адреса — conn.account (выбранный пользователем в Tonkeeper).
 */
(function() {
    if (window.tonConnectSharedLoaded) return;
    window.tonConnectSharedLoaded = true;

    var TonConnectClass = (typeof TonConnectSDK !== 'undefined' && TonConnectSDK.TonConnect) ? TonConnectSDK.TonConnect : (typeof TonConnect !== 'undefined' ? TonConnect : null);
    if (!TonConnectClass) {
        console.error('[TonConnect] SDK не загружен!');
        return;
    }

    var origin = window.location.origin || 'https://jetstoreapp.ru';
    var pathname = window.location.pathname || '';
    var repoPath = '';
    if (origin.indexOf('github.io') !== -1 && pathname.indexOf('/') !== -1) {
        var parts = pathname.split('/').filter(Boolean);
        if (parts.length > 0 && parts[0] !== 'html') {
            repoPath = '/' + parts[0];
        }
    }
    var manifestUrl = origin + repoPath + '/tonconnect-manifest.json';

    try {
        window.tonConnectConnector = new TonConnectClass({ manifestUrl: manifestUrl });
    } catch (e) {
        console.error('[TonConnect] Ошибка создания connector:', e);
        return;
    }

    // Единственный источник адреса — connector.account (официальный API SDK)
    window.getTonkeeperAddress = function() {
        var conn = window.tonConnectConnector;
        var addr = '';
        if (conn && conn.connected) {
            var acc = conn.account;
            if (!acc && conn.wallet) acc = conn.wallet.account;
            if (acc && typeof acc.address === 'string' && acc.address.trim()) {
                addr = acc.address.trim();
            }
        }
        if (!addr) {
            var saved = localStorage.getItem('jetstore_tonkeeper_address') || '';
            if (saved && saved.trim()) addr = saved.trim();
        }
        return addr;
    };

    window.tonConnectConnector.restoreConnection().then(function() {
        if (typeof window.updateTonkeeperButton === 'function') window.updateTonkeeperButton();
    }).catch(function() {});

    window.tonConnectConnector.onStatusChange(function(wallet) {
        var conn = window.tonConnectConnector;

        function saveAddr(addr) {
            if (addr) {
                try {
                    localStorage.setItem('jetstore_tonkeeper_connected', 'true');
                    localStorage.setItem('jetstore_tonkeeper_address', addr);
                    if (!localStorage.getItem('jetstore_tonkeeper_balance')) {
                        localStorage.setItem('jetstore_tonkeeper_balance', '0');
                    }
                } catch (e) {}
            } else {
                try {
                    localStorage.removeItem('jetstore_tonkeeper_connected');
                    localStorage.removeItem('jetstore_tonkeeper_address');
                    localStorage.removeItem('jetstore_tonkeeper_balance');
                } catch (e) {}
            }
            if (typeof window.updateTonkeeperButton === 'function') window.updateTonkeeperButton();
            try { window.dispatchEvent(new CustomEvent('tonkeeperAddressUpdated')); } catch (e) {}
        }

        function getAddr() {
            if (!conn || !conn.connected) return '';
            var acc = (wallet && wallet.account) || conn.account || (conn.wallet && conn.wallet.account);
            if (acc && typeof acc.address === 'string') return acc.address.trim();
            return '';
        }

        setTimeout(function() {
            var addr = getAddr();
            saveAddr(addr);
            if (!addr && conn && conn.connected) {
                setTimeout(function() { saveAddr(getAddr()); }, 100);
                setTimeout(function() { saveAddr(getAddr()); }, 300);
            }
        }, 0);
    });
})();
