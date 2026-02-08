# SmartHome Platform Backend

## Development Certificates

This project uses HTTPS for development. You need to generate SSL certificates for the backend.

1.  **Install mkcert**: Follow the instructions at [mkcert](https://github.com/FiloSottile/mkcert#installation).
2.  **Generate Certificates**:
    Run the following command from the `apps/backend` directory:
    ```bash
    mkdir -p certs
    mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ::1 <YOUR_LOCAL_IP>
    ```
    Replace `<YOUR_LOCAL_IP>` with your machine's local IP address (e.g., `192.168.0.0`).

