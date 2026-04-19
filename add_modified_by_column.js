const db = require('./api/config/db');

async function addModifiedByColumn() {
    try {
        await db.execute('ALTER TABLE file_history ADD COLUMN modified_by VARCHAR(255) DEFAULT NULL');
        console.log('Successfully added modified_by column to file_history table');
    } catch (error) {
        console.error('Error adding modified_by column:', error);
    } finally {
        await db.end();
    }
}

addModifiedByColumn();