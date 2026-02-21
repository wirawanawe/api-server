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

exports.getResepSummary = async (req, res) => {
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
                    COUNT(DISTINCT CASE WHEN CAST(R.TgInvoice AS DATE) = @today THEN R.NoInvoice END) AS countHariIni,
                    SUM(CASE WHEN CAST(R.TgInvoice AS DATE) = @today THEN ISNULL(RD.Jumlah, 0) ELSE 0 END) AS nominalHariIni,
                    COUNT(DISTINCT CASE WHEN CAST(R.TgInvoice AS DATE) BETWEEN @monthStart AND @monthEnd THEN R.NoInvoice END) AS countBulanIni,
                    SUM(CASE WHEN CAST(R.TgInvoice AS DATE) BETWEEN @monthStart AND @monthEnd THEN ISNULL(RD.Jumlah, 0) ELSE 0 END) AS nominalBulanIni,
                    COUNT(DISTINCT CASE WHEN CAST(R.TgInvoice AS DATE) BETWEEN @yearStart AND @yearEnd THEN R.NoInvoice END) AS countTahunIni,
                    SUM(CASE WHEN CAST(R.TgInvoice AS DATE) BETWEEN @yearStart AND @yearEnd THEN ISNULL(RD.Jumlah, 0) ELSE 0 END) AS nominalTahunIni
                FROM Resep R
                LEFT JOIN Resep_Detail RD ON R.NoInvoice = RD.NoInvoice AND (RD.GCRecord = 0 OR RD.GCRecord = 'False' OR RD.GCRecord IS NULL)
                WHERE (R.GCRecord = 0 OR R.GCRecord = 'False' OR R.GCRecord IS NULL)
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

exports.getTopMedicines = async (req, res) => {
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

        const baseQuery = `
            SELECT TOP 10
                RD.ItemDesc,
                SUM(RD.Qty) as TotalQty,
                SUM(RD.Jumlah) as TotalNominal
            FROM Resep R
            JOIN Resep_Detail RD ON R.NoInvoice = RD.NoInvoice
            WHERE (R.GCRecord = 0 OR R.GCRecord = 'False' OR R.GCRecord IS NULL)
              AND (RD.GCRecord = 0 OR RD.GCRecord = 'False' OR RD.GCRecord IS NULL)
              AND RD.ItemDesc IS NOT NULL AND RD.ItemDesc != ''
        `;

        const request = pool.request()
            .input('today', sql.Date, today)
            .input('yearStart', sql.Date, yearStart)
            .input('yearEnd', sql.Date, yearEnd)
            .input('monthStart', sql.Date, monthStart)
            .input('monthEnd', sql.Date, monthEnd);

        const todayResult = await request.query(`
            ${baseQuery}
            AND CAST(R.TgInvoice AS DATE) = @today
            GROUP BY RD.ItemDesc
            ORDER BY TotalQty DESC
        `);

        const monthResult = await request.query(`
            ${baseQuery}
            AND CAST(R.TgInvoice AS DATE) BETWEEN @monthStart AND @monthEnd
            GROUP BY RD.ItemDesc
            ORDER BY TotalQty DESC
        `);

        const yearResult = await request.query(`
            ${baseQuery}
            AND CAST(R.TgInvoice AS DATE) BETWEEN @yearStart AND @yearEnd
            GROUP BY RD.ItemDesc
            ORDER BY TotalQty DESC
        `);

        res.json({
            message: 'Top medicines fetched successfully',
            data: {
                hariIni: todayResult.recordset,
                bulanIni: monthResult.recordset,
                tahunIni: yearResult.recordset
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
