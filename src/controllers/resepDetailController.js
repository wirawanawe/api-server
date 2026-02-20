const { sql } = require('../config/db');

exports.getResepDetail = async (req, res) => {
    try {
        const { noInvoice } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let filterClause = " WHERE 1=1 AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)";
        const inputs = {};

        if (noInvoice) {
            filterClause += ` AND NoInvoice = @noInvoice`;
            inputs.noInvoice = { type: sql.VarChar, value: noInvoice };
        }

        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });
        const countResult = await countRequest.query(
            `SELECT COUNT(*) as total FROM Resep_Detail ${filterClause}`
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
            FROM Resep_Detail
            ${filterClause}
            ORDER BY NoInvoice DESC, NoUrut ASC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
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

exports.getResepDetailByNoInvoice = async (req, res) => {
    try {
        const { noInvoice } = req.params;
        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const result = await pool
            .request()
            .input('noInvoice', sql.VarChar, noInvoice)
            .query(
                "SELECT * FROM Resep_Detail WHERE NoInvoice = @noInvoice AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL) ORDER BY NoUrut ASC"
            );

        res.json({
            message: 'Data fetched successfully',
            data: result.recordset,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
