# E-commerce Service Refactor

## Project Overview

This project involves the systematic refactoring and optimization of an existing legacy e-commerce service. The primary goal is to transform a monolithic, bug-ridden application into a production-quality, stable, and maintainable codebase without altering its core functionality or breaking existing API contracts. This includes addressing critical issues such as race conditions, memory leaks, N+1 SQL queries, broken business logic, and poor code quality.

## Legacy Problems Addressed

The original service suffered from several critical issues:

*   **Race Condition:** Inventory updates were not synchronized, leading to potential overselling and incorrect stock levels under concurrent load.
*   **Memory Leak:** Unidentified components were causing memory consumption to grow continuously, leading to instability and crashes.
*   **N+1 SQL Query:** The `/orders` endpoint performed an excessive number of database queries, fetching order items individually for each order, severely impacting performance.
*   **Broken Discount Logic:** The discount calculation was flawed, failing to handle edge cases and leading to incorrect final amounts.
*   **Poor Code Quality:** The codebase was monolithic, lacked clear separation of concerns, had inconsistent naming, and contained dead/duplicate code and debug prints.

## Architecture

The refactored application follows a layered architecture to promote separation of concerns, maintainability, and testability:

*   **Controllers:** Handle incoming HTTP requests, validate input, and delegate business logic to services. They are responsible for sending appropriate HTTP responses.
*   **Services:** Encapsulate the core business logic. They orchestrate interactions between repositories and other utilities, ensuring data integrity and applying business rules.
*   **Repositories:** Abstract database interactions. They provide methods for CRUD operations, ensuring parameterized queries and handling transaction management where necessary.
*   **Utilities:** Contain pure helper functions, such as the discount calculator, that can be reused across the application.
*   **Database (`db.js`):** Manages the PostgreSQL connection pool and provides a consistent interface for database operations.

## Folder Structure

```
.
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── README.md
├── DEBUG_REPORT.md
├── package.json
├── server.js             # Main application entry point
├── src/
│   ├── controllers/      # Handles HTTP requests, delegates to services
│   │   ├── orderController.js
│   │   └── productController.js
│   ├── db.js             # Database connection and initialization
│   ├── repositories/     # Database interaction logic
│   │   ├── orderRepository.js
│   │   └── productRepository.js
│   ├── routes/           # API route definitions
│   │   ├── index.js
│   │   ├── orderRoutes.js
│   │   └── productRoutes.js
│   ├── services/         # Business logic
│   │   ├── orderService.js
│   │   └── productService.js
│   └── utils/            # Helper functions
│       ├── discountCalculator.js
│       └── errorHandler.js
└── tests/
    ├── integration/      # New integration tests
    │   ├── concurrentCheckout.test.js
    │   └── discountLogic.test.js
    ├── order.test.js     # Existing order tests (unmodified assertions)
    └── product.test.js   # Existing product tests (unmodified assertions)
```

## Docker Setup

The application is containerized using Docker, with a `docker-compose.yml` file to orchestrate both the Node.js application and a PostgreSQL database.

### Prerequisites

*   Docker Desktop installed and running.

### Running the Application

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd legacy-ecommerce-refactor
    ```
2.  **Create `.env` file:** Copy the `.env.example` to `.env` and configure your environment variables.
    ```bash
    cp .env.example .env
    ```
    Ensure the `DB_HOST` in `.env` is set to `db` when running with Docker Compose.
3.  **Build and start the services:**
    ```bash
    docker compose up --build
    ```
    This command will:
    *   Build the `app` service Docker image.
    *   Start the `db` (PostgreSQL) service.
    *   Wait for the `db` service to be healthy.
    *   Start the `app` service, which will connect to the database, initialize the schema, and seed initial data.
    *   The application should be accessible at `http://localhost:3000` (or your configured `PORT`).

### Health Checks

*   **Database:** The PostgreSQL container includes a health check to ensure it's ready to accept connections before the application starts.
*   **Application:** The Node.js application exposes a `/health` endpoint, which Docker Compose uses to verify the application is running and responsive.

## Environment Variables

The application uses environment variables for configuration. A `.env.example` file is provided.

| Variable          | Description                                     | Example Value      |
| :---------------- | :---------------------------------------------- | :----------------- |
| `PORT`            | The port on which the Express server will run.  | `3000`             |
| `DB_HOST`         | The hostname or IP address of the PostgreSQL database. (Use `db` for Docker Compose) | `db`               |
| `DB_PORT`         | The port of the PostgreSQL database.            | `5432`             |
| `DB_USER`         | The username for connecting to the database.    | `ecommerce_user`   |
| `DB_PASSWORD`     | The password for the database user.             | `secure_password`  |
| `DB_NAME`         | The name of the database to connect to.         | `ecommerce_db`     |

**CRITICAL:** Never commit your actual `.env` file with sensitive credentials to version control. Use `.env.example` for documentation.

## Running Tests

The project uses `jest` for testing.

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Run all tests:**
    ```bash
    npm test
    ```
    This will execute all tests in the `tests/` directory, including the original and newly added integration tests.

