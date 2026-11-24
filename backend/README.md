# Miracle Me Backend

Backend service for the Miracle Me application, built with Node.js, Express, and PostgreSQL.

## 🚀 Features

- **RESTful API**: Built with Express.js.
- **Database**: PostgreSQL with Sequelize ORM.
- **Real-time**: Socket.io for real-time features.
- **Caching**: Redis for caching and session management.
- **Authentication**: JWT-based authentication.
- **Notifications**: Firebase Admin SDK for push notifications.
- **File Uploads**: Multer for handling file uploads.

## 🛠️ Prerequisites

Ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v14 or higher)
- [PostgreSQL](https://www.postgresql.org/)
- [Redis](https://redis.io/)

## 📦 Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd miracle-me-backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## ⚙️ Configuration

1.  **Environment Variables:**
    Copy the example environment file and configure it:
    ```bash
    cp .env.example .env
    ```

2.  **Update `.env`:**
    Fill in your database, Redis, JWT, and Firebase credentials in the `.env` file.

    ```env
    # Server
    PORT=3000
    NODE_ENV=development

    # PostgreSQL Database
    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=miracle_me_db
    DB_USER=postgres
    DB_PASSWORD=your_password
    DB_SYNC=true

    # Redis
    REDIS_HOST=127.0.0.1
    REDIS_PORT=6379
    ```

## 🏃‍♂️ Running the Application

### Development Mode
Runs the server with `nodemon` for auto-reloading:
```bash
npm run dev
```

### Production Mode
Runs the server using `node`:
```bash
npm start
```

## 🧪 Testing

Run tests using Jest:
```bash
npm test
```

## 🚀 Deployment

The project includes a `deploy.sh` script for automated deployment on a Linux server.

```bash
./deploy.sh
```
This script will:
1.  Fetch the latest code from the `main` branch.
2.  Reset the local state to match the remote.
3.  Install production dependencies.
4.  Restart the application using PM2.

## 📂 Project Structure

- `src/config`: Configuration files (DB, Firebase, Redis, etc.)
- `src/controllers`: Request handlers
- `src/models`: Sequelize models
- `src/routes`: API routes
- `src/services`: Business logic
- `src/utils`: Utility functions
- `src/websocket`: Socket.io handlers

## 📄 License

ISC
