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
        pools[name] = pool.connect();
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
