const express = require('express');
const router = express.Router();
const wilayahController = require('../controllers/wilayahController');

router.get('/', wilayahController.getWilayah);

module.exports = router;
