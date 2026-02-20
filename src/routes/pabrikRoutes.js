const express = require('express');
const router = express.Router();
const pabrikController = require('../controllers/pabrikController');

router.get('/', pabrikController.getPabrik);
router.get('/:id', pabrikController.getPabrikById);

module.exports = router;
