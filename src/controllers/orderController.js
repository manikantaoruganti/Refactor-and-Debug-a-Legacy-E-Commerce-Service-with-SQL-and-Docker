const orderService = require('../services/orderService');

async function getAllOrders(req, res, next) {
  try {
    const orders = await orderService.getAllOrders();
    res.json(orders);
  } catch (error) {
    next(error);
  }
}

async function getOrderById(req, res, next) {
  try {
    const { id } = req.params;
    const order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    next(error);
  }
}

async function checkout(req, res, next) {
  try {
    const { customerName, items, discountPercentage } = req.body;

    if (!customerName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid checkout data. Customer name and items are required.' });
    }

    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({ message: 'Each item must have a valid productId and a positive quantity.' });
      }
    }

    const order = await orderService.processCheckout(customerName, items, discountPercentage);
    res.status(201).json(order);
  } catch (error) {
    if (error.message.includes('Insufficient stock')) {
      return res.status(409).json({ message: error.message });
    }
    if (error.message.includes('Product not found')) {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
}

module.exports = {
  getAllOrders,
  getOrderById,
  checkout,
};
