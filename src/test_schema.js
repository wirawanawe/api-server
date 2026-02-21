const { sql } = require('./config/db');

async function test() {
    try {
        const pool = await require('./config/db').poolPromise;

        const tables = ['TRANSAKSI_DETAIL', 'Resep', 'Resep_Detail', 'FAR_RESEP', 'FAR_PRODUK', 'Item_Produk'];

        for (const table of tables) {
            const result = await pool.request().query(`
                SELECT COLUMN_NAME, DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = '${table}'
            `);
            console.log(`\n--- ${table} ---`);
            result.recordset.forEach(r => console.log(`${r.COLUMN_NAME}: ${r.DATA_TYPE}`));
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

test();
