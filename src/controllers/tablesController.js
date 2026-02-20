const { sql } = require('../config/db');

// Get all tables
exports.getTables = async (req, res) => {
    try {
        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const result = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE' 
            ORDER BY TABLE_NAME
        `);

        res.json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Get gcrecord column name if exists (returns null if not found)
async function getGCRecordColumnName(pool, tableName) {
    const result = await pool.request()
        .input('tableName', sql.VarChar, tableName)
        .query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = @tableName AND LOWER(COLUMN_NAME) = 'gcrecord'
        `);
    return result.recordset && result.recordset[0] ? result.recordset[0].COLUMN_NAME : null;
}

// Get data from a specific table (hanya baris dengan gcrecord = 0 jika kolom ada)
exports.getTableData = async (req, res) => {
    try {
        const { tableName } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        // Basic SQL Injection prevention
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
            return res.status(400).json({ message: 'Invalid table name' });
        }

        const gcrecordCol = await getGCRecordColumnName(pool, tableName);
        const whereClause = gcrecordCol ? ` WHERE [${gcrecordCol}] = 0` : '';

        // 1. Get Total Count
        const countResult = await pool.request().query(`SELECT COUNT(*) as total FROM [${tableName}]${whereClause}`);
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        // 2. Get Data with Pagination (hanya gcrecord = 0)
        const result = await pool.request()
            .input('offset', sql.Int, offset)
            .input('limit', sql.Int, limit)
            .query(`SELECT * FROM [${tableName}]${whereClause} ORDER BY 1 OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);

        res.json({
            message: 'Data fetched successfully',
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            },
            data: result.recordset,
            filteredByGCRecord: !!gcrecordCol
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
