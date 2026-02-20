const { sql } = require('../config/db');

exports.getWilayah = async (req, res) => {
    try {
        const { type, parentID, nama } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let tableName = '';
        let filterClause = ' WHERE 1=1';
        let orderBy = '';
        const inputs = {};

        switch (type?.toLowerCase()) {
            case 'propinsi':
                tableName = 'Wilayah_Propinsi';
                orderBy = 'Propinsi_Name';
                if (nama) {
                    filterClause += ` AND Propinsi_Name LIKE @nama`;
                    inputs.nama = { type: sql.VarChar, value: `%${nama}%` };
                }
                break;
            case 'kota':
                tableName = 'Wilayah_Kota';
                orderBy = 'Kota_Name';
                if (parentID) {
                    filterClause += ` AND Propinsi_ID = @parentID`;
                    inputs.parentID = { type: sql.Int, value: parentID };
                }
                if (nama) {
                    filterClause += ` AND Kota_Name LIKE @nama`;
                    inputs.nama = { type: sql.VarChar, value: `%${nama}%` };
                }
                break;
            case 'kecamatan':
                tableName = 'Wilayah_Kecamatan';
                orderBy = 'Kecamatan_Name';
                if (parentID) {
                    filterClause += ` AND Kota_ID = @parentID`;
                    inputs.parentID = { type: sql.Int, value: parentID };
                }
                if (nama) {
                    filterClause += ` AND Kecamatan_Name LIKE @nama`;
                    inputs.nama = { type: sql.VarChar, value: `%${nama}%` };
                }
                break;
            case 'kelurahan':
                tableName = 'Wilayah_Kelurahan';
                orderBy = 'Kelurahan_Name';
                if (parentID) {
                    filterClause += ` AND Kecamatan_ID = @parentID`;
                    inputs.parentID = { type: sql.Int, value: parentID };
                }
                if (nama) {
                    filterClause += ` AND Kelurahan_Name LIKE @nama`;
                    inputs.nama = { type: sql.VarChar, value: `%${nama}%` };
                }
                break;
            default:
                return res.status(400).json({ message: 'Invalid or missing type parameter. Valid types: propinsi, kota, kecamatan, kelurahan' });
        }

        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });

        const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM ${tableName} ${filterClause}`);
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
            FROM ${tableName} 
            ${filterClause}
            ORDER BY ${orderBy} ASC 
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
