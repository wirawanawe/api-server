const express = require('express');
const router = express.Router();
const diagnosisCaseController = require('../controllers/diagnosisCaseController');

router.get('/', diagnosisCaseController.getMR_DiagnosisCase);
router.get('/:id', diagnosisCaseController.getMR_DiagnosisCaseById);

module.exports = router;
