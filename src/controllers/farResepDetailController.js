const { sql } = require('../config/db');

exports.getFarResepDetail = async (req, res) => {
    try {
        const { noInvoice } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let filterClause = " WHERE 1=1 AND (RD.GCRecord = 0 OR RD.GCRecord = 'False' OR RD.GCRecord IS NULL)";

        if (noInvoice) {
            filterClause += ` AND RD.NoInvoice = @noInvoice`;
        }

        const countRequest = pool.request();
        if (noInvoice) countRequest.input('noInvoice', sql.VarChar, noInvoice);

        const countResult = await countRequest.query(
            `SELECT COUNT(*) as total FROM Far_Resep_Detail RD ${filterClause}`
        );
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        const request = pool.request();
        if (noInvoice) request.input('noInvoice', sql.VarChar, noInvoice);
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const result = await request.query(`
            SELECT 
                RD.NoInvoice,
                RD.NoUrut,
                RD.ItemID,
                P.Detail AS ItemDescName,
                RD.ItemDesc,
                RD.Satuan,
                RD.Qty,
                RD.Harga,
                RD.HNA,
                RD.Diskon,
                RD.RpNetto,
                RD.NoRacik
            FROM Far_Resep_Detail RD
            LEFT JOIN FAR_PRODUK P ON RD.ItemID = P.ElementDetailKey
            ${filterClause}
            ORDER BY RD.NoUrut ASC 
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
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
