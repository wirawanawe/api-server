const { sql } = require('../config/db');

exports.getPasien = async (req, res) => {
    try {
        const { namaPasien, noMR, jenisKelamin, sortBy, sortOrder } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let filterClause = " WHERE 1=1 AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)";
        const inputs = {};

        if (namaPasien) {
            filterClause += ` AND P.Nama_Pasien LIKE @namaPasien`;
            inputs.namaPasien = { type: sql.VarChar, value: `%${namaPasien}%` };
        }

        if (noMR) {
            filterClause += ` AND P.No_MR LIKE @noMR`;
            inputs.noMR = { type: sql.VarChar, value: `%${noMR}%` };
        }

        if (jenisKelamin) {
            filterClause += ` AND AJk.Atribut_Name = @jenisKelamin`;
            inputs.jenisKelamin = { type: sql.VarChar, value: jenisKelamin };
        }

        // 1. Get Total Count
        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });

        const countResult = await countRequest.query(`
            SELECT COUNT(*) as total
            FROM PASIEN P
            LEFT JOIN Atribut AJk ON AJk.Atribut_ID = P.JK
            ${filterClause}
        `);
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        // 2. Get Data with Pagination
        const request = pool.request();
        Object.keys(inputs).forEach(key => {
            request.input(key, inputs[key].type, inputs[key].value);
        });
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const validSortBy = sortBy ? sortBy.replace(/[^a-zA-Z0-9_]/g, '') : null;
        const validSortOrder = sortOrder && sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const finalOrder = validSortBy ? `${validSortBy} ${validSortOrder}` : 'P.No_MR DESC';

        const result = await request.query(`
            SELECT 
                P.No_MR,
                P.Nama_Pasien,
                P.Nama_Panggilan,
                P.Alamat,
                P.Tgl_Lahir,
                P.NoIdentitas,
                P.No_KPK,
                (CASE WHEN AJk.Atribut_Name IS NULL OR LTRIM(RTRIM(AJk.Atribut_Name)) = '-' THEN 'Tidak diketahui' ELSE AJk.Atribut_Name END) AS Jenis_Kelamin,
                P.NoTelp AS HP1,
                WKel.Kelurahan_Name AS Wilayah_Kelurahan,
                WKec.Kecamatan_Name AS Wilayah_Kecamatan,
                WKota.Kota_Name AS Wilayah_Kota,
                WProp.Propinsi_Name AS Wilayah_Propinsi
            FROM PASIEN P
            LEFT JOIN Atribut AJk ON AJk.Atribut_ID = P.JK
            LEFT JOIN Wilayah_Kelurahan WKel ON P.Kelurahan_ID = WKel.Kelurahan_ID
            LEFT JOIN Wilayah_Kecamatan WKec ON P.Kecamatan_ID = WKec.Kecamatan_ID
            LEFT JOIN Wilayah_Kota WKota ON P.Kota_ID = WKota.Kota_ID
            LEFT JOIN Wilayah_Propinsi WProp ON P.Propinsi_ID = WProp.Propinsi_ID
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

/**
 * GET /api/pasien/keluarga?namaPanggilan=xxx&excludeNoMR=xxx
 * Returns family members (pasien with same Nama_Panggilan / No. Peserta).
 */
exports.getAnggotaKeluarga = async (req, res) => {
    try {
        const { namaPanggilan, excludeNoMR } = req.query;

        if (!namaPanggilan || String(namaPanggilan).trim() === '') {
            return res.status(400).json({ message: 'namaPanggilan (No. Peserta) is required' });
        }

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const request = pool.request();
        request.input('namaPanggilan', sql.VarChar, namaPanggilan.trim());

        let filterExclude = '';
        if (excludeNoMR && String(excludeNoMR).trim() !== '') {
            filterExclude = ' AND P.No_MR != @excludeNoMR';
            request.input('excludeNoMR', sql.VarChar, excludeNoMR.trim());
        }

        const result = await request.query(`
            SELECT 
                P.No_MR,
                P.Nama_Pasien,
                P.Nama_Panggilan,
                P.Alamat,
                P.Tgl_Lahir,
                P.NoIdentitas,
                P.No_KPK,
                (CASE WHEN AJk.Atribut_Name IS NULL OR LTRIM(RTRIM(AJk.Atribut_Name)) = '-' THEN 'Tidak diketahui' ELSE AJk.Atribut_Name END) AS Jenis_Kelamin,
                P.NoTelp AS HP1
            FROM PASIEN P
            LEFT JOIN Atribut AJk ON AJk.Atribut_ID = P.JK
            WHERE P.Nama_Panggilan = @namaPanggilan
            AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)
            ${filterExclude}
            ORDER BY P.Nama_Pasien ASC
        `);

        res.json({
            message: 'Data fetched successfully',
            data: result.recordset || []
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
