const { poolPromise } = require('./src/config/db');

async function run() {
    try {
        const pool = await poolPromise;
        if (!pool) return;
        console.time('query');
        const result = await pool.request().query(`
            SELECT TOP 100 P.Detail, LP.Harga AS HargaJual
            FROM FAR_PRODUK P
            OUTER APPLY (
                SELECT TOP 1 RD.Harga 
                FROM FAR_RESEP_DETAIL RD 
                WHERE RD.ItemID = P.ElementDetailKey 
                ORDER BY RD.NoInvoice DESC
            ) LP
            WHERE P.HNA > 0
        `);
        console.timeEnd('query');
        console.table(result.recordset);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
