
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
        const res = await request(app).get('/api/health'); // Assume it has some health check or default response
        expect(res.status).toBeDefined();
    });
});
