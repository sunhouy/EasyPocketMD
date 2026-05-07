const redis = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

class NotificationService {
    constructor() {
        this.TASK_PREFIX = 'export_task:';
        this.NOTIFICATION_PREFIX = 'notification:';
        this.TASK_TTL = 3600;
        this.TASK_STATUS = {
            PENDING: 'pending',
            PROCESSING: 'processing',
            COMPLETED: 'completed',
            FAILED: 'failed'
        };
    }

    async createTask(userId, taskType, metadata = {}) {
        const taskId = uuidv4();
        const task = {
            id: taskId,
            userId: userId,
            type: taskType,
            status: this.TASK_STATUS.PENDING,
            progress: 0,
            progressMessage: '等待中...',
            metadata: metadata,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            result: null,
            error: null
        };

        await redis.setex(
            this.TASK_PREFIX + taskId,
            this.TASK_TTL,
            JSON.stringify(task)
        );

        this.emitNotification(userId, {
            type: 'task_created',
            taskId: taskId,
            taskType: taskType,
            message: this.getTaskCreatedMessage(taskType, metadata)
        });

        return taskId;
    }

    async updateTask(taskId, updates) {
        const taskKey = this.TASK_PREFIX + taskId;
        const taskJson = await redis.get(taskKey);
        
        if (!taskJson) {
            return null;
        }

        const task = JSON.parse(taskJson);
        Object.assign(task, updates, {
            updatedAt: new Date().toISOString()
        });

        await redis.setex(taskKey, this.TASK_TTL, JSON.stringify(task));

        if (task.userId) {
            this.emitNotification(task.userId, {
                type: 'task_updated',
                taskId: taskId,
                status: task.status,
                progress: task.progress,
                progressMessage: task.progressMessage,
                message: this.getTaskStatusMessage(task.status, task.progressMessage)
            });
        }

        return task;
    }

    async getTask(taskId) {
        const taskJson = await redis.get(this.TASK_PREFIX + taskId);
        return taskJson ? JSON.parse(taskJson) : null;
    }

    async getUserTasks(userId, limit = 10) {
        const keys = await redis.keys(this.TASK_PREFIX + '*');
        const tasks = [];
        
        for (const key of keys) {
            const taskJson = await redis.get(key);
            if (taskJson) {
                const task = JSON.parse(taskJson);
                if (task.userId === userId) {
                    tasks.push(task);
                }
            }
        }

        return tasks
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    }

    async deleteTask(taskId) {
        await redis.del(this.TASK_PREFIX + taskId);
    }

    emitNotification(userId, notification) {
        notification.id = uuidv4();
        notification.timestamp = new Date().toISOString();
        
        if (global.io) {
            global.io.to(`user:${userId}`).emit('notification', notification);
        }

        if (global.sendNotificationToClient) {
            global.sendNotificationToClient(userId, notification);
        }
    }

    getTaskCreatedMessage(taskType, metadata) {
        const messages = {
            'pdf_export': `PDF导出任务已创建: ${metadata.filename || '文档'}`,
            'docx_export': `Word文档导出任务已创建: ${metadata.filename || '文档'}`,
            'ppt_export': `PPT导出任务已创建: ${metadata.filename || '演示文稿'}`,
            'html_export': `HTML导出任务已创建: ${metadata.filename || '文档'}`,
            'markdown_export': `Markdown导出任务已创建: ${metadata.filename || '文档'}`
        };
        return messages[taskType] || `导出任务已创建: ${metadata.filename || '文档'}`;
    }

    getTaskStatusMessage(status, progressMessage) {
        switch (status) {
            case this.TASK_STATUS.PENDING:
                return '任务等待中...';
            case this.TASK_STATUS.PROCESSING:
                return progressMessage || '正在处理中...';
            case this.TASK_STATUS.COMPLETED:
                return '任务已完成';
            case this.TASK_STATUS.FAILED:
                return '任务失败: ' + (progressMessage || '未知错误');
            default:
                return progressMessage || '处理中...';
        }
    }

    async sendBrowserNotification(userId, title, body, options = {}) {
        this.emitNotification(userId, {
            type: 'browser_notification',
            title: title,
            body: body,
            icon: options.icon || '/icon.png',
            tag: options.tag || 'export-notification',
            data: options.data || {}
        });
    }

    async notifyTaskComplete(userId, task) {
        const title = '导出完成';
        const body = this.getCompleteMessage(task.type, task.result);
        
        this.sendBrowserNotification(userId, title, body, {
            tag: `task-${task.id}`,
            data: {
                taskId: task.id,
                type: task.type,
                result: task.result
            }
        });
    }

    async notifyTaskFailed(userId, task) {
        const title = '导出失败';
        const body = task.error || '导出过程中出现错误，请重试';
        
        this.sendBrowserNotification(userId, title, body, {
            tag: `task-${task.id}`,
            data: {
                taskId: task.id,
                type: task.type,
                error: task.error
            }
        });
    }

    getCompleteMessage(taskType, result) {
        if (result && result.filename) {
            return `"${result.filename}" 已导出完成，点击下载`;
        }
        
        const messages = {
            'pdf_export': 'PDF文档已导出完成',
            'docx_export': 'Word文档已导出完成',
            'ppt_export': 'PPT演示文稿已导出完成',
            'html_export': 'HTML文件已导出完成',
            'markdown_export': 'Markdown文件已导出完成'
        };
        return messages[taskType] || '文件已导出完成';
    }
}

module.exports = new NotificationService();
