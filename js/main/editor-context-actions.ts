import { loadFeature } from '../feature-loader';
export const contextInsertActions:[string,string,string,string][] = [
    ['code-block','code','代码块','Code block'],['inline-code','terminal','行内代码','Inline code'],
    ['formula','superscript','公式','Formula'],['chart','chart-bar','图表','Chart'],
    ['link','link','链接','Link'],['image','image','图片','Image'],['file','file','文件','File'],
    ['table','table','表格','Table'],['divider','minus','分割线','Divider'],['emoji','face-smile','表情','Emoji'],
    ['footnote','note-sticky','脚注','Footnote'],['mindmap','brain','脑图','Mind map'],
];
export async function contextInsert(action:string,app:any,restore:()=>void,insert:(text:string)=>void,valid:()=>boolean) {
    const loaders:Record<string,[string,()=>Promise<unknown>,string]>={
        formula:['formula-picker',()=>import('../formula-picker'),'showFormulaPicker'],
        chart:['ui/chart',()=>import('../ui/chart'),'showChartPicker'],
        emoji:['emoji-picker',()=>import('../emoji-picker'),'showEmojiPicker'],
        footnote:['ui/insert-picker',()=>import('../ui/insert-picker'),'showFootnotePicker'],
        mindmap:['ui/insert-picker',()=>import('../ui/insert-picker'),'showMindmapPicker'],
    };
    const simple:Record<string,string>={'inline-code':'`code`',divider:'\n\n---\n\n'};
    if(simple[action]){restore();insert(simple[action]);return;}
    const dialogs:Record<string,string>={'code-block':'showInsertCodeBlockDialog',link:'showInsertLinkDialog',table:'showInsertTableDialog',image:'triggerImageUpload',file:'triggerFileUpload'};
    let method=dialogs[action];
    const loader=loaders[action];
    if(loader){method=loader[2];if(!app[method])await loadFeature(loader[0],loader[1]);}
    if(!valid())throw Error('文档或光标已变化，请重新打开菜单');
    restore();
    if(typeof app[method]!=='function')throw Error('功能尚未就绪，请稍后重试');
    app[method]();
}
