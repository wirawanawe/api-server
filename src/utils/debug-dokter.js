const { sql, poolPromise } = require('../config/db');

async function debugDokter() {
    try {
        const pool = await poolPromise;
        if (!pool) {
            console.error('Database connection failed');
            process.exit(1);
        }

        console.log('Running query: SELECT * FROM Dokter ORDER BY Nama_Dokter ASC');

        try {
            const result = await pool.request().query(`
                SELECT * 
                FROM Dokter 
                ORDER BY Nama_Dokter ASC
            `);
            console.log('Query successful');
            console.log(`Rows: ${result.recordset.length}`);
            if (result.recordset.length > 0) {
                console.log('First row:', result.recordset[0]);
            }
        } catch (queryErr) {
            console.error('Query failed:', queryErr.message);
            console.error('Code:', queryErr.code);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

debugDokter();
