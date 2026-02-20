const { sql } = require('../config/db');

exports.getPabrik = async (req, res) => {
    try {
        const { nama } = req.query;
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
            filterClause += ` AND (Pabrik_Name LIKE @nama OR Name LIKE @nama)`;
            inputs.nama = { type: sql.VarChar, value: `%${nama}%` };
        }

        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });
        const countResult = await countRequest.query(
            `SELECT COUNT(*) as total FROM FAR_PABRIK ${filterClause}`
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
            SELECT *
            FROM FAR_PABRIK
            ${filterClause}
            ORDER BY Pabrik_ID ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
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

exports.getPabrikById = async (req, res) => {
    try {
        const { id } = req.params;
        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const result = await pool
            .request()
            .input('id', sql.Int, parseInt(id, 10))
            .query("SELECT * FROM FAR_PABRIK WHERE Pabrik_ID = @id AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)");

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Pabrik not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
