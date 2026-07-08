const request = require('supertest');
const { Pool } = require('pg');
const app = require('../../server'); // Assuming server.js exports the express app

let server;
let pool;

beforeAll(async () => {
  require('dotenv').config({ path: '.env.test' });

  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  jest.mock('../../src/db', () => {
    const originalModule = jest.requireActual('../../src/db');
    return {
      ...originalModule,
      query: (text, params) => pool.query(text, params),
      getClient: () => pool.connect(),
      connectDb: async () => { /* no-op for tests */ },
      disconnectDb: async () => { await pool.end(); },
      initializeDb: async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`
            DROP TABLE IF EXISTS order_items CASCADE;
            DROP TABLE IF EXISTS orders CASCADE;
            DROP TABLE IF EXISTS products CASCADE;
          `);
          await client.query(`
            CREATE TABLE IF NOT EXISTS products (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              description TEXT,
              price NUMERIC(10, 2) NOT NULL,
              stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
          `);
          await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
              id SERIAL PRIMARY KEY,
              customer_name VARCHAR(255) NOT NULL,
              total_amount NUMERIC(10, 2) NOT NULL,
              discount_applied NUMERIC(10, 2) DEFAULT 0,
              final_amount NUMERIC(10, 2) NOT NULL,
              status VARCHAR(50) DEFAULT 'pending',
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
          `);
          await client.query(`
            CREATE TABLE IF NOT EXISTS order_items (
              id SERIAL PRIMARY KEY,
              order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
              product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
              quantity INTEGER NOT NULL CHECK (quantity > 0),
              price_at_purchase NUMERIC(10, 2) NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
          `);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          console.error('Error during initializeDb in concurrent test:', error);
          throw error;
        } finally {
          client.release();
        }
      },
    };
  });

  server = app.listen(4002); // Use a different port for tests
});

afterAll(async () => {
  await server.close();
  await pool.end();
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE order_items, orders, products RESTART IDENTITY CASCADE;');
    await client.query(`
      INSERT INTO products (name, description, price, stock) VALUES
      ('Concurrent Test Product', 'Product for concurrency testing', 10.00, 100);
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during beforeEach setup for concurrent test:', error);
    throw error;
  } finally {
    client.release();
  }
});

describe('Concurrent Checkout Integration Test', () => {
  it('should correctly handle 50 concurrent checkout requests for a single product', async () => {
    const productId = 1;
    const initialStock = 100;
    const quantityPerOrder = 1;
    const numberOfRequests = 50;

    // Verify initial stock
    let { rows: initialProduct } = await pool.query('SELECT stock FROM products WHERE id = $1', [productId]);
    expect(initialProduct[0].stock).toEqual(initialStock);

    const checkoutPromises = [];
    for (let i = 0; i < numberOfRequests; i++) {
      checkoutPromises.push(
        request(server)
          .post('/api/orders/checkout')
          .send({
            customerName: `Concurrent User ${i + 1}`,
            items: [{ productId: productId, quantity: quantityPerOrder }]
          })
      );
    }

    const results = await Promise.all(checkoutPromises);

    // All requests should ideally succeed if stock allows
    // If stock is 100 and 50 requests for 1 item each, all should pass.
    // If stock was 40 and 50 requests, 40 would pass, 10 would fail.
    // The key is that stock should not go negative and final stock is correct.

    const successfulOrders = results.filter(res => res.statusCode === 201);
    const failedOrders = results.filter(res => res.statusCode !== 201);

    // In this specific scenario (100 stock, 50 requests for 1 item each), all should succeed.
    expect(successfulOrders.length).toEqual(numberOfRequests);
    expect(failedOrders.length).toEqual(0);

    // Verify final stock
    let { rows: finalProduct } = await pool.query('SELECT stock FROM products WHERE id = $1', [productId]);
    const expectedFinalStock = initialStock - (successfulOrders.length * quantityPerOrder);
    expect(finalProduct[0].stock).toEqual(expectedFinalStock);
    expect(finalProduct[0].stock).toEqual(50); // 100 - 50 = 50
  }, 30000); // Increase timeout for concurrent tests
});
