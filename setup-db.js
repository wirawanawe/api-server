const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setup() {
    try {
        // Create connection without selecting database first
        const connection = await mysql.createConnection({
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || ''
        });

        console.log('Connected to MySQL server.');

        // Create Database
        const dbName = process.env.MYSQL_DATABASE || 'dash_klinik_users';
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        console.log(`Database '${dbName}' created or exists.`);

        // Close and reconnect to the specific database
        await connection.end();

        const db = await mysql.createConnection({
            host: process.env.MYSQL_HOST || 'localhost',
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: dbName
        });

        // Create Users Table (base definition)
        await db.query(`
            CREATE TABLE IF NOT EXISTS dashboard_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                sql_server VARCHAR(255) NULL,
                sql_database VARCHAR(255) NULL,
                sql_user VARCHAR(255) NULL,
                sql_password VARCHAR(255) NULL,
                role VARCHAR(50) NOT NULL DEFAULT 'admin',
                auth_token TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table \"dashboard_users\" created or exists.');

        // Ensure new columns exist on older installations (IF NOT EXISTS tidak didukung MySQL < 8.0)
        for (const { col, def } of [
            { col: 'role', def: "VARCHAR(50) NOT NULL DEFAULT 'admin'" },
            { col: 'auth_token', def: 'TEXT NULL' },
        ]) {
            try {
                await db.query(`ALTER TABLE dashboard_users ADD COLUMN ${col} ${def}`);
            } catch (e) {
                if (e.code !== 'ER_DUP_FIELDNAME') throw e;
            }
        }

        // Migrasi: kolom SQL nullable untuk superadmin (tanpa credential)
        for (const col of ['sql_server', 'sql_database', 'sql_user', 'sql_password']) {
            try {
                await db.query(`ALTER TABLE dashboard_users MODIFY COLUMN ${col} VARCHAR(255) NULL`);
            } catch (_) {
                // Abaikan jika kolom sudah nullable
            }
        }

        const sqlServer = process.env.DB_SERVER || 'localhost';
        const sqlDb = process.env.DB_DATABASE || 'PHC_DB';
        const sqlUser = process.env.DB_USER || 'sa';
        const sqlPass = process.env.DB_PASSWORD || 'your_password';

        // Superadmin: tidak punya credential SQL, hanya untuk manage user & impersonate admin
        const [superadminRows] = await db.query('SELECT * FROM dashboard_users WHERE username = ?', ['superadmin']);
        if (superadminRows.length === 0) {
            const hashedSuper = await bcrypt.hash('super123', 10);
            await db.query(`
                INSERT INTO dashboard_users (username, password, sql_server, sql_database, sql_user, sql_password, role)
                VALUES (?, ?, NULL, NULL, NULL, NULL, ?)
            `, ['superadmin', hashedSuper, 'superadmin']);
            console.log('Superadmin created (username: superadmin, password: super123) - tanpa credential SQL.');
        }

        // Admin: punya credential SQL, untuk akses data klinik
        const [adminRows] = await db.query('SELECT * FROM dashboard_users WHERE username = ?', ['admin']);
        if (adminRows.length === 0) {
            const hashedAdmin = await bcrypt.hash('admin123', 10);
            await db.query(`
                INSERT INTO dashboard_users (username, password, sql_server, sql_database, sql_user, sql_password, role)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, ['admin', hashedAdmin, sqlServer, sqlDb, sqlUser, sqlPass, 'admin']);
            console.log('Admin created (username: admin, password: admin123) - dengan credential SQL Server.');
        } else {
            // Migrasi: jika admin lama punya role superadmin, ubah ke admin (punya SQL)
            await db.query(`
                UPDATE dashboard_users SET role = 'admin' WHERE username = 'admin' AND role = 'superadmin'
            `);
            console.log('Admin user already exists.');
        }

        await db.end();
        console.log('Setup complete.');

    } catch (err) {
        console.error('Setup failed:', err);
    }
}

setup();
