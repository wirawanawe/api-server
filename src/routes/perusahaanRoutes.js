const express = require('express');
const router = express.Router();
const perusahaanController = require('../controllers/perusahaanController');

router.get('/', perusahaanController.getPerusahaan);

module.exports = router;
