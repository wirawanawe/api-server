const { sql } = require('../config/db');

exports.getTransactions = async (req, res) => {
    try {
        const { startDate, endDate, noMR, kunjunganID, noTransaksi } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;

        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        // Base Filter Logic
        let filterClause = " WHERE 1=1 AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)";
        const inputs = {};

        if (startDate && endDate) {
            filterClause += ` AND Tgl_Transaksi BETWEEN @startDate AND @endDate`;
            inputs.startDate = { type: sql.Date, value: startDate };
            inputs.endDate = { type: sql.Date, value: endDate };
        }

        if (noMR) {
            filterClause += ` AND No_MR = @noMR`;
            inputs.noMR = { type: sql.VarChar, value: noMR };
        }

        if (kunjunganID) {
            filterClause += ` AND Kunjungan_ID = @kunjunganID`;
            inputs.kunjunganID = { type: sql.VarChar, value: kunjunganID };
        }

        if (noTransaksi) {
            filterClause += ` AND No_Transaksi = @noTransaksi`;
            inputs.noTransaksi = { type: sql.VarChar, value: noTransaksi };
        }

        // 1. Get Total Count
        const countRequest = pool.request();
        // Bind inputs
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });

        const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM TRANSAKSI ${filterClause}`);
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        // 2. Get Data with Pagination
        let query = `
            SELECT 
                No_Transaksi, 
                Kunjungan_ID, 
                Tgl_Transaksi, 
                No_MR, 
                Total
            FROM TRANSAKSI
            ${filterClause}
            ORDER BY Tgl_Transaksi DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `;

        const request = pool.request();
        // Bind inputs again for the second query
        Object.keys(inputs).forEach(key => {
            request.input(key, inputs[key].type, inputs[key].value);
        });
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const result = await request.query(query);

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

exports.getTransactionSummary = async (req, res) => {
    try {
        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const now = new Date();
        const reqYear = parseInt(req.query.year) || now.getFullYear();
        const reqMonth = parseInt(req.query.month) || (now.getMonth() + 1);

        const today = now.toISOString().slice(0, 10);
        const yearStart = `${reqYear}-01-01`;
        const yearEnd = `${reqYear}-12-31`;
        const monthStart = `${reqYear}-${String(reqMonth).padStart(2, '0')}-01`;
        const lastDayOfMonth = new Date(reqYear, reqMonth, 0).getDate();
        const monthEnd = `${reqYear}-${String(reqMonth).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

        const result = await pool.request()
            .input('today', sql.Date, today)
            .input('yearStart', sql.Date, yearStart)
            .input('yearEnd', sql.Date, yearEnd)
            .input('monthStart', sql.Date, monthStart)
            .input('monthEnd', sql.Date, monthEnd)
            .query(`
                SELECT
                    SUM(CASE WHEN CAST(Tgl_Transaksi AS DATE) = @today THEN 1 ELSE 0 END) AS countHariIni,
                    SUM(CASE WHEN CAST(Tgl_Transaksi AS DATE) = @today THEN ISNULL(Total, 0) ELSE 0 END) AS nominalHariIni,
                    SUM(CASE WHEN CAST(Tgl_Transaksi AS DATE) BETWEEN @monthStart AND @monthEnd THEN 1 ELSE 0 END) AS countBulanIni,
                    SUM(CASE WHEN CAST(Tgl_Transaksi AS DATE) BETWEEN @monthStart AND @monthEnd THEN ISNULL(Total, 0) ELSE 0 END) AS nominalBulanIni,
                    SUM(CASE WHEN CAST(Tgl_Transaksi AS DATE) BETWEEN @yearStart AND @yearEnd THEN 1 ELSE 0 END) AS countTahunIni,
                    SUM(CASE WHEN CAST(Tgl_Transaksi AS DATE) BETWEEN @yearStart AND @yearEnd THEN ISNULL(Total, 0) ELSE 0 END) AS nominalTahunIni
                FROM TRANSAKSI
                WHERE (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)
            `);

        const row = result.recordset[0] || {};
        res.json({
            message: 'Data fetched successfully',
            summary: {
                hariIni: { count: row.countHariIni ?? 0, nominal: row.nominalHariIni ?? 0 },
                bulanIni: { count: row.countBulanIni ?? 0, nominal: row.nominalBulanIni ?? 0 },
                tahunIni: { count: row.countTahunIni ?? 0, nominal: row.nominalTahunIni ?? 0 },
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
