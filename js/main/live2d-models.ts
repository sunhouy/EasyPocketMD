// Metadata only: importing this catalog never fetches a model or loads the SDK.
export const LIVE2D_MODELS = {
    shizuku: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json',
    koharu: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-koharu@1.0.5/assets/koharu.model.json',
    hibiki: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-hibiki@1.0.5/assets/hibiki.model.json',
    nico: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-nico@1.0.5/assets/nico.model.json',
    haruto: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-haruto@1.0.5/assets/haruto.model.json',
    z16: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-z16@1.0.5/assets/z16.model.json',
    hijiki: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-hijiki@1.0.5/assets/hijiki.model.json',
    tororo: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-tororo@1.0.5/assets/tororo.model.json',
    wanko: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-wanko@1.0.5/assets/wanko.model.json'
};
export type Live2DModel = keyof typeof LIVE2D_MODELS;
export interface Live2DPreference { enabled: boolean; model: Live2DModel }

declare const __NATIVE_BUNDLE__: boolean;
export function live2dModelUrl(model:Live2DModel):string {
    if(typeof __NATIVE_BUNDLE__ !== 'undefined' && __NATIVE_BUNDLE__)return new URL('/native-resources/live2d/'+model+'/'+model+'.model.json',window.location.href).href;
    return LIVE2D_MODELS[model];
}
