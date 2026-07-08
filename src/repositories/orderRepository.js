const db = require('../db');

async function findAllWithItems() {
  // N+1 fix: Single query to fetch all orders and their items
  const { rows } = await db.query(`
    SELECT
      o.id AS order_id,
      o.customer_name,
      o.total_amount,
      o.discount_applied,
      o.final_amount,
      o.status,
      o.created_at AS order_created_at,
      o.updated_at AS order_updated_at,
      oi.id AS item_id,
      oi.product_id,
      p.name AS product_name,
      oi.quantity,
      oi.price_at_purchase
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
    ORDER BY o.id, oi.id;
  `);
  return rows;
}

async function findByIdWithItems(orderId) {
  const { rows } = await db.query(`
    SELECT
      o.id AS order_id,
      o.customer_name,
      o.total_amount,
      o.discount_applied,
      o.final_amount,
      o.status,
      o.created_at AS order_created_at,
      o.updated_at AS order_updated_at,
      oi.id AS item_id,
      oi.product_id,
      p.name AS product_name,
      oi.quantity,
      oi.price_at_purchase
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE o.id = $1
    ORDER BY oi.id;
  `, [orderId]);
  return rows;
}

async function createOrder(customerName, totalAmount, discountApplied, finalAmount, items, client) {
  const { rows: orderRows } = await client.query(
    `INSERT INTO orders (customer_name, total_amount, discount_applied, final_amount, status)
     VALUES ($1, $2, $3, $4, 'completed') RETURNING id, customer_name, total_amount, discount_applied, final_amount, status, created_at, updated_at`,
    [customerName, totalAmount, discountApplied, finalAmount]
  );
  const order = orderRows[0];

  const itemValues = items.map(item => `(${order.id}, ${item.productId}, ${item.quantity}, ${item.priceAtPurchase})`).join(',');
  if (itemValues) {
    await client.query(`
      INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
      VALUES ${itemValues};
    `);
  }

  // Fetch the created order with its items for the response
  const createdOrderWithItems = await findByIdWithItems(order.id);
  return createdOrderWithItems; // This will be mapped in the service layer
}

module.exports = {
  findAllWithItems,
  findByIdWithItems,
  createOrder,
};
