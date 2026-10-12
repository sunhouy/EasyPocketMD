/** Colors are passed as data so native surfaces follow web theme overrides. */
export function nativePalette(): string {
    const style=getComputedStyle(document.body),colors:Record<string,string>={};
    for(const key of ['surface','container','field','text','muted','outline','primary','primary-text','selected','danger']) {
        let value=style.getPropertyValue('--md-'+key).trim();
        const rgb=value.match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
        if(rgb)value='#'+rgb.slice(1,4).map(channel=>Number(channel).toString(16).padStart(2,'0')).join('');
        if(/^#[\da-f]{6}$/i.test(value))colors[key]=value;
    }
    return JSON.stringify(colors);
}
