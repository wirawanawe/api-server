const sql = require('mssql');

const pools = {};

// Get or create a connection pool for the specific configuration
const getPool = (name, config) => {
    if (!pools[name]) {
        const pool = new sql.ConnectionPool(config);
        const close = pool.close.bind(pool);
        pool.close = (...args) => {
            delete pools[name];
            return close(...args);
        };

        // Handle pool-level errors immediately
        pool.on('error', err => {
            console.error(`Connection Pool Error for ${name}:`, err);
            // Remove from cache to force a new connection on next request
            delete pools[name];
        });

        pools[name] = pool.connect().catch(err => {
            // Log explicitly and delete the failed promise immediately so it's not cached forever
            console.error(`Error establishing connection pool for ${name}:`, err);
            delete pools[name];
            throw err;
        });
    }
    return pools[name];
};

// Close all pools
const closeAll = () => {
    return Promise.all(Object.values(pools).map((pool) => {
        return pool.then((p) => p.close());
    }));
};

module.exports = {
    closeAll,
    getPool
};
