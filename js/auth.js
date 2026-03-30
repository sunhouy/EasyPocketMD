/**
 * 用户认证 - 登录、注册、登出、登录模态
 * 添加了登录/注册按钮的防抖处理，防止重复提交
 * 添加了 Token 验证和刷新功能
 */
(function(global) {
    'use strict';

    // 防抖标志
    let _loginSubmitting = false;
    let _registerSubmitting = false;

    // 辅助函数：获取翻译
    function t(key) {
        return global.i18n ? global.i18n.t(key) : key;
    }

    /**
     * 验证 Token 是否有效
     * @returns {Promise<boolean>} 是否有效
     */
    async function verifyToken() {
        if (!global.currentUser || !global.currentUser.token) {
            return false;
        }
        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/verify';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: global.currentUser.username,
                    token: global.currentUser.token
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            return result.code === 200;
        } catch (error) {
            console.error('Token 验证错误:', error);
            return false;
        }
    }

    /**
     * 刷新 Token（使用密码重新登录）
     * @returns {Promise<boolean>} 是否成功
     */
    async function refreshToken() {
        if (!global.currentUser || !global.currentUser.password) {
            return false;
        }
        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: global.currentUser.username,
                    password: global.currentUser.password
                })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            if (result.code === 200 && result.data.token) {
                global.currentUser.token = result.data.token;
                localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Token 刷新错误:', error);
            return false;
        }
    }

    /**
     * 处理 Token 过期或无效的情况
     * 尝试刷新 Token，如果失败则提示用户重新登录
     * @returns {Promise<boolean>} 是否成功处理
     */
    async function handleTokenExpired() {
        // 尝试刷新 Token
        const refreshed = await refreshToken();
        if (refreshed) {
            global.showMessage(t('tokenRefreshed'), 'success');
            return true;
        }

        // 刷新失败，清除登录状态并提示重新登录
        global.currentUser = null;
        localStorage.removeItem('vditor_user');
        showUserInfo();
        global.showMessage(t('sessionExpiredPleaseLogin'), 'warning');
        showLoginModal();
        return false;
    }

    /**
     * 检查 API 响应是否为 Token 错误
     * @param {Object} result - API 响应结果
     * @returns {boolean} 是否为 Token 错误
     */
    function isTokenError(result) {
        if (!result) return false;
        if (result.code === 401) return true;
        if (result.message && (
            result.message.includes('Token验证失败') ||
            result.message.includes('token') ||
            result.message.includes('Token') ||
            result.message.includes('过期') ||
            result.message.includes('expired')
        )) return true;
        return false;
    }

    /**
     * 执行需要认证的 API 请求，自动处理 Token 过期
     * @param {string} url - API URL
     * @param {Object} options - fetch 选项
     * @returns {Promise<Object>} API 响应
     */
    async function authenticatedFetch(url, options = {}) {
        // 确保 headers 存在
        if (!options.headers) options.headers = {};

        // 添加认证头
        if (global.currentUser && global.currentUser.token) {
            options.headers['Authorization'] = 'Bearer ' + global.currentUser.token;
        }

        let response = await fetch(url, options);
        let result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

        // 如果是 Token 错误，尝试刷新并重试
        if (isTokenError(result)) {
            const handled = await handleTokenExpired();
            if (handled) {
                // 使用新 Token 重试
                if (global.currentUser && global.currentUser.token) {
                    options.headers['Authorization'] = 'Bearer ' + global.currentUser.token;
                }
                response = await fetch(url, options);
                result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();
            } else {
                // 刷新失败，返回错误
                throw new Error(t('sessionExpired'));
            }
        }

        return result;
    }

    function showUserInfo() {
        const mobileLoginBtn = document.getElementById('mobileLoginBtn');
        if (mobileLoginBtn) {
            if (global.currentUser) {
                mobileLoginBtn.classList.add('logged-in');
                mobileLoginBtn.title = t('userMenu');
            } else {
                mobileLoginBtn.classList.remove('logged-in');
                mobileLoginBtn.title = t('login');
            }
        }
    }

    function showLoginModal() {
        const modal = document.getElementById('loginModalOverlay');
        if (!modal) return;
        modal.classList.add('show');
        switchToRegisterTab();
        bindModalEvents();
        document.addEventListener('keydown', handleModalKeydown);
    }

    function hideLoginModal() {
        const modal = document.getElementById('loginModalOverlay');
        if (!modal) return;
        modal.classList.remove('show');
        document.removeEventListener('keydown', handleModalKeydown);
    }

    function bindModalEvents() {
        const loginModalCloseBtn = document.getElementById('loginModalCloseBtn');
        if (loginModalCloseBtn) loginModalCloseBtn.onclick = hideLoginModal;

        const loginSubmitBtn = document.getElementById('loginSubmitBtn');
        if (loginSubmitBtn) loginSubmitBtn.onclick = login;

        const registerSubmitBtn = document.getElementById('registerSubmitBtn');
        if (registerSubmitBtn) registerSubmitBtn.onclick = register;

        const loginTabBtn = document.getElementById('loginTabBtn');
        const registerTabBtn = document.getElementById('registerTabBtn');
        if (loginTabBtn) loginTabBtn.onclick = switchToLoginTab;
        if (registerTabBtn) registerTabBtn.onclick = switchToRegisterTab;
    }

    function handleModalKeydown(e) {
        if (e.key === 'Enter') {
            if (document.getElementById('loginForm').style.display !== 'none') {
                login();
            } else {
                register();
            }
        }
        if (e.key === 'Escape') hideLoginModal();
    }

    function switchToLoginTab() {
        const loginTabBtn = document.getElementById('loginTabBtn');
        const registerTabBtn = document.getElementById('registerTabBtn');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const modalTitle = document.getElementById('modalTitle');
        const modalSubtitle = document.getElementById('modalSubtitle');
        if (loginTabBtn) loginTabBtn.classList.add('active');
        if (registerTabBtn) registerTabBtn.classList.remove('active');
        if (loginForm) loginForm.style.display = 'flex';
        if (registerForm) registerForm.style.display = 'none';
        if (modalTitle) modalTitle.textContent = t('loginRegister');
        if (modalSubtitle) modalSubtitle.textContent = t('pleaseLoginToSave');
        // 清空消息
        const loginMessage = document.getElementById('loginMessage');
        if (loginMessage) {
            loginMessage.textContent = '';
            loginMessage.className = 'modal-message';
        }
    }

    function switchToRegisterTab() {
        const loginTabBtn = document.getElementById('loginTabBtn');
        const registerTabBtn = document.getElementById('registerTabBtn');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const modalTitle = document.getElementById('modalTitle');
        const modalSubtitle = document.getElementById('modalSubtitle');
        if (registerTabBtn) registerTabBtn.classList.add('active');
        if (loginTabBtn) loginTabBtn.classList.remove('active');
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'flex';
        if (modalTitle) modalTitle.textContent = t('loginRegister');
        if (modalSubtitle) modalSubtitle.textContent = t('registerNewAccount');
        // 清空消息
        const registerMessage = document.getElementById('registerMessage');
        if (registerMessage) {
            registerMessage.textContent = '';
            registerMessage.className = 'modal-message';
        }
    }

    async function login() {
        // 防抖：如果正在提交则直接返回
        if (_loginSubmitting) return;
        _loginSubmitting = true;

        const username = document.getElementById('loginUsername')?.value.trim();
        const password = document.getElementById('loginPassword')?.value.trim();
        const message = document.getElementById('loginMessage');

        if (!username || !password) {
            if (message) {
                message.textContent = t('enterUsernameAndPassword');
                message.className = 'modal-message error';
            }
            _loginSubmitting = false;
            return;
        }

        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (message) {
                if (result.code === 200) {
                    // 使用后端返回的 JWT token，如果没有则使用密码进行后续验证
                    global.currentUser = {
                        username: username,
                        token: result.data.token,
                        password: password
                    };
                    localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
                    message.textContent = t('loginSuccessSyncing');
                    message.className = 'modal-message success';

                    setTimeout(() => {
                        hideLoginModal();
                        showUserInfo();
                        global.showMessage(t('loginSuccessStartSync'));
                        if (global.startAutoSync) global.startAutoSync();
                        if (global.loadFilesFromServer) global.loadFilesFromServer();
                        // 隐藏顶部提示横幅
                        if (global.hideTopNoticeBanner) global.hideTopNoticeBanner();
                    }, 1500);
                } else {
                    message.textContent = result.message || t('loginFailed');
                    message.className = 'modal-message error';
                }
            }
        } catch (error) {
            console.error('登录错误:', error);
            if (message) {
                message.textContent = t('networkErrorPleaseRetry');
                message.className = 'modal-message error';
            }
        } finally {
            // 无论成功或失败，都释放锁，允许再次提交
            _loginSubmitting = false;
        }
    }

    async function register() {
        // 防抖：如果正在提交则直接返回
        if (_registerSubmitting) return;
        _registerSubmitting = true;

        const username = document.getElementById('registerUsername')?.value.trim();
        const password = document.getElementById('registerPassword')?.value.trim();
        const inviteCode = document.getElementById('registerInviteCode')?.value.trim();
        const message = document.getElementById('registerMessage');

        if (!username || !password) {
            if (message) {
                message.textContent = t('enterUsernameAndPassword');
                message.className = 'modal-message error';
            }
            _registerSubmitting = false;
            return;
        }

        try {
            const requestBody = { username: username, password: password };
            if (inviteCode) requestBody.invite_code = inviteCode;

            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/register';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (message) {
                if (result.code === 200) {
                    // 注册成功后，调用登录接口获取 JWT token
                    const loginResponse = await fetch((global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: username, password: password })
                    });
                    const loginResult = global.parseJsonResponse ? await global.parseJsonResponse(loginResponse) : await loginResponse.json();

                    if (loginResult.code === 200) {
                        global.currentUser = {
                            username: username,
                            token: loginResult.data.token,
                            password: password
                        };
                        localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
                        message.textContent = t('registerSuccessAutoLogin');
                        message.className = 'modal-message success';

                        setTimeout(() => {
                            hideLoginModal();
                            showUserInfo();
                            global.showMessage(t('registerSuccessStartSync'));
                            if (global.startAutoSync) global.startAutoSync();
                            if (global.loadFilesFromServer) global.loadFilesFromServer();
                        }, 1500);
                    } else {
                        // 登录失败，但仍显示注册成功，让用户手动登录
                        message.textContent = t('registerSuccessAutoLogin');
                        message.className = 'modal-message success';
                        setTimeout(() => {
                            switchToLoginTab();
                        }, 1500);
                    }
                } else if (result.code === 409) {
                    // 用户已存在，尝试自动登录
                    message.textContent = t('userExistsTryingLogin');
                    message.className = 'modal-message';

                    const loginResponse = await fetch((global.getApiBaseUrl ? global.getApiBaseUrl() : 'api') + '/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: username, password: password })
                    });
                    const loginResult = global.parseJsonResponse ? await global.parseJsonResponse(loginResponse) : await loginResponse.json();

                    if (loginResult.code === 200) {
                        // 密码正确，自动登录成功
                        global.currentUser = {
                            username: username,
                            token: loginResult.data.token,
                            password: password
                        };
                        localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
                        message.textContent = t('autoLoginSuccess');
                        message.className = 'modal-message success';

                        setTimeout(() => {
                            hideLoginModal();
                            showUserInfo();
                            global.showMessage(t('loginSuccessStartSync'));
                            if (global.startAutoSync) global.startAutoSync();
                            if (global.loadFilesFromServer) global.loadFilesFromServer();
                            // 隐藏顶部提示横幅
                            if (global.hideTopNoticeBanner) global.hideTopNoticeBanner();
                        }, 1500);
                    } else {
                        // 密码错误
                        message.textContent = t('userExistsPasswordIncorrect');
                        message.className = 'modal-message error';
                        setTimeout(() => {
                            switchToLoginTab();
                        }, 1500);
                    }
                } else {
                    message.textContent = result.message || t('registerFailed');
                    message.className = 'modal-message error';
                }
            }
        } catch (error) {
            console.error('注册错误:', error);
            if (message) {
                message.textContent = t('networkErrorPleaseRetry');
                message.className = 'modal-message error';
            }
        } finally {
            // 释放锁
            _registerSubmitting = false;
        }
    }

    async function logout() {
        const files = global.files || [];
        const unsavedChanges = global.unsavedChanges || {};
        let hasUnsaved = false;
        files.forEach(function(file) {
            if (unsavedChanges[file.id]) hasUnsaved = true;
        });

        if (hasUnsaved) {
            const confirmed = await g('customConfirm')(t('unsavedFilesSave'));
            if (confirmed) {
                if (global.syncAllFiles) await global.syncAllFiles();
            }
        }

        if (global.stopAutoSync) global.stopAutoSync();
        global.currentUser = null;
        localStorage.removeItem('vditor_user');
        // 清除未登录提示横幅的关闭状态，让下次打开时重新显示
        localStorage.removeItem('guestNoticeDismissed');
        showUserInfo();
        if (global.clearAutoSave) global.clearAutoSave();
        showLoginModal();
        global.showMessage(t('loggedOut'));
        // 显示未登录用户提示横幅
        if (global.showGuestNoticeBanner) global.showGuestNoticeBanner();
    }

    function handleLoginButtonClick(e) {
        if (global.currentUser) {
            const dropdown = document.getElementById('userMenuDropdown');
            if (dropdown) {
                const userInfoItem = document.getElementById('userInfoItem');
                if (userInfoItem) {
                    userInfoItem.innerHTML = '<i class="fas fa-user"></i> ' + global.currentUser.username;
                }
                const logoutItem = document.getElementById('logoutItem');
                if (logoutItem) {
                    logoutItem.onclick = logout;
                }
                dropdown.classList.toggle('show');
            }
        } else {
            showLoginModal();
        }
        e.stopPropagation();
    }

    global.showUserInfo = showUserInfo;
    global.showLoginModal = showLoginModal;
    global.hideLoginModal = hideLoginModal;
    global.handleLoginButtonClick = handleLoginButtonClick;
    global.logout = logout;
    global.verifyToken = verifyToken;
    global.refreshToken = refreshToken;
    global.handleTokenExpired = handleTokenExpired;
    global.isTokenError = isTokenError;
    global.authenticatedFetch = authenticatedFetch;

})(typeof window !== 'undefined' ? window : this);