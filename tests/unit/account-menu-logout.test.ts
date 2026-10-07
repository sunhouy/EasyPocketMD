/** @jest-environment jsdom */
export {};
beforeEach(()=>{
 jest.resetModules();localStorage.clear();document.body.innerHTML='<button id="account"></button><div id="userMenuDropdown"><div id="accountListContainer"></div><button id="logoutItem"></button></div>';
 window.i18n={getLanguage:()=> 'zh',t:key=>key} as any;window.currentUser={username:'user',token:'token'};window.files=[];window.unsavedChanges={};window.showMessage=jest.fn();window.stopAutoSync=jest.fn();window.clearAutoSave=jest.fn();window.customConfirm=jest.fn().mockResolvedValue(false);
 require('../../js/auth');
});
it('places the account menu directly below the clicked icon rather than the old toolbar offset',()=>{
 const anchor=document.getElementById('account');anchor.getBoundingClientRect=()=>({left:200,right:236,top:35,bottom:71,width:36,height:36} as DOMRect);
 const menu=document.getElementById('userMenuDropdown');menu.getBoundingClientRect=()=>({width:220,height:160} as DOMRect);anchor.onclick=event=>window.handleLoginButtonClick(event);anchor.click();
 expect(menu.classList.contains('show')).toBe(true);expect(menu.style.position).toBe('fixed');expect(menu.style.top).toBe('77px');expect(menu.style.left).toBe('16px');
});
it('canceling logout retains the account, token and synchronization',async()=>{
 const user=window.currentUser;localStorage.setItem('vditor_user',JSON.stringify(user));await window.logout();expect(window.customConfirm).toHaveBeenCalledWith('确定退出当前账号登录吗？');expect(window.currentUser).toBe(user);expect(localStorage.getItem('vditor_user')).not.toBeNull();expect(window.stopAutoSync).not.toHaveBeenCalled();
});
it('confirmed logout clears the session',async()=>{
 window.customConfirm=jest.fn().mockResolvedValue(true);await window.logout();expect(window.currentUser).toBeNull();expect(window.stopAutoSync).toHaveBeenCalled();
});
it('does not log out a new session if the account changes while confirmation is open',async()=>{
 let resolve:any;window.customConfirm=jest.fn(()=>new Promise<boolean>(r=>{resolve=r;}));const pending=window.logout();const other={username:'other',token:'other'};window.currentUser=other;resolve(true);await pending;expect(window.currentUser).toBe(other);expect(window.stopAutoSync).not.toHaveBeenCalled();
});
