const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Route to get graph data
// GET /api/dashboard/graph?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/graph', dashboardController.getGraphData);

// Route to get dashboard stats (kunjungan, obat, diagnosa)
// GET /api/dashboard/stats
router.get('/stats', dashboardController.getStats);

module.exports = router;