## Concurrency Strategy (Race Condition Resolution)

**Problem:** The legacy system allowed multiple concurrent checkout requests to read the same product stock, decrement it, and write it back without proper synchronization. This led to a race condition where stock could become negative or oversold.

**Solution:** Implemented database-level concurrency control using `SELECT ... FOR UPDATE` within a PostgreSQL transaction.

*   When a checkout request is processed, a database client is acquired from the connection pool.
*   A transaction is started (`BEGIN`).
*   For each product in the order, `SELECT ... FOR UPDATE` is used to fetch the product details. This statement acquires an exclusive row-level lock on the selected product, preventing other transactions from modifying or acquiring a `FOR UPDATE` lock on the same row until the current transaction commits or rolls back.
*   Stock is checked, and if sufficient, the `UPDATE` statement is executed.
*   If all stock checks and updates are successful, the transaction is committed (`COMMIT`).
*   If any error occurs (e.g., insufficient stock, product not found), the transaction is rolled back (`ROLLBACK`), ensuring no partial updates occur and stock remains unchanged.
*   The database client is always released back to the pool in a `finally` block.

This approach guarantees that inventory updates are atomic and isolated, preventing overselling and maintaining data integrity under high concurrency.

## SQL Optimization (N+1 Query Resolution)

**Problem:** The `/api/orders` endpoint initially fetched all orders, and then for each order, performed a separate query to fetch its associated items. For N orders, this resulted in 1 (for orders) + N (for items) queries, leading to an N+1 query problem and poor performance.

**Solution:** The `orderRepository.findAllWithItems()` and `orderRepository.findByIdWithItems()` methods were refactored to use a single `LEFT JOIN` query.

*   A single SQL query now joins the `orders` table with `order_items` and `products` tables.
*   This fetches all relevant order and item data in one round trip to the database.
*   The `orderService` then processes this flat result set, grouping the rows by `order_id` and reconstructing the nested JSON structure (order with an array of items) in application memory.

This reduces the number of database queries significantly, improving the performance of order retrieval endpoints.

## Memory Leak Resolution

**Problem:** The legacy application exhibited continuous memory growth, indicating a memory leak. Common causes include unreleased database connections, unclosed file handles, or unbounded caches.

**Solution:** The primary focus for memory leak resolution in this refactor was on robust database connection management, as this is a common source of leaks in Node.js applications.

*   **Connection Pooling:** The `pg` library's `Pool` is used, which efficiently manages a set of reusable database connections. This prevents the creation of new connections for every request, reducing overhead and resource consumption.
*   **Explicit Client Release:** Every time a client is acquired from the pool (e.g., for transactions using `db.getClient()`), it is explicitly released back to the pool using `client.release()` within a `try...finally` block. This ensures that connections are always returned, even if errors occur during transaction processing.
*   **Graceful Shutdown:** Implemented `SIGTERM` and `SIGINT` handlers in `server.js` to gracefully shut down the server and disconnect the database pool (`pool.end()`). This ensures all resources are properly released when the application stops.

By ensuring proper connection lifecycle management, the application avoids accumulating open database connections, which is a common cause of memory leaks.

## Discount Logic

**Problem:** The original discount calculation logic was buggy, monolithic, and failed to handle various edge cases (e.g., 0%, 100%, negative discounts, discounts exceeding total).

**Solution:** The discount logic was extracted into a pure utility function, `calculateFinalAmount`, located in `src/utils/discountCalculator.js`.

*   **Pure Function:** It takes `totalAmount` and `discountPercentage` as inputs and returns an object containing `finalAmount` and `discountApplied`. It has no side effects.
*   **Input Validation:** Robustly handles invalid `discountPercentage` inputs (e.g., non-numeric, negative, or exceeding 100%) by clamping the value between 0 and 100. It also validates `totalAmount` to be a non-negative number.
*   **Edge Case Handling:**
    *   **0% Discount:** Correctly applies no discount.
    *   **100% Discount:** Ensures the `finalAmount` is 0.
    *   **Negative Discount:** Treats negative percentages as 0%.
    *   **Discount > 100%:** Caps the effective discount at 100%.
    *   **Negative Final Amount:** Ensures `finalAmount` never goes below 0.
*   **Precision:** Rounds results to two decimal places to handle floating-point arithmetic accurately for currency.
*   **Testability:** Being a pure function, it is easily testable, as demonstrated by the new `discountLogic.test.js` integration test.

This refactoring ensures the discount calculation is correct, predictable, and maintainable.

## API Endpoints

All API endpoints are prefixed with `/api`.

### Products

*   **`GET /api/products`**:
    *   **Description:** Retrieves a list of all products.
    *   **Response:** `200 OK` with an array of product objects.
    ```json
    [
      {
        "id": 1,
        "name": "Laptop Pro",
        "description": "High-performance laptop for professionals",
        "price": "1200.00",
        "stock": 98
      }
    ]
    ```
