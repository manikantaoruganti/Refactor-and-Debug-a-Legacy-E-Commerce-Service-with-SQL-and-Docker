const express = require('express');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.get('/', orderController.getAllOrders);
router.post('/checkout', orderController.checkout);
router.get('/:id', orderController.getOrderById);

module.exports = router;
