const orderRepository = require('../repositories/orderRepository');
const productRepository = require('../repositories/productRepository');
const { calculateFinalAmount } = require('../utils/discountCalculator');
const db = require('../db');

async function getAllOrders() {
  // N+1 fix: Fetch orders and their items in a single query
  const rawOrders = await orderRepository.findAllWithItems();

  // Map raw flat data into nested JSON structure
  const ordersMap = new Map();
  rawOrders.forEach(row => {
    if (!ordersMap.has(row.order_id)) {
      ordersMap.set(row.order_id, {
        id: row.order_id,
        customerName: row.customer_name,
        totalAmount: parseFloat(row.total_amount),
        discountApplied: parseFloat(row.discount_applied),
        finalAmount: parseFloat(row.final_amount),
        status: row.status,
        createdAt: row.order_created_at,
        updatedAt: row.order_updated_at,
        items: [],
      });
    }
    if (row.item_id) { // Only add item if it exists (for orders with no items, though unlikely)
      ordersMap.get(row.order_id).items.push({
        id: row.item_id,
        productId: row.product_id,
        productName: row.product_name,
        quantity: row.quantity,
        priceAtPurchase: parseFloat(row.price_at_purchase),
      });
    }
  });

  return Array.from(ordersMap.values());
}

async function getOrderById(id) {
  const rawOrder = await orderRepository.findByIdWithItems(id);

  if (!rawOrder || rawOrder.length === 0) {
    return null;
  }

  const order = {
    id: rawOrder[0].order_id,
    customerName: rawOrder[0].customer_name,
    totalAmount: parseFloat(rawOrder[0].total_amount),
    discountApplied: parseFloat(rawOrder[0].discount_applied),
    finalAmount: parseFloat(rawOrder[0].final_amount),
    status: rawOrder[0].status,
    createdAt: rawOrder[0].order_created_at,
    updatedAt: rawOrder[0].order_updated_at,
    items: [],
  };

  rawOrder.forEach(row => {
    if (row.item_id) {
      order.items.push({
        id: row.item_id,
        productId: row.product_id,
        productName: row.product_name,
        quantity: row.quantity,
        priceAtPurchase: parseFloat(row.price_at_purchase),
      });
    }
  });

  return order;
}

async function processCheckout(customerName, items, discountPercentage = 0) {
  const client = await db.getClient(); // Get a client from the pool for transaction
  try {
    await client.query('BEGIN'); // Start transaction

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      // Race Condition Fix: SELECT ... FOR UPDATE to lock the product row
      const product = await productRepository.findByIdForUpdate(item.productId, client);

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
      }

      totalAmount += product.price * item.quantity;
      orderItems.push({
        productId: product.id,
        quantity: item.quantity,
        priceAtPurchase: product.price,
      });

      // Update stock
      await productRepository.updateStock(product.id, product.stock - item.quantity, client);
    }

    // Calculate final amount with discount
    const { finalAmount, discountApplied } = calculateFinalAmount(totalAmount, discountPercentage);

    // Create the order
    const order = await orderRepository.createOrder(
      customerName,
      totalAmount,
      discountApplied,
      finalAmount,
      orderItems,
      client
    );

    await client.query('COMMIT'); // Commit transaction
    return order;
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback on error
    throw error;
  } finally {
    client.release(); // Release the client back to the pool
  }
}

module.exports = {
  getAllOrders,
  getOrderById,
  processCheckout,
};
