from typing import Any, Dict, Tuple
import uuid

from django.contrib.gis.geos import Point
from django.http import Http404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PositionHistory, UserHome
from .serializers import (
    HomeSerializer,
    FloorSerializer,
    RoomSerializer,
    DeviceSerializer,
    LightbulbSerializer,
    TelevisionSerializer,
    FanSerializer,
    AirConditionerSerializer,
    TogglePowerSerializer,
    SetPositionSerializer,
    LightbulbSetSerializer,
    TelevisionSetSerializer,
    FanSetSerializer,
    AirConditionerSetSerializer,
)
from .zodb_store import get_connection, commit, abort
from .zo_models import Home, Floor, Room, Device, Lightbulb, Television, Fan, AirConditioner


def _key(value) -> str:
    return str(value)


def _check_home_ownership(user, home_id: uuid.UUID) -> bool:
    """Check if a user owns a home"""
    return UserHome.objects.filter(user=user, home_id=home_id).exists()


def _get_user_home_ids(user) -> list:
    """Get list of home IDs owned by a user"""
    return list(UserHome.objects.filter(user=user).values_list('home_id', flat=True))


def _find_device_in_user_homes(root, device_id, user) -> Tuple[Any, Any]:
    """Find a device in homes owned by the user. Returns (device, home) or (None, None)"""
    user_home_ids = _get_user_home_ids(user)
    for _, home in root["homes"].items():
        # Only search in homes owned by the user
        if home.id not in user_home_ids:
            continue
        for _, floor in home.floors.items():
            for _, room in floor.rooms.items():
                device = room.devices.get(_key(device_id))
                if device:
                    return device, home
    return None, None


def _get_home_floor_room(root, home_id, floor_id=None, room_id=None, user=None) -> Tuple[Any, Any, Any]:
    """Get home, floor, and room with ownership check"""
    home = root["homes"].get(_key(home_id))
    if home is None:
        raise Http404("Home not found")
    
    # Check ownership if user is provided
    if user is not None and not _check_home_ownership(user, home.id):
        raise Http404("Home not found or access denied")
    
    floor = None
    room = None
    if floor_id is not None:
        floor = home.floors.get(_key(floor_id))
        if floor is None:
            raise Http404("Floor not found")
    if room_id is not None and floor is not None:
        room = floor.rooms.get(_key(room_id))
        if room is None:
            raise Http404("Room not found")
    return home, floor, room

class HomeFullDataView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        user_home_ids = _get_user_home_ids(user)
        with get_connection() as (conn, root):
            homes_data = []
            for home_id_str, home in root["homes"].items():
                # Only show homes owned by the user
                if home.id in user_home_ids:
                    floors_data = []
                    for _, floor in home.floors.items():
                        rooms_data = []
                        for _, room in floor.rooms.items():
                            devices_data = [_device_to_dict(d) for _, d in room.devices.items()]
                            rooms_data.append({
                                "id": str(room.id),
                                "name": room.name,
                                "devices": devices_data,
                            })
                        floors_data.append({
                            "id": str(floor.id),
                            "name": floor.name,
                            "number": floor.number,
                            "rooms": rooms_data,
                        })
                    homes_data.append({
                        "id": str(home.id),
                        "name": home.name,
                        "floors": floors_data,
                    })
            return Response(homes_data)


class HomeListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        user_home_ids = _get_user_home_ids(user)
        with get_connection() as (conn, root):
            # Only return homes owned by the user
            homes = [h for _, h in root["homes"].items() if h.id in user_home_ids]
            data = [{"id": str(h.id), "name": h.name} for h in homes]
            return Response(data)

    def post(self, request):
        user = request.user
        serializer = HomeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with get_connection() as (conn, root):
            home = Home(name=serializer.validated_data["name"])
            root["homes"][str(home.id)] = home
            commit()
            # Assign home to the user
            UserHome.objects.create(user=user, home_id=home.id)
            return Response({"id": str(home.id), "name": home.name}, status=status.HTTP_201_CREATED)


class HomeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, home_id):
        user = request.user
        try:
            home_id_uuid = uuid.UUID(str(home_id))
        except ValueError:
            raise Http404("Invalid home ID")
        
        if not _check_home_ownership(user, home_id_uuid):
            raise Http404("Home not found or access denied")
        
        with get_connection() as (conn, root):
            home = root["homes"].get(_key(home_id))
            if not home:
                raise Http404
            return Response({"id": str(home.id), "name": home.name})

    def delete(self, request, home_id):
        user = request.user
        try:
            home_id_uuid = uuid.UUID(str(home_id))
        except ValueError:
            raise Http404("Invalid home ID")
        
        if not _check_home_ownership(user, home_id_uuid):
            raise Http404("Home not found or access denied")
        
        with get_connection() as (conn, root):
            key = _key(home_id)
            if key in root["homes"]:
                del root["homes"][key]
                commit()
                # Remove ownership record
                UserHome.objects.filter(user=user, home_id=home_id_uuid).delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            raise Http404


class FloorListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, home_id):
        user = request.user
        with get_connection() as (conn, root):
            home, _, _ = _get_home_floor_room(root, home_id, user=user)
            floors = [f for _, f in home.floors.items()]
            data = [{"id": str(f.id), "name": f.name, "number": f.number} for f in floors]
            return Response(data)

    def post(self, request, home_id):
        user = request.user
        serializer = FloorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with get_connection() as (conn, root):
            home, _, _ = _get_home_floor_room(root, home_id, user=user)
            floor = Floor(name=serializer.validated_data["name"], number=serializer.validated_data["number"])
            home.floors[str(floor.id)] = floor
            commit()
            return Response({"id": str(floor.id), "name": floor.name, "number": floor.number}, status=status.HTTP_201_CREATED)


class FloorDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, home_id, floor_id):
        user = request.user
        with get_connection() as (conn, root):
            _, floor, _ = _get_home_floor_room(root, home_id, floor_id, user=user)
            return Response({"id": str(floor.id), "name": floor.name, "number": floor.number})

    def delete(self, request, home_id, floor_id):
        user = request.user
        with get_connection() as (conn, root):
            home, floor, _ = _get_home_floor_room(root, home_id, floor_id, user=user)
            del home.floors[str(floor.id)]
            commit()
            return Response(status=status.HTTP_204_NO_CONTENT)


class RoomListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, home_id, floor_id):
        user = request.user
        with get_connection() as (conn, root):
            _, floor, _ = _get_home_floor_room(root, home_id, floor_id, user=user)
            rooms = [r for _, r in floor.rooms.items()]
            data = [{"id": str(r.id), "name": r.name} for r in rooms]
            return Response(data)

    def post(self, request, home_id, floor_id):
        user = request.user
        serializer = RoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with get_connection() as (conn, root):
            _, floor, _ = _get_home_floor_room(root, home_id, floor_id, user=user)
            room = Room(name=serializer.validated_data["name"])
            floor.rooms[str(room.id)] = room
            commit()
            return Response({"id": str(room.id), "name": room.name}, status=status.HTTP_201_CREATED)


class RoomDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, home_id, floor_id, room_id):
        user = request.user
        with get_connection() as (conn, root):
            _, _, room = _get_home_floor_room(root, home_id, floor_id, room_id, user=user)
            return Response({"id": str(room.id), "name": room.name})

    def delete(self, request, home_id, floor_id, room_id):
        user = request.user
        with get_connection() as (conn, root):
            _, floor, room = _get_home_floor_room(root, home_id, floor_id, room_id, user=user)
            del floor.rooms[str(room.id)]
            commit()
            return Response(status=status.HTTP_204_NO_CONTENT)


def _device_to_dict(device) -> Dict[str, Any]:
    base = {
        "id": str(device.id),
        "name": device.name,
        "is_on": device.is_on,
        "position": list(device.position) if device.position else None,
    }
    if isinstance(device, Lightbulb):
        base.update({"type": "lightbulb", "brightness": device.brightness, "colour": device.colour})
    elif isinstance(device, Television):
        base.update({"type": "television", "volume": device.volume, "channel": device.channel})
    elif isinstance(device, Fan):
        base.update({"type": "fan", "speed": device.speed, "swing": device.swing})
    elif isinstance(device, AirConditioner):
        base.update({"type": "air_conditioner", "temperature": device.temperature})
    else:
        base.update({"type": "device"})
    return base


class DeviceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, home_id, floor_id, room_id):
        user = request.user
        with get_connection() as (conn, root):
            _, _, room = _get_home_floor_room(root, home_id, floor_id, room_id, user=user)
            devices = [d for _, d in room.devices.items()]
            data = [_device_to_dict(d) for d in devices]
            return Response(data)

    def post(self, request, home_id, floor_id, room_id):
        user = request.user
        device_type = request.data.get("type")
        name = request.data.get("name")
        if not device_type or not name:
            return Response({"detail": "'type' and 'name' are required"}, status=status.HTTP_400_BAD_REQUEST)

        type_map = {
            "lightbulb": Lightbulb,
            "television": Television,
            "fan": Fan,
            "air_conditioner": AirConditioner,
        }
        cls = type_map.get(str(device_type).lower())
        if not cls:
            return Response({"detail": "Unknown device type"}, status=status.HTTP_400_BAD_REQUEST)

        with get_connection() as (conn, root):
            _, _, room = _get_home_floor_room(root, home_id, floor_id, room_id, user=user)
            device = cls(name=name)
            room.devices[str(device.id)] = device
            commit()
            return Response(_device_to_dict(device), status=status.HTTP_201_CREATED)


class DeviceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, home_id, floor_id, room_id, device_id):
        user = request.user
        with get_connection() as (conn, root):
            _, _, room = _get_home_floor_room(root, home_id, floor_id, room_id, user=user)
            device = room.devices.get(_key(device_id))
            if not device:
                raise Http404
            return Response(_device_to_dict(device))

    def delete(self, request, home_id, floor_id, room_id, device_id):
        user = request.user
        with get_connection() as (conn, root):
            _, _, room = _get_home_floor_room(root, home_id, floor_id, room_id, user=user)
            key = _key(device_id)
            if key in room.devices:
                del room.devices[key]
                commit()
                return Response(status=status.HTTP_204_NO_CONTENT)
            raise Http404


class DeviceTogglePowerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, device_id):
        user = request.user
        serializer = TogglePowerSerializer(data=request.data)
        serializer.is_valid(raise_exception=False)
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device:
                device.toggle_power(serializer.validated_data.get("on"))
                commit()
                return Response(_device_to_dict(device))
            raise Http404


class DevicePositionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, device_id):
        user = request.user
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device:
                return Response({"position": list(device.get_position()) if device.get_position() else None})
            raise Http404

    def post(self, request, device_id):
        user = request.user
        serializer = SetPositionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lon = serializer.validated_data["lon"]
        lat = serializer.validated_data["lat"]
        alt = serializer.validated_data.get("alt")

        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device:
                device.set_position(lon, lat, alt)
                commit()
                # Record PostGIS point history with 3D support
                if alt is not None:
                    point = Point(lon, lat, alt, srid=4326)
                else:
                    point = Point(lon, lat, srid=4326)
                PositionHistory.objects.create(device_id=device.id, point=point)
                return Response(_device_to_dict(device))
            raise Http404


class LightbulbControlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, device_id):
        user = request.user
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device and isinstance(device, Lightbulb):
                return Response(_device_to_dict(device))
            raise Http404

    def post(self, request, device_id):
        user = request.user
        serializer = LightbulbSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device and isinstance(device, Lightbulb):
                if "brightness" in serializer.validated_data:
                    device.set_brightness(serializer.validated_data["brightness"])
                if "colour" in serializer.validated_data:
                    device.set_colour(serializer.validated_data["colour"])
                commit()
                return Response(_device_to_dict(device))
            raise Http404


class TelevisionControlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, device_id):
        user = request.user
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device and isinstance(device, Television):
                return Response(_device_to_dict(device))
            raise Http404

    def post(self, request, device_id):
        user = request.user
        serializer = TelevisionSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device and isinstance(device, Television):
                if "volume" in serializer.validated_data:
                    device.set_volume(serializer.validated_data["volume"])
                if "channel" in serializer.validated_data:
                    device.set_channel(serializer.validated_data["channel"])
                commit()
                return Response(_device_to_dict(device))
            raise Http404


class FanControlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, device_id):
        user = request.user
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device and isinstance(device, Fan):
                return Response(_device_to_dict(device))
            raise Http404

    def post(self, request, device_id):
        user = request.user
        serializer = FanSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device and isinstance(device, Fan):
                if "speed" in serializer.validated_data:
                    device.set_speed(serializer.validated_data["speed"])
                if "swing" in serializer.validated_data:
                    device.set_swing(serializer.validated_data["swing"])
                commit()
                return Response(_device_to_dict(device))
            raise Http404


class AirConditionerControlView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, device_id):
        user = request.user
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device and isinstance(device, AirConditioner):
                return Response(_device_to_dict(device))
            raise Http404

    def post(self, request, device_id):
        user = request.user
        serializer = AirConditionerSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with get_connection() as (conn, root):
            device, _ = _find_device_in_user_homes(root, device_id, user)
            if device and isinstance(device, AirConditioner):
                if "temperature" in serializer.validated_data:
                    device.set_temperature(serializer.validated_data["temperature"])
                commit()
                return Response(_device_to_dict(device))
            raise Http404


