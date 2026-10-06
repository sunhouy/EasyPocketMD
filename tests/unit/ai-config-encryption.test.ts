/** @jest-environment jsdom */
export {};
Object.defineProperty(globalThis, 'TextEncoder', {value: require('node:util').TextEncoder, configurable: true});
jest.mock('../../js/e2e',()=>({encrypt:jest.fn().mockResolvedValue('EPMD2:encrypted'),decrypt:jest.fn().mockResolvedValue('{"apiKey":"secret","model":"model"}')}));
const {syncAIConfigToCloud,loadAIConfigFromCloud}=require('../../js/ai-config');
const e2e=require('../../js/e2e');
beforeEach(()=>{
    localStorage.clear();jest.clearAllMocks();
    window.currentUser={username:'user',token:'jwt',password:'account-password'};
    window.E2EVault={...require('../../js/e2e-vault'),ensureUnlocked:jest.fn().mockResolvedValue(undefined),state:()=>({config:null})};
    window.getApiBaseUrl=()=>'/api';
    global.fetch=jest.fn().mockResolvedValue({json:async()=>({code:200,data:{content:'EPMD2:encrypted'}})});
});
afterEach(()=>{delete window.E2EVault;});
it('saves AI settings using only the authenticated account password',async()=>{
    await syncAIConfigToCloud({apiKey:'secret',baseUrl:'https://example.com',model:'model',syncToCloud:true});
    expect(window.E2EVault.ensureUnlocked).toHaveBeenCalled();
    expect(e2e.encrypt).toHaveBeenCalledWith(expect.any(String),'account-password');
    expect(JSON.parse(String(jest.mocked(fetch).mock.calls[0][1].body))).toMatchObject({token:'jwt',content:'EPMD2:encrypted'});
});
it('loads encrypted AI settings using the account password',async()=>{
    const config=await loadAIConfigFromCloud();expect(config.apiKey).toBe('secret');
    expect(e2e.decrypt).toHaveBeenCalledWith('EPMD2:encrypted','account-password');
});
it('does not send plaintext when unlock is cancelled',async()=>{
    jest.mocked(window.E2EVault.ensureUnlocked).mockRejectedValueOnce(Error('cancelled'));
    await expect(syncAIConfigToCloud({apiKey:'secret'})).rejects.toThrow('cancelled');
    expect(fetch).not.toHaveBeenCalled();
});
