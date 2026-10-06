import { installMarketUI } from './build-variant';
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installMarketUI);
else installMarketUI();
