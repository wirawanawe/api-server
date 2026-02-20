const jwt = require('jsonwebtoken');
const mysqlPool = require('../config/mysql');
const { getPool } = require('../services/connectionManager');

const dynamicDb = async (req, res, next) => {
    try {
        // 1. Get Token from Header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        // 2. Verify Token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        req.user = decoded;

        // 3. Fetch SQL Server Credentials from MySQL for current dashboard user
        const [rows] = await mysqlPool.query('SELECT * FROM dashboard_users WHERE id = ?', [decoded.id]);

        if (rows.length === 0) {
            return res.status(403).json({ message: 'User not found in dashboard database' });
        }

        const currentDashboardUser = rows[0];
        req.dashboardUser = {
            id: currentDashboardUser.id,
            username: currentDashboardUser.username,
            role: currentDashboardUser.role,
        };

        // 3a. Route dashboard-users tidak memerlukan SQL Server (hanya MySQL)
        const isDashboardUsersRoute = req.baseUrl && req.baseUrl.startsWith('/api/dashboard-users');
        if (currentDashboardUser.role === 'superadmin' && isDashboardUsersRoute) {
            req.db = null;
            return next();
        }

        // 3b. Superadmin: tidak punya credential SQL, wajib impersonate admin
        const impersonateId = req.headers['x-impersonate-user-id'];
        let sqlUserConfig = currentDashboardUser;

        if (currentDashboardUser.role === 'superadmin') {
            if (!impersonateId) {
                return res.status(400).json({
                    message: 'Superadmin harus memilih admin untuk melihat data (header: x-impersonate-user-id)',
                });
            }
            const [impersonatedRows] = await mysqlPool.query(
                'SELECT * FROM dashboard_users WHERE id = ?',
                [impersonateId]
            );
            if (impersonatedRows.length === 0) {
                return res.status(400).json({ message: 'Admin yang dipilih tidak ditemukan' });
            }
            const impersonatedUser = impersonatedRows[0];
            if (impersonatedUser.role === 'superadmin' || !impersonatedUser.sql_server) {
                return res.status(400).json({
                    message: 'Hanya bisa impersonate user admin yang memiliki credential SQL Server',
                });
            }
            sqlUserConfig = impersonatedUser;
            req.impersonatedUser = {
                id: impersonatedUser.id,
                username: impersonatedUser.username,
            };
        } else if (currentDashboardUser.role === 'admin') {
            // Admin: wajib punya credential SQL sendiri
            if (!currentDashboardUser.sql_server || !currentDashboardUser.sql_database) {
                return res.status(400).json({
                    message: 'Admin belum dikonfigurasi credential SQL Server. Hubungi superadmin.',
                });
            }
        }

        // 4. Configure MSSQL Connection using chosen user config
        const sqlConfig = {
            user: sqlUserConfig.sql_user,
            password: sqlUserConfig.sql_password,
            server: sqlUserConfig.sql_server,
            database: sqlUserConfig.sql_database,
            options: {
                // Gunakan koneksi non-SSL karena banyak server lama tidak support TLS modern
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            }
        };

        // Handle instance name if present in server string (e.g. Host\Instance)
        if (sqlUserConfig.sql_server && sqlUserConfig.sql_server.includes('\\')) {
            const [server, instance] = sqlUserConfig.sql_server.split('\\');
            sqlConfig.server = server;
            sqlConfig.options.instanceName = instance;
        }

        // 5. Get/Create Pool and Attach to Request
        const poolName = `${sqlUserConfig.username}_${sqlUserConfig.sql_database}`;
        const pool = await getPool(poolName, sqlConfig);
        req.db = pool;

        next();
    } catch (err) {
        console.error('Dynamic DB Middleware Error:', err);
        return res.status(403).json({ message: 'Invalid token or database connection failed' });
    }
};

module.exports = dynamicDb;
