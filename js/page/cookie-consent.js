    (function() {
        const euTimeZones = [
            'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid',
            'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Warsaw',
            'Europe/Athens', 'Europe/Helsinki', 'Europe/Riga', 'Europe/Vilnius',
            'Europe/Tallinn', 'Europe/Bucharest', 'Europe/Sofia', 'Europe/Zagreb',
            'Europe/Budapest', 'Europe/Prague', 'Europe/Bratislava', 'Europe/Ljubljana',
            'Europe/Vienna', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Luxembourg',
            'Europe/Copenhagen', 'Europe/Stockholm', 'Europe/Malta', 'Europe/Nicosia'
        ];

        // 判断用户是否位于欧盟时区
        function isEUUser() {
            try {
                const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                return timeZone && euTimeZones.includes(timeZone);
            } catch (e) {
                console.warn('获取时区失败，默认视为非欧盟用户', e);
                return false;   // 无法获取时区时，不显示横幅
            }
        }

        // 初始化 Cookie 同意逻辑
        function initCookieConsent() {
            const banner = document.getElementById('cookieConsentBanner');
            if (!banner) return;

            const hasConsent = localStorage.getItem('cookieConsent') === 'true';

            // 若已同意，直接隐藏横幅
            if (hasConsent) {
                banner.style.display = 'none';
                return;
            }

            // 未同意时：仅当用户位于欧盟时区才显示横幅
            if (isEUUser()) {
                banner.style.display = 'flex';  
            } else {
                banner.style.display = 'none';
            }

            // 绑定“接受”按钮事件
            const acceptBtn = document.getElementById('acceptCookiesBtn');
            if (acceptBtn) {
                acceptBtn.addEventListener('click', function() {
                    localStorage.setItem('cookieConsent', 'true');
                    banner.style.display = 'none';
                });
            }
        }

        // 等待 DOM 加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCookieConsent);
        } else {
            initCookieConsent();
        }
    })();
