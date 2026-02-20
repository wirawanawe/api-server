const { sql } = require('../config/db');

exports.getTrustUsers = async (req, res) => {
    try {
        const { userName } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let filterClause = ' WHERE 1=1';
        const inputs = {};

        if (userName) {
            filterClause += ` AND UserName LIKE @userName`;
            inputs.userName = { type: sql.VarChar, value: `%${userName}%` };
        }

        // 1. Get Total Count
        const countRequest = pool.request();
        Object.keys(inputs).forEach(key => {
            countRequest.input(key, inputs[key].type, inputs[key].value);
        });

        const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM TRUST_USER ${filterClause}`);
        const totalRows = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalRows / limit);

        // 2. Get Data with Pagination
        const request = pool.request();
        Object.keys(inputs).forEach(key => {
            request.input(key, inputs[key].type, inputs[key].value);
        });
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const result = await request.query(`
            SELECT User_ID, UserName, Description, IsActive 
            FROM TRUST_USER 
            ${filterClause}
            ORDER BY UserName ASC
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

exports.updateProfile = async (req, res) => {
    try {
        const { userId, description, password } = req.body;

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const pool = req.db;
        if (!pool) {
            return res.status(500).json({ message: 'Database connection failed' });
        }

        let updateQuery = 'UPDATE TRUST_USER SET Description = @description';
        const inputs = {
            userId: { type: sql.Int, value: userId },
            description: { type: sql.VarChar, value: description }
        };

        if (password) {
            updateQuery += ', Password = @password';
            inputs.password = { type: sql.VarChar, value: password };
        }

        updateQuery += ' WHERE User_ID = @userId';

        const request = pool.request();
        Object.keys(inputs).forEach(key => {
            request.input(key, inputs[key].type, inputs[key].value);
        });

        await request.query(updateQuery);

        res.json({ message: 'Profile updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};
