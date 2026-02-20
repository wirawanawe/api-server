const express = require('express');
const router = express.Router();
const resepController = require('../controllers/resepController');
const resepDetailController = require('../controllers/resepDetailController');

router.get('/', resepController.getResep);
router.get('/detail', resepDetailController.getResepDetail);
router.get('/:noInvoice', resepController.getResepByNo);
router.get('/:noInvoice/detail', resepDetailController.getResepDetailByNoInvoice);

module.exports = router;
