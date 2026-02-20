const { sql, poolPromise } = require('../config/db');

async function checkTables() {
    try {
        const pool = await poolPromise;
        if (!pool) {
            console.log('Database not configured');
            return;
        }

        const keywords = [
            'transaksi', 'detail', 'pasien', 'kunjungan',
            'far_product', 'far_resep', 'resep'
        ];

        const result = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `);

        console.log('--- Matching Tables ---');
        const tables = result.recordset.map(r => r.TABLE_NAME);

        tables.forEach(t => {
            const lowerT = t.toLowerCase();
            if (keywords.some(k => lowerT.includes(k))) {
                console.log(t);
            }
        });
        console.log('-----------------------');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkTables();
