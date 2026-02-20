const { sql, poolPromise } = require('../config/db');

async function listTables() {
    try {
        const pool = await poolPromise;
        if (!pool) {
            console.error('Database connection failed');
            process.exit(1);
        }

        console.log('Listing all tables...');

        const result = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' 
            ORDER BY TABLE_NAME
        `);

        if (result.recordset.length === 0) {
            console.log('No tables found.');
        } else {
            console.table(result.recordset);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

listTables();
