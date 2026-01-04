from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.gis.geos import Point
from .models import *
from .serializers import *

# --- Container Views (Homes & Rooms) ---
class HomeViewSet(viewsets.ModelViewSet):
    queryset = Home.objects.all()
    serializer_class = HomeSerializer
    
    permission_classes = [permissions.IsAuthenticated]
    
    def perform_create(self, serializer):
        # 'self.request.user' is automatically set by Django if the Token is valid
        serializer.save(user=self.request.user)

    # Command: Get All Devices in Home 
    # GET /api/homes/{id}/get_devices/
    @action(detail=True, methods=['get'])
    def get_devices(self, request, pk=None):
        home = self.get_object()
        # Find all devices linked to rooms that belong to this home
        devices = Device.objects.filter(room__home=home)
        serializer = DeviceSerializer(devices, many=True)
        return Response(serializer.data)

    # Command: Get All Rooms in Home
    # GET /api/homes/{id}/get_rooms/
    @action(detail=True, methods=['get'])
    def get_rooms(self, request, pk=None):
        home = self.get_object()
        rooms = Room.objects.filter(home=home)
        serializer = RoomSerializer(rooms, many=True)
        return Response(serializer.data)

class RoomViewSet(viewsets.ModelViewSet):
    queryset = Room.objects.all()
    serializer_class = RoomSerializer

    # Command: Get All Devices in Room
    # GET /api/rooms/{id}/get_devices/
    @action(detail=True, methods=['get'])
    def get_devices(self, request, pk=None):
        room = self.get_object()
        devices = Device.objects.filter(room=room)
        serializer = DeviceSerializer(devices, many=True)
        return Response(serializer.data)


# --- Base Device ViewSet (Position Logic) ---
class BaseDeviceViewSet(viewsets.ModelViewSet):
    """
    Parent ViewSet with logic shared by ALL devices.
    """
    @action(detail=True, methods=['post'])
    def set_position(self, request, pk=None):
        obj = self.get_object()
        # Ensure we access the parent Device instance for history logging
        device_instance = obj if isinstance(obj, Device) else obj.device_ptr

        x = request.data.get('x')
        y = request.data.get('y')
        z = request.data.get('z', 0)

        if x is None or y is None:
            return Response({"error": "x and y required"}, status=400)

        new_point = Point(float(x), float(y), float(z), srid=4326)
        
        obj.device_pos = new_point
        obj.save()
        PositionHistory.objects.create(device=device_instance, point=new_point)

        return Response({"status": "updated", "location": {"x": x, "y": y, "z": z}})

    @action(detail=True, methods=['get'])
    def get_position(self, request, pk=None):
        obj = self.get_object()
        
        # Consistent return format
        if obj.device_pos:
            return Response({
                "x": obj.device_pos.x, 
                "y": obj.device_pos.y, 
                "z": obj.device_pos.z
            })
        
        # If null, return strict null structure
        return Response({
            "x": None, 
            "y": None, 
            "z": None
        })
    
    # Command: Get Position History
    # GET /api/{device_type}/{id}/history/
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        obj = self.get_object()
        
        # We filter by device_id. 
        # Even if 'obj' is an AirConditioner, its .id is the same as the Device .id
        history_records = PositionHistory.objects.filter(device__id=obj.id).order_by('-timestamp')
        
        serializer = PositionHistorySerializer(history_records, many=True)
        return Response(serializer.data)


# --- Specific Device ViewSets (Command Style) ---

class DeviceViewSet(BaseDeviceViewSet):
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer


class AirConditionerViewSet(BaseDeviceViewSet):
    queryset = AirConditioner.objects.all()
    serializer_class = AirConditionerSerializer

    # Command: Set Temperature
    # POST /api/acs/{id}/set_temperature/ | Body: {"temp": 25.5}
    @action(detail=True, methods=['post'])
    def set_temperature(self, request, pk=None):
        ac = self.get_object()
        temp = request.data.get('temp')
        
        if temp is not None:
            ac.temperature = float(temp)
            ac.save()
            return Response({"status": "temperature set", "current_temp": ac.temperature})
        return Response({"error": "temp parameter missing"}, status=400)


