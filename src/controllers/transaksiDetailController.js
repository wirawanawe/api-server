const { sql } = require('../config/db');

exports.getTransaksiDetail = async (req, res) => {
    try {
        const { noTransaksi } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        // Filter untuk count query (tanpa alias tabel)
        let baseFilter = " WHERE 1=1 AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)";
        if (noTransaksi) baseFilter += ` AND No_Transaksi = @noTransaksi`;

        // Filter untuk JOIN query (dengan alias TD.)
        let joinFilter = " WHERE 1=1 AND (TD.GCRecord = 0 OR TD.GCRecord = 'False' OR TD.GCRecord IS NULL)";
        if (noTransaksi) joinFilter += ` AND TD.No_Transaksi = @noTransaksi`;

        // Get count
        const countRequest = pool.request();
        if (noTransaksi) countRequest.input('noTransaksi', sql.VarChar, noTransaksi);

        const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM TRANSAKSI_DETAIL ${baseFilter}`);
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        // Get data
        const request = pool.request();
        if (noTransaksi) request.input('noTransaksi', sql.VarChar, noTransaksi);
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const result = await request.query(`
            SELECT
                TD.*,
                ISNULL(IP.Item_Produk_Name, '') AS Nama_Layanan,
                ISNULL(CAST(TD.Qty AS FLOAT), 1) * ISNULL(CAST(TD.Harga AS FLOAT), 0) AS Subtotal_Calc
            FROM TRANSAKSI_DETAIL TD
            LEFT JOIN Item_Produk IP ON TD.Item_Produk_ID = IP.Item_Produk_ID
            ${joinFilter}
            ORDER BY TD.No_Transaksi DESC, TD.No_Urut ASC
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

exports.getTransaksiDetailByNoTransaksi = async (req, res) => {
    try {
        const { noTransaksi } = req.params;
        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const result = await pool
            .request()
            .input('noTransaksi', sql.VarChar, noTransaksi)
            .query(`
                SELECT
                    TD.*,
                    ISNULL(IP.Item_Produk_Name, '') AS Nama_Layanan,
                    ISNULL(CAST(TD.Qty AS FLOAT), 1) * ISNULL(CAST(TD.Harga AS FLOAT), 0) AS Subtotal_Calc
                FROM TRANSAKSI_DETAIL TD
                LEFT JOIN Item_Produk IP ON TD.Item_Produk_ID = IP.Item_Produk_ID
                WHERE TD.No_Transaksi = @noTransaksi
                AND (TD.GCRecord = 0 OR TD.GCRecord = 'False' OR TD.GCRecord IS NULL)
                ORDER BY TD.No_Transaksi, TD.No_Urut ASC
            `);

        res.json({
            message: 'Data fetched successfully',
            data: result.recordset,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
