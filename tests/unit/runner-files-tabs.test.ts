/** @jest-environment jsdom */
import {RunnerFilesUi} from '../../js/code-runner-files';
it('separates result, file upload and terminal views without losing workspace contents',async()=>{
 const fetchMock=jest.fn().mockResolvedValue({ok:true,json:async()=>({token:'workspace',files:[{name:'a.txt',path:'/tmp/home/a.txt',size:4}],directories:[]})});global.fetch=fetchMock as any;
 const panel=document.createElement('div'),onTab=jest.fn();const ui=new RunnerFilesUi({},()=>false,async()=>({success:true,output:'ok'}),onTab);ui.attach(panel);
 expect(panel.querySelector('[aria-selected=true]')?.textContent).toBe('运行结果');
 await ui.show('files');expect(ui.toolsVisible).toBe(true);expect(panel.textContent).toContain('上传文件');expect(panel.textContent).toContain('/tmp/home/a.txt');expect(panel.querySelector('form')).toBeNull();
 await ui.show('terminal');expect(panel.querySelector('form')).not.toBeNull();expect(panel.textContent).not.toContain('上传文件');expect(panel.querySelector('[aria-selected=true]')?.textContent).toBe('命令行');
 ui.showResult();expect(ui.toolsVisible).toBe(false);expect(onTab).toHaveBeenLastCalledWith(false);expect(panel.querySelector('form')).toBeNull();
 ui.setMinimized(true);expect((panel.firstChild as HTMLElement).hidden).toBe(true);ui.setMinimized(false);expect((panel.firstChild as HTMLElement).hidden).toBe(false);
 await ui.show('files');expect(panel.textContent).toContain('/tmp/home/a.txt');
});
