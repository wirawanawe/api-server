const express = require('express');
const router = express.Router();
const farmasiController = require('../controllers/farmasiController');

router.get('/obat', farmasiController.getObat);
router.get('/far-resep', farmasiController.getFarResep);

module.exports = router;
