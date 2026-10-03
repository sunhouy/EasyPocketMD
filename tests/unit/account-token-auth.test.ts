export {};
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../../api/models/User', () => ({login:jest.fn(),deleteAccount:jest.fn().mockResolvedValue({code:200})}));
jest.mock('../../api/utils/e2e-vault', () => ({ensureSchema:jest.fn().mockResolvedValue(undefined)}));
const user = require('../../api/models/User');
const app = express(); app.use(express.json()); app.use('/auth',require('../../api/routes/auth'));
const token = username => jwt.sign({username},process.env.JWT_SECRET || 'your-secret-key-change-in-production');
beforeEach(()=>jest.clearAllMocks());
it('allows account deletion with a valid login token and no cached password',async()=>{
    const response = await request(app).post('/auth/delete_account').send({username:'user',token:token('user')});
    expect(response.body.code).toBe(200);
    expect(user.deleteAccount).toHaveBeenCalledWith('user',true);
    expect(user.login).not.toHaveBeenCalled();
});
it('rejects another account token before invoking account deletion',async()=>{
    const response = await request(app).post('/auth/delete_account').send({username:'user',token:token('other')});
    expect(response.body.code).toBe(401);
    expect(user.deleteAccount).not.toHaveBeenCalled();
});
it('rejects missing authentication instead of interpreting it as an encryption password',async()=>{
    const response = await request(app).post('/auth/delete_account').send({username:'user'});
    expect(response.body.code).toBe(400);
    expect(user.deleteAccount).not.toHaveBeenCalled();
});
