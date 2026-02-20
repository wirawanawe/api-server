const express = require('express');
const router = express.Router();
const kunjunganController = require('../controllers/kunjunganController');

router.get('/', kunjunganController.getKunjungan);
router.get('/:id/detail', kunjunganController.getKunjunganDetail);

module.exports = router;
