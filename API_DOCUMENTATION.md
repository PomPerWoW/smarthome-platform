# SmartHomeAR Backend API Documentation

## Authentication Endpoints

### Base URL
```
http://127.0.0.1:8000/api/auth/
```

## 1. User Registration

**Endpoint:** `POST /api/auth/register/`

**Description:** Register a new user account

**Request Body:**
```json
{
    "email": "user@example.com",
    "password": "your_password",
    "password_confirm": "your_password"
}
```

**Response (201 Created):**
```json
{
    "message": "User registered successfully",
    "user": {
        "id": 1,
        "email": "user@example.com",
        "first_name": "",
        "last_name": "",
        "date_joined": "2024-01-01T12:00:00Z"
    },
    "token": "your_auth_token_here"
}
```

**Error Response (400 Bad Request):**
```json
{
    "email": ["A user with this email already exists."],
    "password": ["This field is required."],
    "password_confirm": ["Passwords don't match."]
}
```

## 2. User Login

**Endpoint:** `POST /api/auth/login/`

**Description:** Authenticate a user and return an auth token

**Request Body:**
```json
{
    "email": "user@example.com",
    "password": "your_password"
}
```

**Response (200 OK):**
```json
{
    "message": "Login successful",
    "user": {
        "id": 1,
        "email": "user@example.com",
        "first_name": "",
        "last_name": "",
        "date_joined": "2024-01-01T12:00:00Z"
    },
    "token": "your_auth_token_here"
}
```

**Error Response (400 Bad Request):**
```json
{
    "non_field_errors": ["Invalid credentials."]
}
```

## Authentication

After successful login or registration, include the token in subsequent requests:

**Header:**
```
Authorization: Token your_auth_token_here
```

## Example Usage

### Using curl:

**Register:**
```bash
curl -X POST http://127.0.0.1:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123",
    "password_confirm": "testpassword123"
  }'
```

**Login:**
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

**Note:** Make sure to include the `Content-Type: application/json` header in your requests.

### Using Python requests:

```python
import requests

# Register
register_data = {
    "email": "test@example.com",
    "password": "testpassword123",
    "password_confirm": "testpassword123"
}
response = requests.post("http://127.0.0.1:8000/api/auth/register/", json=register_data)
token = response.json()["token"]

# Login
login_data = {
    "email": "test@example.com",
    "password": "testpassword123"
}
response = requests.post("http://127.0.0.1:8000/api/auth/login/", json=login_data)
token = response.json()["token"]

# Use token in authenticated requests
headers = {"Authorization": f"Token {token}"}
response = requests.get("http://127.0.0.1:8000/api/protected-endpoint/", headers=headers)
```