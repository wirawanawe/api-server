const { sql } = require('../config/db');

exports.getMR_DiagnosisCase = async (req, res) => {
    try {
        const { nama } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let filterClause = ' WHERE 1=1';
        const inputs = {};

        if (nama) {
            filterClause += ` AND (Name LIKE @nama)`;
            inputs.nama = { type: sql.VarChar, value: `%${nama}%` };
        }

        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });
        const countResult = await countRequest.query(
            `SELECT COUNT(*) as total FROM MR_DiagnosisCase ${filterClause}`
        );
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        const request = pool.request();
        Object.keys(inputs).forEach(key => {
            request.input(key, inputs[key].type, inputs[key].value);
        });
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const result = await request.query(`
            SELECT * FROM MR_DiagnosisCase
            ${filterClause}
            ORDER BY MR_ID ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

        res.json({
            message: 'Data fetched successfully',
            pagination: { page, limit, totalRows, totalPages },
            data: result.recordset,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

exports.getMR_DiagnosisCaseById = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const result = await pool
            .request()
            .input('id', sql.Int, id)
            .query('SELECT * FROM MR_DiagnosisCase WHERE MR_ID = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'MR_DiagnosisCase not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
