from .scada_ws import WebSocket2Scada

class BaseScadaManager:
    _instances = {}

    def __new__(cls):
        # Singleton pattern to ensure only one connection exists per manager class
        if cls not in cls._instances:
            instance = super().__new__(cls)
            instance.client = None
            cls._instances[cls] = instance
        return cls._instances[cls]

    def _get_connection_params(self):
        """Must be overridden by child classes to return {target, login, password, token, tags, verify_tls}"""
        raise NotImplementedError

    def start(self):
        """Initialize and start the SCADA connection."""
        if self.client and self.client.is_connected():
            return

        params = self._get_connection_params()
        if not params:
            return

        print(f"[{self.__class__.__name__.upper()}] 🔌 Starting connection...")
        self.client = WebSocket2Scada(
            target=params['target'],
            login=params['login'],
            password=params['password'],
            token=params['token'],
            tags=params['tags'],
            on_tag=self.handle_tag_update, # Hook the callback
            verify_tls=params.get('verify_tls', False),
        )
        self.client.start()

    def handle_tag_update(self, tag, value, at):
        """Must be implemented by child classes to handle incoming data."""
        raise NotImplementedError

    def send_command(self, tag, value):
        """Forward command to SCADA"""
        if self.client and self.client.is_connected():
            self.client.send_value(tag, value)
        else:
            print(f"[{self.__class__.__name__.upper()}] ⚠️ Not connected, cannot send command")

    def close(self):
        """Shut down the SCADA connection."""
        if self.client:
            self.client.close()
            self.client = None
            print(f"[{self.__class__.__name__.upper()}] Connection closed")
