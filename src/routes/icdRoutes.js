const express = require('express');
const router = express.Router();
const icdController = require('../controllers/icdController');

router.get('/', icdController.getIcd);
router.get('/:id', icdController.getIcdById);

module.exports = router;
