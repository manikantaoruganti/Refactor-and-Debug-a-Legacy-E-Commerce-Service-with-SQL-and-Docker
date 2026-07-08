const request = require('supertest');
const { Pool } = require('pg');
const app = require('../server'); // Assuming server.js exports the express app

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

  server = app.listen(4001); // Use a different port for tests
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
      ('Laptop', 'Powerful computing', 1200.00, 50),
      ('Mouse', 'Ergonomic design', 25.00, 100),
      ('Keyboard', 'Mechanical switches', 75.00, 75);
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

describe('Product API', () => {
  it('should get all products', async () => {
    const res = await request(server).get('/api/products');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toHaveProperty('name', 'Laptop');
    expect(res.body[1]).toHaveProperty('name', 'Mouse');
  });

  it('should get a product by ID', async () => {
    const res = await request(server).get('/api/products/1');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('name', 'Laptop');
    expect(res.body).toHaveProperty('price', '1200.00');
    expect(res.body).toHaveProperty('stock', 50);
  });

  it('should return 404 for a non-existent product ID', async () => {
    const res = await request(server).get('/api/products/999');
    expect(res.statusCode).toEqual(404);
    expect(res.body.message).toEqual('Product not found');
  });
});
