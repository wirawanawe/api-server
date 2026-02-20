const express = require('express');
const router = express.Router();
const pasienController = require('../controllers/pasienController');

router.get('/', pasienController.getPasien);
router.get('/keluarga', pasienController.getAnggotaKeluarga);

module.exports = router;
