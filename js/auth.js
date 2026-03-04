/**
 * 用户认证 - 登录、注册、登出、登录模态
 * 添加了登录/注册按钮的防抖处理，防止重复提交
 */
(function(global) {
    'use strict';

    // 防抖标志
    let _loginSubmitting = false;
    let _registerSubmitting = false;

    function showUserInfo() {
        const mobileLoginBtn = document.getElementById('mobileLoginBtn');
        if (mobileLoginBtn) {
            if (global.currentUser) {
                mobileLoginBtn.classList.add('logged-in');
                mobileLoginBtn.title = '用户菜单';
            } else {
                mobileLoginBtn.classList.remove('logged-in');
                mobileLoginBtn.title = '登录';
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
        if (modalTitle) modalTitle.textContent = '登录';
        if (modalSubtitle) modalSubtitle.textContent = '请登录以保存您的文档';
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
        if (modalTitle) modalTitle.textContent = '注册';
        if (modalSubtitle) modalSubtitle.textContent = '注册新账户以保存文档至服务器';
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
                message.textContent = '请输入用户名和密码';
                message.className = 'modal-message error';
            }
            _loginSubmitting = false;
            return;
        }

        try {
            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api/index.php') + '?action=login';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, password: password })
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (message) {
                if (result.code === 200) {
                    global.currentUser = {
                        username: username,
                        token: result.data.token || username,
                        password: password
                    };
                    localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
                    message.textContent = '登录成功！正在同步文件...';
                    message.className = 'modal-message success';

                    setTimeout(() => {
                        hideLoginModal();
                        showUserInfo();
                        global.showMessage('登录成功，开始同步文件');
                        if (global.startAutoSync) global.startAutoSync();
                        if (global.loadFilesFromServer) global.loadFilesFromServer();
                    }, 1500);
                } else {
                    message.textContent = result.message || '登录失败';
                    message.className = 'modal-message error';
                }
            }
        } catch (error) {
            console.error('登录错误:', error);
            if (message) {
                message.textContent = '网络错误，请稍后重试';
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
                message.textContent = '请输入用户名和密码';
                message.className = 'modal-message error';
            }
            _registerSubmitting = false;
            return;
        }

        try {
            const requestBody = { username: username, password: password };
            if (inviteCode) requestBody.invite_code = inviteCode;

            const apiUrl = (global.getApiBaseUrl ? global.getApiBaseUrl() : 'api/index.php') + '?action=register';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            const result = global.parseJsonResponse ? await global.parseJsonResponse(response) : await response.json();

            if (message) {
                if (result.code === 200) {
                    global.currentUser = {
                        username: username,
                        token: username,
                        password: password
                    };
                    localStorage.setItem('vditor_user', JSON.stringify(global.currentUser));
                    message.textContent = '注册成功！自动登录中...';
                    message.className = 'modal-message success';

                    setTimeout(() => {
                        hideLoginModal();
                        showUserInfo();
                        global.showMessage('注册成功，开始同步文件');
                        if (global.startAutoSync) global.startAutoSync();
                        if (global.loadFilesFromServer) global.loadFilesFromServer();
                    }, 1500);
                } else {
                    message.textContent = result.message || '注册失败';
                    message.className = 'modal-message error';
                }
            }
        } catch (error) {
            console.error('注册错误:', error);
            if (message) {
                message.textContent = '网络错误，请稍后重试';
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
            if (!confirm('有文件尚未保存，是否保存？')) {
                // 不保存
            } else {
                if (global.syncAllFiles) await global.syncAllFiles();
            }
        }

        if (global.stopAutoSync) global.stopAutoSync();
        global.currentUser = null;
        localStorage.removeItem('vditor_user');
        showUserInfo();
        if (global.clearAutoSave) global.clearAutoSave();
        showLoginModal();
        global.showMessage('已退出登录');
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