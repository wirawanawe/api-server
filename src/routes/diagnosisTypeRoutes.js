const express = require('express');
const router = express.Router();
const diagnosisTypeController = require('../controllers/diagnosisTypeController');

router.get('/', diagnosisTypeController.getMR_DiagnosisType);
router.get('/:id', diagnosisTypeController.getMR_DiagnosisTypeById);

module.exports = router;
