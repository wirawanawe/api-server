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
                SUM(CASE WHEN CAST(K.Tgl_Kunjungan AS DATE) = @today THEN 1 ELSE 0 END) AS totalHariIni,
                SUM(CASE WHEN CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @monthStart AND @monthEnd THEN 1 ELSE 0 END) AS totalBulanIni,
                SUM(CASE WHEN CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd THEN 1 ELSE 0 END) AS totalTahunIni
            FROM Kunjungan K
            WHERE (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
        `);
        const kunjungan = kunjunganResult.recordset[0] || { totalHariIni: 0, totalBulanIni: 0, totalTahunIni: 0 };

        // 1b. Kunjungan Pegawai vs Pensiunan (status dari 2 digit pertama Nama_Panggilan = tahun lahir, usia>56 = pensiunan)
        let statusStats = { hariIni: { pegawai: 0, pensiunan: 0, lainnya: 0 }, bulanIni: { pegawai: 0, pensiunan: 0, lainnya: 0 }, tahunIni: { pegawai: 0, pensiunan: 0, lainnya: 0 } };
        try {
            const statusResult = await pool.request()
                .input('today', sql.Date, today)
                .input('monthStart', sql.Date, monthStart)
                .input('monthEnd', sql.Date, monthEnd)
                .input('yearStart', sql.Date, yearStart)
                .input('yearEnd', sql.Date, yearEnd)
                .query(`
                    WITH KWithStatus AS (
                        SELECT K.Tgl_Kunjungan, ${statusExpr} AS status
                        FROM Kunjungan K
                        LEFT JOIN PASIEN P ON K.No_MR = P.No_MR AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)
                        WHERE (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
                    )
                    SELECT 
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) = @today AND status = 'Pegawai' THEN 1 ELSE 0 END) AS pegawaiHariIni,
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) = @today AND status = 'Pensiunan' THEN 1 ELSE 0 END) AS pensiunanHariIni,
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) = @today AND status = 'Lainnya' THEN 1 ELSE 0 END) AS lainnyaHariIni,
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) BETWEEN @monthStart AND @monthEnd AND status = 'Pegawai' THEN 1 ELSE 0 END) AS pegawaiBulanIni,
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) BETWEEN @monthStart AND @monthEnd AND status = 'Pensiunan' THEN 1 ELSE 0 END) AS pensiunanBulanIni,
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) BETWEEN @monthStart AND @monthEnd AND status = 'Lainnya' THEN 1 ELSE 0 END) AS lainnyaBulanIni,
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd AND status = 'Pegawai' THEN 1 ELSE 0 END) AS pegawaiTahunIni,
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd AND status = 'Pensiunan' THEN 1 ELSE 0 END) AS pensiunanTahunIni,
                        SUM(CASE WHEN CAST(Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd AND status = 'Lainnya' THEN 1 ELSE 0 END) AS lainnyaTahunIni
                    FROM KWithStatus
                `);
            const r = statusResult.recordset[0] || {};
            statusStats = {
                hariIni: { pegawai: r.pegawaiHariIni ?? 0, pensiunan: r.pensiunanHariIni ?? 0, lainnya: r.lainnyaHariIni ?? 0 },
                bulanIni: { pegawai: r.pegawaiBulanIni ?? 0, pensiunan: r.pensiunanBulanIni ?? 0, lainnya: r.lainnyaBulanIni ?? 0 },
                tahunIni: { pegawai: r.pegawaiTahunIni ?? 0, pensiunan: r.pensiunanTahunIni ?? 0, lainnya: r.lainnyaTahunIni ?? 0 },
            };
        } catch (statusErr) {
            console.warn('Status stats query error:', statusErr.message);
        }

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
            kunjunganByStatus: statusStats,
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

const statusExpr = `CASE 
    WHEN P.Nama_Panggilan IS NULL OR LEN(LTRIM(RTRIM(ISNULL(P.Nama_Panggilan,'')))) < 2 THEN 'Lainnya'
    WHEN (YEAR(GETDATE()) - (CASE WHEN TRY_CAST(SUBSTRING(LTRIM(RTRIM(P.Nama_Panggilan)), 1, 2) AS INT) <= 25 
        THEN 2000 + TRY_CAST(SUBSTRING(LTRIM(RTRIM(P.Nama_Panggilan)), 1, 2) AS INT) 
        ELSE 1900 + TRY_CAST(SUBSTRING(LTRIM(RTRIM(P.Nama_Panggilan)), 1, 2) AS INT) END)) > 56 
    THEN 'Pensiunan' ELSE 'Pegawai' END`;

/**
 * GET /api/dashboard/graph-status?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns: kunjungan per hari dengan breakdown pegawai/pensiunan
 */
exports.getGraphDataByStatus = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }
        const pool = req.db;
        if (!pool) return res.status(500).json({ message: 'Database connection failed' });

        const result = await pool.request()
            .input('startDate', sql.Date, startDate)
            .input('endDate', sql.Date, endDate)
            .query(`
                WITH KWithStatus AS (
                    SELECT K.Tgl_Kunjungan, ${statusExpr} AS status
                    FROM Kunjungan K
                    LEFT JOIN PASIEN P ON K.No_MR = P.No_MR AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)
                    WHERE CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @startDate AND @endDate
                    AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
                )
                SELECT 
                    CAST(Tgl_Kunjungan AS DATE) AS tanggal,
                    SUM(CASE WHEN status = 'Pegawai' THEN 1 ELSE 0 END) AS pegawai,
                    SUM(CASE WHEN status = 'Pensiunan' THEN 1 ELSE 0 END) AS pensiunan,
                    SUM(CASE WHEN status = 'Lainnya' THEN 1 ELSE 0 END) AS lainnya
                FROM KWithStatus
                GROUP BY CAST(Tgl_Kunjungan AS DATE)
                ORDER BY CAST(Tgl_Kunjungan AS DATE) ASC
            `);

        const data = (result.recordset || []).map(r => ({
            tanggal: r.tanggal ? new Date(r.tanggal).toISOString().slice(0, 10) : null,
            pegawai: r.pegawai ?? 0,
            pensiunan: r.pensiunan ?? 0,
            lainnya: r.lainnya ?? 0,
        }));
        res.json({ message: 'Data fetched successfully', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

/**
 * GET /api/dashboard/graph-status-month?year=YYYY
 * Returns: kunjungan per bulan dengan breakdown pegawai/pensiunan
 */
exports.getGraphDataByStatusMonth = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const pool = req.db;
        if (!pool) return res.status(500).json({ message: 'Database connection failed' });

        const result = await pool.request()
            .input('yearStart', sql.Date, `${year}-01-01`)
            .input('yearEnd', sql.Date, `${year}-12-31`)
            .query(`
                WITH KWithStatus AS (
                    SELECT K.Tgl_Kunjungan, ${statusExpr} AS status
                    FROM Kunjungan K
                    LEFT JOIN PASIEN P ON K.No_MR = P.No_MR AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)
                    WHERE CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd
                    AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
                )
                SELECT 
                    MONTH(Tgl_Kunjungan) AS bulan,
                    SUM(CASE WHEN status = 'Pegawai' THEN 1 ELSE 0 END) AS pegawai,
                    SUM(CASE WHEN status = 'Pensiunan' THEN 1 ELSE 0 END) AS pensiunan,
                    SUM(CASE WHEN status = 'Lainnya' THEN 1 ELSE 0 END) AS lainnya
                FROM KWithStatus
                GROUP BY MONTH(Tgl_Kunjungan)
                ORDER BY MONTH(Tgl_Kunjungan) ASC
            `);

        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const byMonth = Object.fromEntries([1,2,3,4,5,6,7,8,9,10,11,12].map(m => [m, { bulan: m, label: MONTHS[m-1], pegawai: 0, pensiunan: 0, lainnya: 0 }]));
        (result.recordset || []).forEach(r => {
            const m = r.bulan ?? 1;
            if (byMonth[m]) {
                byMonth[m].pegawai = r.pegawai ?? 0;
                byMonth[m].pensiunan = r.pensiunan ?? 0;
                byMonth[m].lainnya = r.lainnya ?? 0;
            }
        });
        const data = Object.values(byMonth);
        res.json({ message: 'Data fetched successfully', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

/**
 * GET /api/dashboard/pembelian-obat/stats?month=1&year=2025
 * Returns: stats pembelian obat dari POHeader, PODetail, ROHeader, RODetail.
 * Tabel/kolom dideteksi otomatis (tanggal, GCRecord opsional).
 */
exports.getPembelianObatStats = async (req, res) => {
    try {
        const pool = req.db;
        if (!pool) return res.status(500).json({ message: 'Database connection failed' });

        const now = new Date();
        const reqYear = parseInt(req.query.year) || now.getFullYear();
        const reqMonth = parseInt(req.query.month) || (now.getMonth() + 1);
        const monthStart = `${reqYear}-${String(reqMonth).padStart(2, '0')}-01`;
        const lastDayOfMonth = new Date(reqYear, reqMonth, 0).getDate();
        const monthEnd = `${reqYear}-${String(reqMonth).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
        const yearStart = `${reqYear}-01-01`;
        const yearEnd = `${reqYear}-12-31`;

        const out = {
            poBulanIni: 0,
            poTahunIni: 0,
            nilaiBulanIni: 0,
            nilaiTahunIni: 0,
            roBulanIni: 0,
            roTahunIni: 0,
        };

        const poHeaderTable = await resolveTableName(pool, ['POHeader', 'PO_Header', 'PurchaseOrderHeader']);
        if (poHeaderTable) {
            try {
                const poDateCol = await getDateColumnName(pool, poHeaderTable, ['TglPO', 'Tanggal', 'PO_Date', 'Tgl_PO', 'OrderDate', 'Tgl', 'Date', 'CreatedAt']);
                if (poDateCol) {
                    const hGc = await hasColumn(pool, poHeaderTable, 'GCRecord');
                    const hWhere = hGc ? ` AND (H.GCRecord = 0 OR H.GCRecord = 'False' OR H.GCRecord IS NULL)` : '';

                    // Prioritas 1: nilai dari kolom di POHeader (Total, Jumlah, Subtotal, dll)
                    const nilaiCol = await getPOHeaderNilaiColumnName(pool, poHeaderTable);
                    if (nilaiCol) {
                        const reqPool = pool.request();
                        reqPool.input('monthStart', sql.Date, monthStart);
                        reqPool.input('monthEnd', sql.Date, monthEnd);
                        reqPool.input('yearStart', sql.Date, yearStart);
                        reqPool.input('yearEnd', sql.Date, yearEnd);
                        const poStatsResult = await reqPool.query(`
                            SELECT
                                SUM(CASE WHEN CAST(H.[${poDateCol}] AS DATE) BETWEEN @monthStart AND @monthEnd THEN 1 ELSE 0 END) AS poBulanIni,
                                SUM(CASE WHEN CAST(H.[${poDateCol}] AS DATE) BETWEEN @yearStart AND @yearEnd THEN 1 ELSE 0 END) AS poTahunIni,
                                SUM(CASE WHEN CAST(H.[${poDateCol}] AS DATE) BETWEEN @monthStart AND @monthEnd THEN ISNULL(H.[${nilaiCol}], 0) ELSE 0 END) AS nilaiBulanIni,
                                SUM(CASE WHEN CAST(H.[${poDateCol}] AS DATE) BETWEEN @yearStart AND @yearEnd THEN ISNULL(H.[${nilaiCol}], 0) ELSE 0 END) AS nilaiTahunIni
                            FROM [${poHeaderTable}] H
                            WHERE 1=1 ${hWhere}
                        `);
                        const poRow = poStatsResult.recordset && poStatsResult.recordset[0];
                        if (poRow) {
                            out.poBulanIni = poRow.poBulanIni ?? 0;
                            out.poTahunIni = poRow.poTahunIni ?? 0;
                            out.nilaiBulanIni = poRow.nilaiBulanIni ?? 0;
                            out.nilaiTahunIni = poRow.nilaiTahunIni ?? 0;
                        }
                    } else {
                        // Prioritas 2: nilai dari PODetail (Qty*Harga / Jumlah / Subtotal)
                        const poDetailTable = await resolveTableName(pool, ['PODetail', 'PO_Detail', 'PurchaseOrderDetail']);
                        if (poDetailTable) {
                            const dGc = await hasColumn(pool, poDetailTable, 'GCRecord');
                            const hasNoPO = await hasColumn(pool, poHeaderTable, 'NoPO') && await hasColumn(pool, poDetailTable, 'NoPO');
                            const hasPOHeaderID = await hasColumn(pool, poHeaderTable, 'POHeaderID') && await hasColumn(pool, poDetailTable, 'POHeaderID');
                            const joinCol = hasNoPO ? 'NoPO' : (hasPOHeaderID ? 'POHeaderID' : null);
                            const hasQtyHarga = await hasColumn(pool, poDetailTable, 'Qty') && await hasColumn(pool, poDetailTable, 'Harga');
                            const hasJumlah = await hasColumn(pool, poDetailTable, 'Jumlah');
                            const hasSubtotal = await hasColumn(pool, poDetailTable, 'Subtotal');
                            const nilaiExpr = hasQtyHarga
                                ? 'SUM(ISNULL(D2.Qty, 0) * ISNULL(D2.Harga, 0))'
                                : (hasJumlah ? 'SUM(ISNULL(D2.Jumlah, 0))' : (hasSubtotal ? 'SUM(ISNULL(D2.Subtotal, 0))' : '0'));
                            if (joinCol) {
                                const dWhere = dGc ? ` AND (D2.GCRecord = 0 OR D2.GCRecord = 'False' OR D2.GCRecord IS NULL)` : '';
                                const reqPool = pool.request();
                                reqPool.input('monthStart', sql.Date, monthStart);
                                reqPool.input('monthEnd', sql.Date, monthEnd);
                                reqPool.input('yearStart', sql.Date, yearStart);
                                reqPool.input('yearEnd', sql.Date, yearEnd);
                                const poStatsResult = await reqPool.query(`
                                    SELECT
                                        SUM(CASE WHEN CAST(H.[${poDateCol}] AS DATE) BETWEEN @monthStart AND @monthEnd THEN 1 ELSE 0 END) AS poBulanIni,
                                        SUM(CASE WHEN CAST(H.[${poDateCol}] AS DATE) BETWEEN @yearStart AND @yearEnd THEN 1 ELSE 0 END) AS poTahunIni,
                                        SUM(CASE WHEN CAST(H.[${poDateCol}] AS DATE) BETWEEN @monthStart AND @monthEnd THEN ISNULL(D.nilai, 0) ELSE 0 END) AS nilaiBulanIni,
                                        SUM(CASE WHEN CAST(H.[${poDateCol}] AS DATE) BETWEEN @yearStart AND @yearEnd THEN ISNULL(D.nilai, 0) ELSE 0 END) AS nilaiTahunIni
                                    FROM [${poHeaderTable}] H
                                    OUTER APPLY (
                                        SELECT ${nilaiExpr} AS nilai
                                        FROM [${poDetailTable}] D2
                                        WHERE D2.[${joinCol}] = H.[${joinCol}] ${dWhere}
                                    ) D
                                    WHERE 1=1 ${hWhere}
                                `);
                                const poRow = poStatsResult.recordset && poStatsResult.recordset[0];
                                if (poRow) {
                                    out.poBulanIni = poRow.poBulanIni ?? 0;
                                    out.poTahunIni = poRow.poTahunIni ?? 0;
                                    out.nilaiBulanIni = poRow.nilaiBulanIni ?? 0;
                                    out.nilaiTahunIni = poRow.nilaiTahunIni ?? 0;
                                }
                            }
                        }
                    }
                }
            } catch (poErr) {
                console.warn('Pembelian PO stats error:', poErr.message);
            }
        }

        const roHeaderTable = await resolveTableName(pool, ['ROHeader', 'RO_Header', 'ReceivingOrderHeader']);
        if (roHeaderTable) {
            try {
                const roDateCol = await getDateColumnName(pool, roHeaderTable, ['TglRO', 'Tanggal', 'RO_Date', 'Tgl_RO', 'OrderDate', 'Tgl', 'Date', 'CreatedAt']);
                if (roDateCol) {
                    const roGc = await hasColumn(pool, roHeaderTable, 'GCRecord');
                    const roWhere = roGc ? ` AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL)` : '';
                    const roResult = await pool.request()
                        .input('monthStart', sql.Date, monthStart)
                        .input('monthEnd', sql.Date, monthEnd)
                        .input('yearStart', sql.Date, yearStart)
                        .input('yearEnd', sql.Date, yearEnd)
                        .query(`
                            SELECT
                                SUM(CASE WHEN CAST([${roDateCol}] AS DATE) BETWEEN @monthStart AND @monthEnd THEN 1 ELSE 0 END) AS roBulanIni,
                                SUM(CASE WHEN CAST([${roDateCol}] AS DATE) BETWEEN @yearStart AND @yearEnd THEN 1 ELSE 0 END) AS roTahunIni
                            FROM [${roHeaderTable}]
                            WHERE 1=1 ${roWhere}
                        `);
                    const roRow = roResult.recordset && roResult.recordset[0];
                    if (roRow) {
                        out.roBulanIni = roRow.roBulanIni ?? 0;
                        out.roTahunIni = roRow.roTahunIni ?? 0;
                    }
                }
            } catch (roErr) {
                console.warn('Pembelian RO stats error:', roErr.message);
            }
        }

        res.json({ message: 'Data fetched successfully', pembelianObat: out });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

/**
 * GET /api/dashboard/pembelian-obat/schema
 * Debug: daftar tabel PO/RO dan kolom yang terdeteksi (untuk cek kenapa data tidak muncul).
 */
exports.getPembelianObatSchema = async (req, res) => {
    try {
        const pool = req.db;
        if (!pool) return res.status(500).json({ message: 'Database connection failed' });

        const tablesToCheck = ['POHeader', 'PO_Header', 'PODetail', 'PO_Detail', 'ROHeader', 'RO_Header', 'RODetail', 'RO_Detail'];
        const found = {};
        for (const name of tablesToCheck) {
            const exists = await tableExists(pool, name);
            if (exists) {
                const dateCol = await getDateColumnName(pool, name, ['TglPO', 'Tanggal', 'TglRO', 'OrderDate', 'Tgl', 'Date']);
                const hasGc = await hasColumn(pool, name, 'GCRecord');
                const hasNoPO = await hasColumn(pool, name, 'NoPO');
                const hasPOHeaderID = await hasColumn(pool, name, 'POHeaderID');
                const hasNoRO = await hasColumn(pool, name, 'NoRO');
                const hasQty = await hasColumn(pool, name, 'Qty');
                const hasHarga = await hasColumn(pool, name, 'Harga');
                const hasJumlah = await hasColumn(pool, name, 'Jumlah');
                const hasSubtotal = await hasColumn(pool, name, 'Subtotal');
                found[name] = { exists: true, dateColumn: dateCol, GCRecord: hasGc, NoPO: hasNoPO, POHeaderID: hasPOHeaderID, NoRO: hasNoRO, Qty: hasQty, Harga: hasHarga, Jumlah: hasJumlah, Subtotal: hasSubtotal };
            }
        }
        const resolvedPOHeader = await resolveTableName(pool, ['POHeader', 'PO_Header', 'PurchaseOrderHeader']);
        const resolvedPODetail = await resolveTableName(pool, ['PODetail', 'PO_Detail', 'PurchaseOrderDetail']);
        const resolvedROHeader = await resolveTableName(pool, ['ROHeader', 'RO_Header', 'ReceivingOrderHeader']);
        const poHeaderNilaiCol = resolvedPOHeader ? await getPOHeaderNilaiColumnName(pool, resolvedPOHeader) : null;
        res.json({
            message: 'Schema info for pembelian obat',
            resolved: { POHeader: resolvedPOHeader, PODetail: resolvedPODetail, ROHeader: resolvedROHeader },
            poHeaderNilaiColumn: poHeaderNilaiCol,
            tables: found,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

/** Cek apakah tabel ada (nama case-insensitive via COLLATE atau LOWER) */
async function tableExists(pool, tableName) {
    try {
        const r = await pool.request()
            .input('tableName', sql.VarChar, tableName)
            .query(`
                SELECT 1 AS ok FROM INFORMATION_SCHEMA.TABLES
                WHERE LOWER(TABLE_NAME) = LOWER(@tableName)
            `);
        return r.recordset && r.recordset.length > 0;
    } catch (_) {
        return false;
    }
}

/** Cek apakah kolom ada di tabel */
async function hasColumn(pool, tableName, columnName) {
    try {
        const r = await pool.request()
            .input('tableName', sql.VarChar, tableName)
            .input('col', sql.VarChar, columnName)
            .query(`
                SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
                WHERE LOWER(TABLE_NAME) = LOWER(@tableName) AND LOWER(COLUMN_NAME) = LOWER(@col)
            `);
        return r.recordset && r.recordset.length > 0;
    } catch (_) {
        return false;
    }
}

/** Ambil nama kolom tanggal: coba daftar candidates dulu, lalu kolom bertipe date/datetime mana pun */
async function getDateColumnName(pool, tableName, candidates) {
    const tryCol = async (col) => {
        const r = await pool.request()
            .input('tableName', sql.VarChar, tableName)
            .input('col', sql.VarChar, col)
            .query(`
                SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
                WHERE LOWER(TABLE_NAME) = LOWER(@tableName) AND LOWER(COLUMN_NAME) = LOWER(@col)
            `);
        return r.recordset && r.recordset.length > 0 ? col : null;
    };
    for (const col of candidates) {
        try {
            const found = await tryCol(col);
            if (found) return found;
        } catch (_) { /* ignore */ }
    }
    try {
        const r = await pool.request()
            .input('tableName', sql.VarChar, tableName)
            .query(`
                SELECT TOP 1 COLUMN_NAME AS col
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE LOWER(TABLE_NAME) = LOWER(@tableName)
                AND DATA_TYPE IN ('date','datetime','datetime2','smalldatetime')
                ORDER BY ORDINAL_POSITION
            `);
        if (r.recordset && r.recordset[0] && r.recordset[0].col) return r.recordset[0].col;
    } catch (_) { /* ignore */ }
    return null;
}

/** Resolve nama tabel: kembalikan nama asli dari DB jika ada (dari daftar candidates) */
async function resolveTableName(pool, candidates) {
    for (const name of candidates) {
        try {
            const r = await pool.request()
                .input('name', sql.VarChar, name)
                .query(`
                    SELECT TABLE_NAME AS tbl FROM INFORMATION_SCHEMA.TABLES
                    WHERE LOWER(TABLE_NAME) = LOWER(@name)
                `);
            if (r.recordset && r.recordset[0] && r.recordset[0].tbl) return r.recordset[0].tbl;
        } catch (_) { /* ignore */ }
    }
    return null;
}

/** Ambil nama kolom nilai/total di POHeader (prioritas: Total, Jumlah, Subtotal, GrandTotal, dll) */
async function getPOHeaderNilaiColumnName(pool, tableName) {
    const candidates = ['Total', 'Jumlah', 'Subtotal', 'GrandTotal', 'TotalAmount', 'Nilai', 'Amount', 'RpTotal', 'TotalDue', 'SumTotal', 'TotalOrder'];
    for (const col of candidates) {
        try {
            const r = await pool.request()
                .input('tableName', sql.VarChar, tableName)
                .input('col', sql.VarChar, col)
                .query(`
                    SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE LOWER(TABLE_NAME) = LOWER(@tableName) AND LOWER(COLUMN_NAME) = LOWER(@col)
                    AND DATA_TYPE IN ('decimal','numeric','float','real','int','bigint','smallint','money','smallmoney')
                `);
            if (r.recordset && r.recordset.length > 0) return col;
        } catch (_) { /* ignore */ }
    }
    try {
        const r = await pool.request()
            .input('tableName', sql.VarChar, tableName)
            .query(`
                SELECT TOP 1 COLUMN_NAME AS col
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE LOWER(TABLE_NAME) = LOWER(@tableName)
                AND DATA_TYPE IN ('decimal','numeric','float','real','money','smallmoney')
                AND (LOWER(COLUMN_NAME) LIKE '%total%' OR LOWER(COLUMN_NAME) LIKE '%jumlah%' OR LOWER(COLUMN_NAME) LIKE '%nilai%' OR LOWER(COLUMN_NAME) LIKE '%amount%')
                ORDER BY ORDINAL_POSITION
            `);
        if (r.recordset && r.recordset[0] && r.recordset[0].col) return r.recordset[0].col;
    } catch (_) { /* ignore */ }
    return null;
}

/**
 * GET /api/dashboard/pembelian-obat/graph?year=2025
 * Returns: nilai pembelian per bulan dari POHeader + PODetail (untuk grafik).
 */
exports.getPembelianObatGraph = async (req, res) => {
    try {
        const pool = req.db;
        if (!pool) return res.status(500).json({ message: 'Database connection failed' });

        const year = parseInt(req.query.year) || new Date().getFullYear();
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;

        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        const byMonth = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({
            bulan: m,
            label: MONTHS[m - 1],
            nilai: 0,
            jumlahPO: 0,
        }));

        const poHeaderTable = await resolveTableName(pool, ['POHeader', 'PO_Header', 'PurchaseOrderHeader']);
        if (poHeaderTable) {
            try {
                const poDateCol = await getDateColumnName(pool, poHeaderTable, ['TglPO', 'Tanggal', 'PO_Date', 'Tgl_PO', 'OrderDate', 'Tgl', 'Date', 'CreatedAt']);
                if (poDateCol) {
                    const hGc = await hasColumn(pool, poHeaderTable, 'GCRecord');
                    const hWhere = hGc ? ` AND (H.GCRecord = 0 OR H.GCRecord = 'False' OR H.GCRecord IS NULL)` : '';

                    const nilaiCol = await getPOHeaderNilaiColumnName(pool, poHeaderTable);
                    if (nilaiCol) {
                        const result = await pool.request()
                            .input('yearStart', sql.Date, yearStart)
                            .input('yearEnd', sql.Date, yearEnd)
                            .query(`
                                SELECT
                                    MONTH(H.[${poDateCol}]) AS bulan,
                                    SUM(ISNULL(H.[${nilaiCol}], 0)) AS nilai,
                                    COUNT(*) AS jumlahPO
                                FROM [${poHeaderTable}] H
                                WHERE CAST(H.[${poDateCol}] AS DATE) BETWEEN @yearStart AND @yearEnd ${hWhere}
                                GROUP BY MONTH(H.[${poDateCol}])
                                ORDER BY bulan
                            `);
                        (result.recordset || []).forEach(r => {
                            const m = r.bulan ?? 1;
                            const idx = byMonth.findIndex(x => x.bulan === m);
                            if (idx >= 0) {
                                byMonth[idx].nilai = r.nilai ?? 0;
                                byMonth[idx].jumlahPO = r.jumlahPO ?? 0;
                            }
                        });
                    } else {
                        const poDetailTable = await resolveTableName(pool, ['PODetail', 'PO_Detail', 'PurchaseOrderDetail']);
                        if (poDetailTable) {
                            const dGc = await hasColumn(pool, poDetailTable, 'GCRecord');
                            const hasNoPO = await hasColumn(pool, poHeaderTable, 'NoPO') && await hasColumn(pool, poDetailTable, 'NoPO');
                            const hasPOHeaderID = await hasColumn(pool, poHeaderTable, 'POHeaderID') && await hasColumn(pool, poDetailTable, 'POHeaderID');
                            const joinCol = hasNoPO ? 'NoPO' : (hasPOHeaderID ? 'POHeaderID' : null);
                            const hasQtyHarga = await hasColumn(pool, poDetailTable, 'Qty') && await hasColumn(pool, poDetailTable, 'Harga');
                            const hasJumlah = await hasColumn(pool, poDetailTable, 'Jumlah');
                            const hasSubtotal = await hasColumn(pool, poDetailTable, 'Subtotal');
                            const nilaiExpr = hasQtyHarga
                                ? 'SUM(ISNULL(D2.Qty, 0) * ISNULL(D2.Harga, 0))'
                                : (hasJumlah ? 'SUM(ISNULL(D2.Jumlah, 0))' : (hasSubtotal ? 'SUM(ISNULL(D2.Subtotal, 0))' : '0'));
                            if (joinCol) {
                                const dWhere = dGc ? ` AND (D2.GCRecord = 0 OR D2.GCRecord = 'False' OR D2.GCRecord IS NULL)` : '';
                                const result = await pool.request()
                                    .input('yearStart', sql.Date, yearStart)
                                    .input('yearEnd', sql.Date, yearEnd)
                                    .query(`
                                        SELECT
                                            MONTH(H.[${poDateCol}]) AS bulan,
                                            SUM(ISNULL(D.nilai, 0)) AS nilai,
                                            COUNT(DISTINCT H.[${joinCol}]) AS jumlahPO
                                        FROM [${poHeaderTable}] H
                                        OUTER APPLY (
                                            SELECT ${nilaiExpr} AS nilai
                                            FROM [${poDetailTable}] D2
                                            WHERE D2.[${joinCol}] = H.[${joinCol}] ${dWhere}
                                        ) D
                                        WHERE CAST(H.[${poDateCol}] AS DATE) BETWEEN @yearStart AND @yearEnd ${hWhere}
                                        GROUP BY MONTH(H.[${poDateCol}])
                                        ORDER BY bulan
                                    `);
                                (result.recordset || []).forEach(r => {
                                    const m = r.bulan ?? 1;
                                    const idx = byMonth.findIndex(x => x.bulan === m);
                                    if (idx >= 0) {
                                        byMonth[idx].nilai = r.nilai ?? 0;
                                        byMonth[idx].jumlahPO = r.jumlahPO ?? 0;
                                    }
                                });
                            }
                        }
                    }
                }
            } catch (graphErr) {
                console.warn('Pembelian graph error:', graphErr.message);
            }
        }

        res.json({ message: 'Data fetched successfully', data: byMonth });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

/**
 * GET /api/dashboard/graph-status-year?yearFrom=YYYY&yearTo=YYYY
 * Returns: kunjungan per tahun dengan breakdown pegawai/pensiunan
 */
exports.getGraphDataByStatusYear = async (req, res) => {
    try {
        const now = new Date().getFullYear();
        const yearFrom = parseInt(req.query.yearFrom) || now - 4;
        const yearTo = parseInt(req.query.yearTo) || now;
        const pool = req.db;
        if (!pool) return res.status(500).json({ message: 'Database connection failed' });

        const result = await pool.request()
            .input('yearStart', sql.Date, `${yearFrom}-01-01`)
            .input('yearEnd', sql.Date, `${yearTo}-12-31`)
            .query(`
                WITH KWithStatus AS (
                    SELECT K.Tgl_Kunjungan, ${statusExpr} AS status
                    FROM Kunjungan K
                    LEFT JOIN PASIEN P ON K.No_MR = P.No_MR AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)
                    WHERE CAST(K.Tgl_Kunjungan AS DATE) BETWEEN @yearStart AND @yearEnd
                    AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
                )
                SELECT 
                    YEAR(Tgl_Kunjungan) AS tahun,
                    SUM(CASE WHEN status = 'Pegawai' THEN 1 ELSE 0 END) AS pegawai,
                    SUM(CASE WHEN status = 'Pensiunan' THEN 1 ELSE 0 END) AS pensiunan,
                    SUM(CASE WHEN status = 'Lainnya' THEN 1 ELSE 0 END) AS lainnya
                FROM KWithStatus
                GROUP BY YEAR(Tgl_Kunjungan)
                ORDER BY YEAR(Tgl_Kunjungan) ASC
            `);

        const byYear = Object.fromEntries(
            Array.from({ length: yearTo - yearFrom + 1 }, (_, i) => yearFrom + i).map(y => [y, { tahun: y, pegawai: 0, pensiunan: 0, lainnya: 0 }])
        );
        (result.recordset || []).forEach(r => {
            const y = r.tahun ?? yearFrom;
            if (byYear[y]) {
                byYear[y].pegawai = r.pegawai ?? 0;
                byYear[y].pensiunan = r.pensiunan ?? 0;
                byYear[y].lainnya = r.lainnya ?? 0;
            }
        });
        const data = Object.values(byYear);
        res.json({ message: 'Data fetched successfully', data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
