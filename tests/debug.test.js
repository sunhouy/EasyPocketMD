
const express = require('express');

const request = require('supertest');

describe('Debug test', () => {
    it('should pass simple test', async () => {
        const app = express();
        app.get('/test', (req, res) => res.json({ ok: true }));
        const res = await request(app).get('/test');
        expect(res.body.ok).toBe(true);
    });

    it('should pass app test', async () => {
        const app = require('../api/server');
        const res = await request(app).get('/api/health');
        expect(res.status).toBeDefined();
    });

    it('should return 200 on health check endpoint', async () => {
        const app = require('../api/server');
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.message).toBe('Service is healthy');
        expect(res.body.timestamp).toBeDefined();
    });
});
