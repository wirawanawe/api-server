const express = require('express');
const router = express.Router();
const penjaminController = require('../controllers/penjaminController');

router.get('/', penjaminController.getPenjamin);

module.exports = router;
