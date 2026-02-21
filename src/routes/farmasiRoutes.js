const express = require('express');
const router = express.Router();
const farmasiController = require('../controllers/farmasiController');
const farResepDetailController = require('../controllers/farResepDetailController');

router.get('/obat', farmasiController.getObat);
router.get('/far-resep', farmasiController.getFarResep);
router.get('/far-resep/:noInvoice/detail', farResepDetailController.getFarResepDetail);

module.exports = router;
