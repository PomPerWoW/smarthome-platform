#!/usr/bin/env python3
"""
Database setup script for SmartHomeAR backend
Creates PostgreSQL database if it doesn't exist and runs migrations
"""

import os
import sys
import django
from pathlib import Path

# Add the project directory to Python path
project_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(project_dir))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')
django.setup()

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from django.conf import settings
from django.core.management import execute_from_command_line


def create_database():
    """Create PostgreSQL database if it doesn't exist"""
    db_config = settings.DATABASES['default']
    
    # Connect to PostgreSQL server (not to specific database)
    try:
        conn = psycopg2.connect(
            host=db_config['HOST'],
            port=db_config['PORT'],
            user=db_config['USER'],
            password=db_config['PASSWORD'],
            database='postgres'  # Connect to default postgres database
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Check if database exists
        cursor.execute(
            "SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s",
            (db_config['NAME'],)
        )
        
        exists = cursor.fetchone()
        
        if not exists:
            print(f"Creating database '{db_config['NAME']}'...")
            cursor.execute(f'CREATE DATABASE "{db_config["NAME"]}"')
            print(f"✅ Database '{db_config['NAME']}' created successfully!")
        else:
            print(f"✅ Database '{db_config['NAME']}' already exists!")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"❌ Error connecting to PostgreSQL: {e}")
        print("\nMake sure PostgreSQL is running and the credentials are correct:")
        print(f"  Host: {db_config['HOST']}")
        print(f"  Port: {db_config['PORT']}")
        print(f"  User: {db_config['USER']}")
        print(f"  Password: {'*' * len(db_config['PASSWORD'])}")
        sys.exit(1)


def run_migrations():
    """Run Django migrations"""
    print("\n🔄 Running Django migrations...")
    try:
        execute_from_command_line(['manage.py', 'migrate'])
        print("✅ Migrations completed successfully!")
    except Exception as e:
        print(f"❌ Error running migrations: {e}")
        sys.exit(1)


def create_superuser():
    """Create Django superuser if it doesn't exist"""
    print("\n👤 Creating superuser...")
    try:
        from django.contrib.auth.models import User
        if not User.objects.filter(is_superuser=True).exists():
            execute_from_command_line(['manage.py', 'createsuperuser', '--noinput', '--username', 'admin', '--email', 'admin@smarthome.com'])
            # Set password after creation
            admin_user = User.objects.get(username='admin')
            admin_user.set_password('admin123')
            admin_user.save()
            print("✅ Superuser 'admin' created with password 'admin123'")
        else:
            print("✅ Superuser already exists!")
    except Exception as e:
        print(f"❌ Error creating superuser: {e}")


def main():
    """Main setup function"""
    print("🚀 Setting up SmartHomeAR Database...")
    print("=" * 50)
    
    # Create database
    create_database()
    
    # Run migrations
    run_migrations()
    
    # Create superuser
    create_superuser()
    
    print("\n" + "=" * 50)
    print("🎉 Database setup completed successfully!")
    print("\nDatabase Information:")
    db_config = settings.DATABASES['default']
    print(f"  Database: {db_config['NAME']}")
    print(f"  Host: {db_config['HOST']}:{db_config['PORT']}")
    print(f"  User: {db_config['USER']}")
    print(f"\nAdmin Credentials:")
    print(f"  Username: admin")
    print(f"  Password: admin123")
    print(f"\nAPI Endpoints:")
    print(f"  Register: http://localhost:8000/api/auth/register/")
    print(f"  Login: http://localhost:8000/api/auth/login/")


if __name__ == '__main__':
    main()
