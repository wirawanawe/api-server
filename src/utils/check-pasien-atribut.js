const { sql, poolPromise } = require('../config/db');

async function run() {
    try {
        const pool = await poolPromise;
        if (!pool) {
            console.error('Pool not configured');
            process.exit(1);
        }

        console.log('=== Columns in PASIEN ===');
        let result = await pool.request().query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'PASIEN'
            ORDER BY COLUMN_NAME
        `);
        console.log(result.recordset.map(r => r.COLUMN_NAME));

        console.log('\n=== Columns in Atribut ===');
        result = await pool.request().query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'Atribut'
            ORDER BY COLUMN_NAME
        `);
        console.log(result.recordset.map(r => r.COLUMN_NAME));

        console.log('\n=== Sample from PASIEN (TOP 3) ===');
        result = await pool.request().query(`SELECT TOP 3 * FROM PASIEN`);
        console.dir(result.recordset, { depth: 2 });

        console.log('\n=== Sample from Atribut (TOP 10) ===');
        result = await pool.request().query(`SELECT TOP 10 * FROM Atribut`);
        console.dir(result.recordset, { depth: 2 });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();

