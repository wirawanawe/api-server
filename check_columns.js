
const { sql, poolPromise } = require('./src/config/db');

async function checkColumns() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Far_Produk'
        `);
        console.log("Columns in Far_Produk:", result.recordset.map(row => row.COLUMN_NAME));
    } catch (err) {
        console.error("Error:", err);
    } finally {
        // sql.close(); // poolPromise usually manages connection, but if stuck need to close
        process.exit(0);
    }
}

checkColumns();
