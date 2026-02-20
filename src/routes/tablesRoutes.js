const express = require('express');
const router = express.Router();
const tablesController = require('../controllers/tablesController');

// Route to get all tables
router.get('/', tablesController.getTables);

// Route to get data from a specific table
router.get('/:tableName', tablesController.getTableData);

module.exports = router;
