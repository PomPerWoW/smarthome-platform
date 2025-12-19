# SmartHome Platform Backend API Documentation

**Base URL:** `http://127.0.0.1:5500`

## Table of Contents

1. [Authentication](#authentication)
2. [Home Management](#home-management)
3. [Floor Management](#floor-management)
4. [Room Management](#room-management)
5. [Device Management](#device-management)
6. [Device Actions](#device-actions)
7. [Device-Specific Controls](#device-specific-controls)

---

## Authentication

All authenticated endpoints support three authentication methods:

1. **Token Header**: `Authorization: Token your_auth_token_here` (recommended)
2. **Cookie**: `auth_token` cookie set by login endpoint (for cross-origin)
3. **URL Parameter**: `?token=your_auth_token_here` (for initial XR access)

### Base URL

```
http://127.0.0.1:5500/api/auth/
```

All endpoints except authentication require a token in the header:

```
Authorization: Token your_auth_token_here
```

### 1. User Registration

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

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123",
    "password_confirm": "testpassword123"
  }'
```

### 2. User Login

**Endpoint:** `POST /api/auth/login/`

**Description:** Authenticate a user and return an auth token. Also sets an `auth_token` cookie for cross-origin authentication (scene creator, etc.)

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

**Response Headers:**

```
Set-Cookie: auth_token=your_auth_token_here; Max-Age=604800; Path=/; SameSite=None
```

**Error Response (400 Bad Request):**

```json
{
  "non_field_errors": ["Invalid credentials."]
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }' \
  -c cookies.txt
```

## 3. Verify Authentication (Whoami)

**Endpoint:** `GET /api/auth/whoami/`

**Description:** Get current authenticated user information. Useful for verifying authentication status without fetching all data.

**Authentication:** Required

**Response (200 OK):**

```json
{
  "authenticated": true,
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

**Error Response (401 Unauthorized):**

```json
{
  "detail": "Authentication credentials were not provided."
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/auth/whoami/ \
  -H "Authorization: Token your_auth_token_here"
```

## 4. Get Scene Creator URL

**Endpoint:** `GET /api/auth/scene-creator-url/`

**Description:** Generate a scene creator URL with embedded auth token for easy access from XR devices

**Authentication:** Required

**Response (200 OK):**

```json
{
  "scene_creator_url": "https://localhost:3003/?token=your_auth_token_here",
  "instructions": [
    "Open this URL on your XR device (Meta Quest, etc.)",
    "The token is embedded in the URL for authentication",
    "Bookmark this URL for easy access"
  ]
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/auth/scene-creator-url/ \
  -H "Authorization: Token your_auth_token_here"
```

---

## Home Management

### Base URL

```
http://127.0.0.1:5500/api/home/
```

### 1. Get Full Home Data

**Endpoint:** `GET /api/home/homes/all/`

**Description:** Get complete hierarchy of all homes, floors, rooms, and devices owned by the authenticated user

**Authentication:** Required

**Response (200 OK):**

```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "My Home",
    "floors": [
      {
        "id": "223e4567-e89b-12d3-a456-426614174000",
        "name": "First Floor",
        "number": 1,
        "rooms": [
          {
            "id": "323e4567-e89b-12d3-a456-426614174000",
            "name": "Living Room",
            "devices": [
              {
                "id": "423e4567-e89b-12d3-a456-426614174000",
                "name": "Ceiling Light",
                "type": "lightbulb",
                "is_on": true,
                "position": [0.0, 1.5, 0.0],
                "brightness": 80,
                "colour": "white"
              }
            ]
          }
        ]
      }
    ]
  }
]
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/all/ \
  -H "Authorization: Token your_auth_token_here"
```

### 2. List Homes

**Endpoint:** `GET /api/home/homes/`

**Description:** List all homes owned by the authenticated user

**Authentication:** Required

**Response (200 OK):**

```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "My Home"
  },
  {
    "id": "223e4567-e89b-12d3-a456-426614174000",
    "name": "Office"
  }
]
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/ \
  -H "Authorization: Token your_auth_token_here"
```

### 3. Create Home

**Endpoint:** `POST /api/home/homes/`

**Description:** Create a new home

**Authentication:** Required

**Request Body:**

```json
{
  "name": "My New Home"
}
```

**Response (201 Created):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "My New Home"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/homes/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name": "My New Home"}'
```

### 4. Get Home Detail

**Endpoint:** `GET /api/home/homes/{home_id}/`

**Description:** Get details of a specific home

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID

**Response (200 OK):**

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "My Home"
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/ \
  -H "Authorization: Token your_auth_token_here"
```

### 5. Delete Home

**Endpoint:** `DELETE /api/home/homes/{home_id}/`

**Description:** Delete a home and all its contents

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID

**Response (204 No Content):**

```
(No content)
```

**Example:**

```bash
curl -X DELETE http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/ \
  -H "Authorization: Token your_auth_token_here"
```

---

## Floor Management

### 1. List Floors

**Endpoint:** `GET /api/home/homes/{home_id}/floors/`

**Description:** List all floors in a home

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID

**Response (200 OK):**

```json
[
  {
    "id": "223e4567-e89b-12d3-a456-426614174000",
    "name": "First Floor",
    "number": 1
  },
  {
    "id": "323e4567-e89b-12d3-a456-426614174000",
    "name": "Second Floor",
    "number": 2
  }
]
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/ \
  -H "Authorization: Token your_auth_token_here"
```

### 2. Create Floor

**Endpoint:** `POST /api/home/homes/{home_id}/floors/`

**Description:** Create a new floor in a home

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID

**Request Body:**

```json
{
  "name": "First Floor",
  "number": 1
}
```

**Response (201 Created):**

```json
{
  "id": "223e4567-e89b-12d3-a456-426614174000",
  "name": "First Floor",
  "number": 1
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name": "First Floor", "number": 1}'
```

### 3. Get Floor Detail

**Endpoint:** `GET /api/home/homes/{home_id}/floors/{floor_id}/`

**Description:** Get details of a specific floor

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID

**Response (200 OK):**

```json
{
  "id": "223e4567-e89b-12d3-a456-426614174000",
  "name": "First Floor",
  "number": 1
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/ \
  -H "Authorization: Token your_auth_token_here"
```

### 4. Delete Floor

**Endpoint:** `DELETE /api/home/homes/{home_id}/floors/{floor_id}/`

**Description:** Delete a floor and all its contents

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID

**Response (204 No Content):**

```
(No content)
```

**Example:**

```bash
curl -X DELETE http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/ \
  -H "Authorization: Token your_auth_token_here"
```

---

## Room Management

### 1. List Rooms

**Endpoint:** `GET /api/home/homes/{home_id}/floors/{floor_id}/rooms/`

**Description:** List all rooms on a floor

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID

**Response (200 OK):**

```json
[
  {
    "id": "323e4567-e89b-12d3-a456-426614174000",
    "name": "Living Room"
  },
  {
    "id": "423e4567-e89b-12d3-a456-426614174000",
    "name": "Bedroom"
  }
]
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/rooms/ \
  -H "Authorization: Token your_auth_token_here"
```

### 2. Create Room

**Endpoint:** `POST /api/home/homes/{home_id}/floors/{floor_id}/rooms/`

**Description:** Create a new room on a floor

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID

**Request Body:**

```json
{
  "name": "Living Room"
}
```

**Response (201 Created):**

```json
{
  "id": "323e4567-e89b-12d3-a456-426614174000",
  "name": "Living Room"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/rooms/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"name": "Living Room"}'
```

### 3. Get Room Detail

**Endpoint:** `GET /api/home/homes/{home_id}/floors/{floor_id}/rooms/{room_id}/`

**Description:** Get details of a specific room

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID
- `room_id` (UUID): Room ID

**Response (200 OK):**

```json
{
  "id": "323e4567-e89b-12d3-a456-426614174000",
  "name": "Living Room"
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/rooms/323e4567-e89b-12d3-a456-426614174000/ \
  -H "Authorization: Token your_auth_token_here"
```

### 4. Delete Room

**Endpoint:** `DELETE /api/home/homes/{home_id}/floors/{floor_id}/rooms/{room_id}/`

**Description:** Delete a room and all its contents

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID
- `room_id` (UUID): Room ID

**Response (204 No Content):**

```
(No content)
```

**Example:**

```bash
curl -X DELETE http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/rooms/323e4567-e89b-12d3-a456-426614174000/ \
  -H "Authorization: Token your_auth_token_here"
```

---

## Device Management

### 1. Get All Devices

**Endpoint:** `GET /api/home/devices/`

**Description:** Get all devices across all homes owned by the authenticated user. This is useful for AR scene creator to load all devices at once.

**Authentication:** Required

**Response (200 OK):**

```json
[
  {
    "id": "423e4567-e89b-12d3-a456-426614174000",
    "name": "Ceiling Light",
    "type": "lightbulb",
    "is_on": true,
    "position": [0.0, 1.5, 0.0],
    "brightness": 80,
    "colour": "white",
    "home_id": "123e4567-e89b-12d3-a456-426614174000",
    "home_name": "My Home",
    "floor_id": "223e4567-e89b-12d3-a456-426614174000",
    "floor_name": "First Floor",
    "room_id": "323e4567-e89b-12d3-a456-426614174000",
    "room_name": "Living Room"
  },
  {
    "id": "523e4567-e89b-12d3-a456-426614174000",
    "name": "Living Room TV",
    "type": "television",
    "is_on": false,
    "position": [2.0, 1.0, -1.5],
    "volume": 50,
    "channel": 5,
    "home_id": "123e4567-e89b-12d3-a456-426614174000",
    "home_name": "My Home",
    "floor_id": "223e4567-e89b-12d3-a456-426614174000",
    "floor_name": "First Floor",
    "room_id": "323e4567-e89b-12d3-a456-426614174000",
    "room_name": "Living Room"
  }
]
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/devices/ \
  -H "Authorization: Token your_auth_token_here"
```

### 2. List Devices in Room

**Endpoint:** `GET /api/home/homes/{home_id}/floors/{floor_id}/rooms/{room_id}/devices/`

**Description:** List all devices in a specific room

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID
- `room_id` (UUID): Room ID

**Response (200 OK):**

```json
[
  {
    "id": "423e4567-e89b-12d3-a456-426614174000",
    "name": "Ceiling Light",
    "type": "lightbulb",
    "is_on": true,
    "position": [0.0, 1.5, 0.0],
    "brightness": 80,
    "colour": "white"
  },
  {
    "id": "523e4567-e89b-12d3-a456-426614174000",
    "name": "Living Room TV",
    "type": "television",
    "is_on": false,
    "position": [2.0, 1.0, -1.5],
    "volume": 50,
    "channel": 5
  }
]
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/rooms/323e4567-e89b-12d3-a456-426614174000/devices/ \
  -H "Authorization: Token your_auth_token_here"
```

### 3. Create Device

**Endpoint:** `POST /api/home/homes/{home_id}/floors/{floor_id}/rooms/{room_id}/devices/`

**Description:** Create a new device in a room

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID
- `room_id` (UUID): Room ID

**Request Body:**

```json
{
  "type": "lightbulb",
  "name": "Ceiling Light"
}
```

**Device Types:**

- `lightbulb` - Smart light bulb
- `television` - Smart TV
- `fan` - Tower fan
- `air_conditioner` - Air conditioner

**Response (201 Created):**

```json
{
  "id": "423e4567-e89b-12d3-a456-426614174000",
  "name": "Ceiling Light",
  "type": "lightbulb",
  "is_on": false,
  "position": null,
  "brightness": 0,
  "colour": "white"
}
```

**Error Response (400 Bad Request):**

```json
{
  "detail": "'type' and 'name' are required"
}
```

or

```json
{
  "detail": "Unknown device type"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/rooms/323e4567-e89b-12d3-a456-426614174000/devices/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"type": "lightbulb", "name": "Ceiling Light"}'
```

### 4. Get Device Detail

**Endpoint:** `GET /api/home/homes/{home_id}/floors/{floor_id}/rooms/{room_id}/devices/{device_id}/`

**Description:** Get details of a specific device

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID
- `room_id` (UUID): Room ID
- `device_id` (UUID): Device ID

**Response (200 OK):**

```json
{
  "id": "423e4567-e89b-12d3-a456-426614174000",
  "name": "Ceiling Light",
  "type": "lightbulb",
  "is_on": true,
  "position": [0.0, 1.5, 0.0],
  "brightness": 80,
  "colour": "white"
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/rooms/323e4567-e89b-12d3-a456-426614174000/devices/423e4567-e89b-12d3-a456-426614174000/ \
  -H "Authorization: Token your_auth_token_here"
```

### 5. Delete Device

**Endpoint:** `DELETE /api/home/homes/{home_id}/floors/{floor_id}/rooms/{room_id}/devices/{device_id}/`

**Description:** Delete a device

**Authentication:** Required

**Parameters:**

- `home_id` (UUID): Home ID
- `floor_id` (UUID): Floor ID
- `room_id` (UUID): Room ID
- `device_id` (UUID): Device ID

**Response (204 No Content):**

```
(No content)
```

**Example:**

```bash
curl -X DELETE http://127.0.0.1:5500/api/home/homes/123e4567-e89b-12d3-a456-426614174000/floors/223e4567-e89b-12d3-a456-426614174000/rooms/323e4567-e89b-12d3-a456-426614174000/devices/423e4567-e89b-12d3-a456-426614174000/ \
  -H "Authorization: Token your_auth_token_here"
```

---

## Device Actions

### 1. Toggle Device Power

**Endpoint:** `POST /api/home/devices/{device_id}/toggle/`

**Description:** Toggle device power on/off or set to specific state

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Request Body (optional):**

```json
{
  "on": true
}
```

If `on` is not provided, the power state will be toggled.

**Response (200 OK):**

```json
{
  "id": "423e4567-e89b-12d3-a456-426614174000",
  "name": "Ceiling Light",
  "type": "lightbulb",
  "is_on": true,
  "position": [0.0, 1.5, 0.0],
  "brightness": 80,
  "colour": "white"
}
```

**Example:**

```bash
# Toggle power
curl -X POST http://127.0.0.1:5500/api/home/devices/423e4567-e89b-12d3-a456-426614174000/toggle/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{}'

# Set power to on
curl -X POST http://127.0.0.1:5500/api/home/devices/423e4567-e89b-12d3-a456-426614174000/toggle/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"on": true}'
```

### 2. Get Device Position

**Endpoint:** `GET /api/home/devices/{device_id}/position/`

**Description:** Get the current position of a device

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Response (200 OK):**

```json
{
  "position": [0.0, 1.5, 0.0]
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/devices/423e4567-e89b-12d3-a456-426614174000/position/ \
  -H "Authorization: Token your_auth_token_here"
```

### 3. Set Device Position

**Endpoint:** `POST /api/home/devices/{device_id}/position/`

**Description:** Set the position of a device. This also records the position in PostGIS history.

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Request Body:**

```json
{
  "lon": 0.0,
  "lat": 1.5,
  "alt": 0.0
}
```

**Fields:**

- `lon` (float): Longitude
- `lat` (float): Latitude
- `alt` (float, optional): Altitude

**Response (200 OK):**

```json
{
  "id": "423e4567-e89b-12d3-a456-426614174000",
  "name": "Ceiling Light",
  "type": "lightbulb",
  "is_on": true,
  "position": [0.0, 1.5, 0.0],
  "brightness": 80,
  "colour": "white"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/devices/423e4567-e89b-12d3-a456-426614174000/position/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"lon": 0.0, "lat": 1.5, "alt": 0.0}'
```

---

## Device-Specific Controls

### Lightbulb Control

#### Get Lightbulb State

**Endpoint:** `GET /api/home/devices/{device_id}/lightbulb/`

**Description:** Get the current state of a lightbulb

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Response (200 OK):**

```json
{
  "id": "423e4567-e89b-12d3-a456-426614174000",
  "name": "Ceiling Light",
  "type": "lightbulb",
  "is_on": true,
  "position": [0.0, 1.5, 0.0],
  "brightness": 80,
  "colour": "white"
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/devices/423e4567-e89b-12d3-a456-426614174000/lightbulb/ \
  -H "Authorization: Token your_auth_token_here"
```

#### Set Lightbulb Properties

**Endpoint:** `POST /api/home/devices/{device_id}/lightbulb/`

**Description:** Set lightbulb properties (brightness and/or colour)

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Request Body:**

```json
{
  "brightness": 80,
  "colour": "warm_white"
}
```

**Fields:**

- `brightness` (integer, optional): 0-100
- `colour` (string, optional): Colour name or hex code

**Response (200 OK):**

```json
{
  "id": "423e4567-e89b-12d3-a456-426614174000",
  "name": "Ceiling Light",
  "type": "lightbulb",
  "is_on": true,
  "position": [0.0, 1.5, 0.0],
  "brightness": 80,
  "colour": "warm_white"
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/devices/423e4567-e89b-12d3-a456-426614174000/lightbulb/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"brightness": 80, "colour": "warm_white"}'
```

---

### Television Control

#### Get Television State

**Endpoint:** `GET /api/home/devices/{device_id}/television/`

**Description:** Get the current state of a television

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Response (200 OK):**

```json
{
  "id": "523e4567-e89b-12d3-a456-426614174000",
  "name": "Living Room TV",
  "type": "television",
  "is_on": true,
  "position": [2.0, 1.0, -1.5],
  "volume": 50,
  "channel": 5
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/devices/523e4567-e89b-12d3-a456-426614174000/television/ \
  -H "Authorization: Token your_auth_token_here"
```

#### Set Television Properties

**Endpoint:** `POST /api/home/devices/{device_id}/television/`

**Description:** Set television properties (volume and/or channel)

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Request Body:**

```json
{
  "volume": 60,
  "channel": 10
}
```

**Fields:**

- `volume` (integer, optional): 0-100
- `channel` (integer, optional): Channel number (1+)

**Response (200 OK):**

```json
{
  "id": "523e4567-e89b-12d3-a456-426614174000",
  "name": "Living Room TV",
  "type": "television",
  "is_on": true,
  "position": [2.0, 1.0, -1.5],
  "volume": 60,
  "channel": 10
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/devices/523e4567-e89b-12d3-a456-426614174000/television/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"volume": 60, "channel": 10}'
```

---

### Fan Control

#### Get Fan State

**Endpoint:** `GET /api/home/devices/{device_id}/fan/`

**Description:** Get the current state of a fan

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Response (200 OK):**

```json
{
  "id": "623e4567-e89b-12d3-a456-426614174000",
  "name": "Tower Fan",
  "type": "fan",
  "is_on": true,
  "position": [-1.0, 0.0, 1.0],
  "speed": 3,
  "swing": true
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/devices/623e4567-e89b-12d3-a456-426614174000/fan/ \
  -H "Authorization: Token your_auth_token_here"
```

#### Set Fan Properties

**Endpoint:** `POST /api/home/devices/{device_id}/fan/`

**Description:** Set fan properties (speed and/or swing)

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Request Body:**

```json
{
  "speed": 4,
  "swing": true
}
```

**Fields:**

- `speed` (integer, optional): 0-5
- `swing` (boolean, optional): Enable/disable swing mode

**Response (200 OK):**

```json
{
  "id": "623e4567-e89b-12d3-a456-426614174000",
  "name": "Tower Fan",
  "type": "fan",
  "is_on": true,
  "position": [-1.0, 0.0, 1.0],
  "speed": 4,
  "swing": true
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/devices/623e4567-e89b-12d3-a456-426614174000/fan/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"speed": 4, "swing": true}'
```

---

### Air Conditioner Control

#### Get Air Conditioner State

**Endpoint:** `GET /api/home/devices/{device_id}/air-conditioner/`

**Description:** Get the current state of an air conditioner

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Response (200 OK):**

```json
{
  "id": "723e4567-e89b-12d3-a456-426614174000",
  "name": "Bedroom AC",
  "type": "air_conditioner",
  "is_on": true,
  "position": [0.0, 2.0, 1.5],
  "temperature": 24
}
```

**Example:**

```bash
curl -X GET http://127.0.0.1:5500/api/home/devices/723e4567-e89b-12d3-a456-426614174000/air-conditioner/ \
  -H "Authorization: Token your_auth_token_here"
```

#### Set Air Conditioner Properties

**Endpoint:** `POST /api/home/devices/{device_id}/air-conditioner/`

**Description:** Set air conditioner temperature

**Authentication:** Required

**Parameters:**

- `device_id` (UUID): Device ID

**Request Body:**

```json
{
  "temperature": 22
}
```

**Fields:**

- `temperature` (integer, optional): Temperature in Celsius

**Response (200 OK):**

```json
{
  "id": "723e4567-e89b-12d3-a456-426614174000",
  "name": "Bedroom AC",
  "type": "air_conditioner",
  "is_on": true,
  "position": [0.0, 2.0, 1.5],
  "temperature": 22
}
```

**Example:**

```bash
curl -X POST http://127.0.0.1:5500/api/home/devices/723e4567-e89b-12d3-a456-426614174000/air-conditioner/ \
  -H "Authorization: Token your_auth_token_here" \
  -H "Content-Type: application/json" \
  -d '{"temperature": 22}'
```

---

## Data Models

### Device Types

#### Lightbulb

```json
{
  "id": "uuid",
  "name": "string",
  "type": "lightbulb",
  "is_on": "boolean",
  "position": "[lon, lat, alt]",
  "brightness": "integer (0-100)",
  "colour": "string"
}
```

#### Television

```json
{
  "id": "uuid",
  "name": "string",
  "type": "television",
  "is_on": "boolean",
  "position": "[lon, lat, alt]",
  "volume": "integer (0-100)",
  "channel": "integer (1+)"
}
```

#### Fan

```json
{
  "id": "uuid",
  "name": "string",
  "type": "fan",
  "is_on": "boolean",
  "position": "[lon, lat, alt]",
  "speed": "integer (0-5)",
  "swing": "boolean"
}
```

#### Air Conditioner

```json
{
  "id": "uuid",
  "name": "string",
  "type": "air_conditioner",
  "is_on": "boolean",
  "position": "[lon, lat, alt]",
  "temperature": "integer (celsius)"
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "detail": "Error message"
}
```

or

```json
{
  "field_name": ["Error message"]
}
```

### 401 Unauthorized

```json
{
  "detail": "Authentication credentials were not provided."
}
```

### 404 Not Found

```json
{
  "detail": "Not found."
}
```

---

## Python Client Example

```python
import requests

BASE_URL = "http://127.0.0.1:5500"

class SmartHomeClient:
    def __init__(self):
        self.token = None
        self.base_url = BASE_URL

    def register(self, email, password):
        """Register a new user"""
        response = requests.post(
            f"{self.base_url}/api/auth/register/",
            json={
                "email": email,
                "password": password,
                "password_confirm": password
            }
        )
        data = response.json()
        self.token = data["token"]
        return data

    def login(self, email, password):
        """Login and get token"""
        response = requests.post(
            f"{self.base_url}/api/auth/login/",
            json={
                "email": email,
                "password": password
            }
        )
        data = response.json()
        self.token = data["token"]
        return data

    def _headers(self):
        """Get authorization headers"""
        return {"Authorization": f"Token {self.token}"}

    def get_all_devices(self):
        """Get all devices across all homes"""
        response = requests.get(
            f"{self.base_url}/api/home/devices/",
            headers=self._headers()
        )
        return response.json()

    def create_home(self, name):
        """Create a new home"""
        response = requests.post(
            f"{self.base_url}/api/home/homes/",
            headers=self._headers(),
            json={"name": name}
        )
        return response.json()

    def create_floor(self, home_id, name, number):
        """Create a new floor"""
        response = requests.post(
            f"{self.base_url}/api/home/homes/{home_id}/floors/",
            headers=self._headers(),
            json={"name": name, "number": number}
        )
        return response.json()

    def create_room(self, home_id, floor_id, name):
        """Create a new room"""
        response = requests.post(
            f"{self.base_url}/api/home/homes/{home_id}/floors/{floor_id}/rooms/",
            headers=self._headers(),
            json={"name": name}
        )
        return response.json()

    def create_device(self, home_id, floor_id, room_id, device_type, name):
        """Create a new device"""
        response = requests.post(
            f"{self.base_url}/api/home/homes/{home_id}/floors/{floor_id}/rooms/{room_id}/devices/",
            headers=self._headers(),
            json={"type": device_type, "name": name}
        )
        return response.json()

    def toggle_device(self, device_id, on=None):
        """Toggle device power"""
        data = {"on": on} if on is not None else {}
        response = requests.post(
            f"{self.base_url}/api/home/devices/{device_id}/toggle/",
            headers=self._headers(),
            json=data
        )
        return response.json()

    def set_device_position(self, device_id, lon, lat, alt=None):
        """Set device position"""
        data = {"lon": lon, "lat": lat}
        if alt is not None:
            data["alt"] = alt
        response = requests.post(
            f"{self.base_url}/api/home/devices/{device_id}/position/",
            headers=self._headers(),
            json=data
        )
        return response.json()

    def set_lightbulb(self, device_id, brightness=None, colour=None):
        """Set lightbulb properties"""
        data = {}
        if brightness is not None:
            data["brightness"] = brightness
        if colour is not None:
            data["colour"] = colour
        response = requests.post(
            f"{self.base_url}/api/home/devices/{device_id}/lightbulb/",
            headers=self._headers(),
            json=data
        )
        return response.json()

    def set_television(self, device_id, volume=None, channel=None):
        """Set television properties"""
        data = {}
        if volume is not None:
            data["volume"] = volume
        if channel is not None:
            data["channel"] = channel
        response = requests.post(
            f"{self.base_url}/api/home/devices/{device_id}/television/",
            headers=self._headers(),
            json=data
        )
        return response.json()

    def set_fan(self, device_id, speed=None, swing=None):
        """Set fan properties"""
        data = {}
        if speed is not None:
            data["speed"] = speed
        if swing is not None:
            data["swing"] = swing
        response = requests.post(
            f"{self.base_url}/api/home/devices/{device_id}/fan/",
            headers=self._headers(),
            json=data
        )
        return response.json()

    def set_air_conditioner(self, device_id, temperature):
        """Set air conditioner temperature"""
        response = requests.post(
            f"{self.base_url}/api/home/devices/{device_id}/air-conditioner/",
            headers=self._headers(),
            json={"temperature": temperature}
        )
        return response.json()


# Usage example
if __name__ == "__main__":
    client = SmartHomeClient()

    # Register or login
    client.register("user@example.com", "password123")
    # or
    # client.login("user@example.com", "password123")

    # Create home structure
    home = client.create_home("My Home")
    floor = client.create_floor(home["id"], "First Floor", 1)
    room = client.create_room(home["id"], floor["id"], "Living Room")

    # Create devices
    light = client.create_device(home["id"], floor["id"], room["id"], "lightbulb", "Ceiling Light")
    tv = client.create_device(home["id"], floor["id"], room["id"], "television", "Living Room TV")

    # Control devices
    client.toggle_device(light["id"], on=True)
    client.set_lightbulb(light["id"], brightness=80, colour="warm_white")
    client.set_television(tv["id"], volume=50, channel=5)

    # Set positions
    client.set_device_position(light["id"], lon=0.0, lat=1.5, alt=0.0)

    # Get all devices
    all_devices = client.get_all_devices()
    print(f"Total devices: {len(all_devices)}")
```

---

## Notes

- All UUIDs are in UUID4 format
- Position coordinates use `[lon, lat, alt]` format (longitude, latitude, altitude)
- All authenticated endpoints require the `Authorization: Token <token>` header
- The backend uses ZODB for device state storage and PostgreSQL with PostGIS for position history
- All endpoints return JSON responses
- Timestamps are in ISO 8601 format with UTC timezone
