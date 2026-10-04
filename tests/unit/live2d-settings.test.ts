/** @jest-environment jsdom */
// @ts-nocheck
const destroy = jest.fn();
jest.mock('../../js/ui/live2d-companion', () => ({ mountLive2D: jest.fn(async () => ({ destroy })) }));
import { applyLive2D, live2DPreference } from '../../js/main/live2d-settings';
import { mountLive2D } from '../../js/ui/live2d-companion';
it('does not mount on a default visit, mounts only the selected character and releases it when disabled', async () => {
    expect(live2DPreference(undefined)).toEqual({ enabled: false, model: 'shizuku' });
    await applyLive2D(undefined); expect(mountLive2D).not.toHaveBeenCalled();
    await applyLive2D({ enabled: true, model: 'koharu' });
    expect(mountLive2D).toHaveBeenCalledWith('koharu', expect.any(AbortSignal));
    await applyLive2D({ enabled: true, model: 'koharu' }); expect(mountLive2D).toHaveBeenCalledTimes(1);
    await applyLive2D({ enabled: false }); expect(destroy).toHaveBeenCalledTimes(1);
});
