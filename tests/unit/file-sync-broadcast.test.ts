// @ts-nocheck
import { EventEmitter } from 'events';
jest.mock('../../api/utils/auth',()=>({verifyJwtToken:()=>({username:'user'})}));
jest.mock('../../api/models/FileManager',()=>({saveFile:jest.fn(),getUserFiles:jest.fn()}));
jest.mock('ws',()=>({WebSocketServer:class extends (require('events').EventEmitter) {clients=new Set();}}));
const {initFileSyncServer,broadcastToUser}=require('../../api/realtime/fileSyncServer');
const fileManager=require('../../api/models/FileManager');
function setup(){
    const server=initFileSyncServer({});
    const socket=new EventEmitter();socket.readyState=1;socket.send=jest.fn();socket.close=jest.fn();
    server.emit('connection',socket,{url:'/api/files/ws?token=t'});
    return {server,socket};
}
afterEach(()=>jest.restoreAllMocks());
it('broadcasts committed HTTP saves to signed-in sockets and removes closed peers',()=>{
    const {server,socket}=setup();
    try{broadcastToUser('user',{type:'file_updated',filename:'a.md',content:'latest',content_version:2});
        expect(JSON.parse(socket.send.mock.calls.at(-1)[0])).toMatchObject({content:'latest',content_version:2});
        socket.emit('close');socket.send.mockClear();broadcastToUser('user',{content:'later'});expect(socket.send).not.toHaveBeenCalled();
    }finally{server.emit('close');}
});
it.each([200,409])('uses strict conflict policy for legacy websocket writes, including empty responses: %s',async code=>{
    const {server,socket}=setup();
    fileManager.saveFile.mockResolvedValue({code,data:{content:'',content_version:3,e2e_enabled:0}});
    try{await socket.listeners('message')[0](JSON.stringify({type:'file_save',filename:'a.md',content:'old',base_content:'base',base_content_version:1}));
        expect(fileManager.saveFile).toHaveBeenCalledWith('user','a.md','old',{base_content:'base',base_content_version:1},{e2e_enabled:0,conflict_strategy:'strict'});
        expect(JSON.parse(socket.send.mock.calls.at(-1)[0])).toMatchObject({type:'file_saved',code,content:'',content_version:3});
    }finally{socket.emit('close');server.emit('close');}
});
