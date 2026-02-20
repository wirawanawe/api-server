const express = require('express');
const router = express.Router();
const diagnosaController = require('../controllers/diagnosaController');

router.get('/', diagnosaController.getDiagnosa);
router.get('/:id', diagnosaController.getDiagnosaById);

module.exports = router;
