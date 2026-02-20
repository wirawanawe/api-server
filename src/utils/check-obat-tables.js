const { sql, poolPromise } = require('../config/db');

async function checkTables() {
    try {
        const pool = await poolPromise;
        if (!pool) return;

        const result = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%Obat%'
            ORDER BY TABLE_NAME
        `);

        console.log('--- Tables with Obat ---');
        console.log(result.recordset.map(r => r.TABLE_NAME));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTables();
