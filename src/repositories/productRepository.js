const db = require('../db');

async function findAll() {
  const { rows } = await db.query('SELECT id, name, description, price, stock FROM products ORDER BY id');
  return rows;
}

async function findById(id) {
  const { rows } = await db.query('SELECT id, name, description, price, stock FROM products WHERE id = $1', [id]);
  return rows[0];
}

// Race Condition Fix: Use SELECT ... FOR UPDATE to lock the row
async function findByIdForUpdate(id, client) {
  const { rows } = await client.query('SELECT id, name, description, price, stock FROM products WHERE id = $1 FOR UPDATE', [id]);
  return rows[0];
}

// Update stock within a transaction
async function updateStock(productId, newStock, client) {
  await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStock, productId]);
}

module.exports = {
  findAll,
  findById,
  findByIdForUpdate,
  updateStock,
};
