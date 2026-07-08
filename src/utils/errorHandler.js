function errorHandler(err, req, res, next) {
  console.error('Error:', err.message);
  console.error(err.stack); // Log stack trace for debugging, but don't send to client

  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred.';

  // For production, avoid sending detailed error messages or stack traces
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    return res.status(statusCode).json({ message: 'An internal server error occurred.' });
  }

  res.status(statusCode).json({ message });
}

module.exports = errorHandler;
