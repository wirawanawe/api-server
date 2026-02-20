const express = require('express');
const router = express.Router();
const atributController = require('../controllers/atributController');

router.get('/', atributController.getAtribut);
router.get('/:id', atributController.getAtributById);

module.exports = router;