*   **`GET /api/products/:id`**:
    *   **Description:** Retrieves a single product by its ID.
    *   **Response:** `200 OK` with a product object, or `404 Not Found` if the product does not exist.
    ```json
    {
      "id": 1,
      "name": "Laptop Pro",
      "description": "High-performance laptop for professionals",
      "price": "1200.00",
      "stock": 98
    }
    ```

### Orders

*   **`GET /api/orders`**:
    *   **Description:** Retrieves a list of all orders, including their associated items. This endpoint has been optimized to resolve the N+1 query problem.
    *   **Response:** `200 OK` with an array of order objects.
    ```json
    [
      {
        "id": 1,
        "customerName": "John Doe",
        "totalAmount": 40.00,
        "discountApplied": 4.00,
        "finalAmount": 36.00,
        "status": "completed",
        "createdAt": "2023-10-27T10:00:00.000Z",
        "updatedAt": "2023-10-27T10:00:00.000Z",
        "items": [
          {
            "id": 1,
            "productId": 1,
            "productName": "Laptop Pro",
            "quantity": 2,
            "priceAtPurchase": 1200.00
          }
        ]
      }
    ]
    ```
*   **`GET /api/orders/:id`**:
    *   **Description:** Retrieves a single order by its ID, including its associated items.
    *   **Response:** `200 OK` with an order object, or `404 Not Found` if the order does not exist.
    ```json
    {
      "id": 1,
      "customerName": "John Doe",
      "totalAmount": 40.00,
      "discountApplied": 4.00,
      "finalAmount": 36.00,
      "status": "completed",
      "createdAt": "2023-10-27T10:00:00.000Z",
      "updatedAt": "2023-10-27T10:00:00.000Z",
      "items": [
        {
          "id": 1,
          "productId": 1,
          "productName": "Laptop Pro",
          "quantity": 2,
          "priceAtPurchase": 1200.00
        }
      ]
    }
    ```
*   **`POST /api/orders/checkout`**:
    *   **Description:** Processes a new customer checkout, creating an order and updating product stock. This endpoint incorporates the race condition fix and discount logic.
    *   **Request Body:**
        ```json
        {
          "customerName": "Jane Doe",
          "items": [
            { "productId": 1, "quantity": 1 },
            { "productId": 2, "quantity": 2 }
          ],
          "discountPercentage": 15
        }
        ```
    *   **Response:** `201 Created` with the newly created order object, or `400 Bad Request` for invalid input, `404 Not Found` if a product doesn't exist, or `409 Conflict` for insufficient stock.
    ```json
    {
      "id": 2,
      "customerName": "Jane Doe",
      "totalAmount": 70.00,
      "discountApplied": 10.50,
      "finalAmount": 59.50,
      "status": "completed",
      "createdAt": "2023-10-27T10:05:00.000Z",
      "updatedAt": "2023-10-27T10:05:00.000Z",
      "items": [
        {
          "id": 2,
          "productId": 1,
          "productName": "Laptop Pro",
          "quantity": 1,
          "priceAtPurchase": 1200.00
        },
        {
          "id": 3,
          "productId": 2,
          "productName": "Mechanical Keyboard",
          "quantity": 2,
          "priceAtPurchase": 80.00
        }
      ]
    }
    ```

## Debug Report

Refer to `DEBUG_REPORT.md` for a detailed analysis of each critical issue, including root cause, diagnosis, and fix.

## Troubleshooting

*   **Docker Compose fails to start:**
    *   Ensure Docker Desktop is running.
    *   Check `docker compose logs` for specific error messages.
    *   Verify `.env` file exists and variables are correctly set.
    *   Try `docker compose down --volumes` followed by `docker compose up --build` to clean up and rebuild.
*   **Application not accessible:**
    *   Check if the server is listening on the correct port (default 3000).
    *   Verify container logs for any application-level errors.
    *   Ensure no other process is using the configured `PORT`.
*   **Database connection issues:**
    *   Confirm `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env` are correct.
    *   Check PostgreSQL container logs for errors.
    *   Ensure the `db` service is healthy in `docker compose ps`.
*   **Tests failing unexpectedly:**
    *   Ensure the test database is properly reset before each test.
    *   Check test logs for specific assertion failures.
    *   Verify that the test environment variables are correctly loaded (e.g., `.env.test`).

## Future Improvements

*   **Authentication and Authorization:** Implement user authentication (e.g., JWT) and role-based authorization for API endpoints.
*   **Caching:** Introduce a caching layer (e.g., Redis) for frequently accessed data like product listings to further reduce database load.
*   **Asynchronous Processing:** For long-running tasks (e.g., complex order fulfillment, email notifications), consider using a message queue (e.g., RabbitMQ, Kafka) to offload processing.
*   **Logging:** Implement a structured logging solution (e.g., Winston, Pino) with different log levels.
*   **Monitoring:** Integrate with monitoring tools (e.g., Prometheus, Grafana) to track application performance and health metrics.
*   **Input Validation Library:** Use a dedicated validation library (e.g., Joi, Yup) for more robust and declarative input validation.
*   **API Documentation:** Generate API documentation using tools like Swagger/OpenAPI.
*   **More Granular Error Handling:** Define custom error classes for specific business logic errors to provide more precise error responses.
