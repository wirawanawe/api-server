const express = require('express');
const cors = require('cors');
require('dotenv').config();

const dashboardRoutes = require('./routes/dashboardRoutes');
const dynamicDb = require('./middleware/dynamicDb');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies

// Auth routes (no dynamic DB)
app.use('/api/auth', require('./routes/authRoutes'));

// Apply Dynamic DB Middleware to all protected API routes
app.use('/api/dashboard', dynamicDb, dashboardRoutes);
app.use('/api/tables', dynamicDb, require('./routes/tablesRoutes'));
app.use('/api/transactions', dynamicDb, require('./routes/transactionRoutes'));
app.use('/api/pasien', dynamicDb, require('./routes/pasienRoutes'));
app.use('/api/kunjungan', dynamicDb, require('./routes/kunjunganRoutes'));
app.use('/api/transaksi-detail', dynamicDb, require('./routes/transaksiDetailRoutes'));
app.use('/api/farmasi', dynamicDb, require('./routes/farmasiRoutes'));
app.use('/api/pabrik', dynamicDb, require('./routes/pabrikRoutes'));
app.use('/api/dokter', dynamicDb, require('./routes/dokterRoutes'));
app.use('/api/unit', dynamicDb, require('./routes/unitRoutes'));
app.use('/api/perusahaan', dynamicDb, require('./routes/perusahaanRoutes'));
app.use('/api/penjamin', dynamicDb, require('./routes/penjaminRoutes'));
app.use('/api/wilayah', dynamicDb, require('./routes/wilayahRoutes'));
app.use('/api/trust-user', dynamicDb, require('./routes/trustUserRoutes'));
app.use('/api/atribut', dynamicDb, require('./routes/atributRoutes'));
app.use('/api/diagnosa', dynamicDb, require('./routes/diagnosaRoutes'));
app.use('/api/resep', dynamicDb, require('./routes/resepRoutes'));
app.use('/api/icd', dynamicDb, require('./routes/icdRoutes'));
app.use('/api/diagnosis-case', dynamicDb, require('./routes/diagnosisCaseRoutes'));
app.use('/api/diagnosis-type', dynamicDb, require('./routes/diagnosisTypeRoutes'));
app.use('/api/final-state', dynamicDb, require('./routes/finalStateRoutes'));
app.use('/api/dashboard-users', dynamicDb, require('./routes/userRoutes'));

// Base route for health check
app.get('/', (req, res) => {
    res.send('Dashboard API is running');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
