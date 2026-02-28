const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Route to get graph data
// GET /api/dashboard/graph?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/graph', dashboardController.getGraphData);

// Graph dengan breakdown pegawai/pensiunan
router.get('/graph-status', dashboardController.getGraphDataByStatus);
router.get('/graph-status-month', dashboardController.getGraphDataByStatusMonth);
router.get('/graph-status-year', dashboardController.getGraphDataByStatusYear);

// Route to get dashboard stats (kunjungan, obat, diagnosa)
// GET /api/dashboard/stats
router.get('/stats', dashboardController.getStats);

// Pembelian Obat (PO/RO)
// GET /api/dashboard/pembelian-obat/stats?month=1&year=2025
router.get('/pembelian-obat/stats', dashboardController.getPembelianObatStats);
// GET /api/dashboard/pembelian-obat/graph?year=2025
router.get('/pembelian-obat/graph', dashboardController.getPembelianObatGraph);
// GET /api/dashboard/pembelian-obat/schema (debug: cek tabel/kolom terdeteksi)
router.get('/pembelian-obat/schema', dashboardController.getPembelianObatSchema);

module.exports = router;
