const express = require('express');

const router = express.Router();

const MAX_STATUS_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PAGE_COUNT = 60;
const MAX_TASKS_PER_USER = 10;
const taskStore = new Map();

function getActor(req) {
    const body = req.body || {};
    return String(
        body.username ||
        req.query.username ||
        req.get('x-ppt-user') ||
        req.get('authorization') ||
        'anonymous'
    ).trim().slice(0, 128) || 'anonymous';
}

function getStoreKey(actor, taskId) {
    return actor + ':' + taskId;
}

function sanitizeTaskId(taskId) {
    return String(taskId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function sanitizeOutline(outline) {
    if (!Array.isArray(outline)) return [];
    return outline.slice(0, MAX_PAGE_COUNT).map((page, index) => ({
        number: Number(page && page.number) || index + 1,
        title: String((page && page.title) || '').slice(0, 200),
        content: Array.isArray(page && page.content)
            ? page.content.slice(0, 20).map(item => String(item).slice(0, 1000))
            : [],
        role: page && page.role ? String(page.role).slice(0, 40) : undefined
    }));
}

function sanitizePages(pages) {
    if (!Array.isArray(pages)) return [];
    return pages.slice(0, MAX_PAGE_COUNT).map(page => page || null);
}

function cleanupExpiredTasks() {
    const now = Date.now();
    for (const [key, value] of taskStore.entries()) {
        if (!value || now - new Date(value.updatedAt || value.createdAt || 0).getTime() > MAX_STATUS_AGE_MS) {
            taskStore.delete(key);
        }
    }
}

function limitUserTasks(actor) {
    const userEntries = [];
    for (const [key, value] of taskStore.entries()) {
        if (key.startsWith(actor + ':')) {
            userEntries.push([key, value]);
        }
    }

    userEntries
        .sort((a, b) => new Date(b[1].updatedAt || 0) - new Date(a[1].updatedAt || 0))
        .slice(MAX_TASKS_PER_USER)
        .forEach(([key]) => taskStore.delete(key));
}

router.get('/latest', (req, res) => {
    cleanupExpiredTasks();
    const actor = getActor(req);
    let latest = null;

    for (const [key, value] of taskStore.entries()) {
        if (!key.startsWith(actor + ':')) continue;
        if (value && value.status === 'completed') continue;
        if (!latest || new Date(value.updatedAt || 0) > new Date(latest.updatedAt || 0)) {
            latest = value;
        }
    }

    res.json({
        code: 200,
        message: 'success',
        data: latest
    });
});

router.get('/:taskId', (req, res) => {
    cleanupExpiredTasks();
    const taskId = sanitizeTaskId(req.params.taskId);
    const actor = getActor(req);
    const status = taskStore.get(getStoreKey(actor, taskId)) || null;

    res.json({
        code: 200,
        message: 'success',
        data: status
    });
});

function saveTaskStatus(req, res) {
    cleanupExpiredTasks();
    const taskId = sanitizeTaskId(req.params.taskId);
    if (!taskId) {
        return res.status(400).json({
            code: 400,
            message: 'Invalid PPT task id'
        });
    }

    const actor = getActor(req);
    const now = new Date().toISOString();
    const existing = taskStore.get(getStoreKey(actor, taskId)) || {};
    const body = req.body || {};
    const outline = sanitizeOutline(body.outline || existing.outline);
    const incomingPages = Array.isArray(body.pages) && body.pages.length > 0 ? body.pages : existing.pages;
    const pages = sanitizePages(incomingPages);
    const generatedPages = pages.reduce((count, page) => count + (page ? 1 : 0), 0);

    const status = {
        taskId,
        username: actor,
        topic: String(body.topic || existing.topic || '').slice(0, 200),
        outline,
        pages,
        ratio: body.ratio === '4:3' ? '4:3' : (body.ratio || existing.ratio || '16:9'),
        source: String(body.source || existing.source || 'current').slice(0, 40),
        colorScheme: String(body.colorScheme || existing.colorScheme || 'white-black').slice(0, 60),
        isAcademic: !!(body.isAcademic !== undefined ? body.isAcademic : existing.isAcademic),
        currentPage: Number.isFinite(Number(body.currentPage)) ? Number(body.currentPage) : (existing.currentPage || 0),
        totalPages: outline.length || pages.length || Number(body.totalPages) || existing.totalPages || 0,
        generatedPages,
        status: String(body.status || existing.status || 'generating').slice(0, 40),
        createdAt: existing.createdAt || now,
        updatedAt: now
    };

    taskStore.set(getStoreKey(actor, taskId), status);
    limitUserTasks(actor);

    res.json({
        code: 200,
        message: 'success',
        data: status
    });
}

router.put('/:taskId', saveTaskStatus);
router.post('/:taskId', saveTaskStatus);

router.delete('/:taskId', (req, res) => {
    const taskId = sanitizeTaskId(req.params.taskId);
    const actor = getActor(req);
    taskStore.delete(getStoreKey(actor, taskId));

    res.json({
        code: 200,
        message: 'success'
    });
});

module.exports = router;
