const { sql } = require('../config/db');

exports.getResep = async (req, res) => {
    try {
        const { noInvoice, kunjunganId } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let filterClause = " WHERE 1=1 AND (Resep.GCRecord = 0 OR Resep.GCRecord = 'False' OR Resep.GCRecord IS NULL)";
        const inputs = {};

        if (noInvoice) {
            filterClause += ` AND NoInvoice = @noInvoice`;
            inputs.noInvoice = { type: sql.VarChar, value: noInvoice };
        }
        if (kunjunganId) {
            filterClause += ` AND Kunjungan_ID = @kunjunganId`;
            inputs.kunjunganId = { type: sql.Int, value: parseInt(kunjunganId) };
        }

        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });
        const countResult = await countRequest.query(
            `SELECT COUNT(*) as total FROM Resep ${filterClause.replace(/Resep\.GCRecord/g, 'GCRecord')}`
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
            FROM Resep
            ${filterClause.replace(/Resep\.GCRecord/g, 'GCRecord')}
            ORDER BY NoInvoice DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
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

exports.getResepByNo = async (req, res) => {
    try {
        const { noInvoice } = req.params;
        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const result = await pool
            .request()
            .input('noInvoice', sql.VarChar, noInvoice)
            .query("SELECT * FROM Resep WHERE NoInvoice = @noInvoice AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)");

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'Resep not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
