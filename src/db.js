const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 20, // Max number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // How long to wait for a new client from the pool
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function connectDb() {
  try {
    await pool.query('SELECT 1'); // Test connection
    console.log('PostgreSQL pool connected.');
  } catch (error) {
    console.error('Failed to connect to PostgreSQL:', error);
    throw error;
  }
}

async function disconnectDb() {
  try {
    await pool.end();
    console.log('PostgreSQL pool disconnected.');
  } catch (error) {
    console.error('Error disconnecting PostgreSQL pool:', error);
  }
}

async function initializeDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop tables if they exist (for development/testing purposes)
    await client.query(`
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
    `);

    // Create products table
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

    // Create orders table
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

    // Create order_items table
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

    // Seed initial data if tables are empty
    const productCount = await client.query('SELECT COUNT(*) FROM products');
    if (productCount.rows[0].count == 0) {
      await client.query(`
        INSERT INTO products (name, description, price, stock) VALUES
        ('Laptop Pro', 'High-performance laptop for professionals', 1200.00, 100),
        ('Mechanical Keyboard', 'Tactile and responsive keyboard', 80.00, 200),
        ('Wireless Mouse', 'Ergonomic wireless mouse', 30.00, 150),
        ('Monitor 4K', '27-inch 4K UHD monitor', 350.00, 75),
        ('Webcam HD', 'Full HD 1080p webcam', 50.00, 120);
      `);
      console.log('Products seeded.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  connectDb,
  disconnectDb,
  initializeDb,
};
