const express = require('express');
const router = express.Router();
const trustUserController = require('../controllers/trustUserController');

router.get('/', trustUserController.getTrustUsers);
router.put('/profile', trustUserController.updateProfile);

module.exports = router;
