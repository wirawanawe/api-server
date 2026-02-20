const { sql } = require('../config/db');

/**
 * GET /api/dashboard/stats
 * Query: month (1-12), year (e.g. 2025) - optional, defaults to current
 * Returns: total kunjungan (today, selected month, selected year), top drugs, top diagnoses
 */
exports.getStats = async (req, res) => {
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
        const monthStart = `${reqYear}-${String(reqMonth).padStart(2, '0')}-01`;
        const lastDayOfMonth = new Date(reqYear, reqMonth, 0).getDate();
        const monthEnd = `${reqYear}-${String(reqMonth).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
        const yearEnd = `${reqYear}-12-31`;

        const reqPool = pool.request();
        reqPool.input('today', sql.Date, today);
        reqPool.input('yearStart', sql.Date, yearStart);
        reqPool.input('yearEnd', sql.Date, yearEnd);
        reqPool.input('monthStart', sql.Date, monthStart);
        reqPool.input('monthEnd', sql.Date, monthEnd);

        // 1. Total Kunjungan: hari ini, bulan terpilih, tahun terpilih (hanya GCRecord = false)
        const kunjunganResult = await reqPool.query(`
            SELECT 
                SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) = @today THEN 1 ELSE 0 END) AS totalHariIni,
                SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) BETWEEN @monthStart AND @monthEnd THEN 1 ELSE 0 END) AS totalBulanIni,
                SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd THEN 1 ELSE 0 END) AS totalTahunIni
            FROM Kunjungan
            WHERE (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)
        `);
        const kunjungan = kunjunganResult.recordset[0] || { totalHariIni: 0, totalBulanIni: 0, totalTahunIni: 0 };

        // 2. Obat yang sering diresepkan (per tahun dan per bulan) - dari Resep dan Resep_Detail
        let topObatTahun = [];
        let topObatBulan = [];
        try {
            const obatTahunResult = await pool.request()
                .input('yearStart', sql.Date, yearStart)
                .input('yearEnd', sql.Date, yearEnd)
                .query(`
                    SELECT TOP 10
                        COALESCE(RD.ItemDesc, 'Lainnya') AS namaObat,
                        SUM(ISNULL(RD.Qty, RD.Jumlah) + 0) AS totalQty,
                        COUNT(*) AS totalResep
                    FROM Resep R
                    INNER JOIN Kunjungan K ON R.Kunjungan_ID = K.Kunjungan_ID
                    INNER JOIN Resep_Detail RD ON R.NoInvoice = RD.NoInvoice
                    WHERE CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd
                    AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
                    AND (R.GCRecord = 0 OR R.GCRecord = 'False' OR R.GCRecord IS NULL)
                    AND (RD.GCRecord = 0 OR RD.GCRecord = 'False' OR RD.GCRecord IS NULL)
                    GROUP BY COALESCE(RD.ItemDesc, 'Lainnya')
                    ORDER BY totalQty DESC
                `);
            topObatTahun = (obatTahunResult.recordset || []).map((r, i) => ({
                no: i + 1,
                namaObat: r.namaObat ?? '-',
                totalQty: r.totalQty ?? 0,
                totalResep: r.totalResep ?? 0,
            }));

            const obatBulanResult = await pool.request()
                .input('monthStart', sql.Date, monthStart)
                .input('monthEnd', sql.Date, monthEnd)
                .query(`
                    SELECT TOP 10
                        COALESCE(RD.ItemDesc, 'Lainnya') AS namaObat,
                        SUM(ISNULL(RD.Qty, RD.Jumlah) + 0) AS totalQty,
                        COUNT(*) AS totalResep
                    FROM Resep R
                    INNER JOIN Kunjungan K ON R.Kunjungan_ID = K.Kunjungan_ID
                    INNER JOIN Resep_Detail RD ON R.NoInvoice = RD.NoInvoice
                    WHERE CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @monthStart AND @monthEnd
                    AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
                    AND (R.GCRecord = 0 OR R.GCRecord = 'False' OR R.GCRecord IS NULL)
                    AND (RD.GCRecord = 0 OR RD.GCRecord = 'False' OR RD.GCRecord IS NULL)
                    GROUP BY COALESCE(RD.ItemDesc, 'Lainnya')
                    ORDER BY totalQty DESC
                `);
            topObatBulan = (obatBulanResult.recordset || []).map((r, i) => ({
                no: i + 1,
                namaObat: r.namaObat ?? '-',
                totalQty: r.totalQty ?? 0,
                totalResep: r.totalResep ?? 0,
            }));
        } catch (obatErr) {
            console.warn('Top obat query error (schema may differ):', obatErr.message);
        }

        // 3. Diagnosa yang sering diderita (per tahun dan per bulan) - top 10
        let topDiagnosaTahun = [];
        let topDiagnosaBulan = [];
        try {
            const diagnosaTahunResult = await pool.request()
                .input('yearStart', sql.Date, yearStart)
                .input('yearEnd', sql.Date, yearEnd)
                .query(`
                    SELECT TOP 10
                        COALESCE(I.Disease, I.ICD, 'Lainnya') AS namaDiagnosa,
                        I.ICD AS kodeICD,
                        COUNT(*) AS total
                    FROM MR_Diagnosis MD
                    INNER JOIN Kunjungan K ON MD.Kunjungan_ID = K.Kunjungan_ID
                    LEFT JOIN MR_ICD I ON MD.ICD_ID = I.ID
                    WHERE CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd
                    AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
                    GROUP BY COALESCE(I.Disease, I.ICD, 'Lainnya'), I.ICD
                    ORDER BY total DESC
                `);
            topDiagnosaTahun = (diagnosaTahunResult.recordset || []).map((r, i) => ({
                no: i + 1,
                namaDiagnosa: r.namaDiagnosa ?? '-',
                kodeICD: r.kodeICD ?? '-',
                total: r.total ?? 0,
            }));

            const diagnosaBulanResult = await pool.request()
                .input('monthStart', sql.Date, monthStart)
                .input('monthEnd', sql.Date, monthEnd)
                .query(`
                    SELECT TOP 10
                        COALESCE(I.Disease, I.ICD, 'Lainnya') AS namaDiagnosa,
                        I.ICD AS kodeICD,
                        COUNT(*) AS total
                    FROM MR_Diagnosis MD
                    INNER JOIN Kunjungan K ON MD.Kunjungan_ID = K.Kunjungan_ID
                    LEFT JOIN MR_ICD I ON MD.ICD_ID = I.ID
                    WHERE CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @monthStart AND @monthEnd
                    AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
                    GROUP BY COALESCE(I.Disease, I.ICD, 'Lainnya'), I.ICD
                    ORDER BY total DESC
                `);
            topDiagnosaBulan = (diagnosaBulanResult.recordset || []).map((r, i) => ({
                no: i + 1,
                namaDiagnosa: r.namaDiagnosa ?? '-',
                kodeICD: r.kodeICD ?? '-',
                total: r.total ?? 0,
            }));
        } catch (diagErr) {
            console.warn('Top diagnosa query error (schema may differ):', diagErr.message);
        }

        res.json({
            message: 'Data fetched successfully',
            kunjungan: {
                hariIni: kunjungan.totalHariIni ?? 0,
                bulanIni: kunjungan.totalBulanIni ?? 0,
                tahunIni: kunjungan.totalTahunIni ?? 0,
            },
            obatTahunIni: topObatTahun,
            obatBulanIni: topObatBulan,
            diagnosaTahunIni: topDiagnosaTahun,
            diagnosaBulanIni: topDiagnosaBulan,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

/**
 * GET /api/dashboard/graph?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns: kunjungan per hari (tanggal) dalam rentang
 */
exports.getGraphData = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const result = await pool.request()
            .input('startDate', sql.Date, startDate)
            .input('endDate', sql.Date, endDate)
            .query(`
                SELECT 
                    CAST(Tgl_Kunjungan AS DATE) AS tanggal,
                    COUNT(*) AS jumlah
                FROM Kunjungan
                WHERE CAST(Tgl_Kunjungan AS DATE) BETWEEN @startDate AND @endDate
                AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)
                GROUP BY CAST(Tgl_Kunjungan AS DATE)
                ORDER BY CAST(Tgl_Kunjungan AS DATE) ASC
            `);

        const data = (result.recordset || []).map(r => ({
            tanggal: r.tanggal ? new Date(r.tanggal).toISOString().slice(0, 10) : null,
            jumlah: r.jumlah ?? 0
        }));

        res.json({ message: 'Data fetched successfully', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
