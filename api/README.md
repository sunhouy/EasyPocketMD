# Node.js API Refactor

This directory contains the Node.js implementation of the backend API, replacing the original PHP implementation.

## Features

- **Compatibility**: Implements a `legacy` route (`/api/index.php`) that mimics the original PHP API, ensuring full compatibility with the existing frontend.
- **Technology Stack**:
  - **Runtime**: Node.js
  - **Framework**: Express.js
  - **Database**: MySQL (using `mysql2`)
  - **Authentication**: JWT/Session based (currently using database token/password verification for compatibility)
  - **File Uploads**: Multer
  - **Security**: Bcrypt for password hashing

## Directory Structure

- `server.js`: Main entry point.
- `config/`: Configuration files (database).
- `models/`: Business logic and database interactions (`User`, `FileManager`, `HistoryManager`, `ShareManager`, `ApiManager`).
- `routes/`: Express routes. `legacy.js` handles the compatibility layer.
- `utils/`: Utility functions (`auth`, `htmlGenerator`).

## Setup & Run

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Configuration**:
    The database configuration is loaded from `.env` file in the project root.
    Default configuration matches the original PHP `config.php`.

3.  **Run Server**:
    ```bash
    npm start
    # OR
    node api/server.js
    ```
    The server runs on port 3000 by default.

4.  **Access**:
    Open `http://localhost:3000` in your browser.

## Notes

- The Node.js server also serves the static frontend files from the project root.
- All API requests to `/api/index.php` are handled by `api/routes/legacy.js`.
- File uploads are stored in `api/uploads`, `api/avatars`, and `api/screenshots`, consistent with the PHP version.
