const mysqlPool = require('../config/mysql');
const bcrypt = require('bcryptjs');

// Helper to ensure only superadmin can access these handlers
function ensureSuperadmin(req, res) {
    const role = req.dashboardUser?.role || req.user?.role;
    if (role !== 'superadmin') {
        res.status(403).json({ message: 'Forbidden: superadmin only' });
        return false;
    }
    return true;
}

exports.listUsers = async (req, res) => {
    try {
        if (!ensureSuperadmin(req, res)) return;

        const [rows] = await mysqlPool.query(
            'SELECT id, username, role, created_at FROM dashboard_users ORDER BY created_at DESC'
        );
        res.json({ data: rows });
    } catch (err) {
        console.error('Error listing dashboard users:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getUser = async (req, res) => {
    try {
        if (!ensureSuperadmin(req, res)) return;

        const { id } = req.params;
        const [rows] = await mysqlPool.query(
            'SELECT id, username, role, created_at FROM dashboard_users WHERE id = ?',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Error getting dashboard user:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.createUser = async (req, res) => {
    try {
        if (!ensureSuperadmin(req, res)) return;

        const {
            username,
            password,
            role = 'admin',
            sql_server,
            sql_database,
            sql_user,
            sql_password,
        } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username dan password wajib' });
        }

        // Admin wajib punya credential SQL; superadmin tidak
        if (role === 'admin') {
            if (!sql_server || !sql_database || !sql_user || !sql_password) {
                return res.status(400).json({ message: 'Admin wajib memiliki credential SQL Server' });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const finalSqlServer = role === 'superadmin' ? null : sql_server;
        const finalSqlDb = role === 'superadmin' ? null : sql_database;
        const finalSqlUser = role === 'superadmin' ? null : sql_user;
        const finalSqlPass = role === 'superadmin' ? null : sql_password;

        await mysqlPool.query(
            `INSERT INTO dashboard_users 
                (username, password, sql_server, sql_database, sql_user, sql_password, role)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [username, hashedPassword, finalSqlServer, finalSqlDb, finalSqlUser, finalSqlPass, role]
        );

        res.status(201).json({ message: 'User created' });
    } catch (err) {
        console.error('Error creating dashboard user:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Username already exists' });
        }
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateUser = async (req, res) => {
    try {
        if (!ensureSuperadmin(req, res)) return;

        const { id } = req.params;
        const {
            password,
            role,
            sql_server,
            sql_database,
            sql_user,
            sql_password,
        } = req.body;

        const [rows] = await mysqlPool.query(
            'SELECT * FROM dashboard_users WHERE id = ?',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = rows[0];
        const newRole = role ?? user.role;

        const updated = {
            role: newRole,
            sql_server: newRole === 'superadmin' ? null : (sql_server ?? user.sql_server),
            sql_database: newRole === 'superadmin' ? null : (sql_database ?? user.sql_database),
            sql_user: newRole === 'superadmin' ? null : (sql_user ?? user.sql_user),
            sql_password: newRole === 'superadmin' ? null : (sql_password ?? user.sql_password),
            password: user.password,
        };

        if (newRole === 'admin' && (!updated.sql_server || !updated.sql_database || !updated.sql_user || !updated.sql_password)) {
            return res.status(400).json({ message: 'Admin wajib memiliki credential SQL Server' });
        }

        if (password) {
            updated.password = await bcrypt.hash(password, 10);
        }

        await mysqlPool.query(
            `UPDATE dashboard_users
             SET password = ?, role = ?, sql_server = ?, sql_database = ?, sql_user = ?, sql_password = ?
             WHERE id = ?`,
            [
                updated.password,
                updated.role,
                updated.sql_server,
                updated.sql_database,
                updated.sql_user,
                updated.sql_password,
                id,
            ]
        );

        res.json({ message: 'User updated' });
    } catch (err) {
        console.error('Error updating dashboard user:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (!ensureSuperadmin(req, res)) return;

        const { id } = req.params;

        await mysqlPool.query(
            'DELETE FROM dashboard_users WHERE id = ?',
            [id]
        );

        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error('Error deleting dashboard user:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

