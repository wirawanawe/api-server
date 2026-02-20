const express = require('express');
const router = express.Router();
const dokterController = require('../controllers/dokterController');

router.get('/', dokterController.getDokter);

module.exports = router;
