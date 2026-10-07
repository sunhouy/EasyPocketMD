const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../../api/models/User', () => ({login:jest.fn()}));
const app = express();app.use(express.json());app.use('/user_files',require('../../api/routes/user_files'));
const token = (username) => jwt.sign({username},process.env.JWT_SECRET || 'your-secret-key-change-in-production');
const fs = require('fs');
afterEach(()=>jest.restoreAllMocks());
it('lists files using a JWT even when the encrypted account retains no password', async()=>{
    jest.spyOn(fs,'existsSync').mockReturnValue(false);
    const res=await request(app).post('/user_files/list').set('Authorization','Bearer '+token('user')).send({username:'user'});
    expect(res.body).toMatchObject({code:200,data:[]});
});
it('rejects a token belonging to another user', async()=>{
    const res=await request(app).post('/user_files/list').set('Authorization','Bearer '+token('other')).send({username:'user'});
    expect(res.body.code).toBe(401);
});
it('applies the same token check to file deletion', async()=>{
    const res=await request(app).post('/user_files/delete').send({username:'user',token:token('other'),filename:'note.md'});
    expect(res.body.code).toBe(401);
});
it('returns the upload timestamp independently of subsequent filesystem modifications',async()=>{
    jest.spyOn(fs,'existsSync').mockReturnValue(true);
    jest.spyOn(fs,'readdirSync').mockReturnValue(['1720000000000_file.pdf']);
    jest.spyOn(fs,'statSync').mockReturnValue({isFile:()=>true,size:10,mtime:new Date('2026-10-07'),birthtimeMs:1,birthtime:new Date(1)});
    const res=await request(app).post('/user_files/list').set('Authorization','Bearer '+token('user')).send({username:'user'});
    expect(res.body.data[0].uploadedAt).toBe(new Date(1720000000000).toISOString());
});
