const express = require('express');
const router = express.Router();
const notificationService = require('../services/notification');

router.get('/tasks', async (req, res) => {
    try {
        const userId = req.user ? req.user.username : req.query.userId;
        if (!userId) {
            return res.status(401).json({ code: 401, message: 'Unauthorized' });
        }

        const tasks = await notificationService.getUserTasks(userId);
        res.json({ code: 200, data: tasks });
    } catch (error) {
        console.error('Failed to get tasks:', error);
        res.status(500).json({ code: 500, message: 'Failed to get tasks' });
    }
});

router.get('/tasks/:taskId', async (req, res) => {
    try {
        const task = await notificationService.getTask(req.params.taskId);
        if (!task) {
            return res.status(404).json({ code: 404, message: 'Task not found' });
        }

        const userId = req.user ? req.user.username : req.query.userId;
        if (task.userId !== userId) {
            return res.status(403).json({ code: 403, message: 'Forbidden' });
        }

        res.json({ code: 200, data: task });
    } catch (error) {
        console.error('Failed to get task:', error);
        res.status(500).json({ code: 500, message: 'Failed to get task' });
    }
});

router.delete('/tasks/:taskId', async (req, res) => {
    try {
        await notificationService.deleteTask(req.params.taskId);
        res.json({ code: 200, message: 'Task deleted' });
    } catch (error) {
        console.error('Failed to delete task:', error);
        res.status(500).json({ code: 500, message: 'Failed to delete task' });
    }
});

router.post('/subscribe', (req, res) => {
    const userId = req.body.userId;
    if (!userId) {
        return res.status(400).json({ code: 400, message: 'userId is required' });
    }
    
    res.json({ code: 200, message: 'Subscribed', userId: userId });
});

module.exports = router;
