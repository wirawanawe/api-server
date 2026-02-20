const { sql, poolPromise } = require('../config/db');

async function checkSchema() {
    try {
        const tableName = process.argv[2];
        if (!tableName) {
            console.error('Please provide a table name');
            process.exit(1);
        }

        const pool = await poolPromise;
        if (!pool) {
            console.error('Database connection failed');
            process.exit(1);
        }

        console.log(`Checking schema for table: ${tableName}`);

        const result = await pool.request()
            .input('tableName', sql.VarChar, tableName)
            .query(`
                SELECT COLUMN_NAME, DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = @tableName
            `);

        if (result.recordset.length === 0) {
            console.log(`No columns found for table '${tableName}'. Table might not exist.`);
        } else {
            console.table(result.recordset);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

checkSchema();
