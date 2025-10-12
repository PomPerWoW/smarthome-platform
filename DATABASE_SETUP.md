# SmartHomeAR Backend Database Setup Documentation

## Database Setup (PostgreSQL)

### Prerequisites
- PostgreSQL installed and running
- Default PostgreSQL user: `postgres`
- Default password: `postgres` (or your configured password)

### Quick Setup
Run the automated setup script:
```bash
python setup_database.py
```

### Manual Setup
1. Create the database:
   ```bash
   createdb smarthome_db
   ```

2. Activate virtual environment:
   ```bash
   source venv/bin/activate
   ```

3. Run migrations:
   ```bash
   python manage.py migrate
   ```

4. Create superuser:
   ```bash
   python manage.py createsuperuser
   ```

## Running the Server

1. Activate the virtual environment:
   ```bash
   source venv/bin/activate
   ```

2. Start the development server:
   ```bash
   python manage.py runserver
   ```

3. Access the admin panel:
   - URL: http://localhost:8000/admin/
   - Username: admin
   - Password: admin123 (if created by setup script)

## Environment Configuration

Copy the environment template and customize:
```bash
cp env.example .env
```

Edit `.env` with your database credentials:
```env
DB_NAME=smarthome_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
```
