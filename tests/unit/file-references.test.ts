import {findFileReferences, resourceKey, uploadDate} from '../../js/ui/file-references';
it('matches exact resource paths across domestic/overseas hosts and encoded links',()=>{
    const files=[{url:'https://md.yhsun.cn/user_files/alice/123_中文.png'},{url:'/user_files/alice/unused.pdf'}];
    const references=findFileReferences(files,[
        {path:'目录/笔记.md',content:'![图](https://us.yhsun.cn/user_files/alice/123_%E4%B8%AD%E6%96%87.png#epmd-encrypted)'},
        {path:'another.md',content:'<img src="/user_files/alice/123_中文.png">'},
        {path:'wrong.md',content:'[不是同一个文件](/user_files/alice/unused.pdf.bak)'}
    ]);
    expect(references.get(files[0].url)).toEqual(['目录/笔记.md','another.md']);
    expect(references.get(files[1].url)).toEqual([]);
    expect(resourceKey('local://some/file.png#marker')).toBe('local://some/file.png');
});
it('uses upload metadata or a stored timestamp and handles missing dates',()=>{
    expect(uploadDate({name:'alice_1720000000000_note.md'})).toBe(new Date(1720000000000).toISOString());
    expect(uploadDate({uploadedAt:'2026-10-07T01:00:00Z',mtime:'2026-10-08'})).toBe('2026-10-07T01:00:00.000Z');
    expect(uploadDate({})).toBeUndefined();expect(uploadDate({date:'invalid'})).toBeUndefined();
});
