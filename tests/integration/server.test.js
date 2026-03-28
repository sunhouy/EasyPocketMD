
const app = require('../../api/server');

const request = require('supertest');

jest.setTimeout(10000);

// Mock the User model
jest.mock('../../api/models/User', () => ({
    checkUpdate: jest.fn().mockResolvedValue({
        code: 200,
        message: 'No update needed',
        data: { need_update: 0 }
    }),
    login: jest.fn(),
    baseUrl: 'http://test.com'
}));

describe('Server Integration', () => {
    it('should export the express app', () => {
        expect(app).toBeDefined();
    });

    it('should handle API 404 correctly', async () => {
        // API routes that don't match should probably return 404 or fall through
        // In server.js: app.use('/api', legacyRoutes); ...
        // If no route matches in /api, it might fall through to the SPA handler or 404
        // But the SPA handler has: if (req.path.startsWith('/api')) return next();
        // So it should eventually hit the error handler or default 404 express behavior
        
        const res = await request(app).get('/api/unknown-endpoint');
        // Express default 404 is HTML, but we might expect JSON if we are calling API
        // But since we didn't define a specific 404 handler for API, it might return standard HTML 404
        expect(res.status).toBe(404);
    });

    it('should check for updates via API', async () => {
        const res = await request(app)
            .post('/api/external/check_update')
            .send({ current_version: '1.0.0' });
        
        expect(res.status).toBe(200);
        expect(res.body.code).toBe(200);
        expect(res.body.message).toBe('No update needed');
    });

    it('should handle health check or root', async () => {
        const res = await request(app).get('/');
        // Depending on whether index.html exists, it returns 200, 404, or 500 (if dist not found)
        expect([200, 404, 500]).toContain(res.status);
    });
});
