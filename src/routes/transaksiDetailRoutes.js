const express = require('express');
const router = express.Router();
const transaksiDetailController = require('../controllers/transaksiDetailController');

router.get('/', transaksiDetailController.getTransaksiDetail);
router.get('/:noTransaksi', transaksiDetailController.getTransaksiDetailByNoTransaksi);

module.exports = router;
