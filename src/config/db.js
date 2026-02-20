const sql = require('mssql');
require('dotenv').config();

const dbServer = process.env.DB_SERVER || '';
// Handle 'server\instance' format
let [server, instanceName] = dbServer.split('\\');

// If not split by backslash, try comma for port (server,port)
if (!instanceName && dbServer.includes(',')) {
    const parts = dbServer.split(',');
    server = parts[0];
    // mssql config takes port as a separate number, but we can't easily inject it here without changing structure significantly.
    // However, mssql driver often handles server: 'host,port' correctly in connection string, but for config object it prefers 'port' property.
    // Let's stick to instance name support for now.
}

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: server, // IP or Hostname
    database: process.env.DB_DATABASE,
    options: {
        // Non-SSL connection to support older SQL Server instances
        encrypt: false,
        trustServerCertificate: true, // change to true for local dev / self-signed certs
        enableArithAbort: true
    }
};

if (instanceName) {
    config.options.instanceName = instanceName;
}

let poolPromise;

if (!server) {
    console.warn('WARNING: DB_SERVER not specified in .env. Database functionality will be disabled.');
    poolPromise = Promise.resolve(null);
} else {
    poolPromise = new sql.ConnectionPool(config)
        .connect()
        .then(pool => {
            console.log('Connected to SQL Server');
            return pool;
        })
        .catch(err => {
            console.error('Database Connection Failed! Bad Config: ', err.message);
            // Return null instead of throwing to allow the app to start with mock data
            return null;
        });
}

module.exports = {
    sql,
    poolPromise
};
