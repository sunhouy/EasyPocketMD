/**
 * 用户认证 - 登录、注册、登出、登录模态
 * 添加了登录/注册按钮的防抖处理，防止重复提交
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
        switchToLoginTab();
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
        const loginCancelBtn = document.getElementById('loginCancelBtn');
        const registerCancelBtn = document.getElementById('registerCancelBtn');
        if (loginCancelBtn) loginCancelBtn.onclick = hideLoginModal;
        if (registerCancelBtn) registerCancelBtn.onclick = hideLoginModal;

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
        if (modalTitle) modalTitle.textContent = t('login');
        if (modalSubtitle) modalSubtitle.textContent = t('pleaseLoginToSave');
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
        if (modalTitle) modalTitle.textContent = t('register');
        if (modalSubtitle) modalSubtitle.textContent = t('registerNewAccount');
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

})(typeof window !== 'undefined' ? window : this);