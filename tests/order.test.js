const request = require('supertest');
const { Pool } = require('pg');
const { initializeDb, disconnectDb } = require('../src/db'); // Import initializeDb and disconnectDb
const app = require('../server'); // Assuming server.js exports the express app

let server;
let pool;

beforeAll(async () => {
  // Ensure environment variables are loaded for tests
  require('dotenv').config({ path: '.env.test' }); // Use a separate test .env if needed

  // Initialize a new pool for tests to ensure isolation
  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  // Override db.js pool with test pool for testing purposes
  jest.mock('../src/db', () => {
    const originalModule = jest.requireActual('../src/db');
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
          throw error;
        } finally {
          client.release();
        }
      },
    };
  });

  // Start the server for integration tests
  server = app.listen(4000); // Use a different port for tests
});

afterAll(async () => {
  await server.close(); // Close the server
  await pool.end(); // Close the test database pool
  await disconnectDb(); // Ensure the main db pool is also disconnected if it was connected
});

beforeEach(async () => {
  // Clear and re-seed database before each test
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE order_items, orders, products RESTART IDENTITY CASCADE;');
    await client.query(`
      INSERT INTO products (name, description, price, stock) VALUES
      ('Test Product 1', 'Description 1', 10.00, 100),
      ('Test Product 2', 'Description 2', 20.00, 50),
      ('Test Product 3', 'Description 3', 5.00, 200);
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during beforeEach setup:', error);
    throw error;
  } finally {
    client.release();
  }
});

describe('Order API', () => {
  it('should create a new order (checkout)', async () => {
    const res = await request(server)
      .post('/api/orders/checkout')
      .send({
        customerName: 'John Doe',
        items: [
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 1 }
        ],
        discountPercentage: 10
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.customerName).toEqual('John Doe');
    expect(res.body.totalAmount).toEqual(40.00); // (10*2) + (20*1) = 40
    expect(res.body.discountApplied).toEqual(4.00); // 10% of 40
    expect(res.body.finalAmount).toEqual(36.00); // 40 - 4
    expect(res.body.items).toHaveLength(2);

    // Verify stock update
    const product1 = await pool.query('SELECT stock FROM products WHERE id = 1');
    const product2 = await pool.query('SELECT stock FROM products WHERE id = 2');
    expect(product1.rows[0].stock).toEqual(98); // 100 - 2
    expect(product2.rows[0].stock).toEqual(49); // 50 - 1
  });

  it('should return 409 if stock is insufficient', async () => {
    const res = await request(server)
      .post('/api/orders/checkout')
      .send({
        customerName: 'Jane Doe',
        items: [
          { productId: 1, quantity: 150 } // Request more than available (100)
        ]
      });

    expect(res.statusCode).toEqual(409);
    expect(res.body.message).toContain('Insufficient stock');
  });

  it('should return 404 if product not found', async () => {
    const res = await request(server)
      .post('/api/orders/checkout')
      .send({
        customerName: 'Jane Doe',
        items: [
          { productId: 999, quantity: 1 } // Non-existent product
        ]
      });

    expect(res.statusCode).toEqual(404);
    expect(res.body.message).toContain('Product not found');
  });

  it('should get all orders with items (N+1 fix verification)', async () => {
    // Create a few orders first
    await request(server)
      .post('/api/orders/checkout')
      .send({ customerName: 'Alice', items: [{ productId: 1, quantity: 1 }] });
    await request(server)
      .post('/api/orders/checkout')
      .send({ customerName: 'Bob', items: [{ productId: 2, quantity: 1 }, { productId: 3, quantity: 2 }] });

    const res = await request(server).get('/api/orders');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('items');
    expect(res.body[0].items).toHaveLength(1);
    expect(res.body[1].items).toHaveLength(2);
    expect(res.body[1].items[0].productName).toEqual('Test Product 2');
    expect(res.body[1].items[1].productName).toEqual('Test Product 3');
  });

  it('should get a single order by ID with items', async () => {
    const checkoutRes = await request(server)
      .post('/api/orders/checkout')
      .send({ customerName: 'Charlie', items: [{ productId: 1, quantity: 3 }, { productId: 2, quantity: 1 }] });

    const orderId = checkoutRes.body[0].id; // Assuming the service returns the order object with ID

    const res = await request(server).get(`/api/orders/${orderId}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('id', orderId);
    expect(res.body.customerName).toEqual('Charlie');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].productName).toEqual('Test Product 1');
    expect(res.body.items[1].productName).toEqual('Test Product 2');
  });

  it('should return 404 for non-existent order ID', async () => {
    const res = await request(server).get('/api/orders/999');
    expect(res.statusCode).toEqual(404);
    expect(res.body.message).toEqual('Order not found');
  });
});
