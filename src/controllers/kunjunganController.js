const { sql } = require('../config/db');

exports.getKunjungan = async (req, res) => {
    try {
        const { startDate, endDate, noMR, namaPeserta, noKPK, dokterID, sortBy, sortOrder } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        // Build Filter Clause
        let filterClause = " WHERE 1=1 AND (Kunjungan.GCRecord = 0 OR Kunjungan.GCRecord = 'False' OR Kunjungan.GCRecord IS NULL)";
        const inputs = {};

        if (startDate && endDate) {
            filterClause += ` AND Tgl_Kunjungan BETWEEN @startDate AND @endDate`;
            inputs.startDate = { type: sql.Date, value: startDate };
            inputs.endDate = { type: sql.Date, value: endDate };
        }

        if (noMR) {
            filterClause += ` AND No_MR = @noMR`;
            inputs.noMR = { type: sql.VarChar, value: noMR };
        }

        if (namaPeserta) {
            filterClause += ` AND Nama_Peserta LIKE @namaPeserta`;
            inputs.namaPeserta = { type: sql.VarChar, value: `%${namaPeserta}%` };
        }

        if (noKPK) {
            filterClause += ` AND No_KPK = @noKPK`;
            inputs.noKPK = { type: sql.VarChar, value: noKPK };
        }

        if (dokterID) {
            filterClause += ` AND Dokter_ID = @dokterID`;
            inputs.dokterID = { type: sql.Int, value: dokterID };
        }

        // 1. Get Total Count
        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });

        const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM Kunjungan ${filterClause.replace(/Kunjungan\.GCRecord/g, 'GCRecord')}`);
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
        const finalOrder = validSortBy ? `${validSortBy} ${validSortOrder}` : 'K.Tgl_Kunjungan DESC';

        const result = await request.query(`
            SELECT K.*, D.Dokter_Name, U.Unit_Name, P.Nama_Panggilan
            FROM Kunjungan K
            LEFT JOIN Dokter D ON K.Dokter_ID = D.Dokter_ID
            LEFT JOIN Unit U ON K.Unit_ID = U.Unit_ID
            LEFT JOIN PASIEN P ON K.No_MR = P.No_MR AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)
            ${filterClause.replace(/Kunjungan\.GCRecord/g, 'K.GCRecord')}
            ORDER BY ${finalOrder} 
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

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

function parseKunjunganId(idRaw) {
    if (idRaw == null || String(idRaw).trim() === '') return null;
    const s = String(idRaw).trim();
    if (/^-?\d+$/.test(s)) {
        const n = parseInt(s, 10);
        if (n >= INT32_MIN && n <= INT32_MAX) return { type: 'int', value: n };
    }
    return { type: 'string', value: s };
}

exports.getKunjunganDetail = async (req, res) => {
    try {
        const idRaw = req.params.id;
        const idParsed = parseKunjunganId(idRaw);
        if (idParsed == null) {
            return res.status(400).json({ message: 'Invalid Kunjungan ID' });
        }

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        const kReq = pool.request();
        if (idParsed.type === 'int') {
            kReq.input('id', sql.Int, idParsed.value);
        } else {
            kReq.input('id', sql.NVarChar, idParsed.value);
        }

        const kunjunganResult = await kReq.query(`
                SELECT K.*, D.Dokter_Name, U.Unit_Name, P.Nama_Panggilan
                FROM Kunjungan K
                LEFT JOIN Dokter D ON K.Dokter_ID = D.Dokter_ID
                LEFT JOIN Unit U ON K.Unit_ID = U.Unit_ID
                LEFT JOIN PASIEN P ON K.No_MR = P.No_MR AND (P.GCRecord = 0 OR P.GCRecord = 'False' OR P.GCRecord IS NULL)
                WHERE K.Kunjungan_ID = @id AND (K.GCRecord = 0 OR K.GCRecord = 'False' OR K.GCRecord IS NULL)
            `);

        if (kunjunganResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Kunjungan not found' });
        }

        const dReq = pool.request();
        if (idParsed.type === 'int') {
            dReq.input('kunjunganId', sql.Int, idParsed.value);
        } else {
            dReq.input('kunjunganId', sql.NVarChar, idParsed.value);
        }
        const diagnosaResult = await dReq
            .query(`
                SELECT
                    I.ICD AS ICD,
                    I.Disease AS Diseases,
                    DT.Name AS DiagnosaType,
                    DC.Name AS DiagnosaCase,
                    FS.Name AS FinalState
                FROM MR_Diagnosis MD
                LEFT JOIN MR_ICD I ON MD.ICD_ID = I.ID
                LEFT JOIN MR_DiagnosisType DT ON MD.Type_ID = DT.ID
                LEFT JOIN MR_DiagnosisCase DC ON MD.Case_ID = DC.ID
                LEFT JOIN MR_FinalState FS ON MD.FinalState_ID = FS.ID
                WHERE MD.Kunjungan_ID = @kunjunganId
                ORDER BY MD.ID
            `);

        const diagnosa = (diagnosaResult.recordset || []).map((row, idx) => ({
            No: idx + 1,
            ICD: row.ICD ?? '',
            Diseases: row.Diseases ?? '',
            DiagnosaType: row.DiagnosaType ?? '',
            DiagnosaCase: row.DiagnosaCase ?? '',
            FinalState: row.FinalState ?? '',
        }));

        // Resep by Kunjungan_ID
        const rReq = pool.request();
        if (idParsed.type === 'int') {
            rReq.input('kunjunganId', sql.Int, idParsed.value);
        } else {
            rReq.input('kunjunganId', sql.NVarChar, idParsed.value);
        }
        const resepResult = await rReq.query(`
            SELECT * FROM Resep WHERE Kunjungan_ID = @kunjunganId AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL) ORDER BY NoInvoice
        `);
        const resepRows = resepResult.recordset || [];

        const resepWithDetail = [];
        for (const resep of resepRows) {
            const noInvoice = resep.NoInvoice;
            const rdReq = pool.request().input('noInvoice', sql.VarChar, noInvoice);
            const detailResult = await rdReq.query(`
                SELECT * FROM Resep_Detail WHERE NoInvoice = @noInvoice AND (GCRecord = 0 OR GCRecord = 'False' OR GCRecord IS NULL) ORDER BY NoUrut ASC
            `);
            resepWithDetail.push({
                ...resep,
                detail: detailResult.recordset || [],
            });
        }

        res.json({
            message: 'Data fetched successfully',
            kunjungan: kunjunganResult.recordset[0],
            diagnosa,
            resep: resepWithDetail,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