class FanViewSet(BaseDeviceViewSet):
    queryset = Fan.objects.all()
    serializer_class = FanSerializer

    # Command: Set Speed
    # POST /api/fans/{id}/set_speed/ | Body: {"speed": 3}
    @action(detail=True, methods=['post'])
    def set_speed(self, request, pk=None):
        fan = self.get_object()
        speed = request.data.get('speed')

        if speed is not None:
            fan.speed = int(speed)
            fan.save()
            return Response({"status": "speed set", "current_speed": fan.speed})
        return Response({"error": "speed parameter missing"}, status=400)

    # Command: Set Swing
    # POST /api/fans/{id}/set_swing/ | Body: {"swing": true}
    @action(detail=True, methods=['post'])
    def set_swing(self, request, pk=None):
        fan = self.get_object()
        swing = request.data.get('swing')

        if swing is not None:
            fan.swing = bool(swing)
            fan.save()
            return Response({"status": "swing updated", "is_swinging": fan.swing})
        return Response({"error": "swing parameter missing"}, status=400)


class LightbulbViewSet(BaseDeviceViewSet):
    queryset = Lightbulb.objects.all()
    serializer_class = LightbulbSerializer

    # Command: Set Brightness
    # POST /api/lightbulbs/{id}/set_brightness/ | Body: {"brightness": 80}
    @action(detail=True, methods=['post'])
    def set_brightness(self, request, pk=None):
        bulb = self.get_object()
        brightness = request.data.get('brightness')

        if brightness is not None:
            bulb.brightness = int(brightness)
            bulb.save()
            return Response({"status": "brightness set", "current_brightness": bulb.brightness})
        return Response({"error": "brightness parameter missing"}, status=400)

    # Command: Set Colour
    # POST /api/lightbulbs/{id}/set_colour/ | Body: {"colour": "#FF0000"}
    @action(detail=True, methods=['post'])
    def set_colour(self, request, pk=None):
        bulb = self.get_object()
        colour = request.data.get('colour')

        if colour:
            bulb.colour = colour
            bulb.save()
            return Response({"status": "colour set", "current_colour": bulb.colour})
        return Response({"error": "colour parameter missing"}, status=400)


class TelevisionViewSet(BaseDeviceViewSet):
    queryset = Television.objects.all()
    serializer_class = TelevisionSerializer

    # Command: Set Volume
    # POST /api/tvs/{id}/set_volume/ | Body: {"volume": 15}
    @action(detail=True, methods=['post'])
    def set_volume(self, request, pk=None):
        tv = self.get_object()
        volume = request.data.get('volume')

        if volume is not None:
            tv.volume = int(volume)
            tv.save()
            return Response({"status": "volume set", "current_volume": tv.volume})
        return Response({"error": "volume parameter missing"}, status=400)

    # Command: Set Channel
    # POST /api/tvs/{id}/set_channel/ | Body: {"channel": 5}
    @action(detail=True, methods=['post'])
    def set_channel(self, request, pk=None):
        tv = self.get_object()
        channel = request.data.get('channel')

        if channel is not None:
            tv.channel = int(channel)
            tv.save()
            return Response({"status": "channel set", "current_channel": tv.channel})
        return Response({"error": "channel parameter missing"}, status=400)

    # Command: Set Mute
    # POST /api/tvs/{id}/set_mute/ | Body: {"mute": true}
    @action(detail=True, methods=['post'])
    def set_mute(self, request, pk=None):
        tv = self.get_object()
        mute = request.data.get('mute')

        if mute is not None:
            tv.is_mute = bool(mute)
            tv.save()
            return Response({"status": "mute updated", "is_muted": tv.is_mute})
        return Response({"error": "mute parameter missing"}, status=400)