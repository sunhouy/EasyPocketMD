export function renderStorageUsage(list:HTMLElement, rows:{label:string;value:string}[]) {
    const ids=['clearLocalStorageBtn','clearIndexedDBBtn','clearCacheStorageBtn','clearCookiesBtn','clearServiceWorkerBtn'];
    const buttons=ids.map(id=>document.getElementById(id));
    list.replaceChildren();
    rows.forEach((row,index)=>{
        const line=document.createElement('div');line.className='storage-usage-row';
        const label=document.createElement('span');label.textContent=row.label;
        const value=document.createElement('strong');value.textContent=row.value;
        line.append(label);if(buttons[index])line.append(buttons[index]);line.append(value);list.append(line);
    });
}
