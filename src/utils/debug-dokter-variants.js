const { sql, poolPromise } = require('../config/db');

async function debugDokterVariants() {
    try {
        const pool = await poolPromise;
        const variants = ['Nama_Dokter', 'Dokter_Name', 'Name', 'Nama', 'Dokter_Nama'];

        for (const col of variants) {
            try {
                console.log(`Trying column: ${col}`);
                await pool.request().query(`SELECT TOP 1 ${col} FROM Dokter`);
                console.log(`SUCCESS: ${col} exists!`);
                process.exit(0);
            } catch (err) {
                console.log(`Failed: ${col} - ${err.message}`);
            }
        }
        process.exit(1);
    } catch (err) {
        console.error(err);
    }
}

debugDokterVariants();
