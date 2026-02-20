const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// All routes here are protected by dynamicDb in app.js
router.get('/', userController.listUsers);
router.get('/:id', userController.getUser);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;

