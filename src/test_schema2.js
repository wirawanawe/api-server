const { sql } = require('./config/db');

async function test() {
    try {
        const pool = await require('./config/db').poolPromise;
        const result1 = await pool.request().query('SELECT TOP 1 * FROM Resep');
        console.log("Resep:", result1.recordset[0]);

        const result2 = await pool.request().query('SELECT TOP 1 * FROM Resep_Detail');
        console.log("Resep_Detail:", result2.recordset[0]);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

test();
