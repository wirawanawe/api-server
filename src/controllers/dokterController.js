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

        // Selalu gunakan alias D untuk tabel Dokter
        let filterClause = " WHERE 1=1 AND (D.GCRecord = 0 OR D.GCRecord = 'False' OR D.GCRecord IS NULL)";
        const inputs = {};

        if (nama) {
            filterClause += ` AND Dokter_Name LIKE @nama`;
            inputs.nama = { type: sql.VarChar, value: `%${nama}%` };
        }

        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });

        const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM Dokter D ${filterClause}`);
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
            SELECT 
                D.*,
                ISNULL(S.PasienHariIni, 0) AS PasienHariIni,
                ISNULL(S.PasienBulanIni, 0) AS PasienBulanIni,
                ISNULL(S.PasienTahunIni, 0) AS PasienTahunIni
            FROM Dokter D
            OUTER APPLY (
                SELECT
                    SUM(CASE WHEN CAST(K.Tgl_Kunjungan AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS PasienHariIni,
                    SUM(CASE 
                            WHEN YEAR(K.Tgl_Kunjungan) = YEAR(GETDATE()) 
                             AND MONTH(K.Tgl_Kunjungan) = MONTH(GETDATE()) 
                        THEN 1 ELSE 0 END) AS PasienBulanIni,
                    SUM(CASE WHEN YEAR(K.Tgl_Kunjungan) = YEAR(GETDATE()) THEN 1 ELSE 0 END) AS PasienTahunIni
                FROM Kunjungan K
                WHERE K.Dokter_ID = D.Dokter_ID
                  AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
            ) AS S
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
