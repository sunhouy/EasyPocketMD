/** @jest-environment jsdom */
// @ts-nocheck
const destroy = jest.fn();
jest.mock('l2d', () => ({ init: () => ({ on: jest.fn(), load: async () => {}, destroy }) }), { virtual: true });
jest.mock('../../js/ui/live2d-assets', () => ({ prepareCachedModel: async () => ({ path: 'data:,model', dispose: jest.fn() }) }));
jest.mock('../../js/ui/ai-assistant', () => ({}));
import { mountLive2D } from '../../js/ui/live2d-companion';
import { LIVE2D_MODELS } from '../../js/main/live2d-models';
import { live2DPreference } from '../../js/main/live2d-settings';
it('accepts all nine choices and shows only the clickable character after loading', async () => {
    expect(Object.keys(LIVE2D_MODELS)).toHaveLength(9);
    for (const model of Object.keys(LIVE2D_MODELS)) expect(live2DPreference({ enabled: true, model }).model).toBe(model);
    window.showAIQueryPanel = jest.fn();
    const mounted = await mountLive2D('nico', new AbortController().signal);
    const host = document.getElementById('live2dCompanion');
    expect(host.querySelectorAll('canvas')).toHaveLength(1); expect(host.textContent).toBe(''); expect(host.querySelector('button')).toBeNull();
    host.querySelector('canvas').click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(window.showAIQueryPanel).toHaveBeenCalledTimes(1);
    mounted.destroy(); expect(document.getElementById('live2dCompanion')).toBeNull();
});
