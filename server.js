require('dotenv').config();
const express = require('express');
const { connectDb, disconnectDb, initializeDb } = require('./src/db');
const routes = require('./src/routes');
const errorHandler = require('./src/utils/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Mount API routes
app.use('/api', routes);

// Global error handler
app.use(errorHandler);

async function startServer() {
  try {
    await connectDb();
    console.log('Database connected successfully.');
    await initializeDb(); // Ensure tables exist and are populated
    console.log('Database initialized with schema and seed data.');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await disconnectDb();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await disconnectDb();
  process.exit(0);
});

startServer();
