const { sql, poolPromise } = require('../config/db');

async function checkColumns() {
    try {
        const pool = await poolPromise;
        if (!pool) return;

        const result = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'FAR_OBAT'
        `);

        console.log('--- Columns in FAR_OBAT ---');
        console.log(result.recordset.map(r => r.COLUMN_NAME));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkColumns();
