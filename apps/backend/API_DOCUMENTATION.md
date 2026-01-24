# SmartHome Platform Backend API Documentation

**Base URL:** `http://127.0.0.1:8000` (or your configured backend port)

## Table of Contents

1. [Authentication](#authentication)
2. [Home Management](#home-management)
3. [Room Management](#room-management)
4. [Device Management](#device-management)
5. [Device Control Commands](#device-control-commands)

---

## Authentication

**Base URL:** `/api/auth/`

All authenticated endpoints support three authentication methods:
1. **Token Header**: `Authorization: Token <key>` (Recommended)
2. **Cookie**: `auth_token` cookie (Automatically set by login/register)
3. **Session**: Django session authentication (if enabled)

### 1. Register
**Endpoint:** `POST /api/auth/register/`  
**Description:** Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "password_confirm": "securepassword",
  "first_name": "John",
  "last_name": "Doe"
}
```

**Response (201 Created):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "...": "..."
  },
  "token": "valid_token_string"
}
```

### 2. Login
**Endpoint:** `POST /api/auth/login/`  
**Description:** Authenticate using email and password. Sets `auth_token` cookie.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response (200 OK):**
```json
{
  "message": "Login successful",
  "user": { ... },
  "token": "valid_token_string"
}
```

### 3. Logout
**Endpoint:** `POST /api/auth/logout/`  
**Description:** Invalidates the current token and clears the auth cookie.

**Response (200 OK):**
```json
{
  "message": "Logout successful"
}
```

### 4. Who Am I
**Endpoint:** `GET /api/auth/whoami/`  
**Description:** Retrieve details of the currently authenticated user.

**Response (200 OK):**
```json
{
  "authenticated": true,
  "user": { ... },
  "token": "valid_token_string"
}
```

---

## Home Management

**Base URL:** `/api/homes/homes/`

### 1. List Homes
**Endpoint:** `GET /api/homes/homes/`  
**Description:** Get a list of homes owned by the user.

### 2. Create Home
**Endpoint:** `POST /api/homes/homes/`  
**Body:**
```json
{
  "home_name": "My Smart Home"
}
```

### 3. Retrieve Home
**Endpoint:** `GET /api/homes/homes/{id}/`

### 4. Update Home
**Endpoint:** `PUT/PATCH /api/homes/homes/{id}/`

### 5. Delete Home
**Endpoint:** `DELETE /api/homes/homes/{id}/`

### 6. Get Home Devices
**Endpoint:** `GET /api/homes/homes/{id}/get_devices/`  
**Description:** Retrieve all devices associated with this home (across all rooms).

---

## Room Management

**Base URL:** `/api/homes/rooms/`

### 1. List Rooms
**Endpoint:** `GET /api/homes/rooms/`  
**Description:** Get a list of rooms owned by the user.

### 2. Create Room
**Endpoint:** `POST /api/homes/rooms/`  
**Body:**
```json
{
  "room_name": "Living Room",
  "home": "uuid-of-home"
}
```

### 3. Retrieve Room
**Endpoint:** `GET /api/homes/rooms/{id}/`

### 4. Update Room
**Endpoint:** `PUT/PATCH /api/homes/rooms/{id}/`

### 5. Delete Room
**Endpoint:** `DELETE /api/homes/rooms/{id}/`

### 6. Get Room Devices
**Endpoint:** `GET /api/homes/rooms/{id}/get_devices/`  
**Description:** Retrieve all devices in this room.

---

## Device Management

**Base URL:** `/api/homes/devices/` (Polymorphic endpoint)

This endpoint handles all device types. Specific device types can also be accessed via their specific endpoints:
- Air Conditioners: `/api/homes/acs/`
- Fans: `/api/homes/fans/`
- Lightbulbs: `/api/homes/lightbulbs/`
- Televisions: `/api/homes/tvs/`

### 1. List Devices
**Endpoint:** `GET /api/homes/devices/`

### 2. Create Device
**Endpoint:** `POST /api/homes/devices/`  
**NOTE:** It is recommended to use specific endpoints (e.g., `/api/homes/lightbulbs/`) to create devices to ensure type-specific fields are handled correctly, although the generic endpoint may support it depending on the payload.

### 3. Device Positioning & Tagging (Common Actions)

All devices (regardless of type) support the following actions.

#### Set Position
**Endpoint:** `POST /api/homes/devices/{id}/set_position/`  
**Body:**
```json
{
  "x": 1.0,
  "y": 2.5,
  "z": -3.0
}
```

#### Get Position
**Endpoint:** `GET /api/homes/devices/{id}/get_position/`

#### Get Position History
**Endpoint:** `GET /api/homes/devices/{id}/history/`

#### Manage Tag
**Endpoint:** `GET/POST/PUT/DELETE /api/homes/devices/{id}/tag/`  
**Body (POST/PUT):**
```json
{
  "tag": "Living Room Main Light"
}
```

---

## Device Control Commands

Use the specific endpoints for device controls.

### Air Conditioner
**Base URL:** `/api/homes/acs/{id}/`

- **Set Temperature:** `POST set_temperature/`
  ```json
  { "temp": 24.5 }
  ```

### Fan
**Base URL:** `/api/homes/fans/{id}/`

- **Set Speed:** `POST set_speed/`
  ```json
  { "speed": 3 }
  ```
- **Set Swing:** `POST set_swing/`
  ```json
  { "swing": true }
  ```

### Lightbulb
**Base URL:** `/api/homes/lightbulbs/{id}/`

- **Set Brightness:** `POST set_brightness/`
  ```json
  { "brightness": 80 }
  ```
- **Set Colour:** `POST set_colour/`
  ```json
  { "colour": "#FF5733" }
  ```

### Television
**Base URL:** `/api/homes/tvs/{id}/`

- **Set Volume:** `POST set_volume/`
  ```json
  { "volume": 15 }
  ```
- **Set Channel:** `POST set_channel/`
  ```json
  { "channel": 5 }
  ```
- **Set Mute:** `POST set_mute/`
  ```json
  { "mute": true }
  ```
