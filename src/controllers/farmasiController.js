const { sql } = require('../config/db');

const getPaginatedData = async (req, res, tableName, orderColumn) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const countResult = await pool.request().query(`SELECT COUNT(*) as total FROM [${tableName}]`);
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        const result = await pool.request()
            .input('offset', sql.Int, offset)
            .input('limit', sql.Int, limit)
            .query(`
                SELECT * 
                FROM [${tableName}] 
                ORDER BY ${orderColumn} 
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            `);

        res.json({
            message: 'Data fetched successfully',
            pagination: { page, limit, totalRows, totalPages },
            data: result.recordset
        });
    } catch (err) {
        console.error(`Error in ${tableName} controller:`, err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

const obatJoinClause = `
            FROM FAR_PRODUK P
            LEFT JOIN Far_Obat O ON P.ElementDetailKey = O.ElementDetailKey
            LEFT JOIN Far_Pabrik PB ON O.KDPAB = PB.KDPAB
            LEFT JOIN Far_TYPECRITERIA G ON O.GOLOBAT_ID = G.TYPE_OBAT_ID`;

exports.getObat = async (req, res) => {
    try {
        const { namaObat, aktif, pabrik, golongan } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let filterClause = " WHERE 1=1 AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)";
        const inputs = {};

        if (namaObat) {
            filterClause += ` AND P.Detail LIKE @namaObat`;
            inputs.namaObat = { type: sql.VarChar, value: `%${namaObat}%` };
        }

        if (aktif) {
            filterClause += ` AND P.Berlaku = @aktif`;
            inputs.aktif = { type: sql.Bit, value: aktif === '1' || aktif === 'true' ? 1 : 0 };
        }

        if (pabrik) {
            filterClause += ` AND PB.NMPAB = @pabrik`;
            inputs.pabrik = { type: sql.VarChar, value: pabrik.trim() };
        }

        if (golongan) {
            filterClause += ` AND G.TYPE_OBAT_NAME = @golongan`;
            inputs.golongan = { type: sql.VarChar, value: golongan.trim() };
        }

        // 1. Get Total Count (same JOINs so filter applies)
        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });
        const countResult = await countRequest.query(`
            SELECT COUNT(*) as total
            ${obatJoinClause}
            ${filterClause}
        `);
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        // 2. Get Data with Pagination + Pabrik (Far_Pabrik.KDPAB) + Golongan (GOLOBAT)
        const request = pool.request();
        Object.keys(inputs).forEach(key => {
            request.input(key, inputs[key].type, inputs[key].value);
        });
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const result = await request.query(`
            SELECT P.*,
                PB.NMPAB AS Pabrik,
                G.TYPE_OBAT_NAME AS Golongan
            ${obatJoinClause}
            ${filterClause}
            ORDER BY P.Detail ASC, P.KFA_Code ASC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

        res.json({
            message: 'Data fetched successfully',
            pagination: {
                page,
                limit,
                totalRows,
                totalPages
            },
            data: result.recordset
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
exports.getFarResep = (req, res) => getPaginatedData(req, res, 'FAR_RESEP', 'NoInvoice DESC');
