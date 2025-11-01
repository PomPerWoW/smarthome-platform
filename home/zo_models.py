import uuid
from typing import Optional

from BTrees.OOBTree import OOBTree
from persistent import Persistent


class Device(Persistent):
    def __init__(self, name: str):
        self.id = uuid.uuid4()
        self.name = name
        self.is_on = False
        self.position = None  # (lon, lat, alt) tuple

    # power
    def toggle_power(self, on: Optional[bool] = None):
        if on is None:
            self.is_on = not self.is_on
        else:
            self.is_on = bool(on)

    # position: set/get handled in DRF view to also persist PostGIS history
    def set_position(self, lon: float, lat: float, alt: Optional[float] = None):
        self.position = (lon, lat, alt)

    def get_position(self):
        return self.position


class Lightbulb(Device):
    def __init__(self, name: str):
        super().__init__(name)
        self.brightness = 0  # 0-100
        self.colour = "white"  # simple string for color name/hex

    def set_brightness(self, value: int):
        value = max(0, min(100, int(value)))
        self.brightness = value

    def get_brightness(self) -> int:
        return self.brightness

    def set_colour(self, value: str):
        self.colour = str(value)

    def get_colour(self) -> str:
        return self.colour


class Television(Device):
    def __init__(self, name: str):
        super().__init__(name)
        self.volume = 10  # 0-100
        self.channel = 1

    def set_volume(self, value: int):
        value = max(0, min(100, int(value)))
        self.volume = value

    def get_volume(self) -> int:
        return self.volume

    def set_channel(self, value: int):
        self.channel = int(value)

    def get_channel(self) -> int:
        return self.channel


class Fan(Device):
    def __init__(self, name: str):
        super().__init__(name)
        self.speed = 0  # 0-5
        self.swing = False

    def set_speed(self, value: int):
        value = max(0, min(5, int(value)))
        self.speed = value

    def get_speed(self) -> int:
        return self.speed

    def set_swing(self, value: bool):
        self.swing = bool(value)

    def get_swing(self) -> bool:
        return self.swing


class AirConditioner(Device):
    def __init__(self, name: str):
        super().__init__(name)
        self.temperature = 24

    def set_temperature(self, value: int):
        self.temperature = int(value)

    def get_temperature(self) -> int:
        return self.temperature


class Room(Persistent):
    def __init__(self, name: str):
        self.id = uuid.uuid4()
        self.name = name
        self.devices = OOBTree()  # device_id -> Device


class Floor(Persistent):
    def __init__(self, name: str, number: int):
        self.id = uuid.uuid4()
        self.name = name
        self.number = number
        self.rooms = OOBTree()  # room_id -> Room


class Home(Persistent):
    def __init__(self, name: str):
        self.id = uuid.uuid4()
        self.name = name
        self.floors = OOBTree()  # floor_id -> Floor


