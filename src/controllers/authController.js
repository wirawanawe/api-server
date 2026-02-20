const mysqlPool = require('../config/mysql');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Check User in MySQL
        const [rows] = await mysqlPool.query('SELECT * FROM dashboard_users WHERE username = ?', [username]);

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const user = rows[0];

        // 2. Verify Password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        // 3. Generate JWT (include role)
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '1d' }
        );

        // 4. Save latest auth token in user table
        try {
            await mysqlPool.query(
                'UPDATE dashboard_users SET auth_token = ? WHERE id = ?',
                [token, user.id]
            );
        } catch (updateErr) {
            console.error('Failed to store auth token in dashboard_users:', updateErr);
            // Do not block login if token persistence fails
        }

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
            },
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
    }
};
