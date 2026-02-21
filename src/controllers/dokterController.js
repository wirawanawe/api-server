const { sql } = require('../config/db');

exports.getDokter = async (req, res) => {
    try {
        const { nama, sortBy, sortOrder } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let filterClause = " WHERE 1=1 AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)";
        const inputs = {};

        if (nama) {
            filterClause += ` AND Dokter_Name LIKE @nama`;
            inputs.nama = { type: sql.VarChar, value: `%${nama}%` };
        }

        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });

        const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM Dokter ${filterClause}`);
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        const request = pool.request();
        Object.keys(inputs).forEach(key => {
            request.input(key, inputs[key].type, inputs[key].value);
        });
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const validSortBy = sortBy ? sortBy.replace(/[^a-zA-Z0-9_]/g, '') : null;
        const validSortOrder = sortOrder && sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
        const finalOrder = validSortBy ? `${validSortBy} ${validSortOrder}` : 'Dokter_Name ASC';

        const result = await request.query(`
            SELECT * 
            FROM Dokter 
            ${filterClause}
            ORDER BY ${finalOrder} 
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

        res.json({
            message: 'Data fetched successfully',
            pagination: { page, limit, totalRows, totalPages },
            data: result.recordset
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
