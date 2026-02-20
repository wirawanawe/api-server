const express = require('express');
const router = express.Router();
const finalStateController = require('../controllers/finalStateController');

router.get('/', finalStateController.getFinalState);
router.get('/:id', finalStateController.getFinalStateById);

module.exports = router;
