from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.contrib.gis.geos import Point
from .permissions import IsHomeOwner
from .models import *
from .serializers import *
from .services import VoiceAssistantService

from datetime import datetime, timedelta
import requests

# --- 1. Home ViewSet ---
class HomeViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing Home instances.
    
    Ensures that users can only interact with Homes they own.
    """
    serializer_class = HomeSerializer
    # Apply Permissions
    permission_classes = [permissions.IsAuthenticated, IsHomeOwner]

    def get_queryset(self):
        """
        Filters the queryset to return only homes owned by the authenticated user.
        """
        return Home.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        """
        Intersects the creation process to automatically assign the 
        authenticated user as the owner of the home.
        """
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['get'])
    def get_devices(self, request, pk=None):
        """
        Custom Action: Retrieve all devices linked to a specific Home.
        
        URL: GET /api/homes/homes/{pk}/get_devices/
        """
        home = self.get_object() # Triggers IsHomeOwner check
        devices = Device.objects.filter(room__home=home)
        return Response(DeviceSerializer(devices, many=True).data)


# --- 2. Room ViewSet ---
class RoomViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing Room instances.
    """
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated, IsHomeOwner]

    def get_queryset(self):
        """
        Filters the queryset to return only rooms belonging to homes owned by the user.
        """
        return Room.objects.filter(home__user=self.request.user)

    def perform_create(self, serializer):
        """
        Saves a new Room instance with a security check.
        
        Raises:
            PermissionDenied: If the user tries to add a room to a home they do not own.
        """
        home = serializer.validated_data['home']
        if home.user != self.request.user:
            raise PermissionDenied("You do not own this home.")
        serializer.save()

    @action(detail=True, methods=['get'])
    def get_devices(self, request, pk=None):
        """
        Custom Action: Retrieve all devices contained within a specific Room.
        
        URL: GET /api/homes/rooms/{pk}/get_devices/
        """
        room = self.get_object() 
        devices = Device.objects.filter(room=room)
        return Response(DeviceSerializer(devices, many=True).data)


# --- Base Device ViewSet (Position Logic) ---
class BaseDeviceViewSet(viewsets.ModelViewSet):
    """
    Abstract/Parent ViewSet containing logic shared by ALL device types.
    
    Handles:
    1. Dynamic queryset filtering based on the child model.
    2. Common ownership security checks.
    3. 3D Positioning logic (get/set position).
    4. Position History tracking.
    """
    permission_classes = [permissions.IsAuthenticated, IsHomeOwner]

    def get_queryset(self):
        """
        Dynamically retrieves the model class from the serializer and filters 
        objects to ensure they belong to the authenticated user's homes.
        """
        model = self.serializer_class.Meta.model
        return model.objects.filter(room__home__user=self.request.user)

    def perform_create(self, serializer):
        """
        Saves a Device with a security check to ensure the target Room belongs to the user.
        """
        room = serializer.validated_data.get('room')
        if room and room.home.user != self.request.user:
            raise PermissionDenied("You do not own this room.")
        serializer.save()
    
    @action(detail=True, methods=['post'])
    def set_position(self, request, pk=None):
        """
        Updates the 3D position (GeoDjango Point) and rotation of the device and logs the change to history.
        
        Body Parameters:
            x (float): Required.
            y (float): Required.
            z (float): Optional (default 0).
            rotation_x (float): Optional (default 0).
            rotation_y (float): Optional (default 0).
            rotation_z (float): Optional (default 0).
            
        Returns:
            JSON: The updated coordinates and rotation or an error message.
        """
        obj = self.get_object()
        # Ensure we access the parent Device instance for history logging
        device_instance = obj if isinstance(obj, Device) else obj.device_ptr

        x = request.data.get('x')
        y = request.data.get('y')
        z = request.data.get('z', 0)
        rotation_x = request.data.get('rotation_x', 0)
        rotation_y = request.data.get('rotation_y', 0)
        rotation_z = request.data.get('rotation_z', 0)

        if x is None or y is None:
            return Response({"error": "x and y required"}, status=400)

        new_point = Point(float(x), float(y), float(z), srid=4326)
        
        obj.device_pos = new_point
        obj.rotation_x = float(rotation_x)
        obj.rotation_y = float(rotation_y)
        obj.rotation_z = float(rotation_z)
        obj.save()
        
        PositionHistory.objects.create(
            device=device_instance, 
            point=new_point,
            rotation_x=float(rotation_x),
            rotation_y=float(rotation_y),
            rotation_z=float(rotation_z)
        )

        return Response({
            "status": "updated", 
            "location": {"x": x, "y": y, "z": z},
            "rotation": {"x": rotation_x, "y": rotation_y, "z": rotation_z}
        })

    @action(detail=True, methods=['get'])
    def get_position(self, request, pk=None):
        """
        Retrieves the current x, y, z coordinates and rotation of the device.
        
        Returns:
            JSON: {x, y, z, rotation: {x, y, z}} or nulls if position is not set.
        """
        obj = self.get_object()
        
        # Consistent return format
        if obj.device_pos:
            return Response({
                "x": obj.device_pos.x, 
                "y": obj.device_pos.y, 
                "z": obj.device_pos.z,
                "rotation": {
                    "x": obj.rotation_x,
                    "y": obj.rotation_y,
                    "z": obj.rotation_z
                }
            })
        
        # If null, return strict null structure
        return Response({
            "x": None, 
            "y": None, 
            "z": None,
            "rotation": {
                "x": obj.rotation_x,
                "y": obj.rotation_y,
                "z": obj.rotation_z
            }
        })
    
    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """
        Retrieves the movement history of the device.
        
        URL: GET /api/homes/{device_type}/{id}/history/
        
        Returns:
            List: serialized PositionHistory records ordered by timestamp (descending).
        """
        obj = self.get_object()
        
        # We filter by device_id. 
        # Even if 'obj' is an AirConditioner, its .id is the same as the Device .id
        history_records = PositionHistory.objects.filter(device__id=obj.id).order_by('-timestamp')
        
        serializer = PositionHistorySerializer(history_records, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get', 'post', 'put', 'delete'])
    def tag(self, request, pk=None):
        """
        Manage the 'tag' for a device. Handles retrieval, creation, updating, and deletion.

        Supported Methods:
            GET: Retrieve the current tag.
            POST/PUT: Set or update the tag.
            DELETE: Clear the tag (set to null).

        Body Parameters (POST/PUT only):
            tag (string): Required. The new tag string.

        Returns:
            GET: JSON {"tag": "string" or null}
            POST/PUT: JSON {"status": "tag updated", "tag": "new_tag"}
            DELETE: JSON {"status": "tag cleared"}
        """
        obj = self.get_object()

        # 1. READ (GET)
        if request.method == 'GET':
            return Response({"tag": obj.tag})

        # 2. CREATE / UPDATE (POST, PUT)
        elif request.method in ['POST', 'PUT']:
            new_tag = request.data.get('tag')
            if new_tag is None:
                return Response({"error": "tag parameter is required"}, status=400)
            
            obj.tag = new_tag
            obj.save()
            return Response({"status": "tag updated", "tag": obj.tag})

        # 3. DELETE (DELETE)
        elif request.method == 'DELETE':
            obj.tag = None  # Set to null instead of deleting the device
            obj.save()
            return Response({"status": "tag cleared"})

# --- Specific Device ViewSets (Command Style) ---

class DeviceViewSet(BaseDeviceViewSet):
    """
    Generic ViewSet for querying the base 'Device' model.
    """
    queryset = Device.objects.all()
    serializer_class = DeviceSerializer


class AirConditionerViewSet(BaseDeviceViewSet):
    """
    ViewSet for Air Conditioner devices. Includes specific controls for temperature.
    """
    queryset = AirConditioner.objects.all()
    serializer_class = AirConditionerSerializer

    @action(detail=True, methods=['post'])
    def set_temperature(self, request, pk=None):
        """
        Command: Set the target temperature of the AC.
        
        Body: {"temp": float}
        """
        ac = self.get_object()
        temp = request.data.get('temp')
        
        if temp is not None:
            ac.temperature = float(temp)
            ac.save()
            return Response({"status": "temperature set", "current_temp": ac.temperature})
        return Response({"error": "temp parameter missing"}, status=400)

    @action(detail=False, methods=['get'], url_path='getACLog')
    def getACLog(self, request):
        """
        Retrieves AC logs for a specific date by aggregating data from an external API.
        
        URL: GET /api/homes/acs/getACLog/?date=YYYY-MM-DD
        """
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({"error": "date parameter is required (YYYY-MM-DD)"}, status=400)
            
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD"}, status=400)

        # Define time range for the day
        start_dt = datetime.combine(target_date, datetime.min.time())
        
        # Start iterating from the end of the day backwards
        curr_end = start_dt.replace(hour=23, minute=55, second=0)
        
        aggregated_data = {} 
        device_name = "Unknown"
        
        while curr_end >= start_dt:
            end_str = curr_end.strftime("%Y-%m-%dT%H:%M:%S")
            # Template ID 6 for AC
            url = f"https://171.102.128.142:6443/restapi/tag/get_log_data/?template_id=6&end_datetime={end_str}"
            
            try:
                resp = requests.get(url, verify=False, timeout=10)
                if resp.status_code == 200:
                    data_json = resp.json()
                    
                    if device_name == "Unknown" and "header" in data_json and len(data_json["header"]) > 0:
                        device_name = data_json["header"][0].get("big_column_name", "Unknown")
                    
                    rows = data_json.get("data", [])
                    for row in rows:
                        if len(row) < 4:
                            continue
                        
                        ts_str = row[0]
                        # Parsing logic
                        on_raw = row[1]
                        current_temp_raw = row[2]
                        set_temp_raw = row[3]
                        
                        try:
                            ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                            if ts.date() != target_date:
                                continue 
                        except ValueError:
                            continue

                        onoff = True if on_raw == "1" else False
                        
                        current_temp = None
                        if current_temp_raw != "-" and current_temp_raw is not None:
                             try:
                                 current_temp = float(current_temp_raw)
                             except ValueError:
                                 pass
                                 
                        set_temp = None
                        if set_temp_raw != "-" and set_temp_raw is not None:
                             try:
                                 set_temp = float(set_temp_raw)
                             except ValueError:
                                 pass

                        entry = {
                            "timestamp": ts_str,
                            "onoff": onoff,
                            "current_temp": current_temp,
                            "set_temp": set_temp
                        }
                        
                        aggregated_data[ts_str] = entry
                
            except requests.RequestException:
                pass
            
            curr_end = curr_end - timedelta(minutes=100)
            
            if curr_end < start_dt - timedelta(hours=2):
                break

        sorted_data = sorted(aggregated_data.values(), key=lambda x: x['timestamp'], reverse=True)
        
        return Response({
            "device_name": device_name,
            "data": sorted_data
        })


class FanViewSet(BaseDeviceViewSet):
    """
    ViewSet for Fan devices. Includes controls for speed and swing mode.
    """
    queryset = Fan.objects.all()
    serializer_class = FanSerializer

    @action(detail=True, methods=['post'])
    def set_speed(self, request, pk=None):
        """
        Command: Set the fan speed.
        
        Body: {"speed": int}
        """
        fan = self.get_object()
        speed = request.data.get('speed')

        if speed is not None:
            fan.speed = int(speed)
            fan.save()
            return Response({"status": "speed set", "current_speed": fan.speed})
        return Response({"error": "speed parameter missing"}, status=400)

    @action(detail=True, methods=['post'])
    def set_swing(self, request, pk=None):
        """
        Command: Toggle or set the fan swing mode.
        
        Body: {"swing": boolean}
        """
        fan = self.get_object()
        swing = request.data.get('swing')

        if swing is not None:
            fan.swing = bool(swing)
            fan.save()
            return Response({"status": "swing updated", "is_swinging": fan.swing})
        return Response({"error": "swing parameter missing"}, status=400)

    @action(detail=False, methods=['get'], url_path='getFanLog')
    def getFanLog(self, request):
        """
        Retrieves fan logs for a specific date by aggregating data from an external API.
        
        URL: GET /api/homes/fans/getFanLog/?date=YYYY-MM-DD
        """
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({"error": "date parameter is required (YYYY-MM-DD)"}, status=400)
            
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD"}, status=400)

        # Define time range for the day
        start_dt = datetime.combine(target_date, datetime.min.time())
        # end_dt = datetime.combine(target_date, datetime.max.time())
        
        # Start iterating from the end of the day backwards
        curr_end = start_dt.replace(hour=23, minute=55, second=0)
        
        aggregated_data = {} 
        device_name = "Unknown"
        
        # Loop until we cover the start of the day
        while curr_end >= start_dt:
            # Format datetime for API: 2026-01-24T18:30:00
            end_str = curr_end.strftime("%Y-%m-%dT%H:%M:%S")
            # Template ID 5 for Fan
            url = f"https://171.102.128.142:6443/restapi/tag/get_log_data/?template_id=5&end_datetime={end_str}"
            
            try:
                resp = requests.get(url, verify=False, timeout=10)
                if resp.status_code == 200:
                    data_json = resp.json()
                    
                    if device_name == "Unknown" and "header" in data_json and len(data_json["header"]) > 0:
                        device_name = data_json["header"][0].get("big_column_name", "Unknown")
                    
                    rows = data_json.get("data", [])
                    for row in rows:
                        if len(row) < 4:
                            continue
                        
                        ts_str = row[0]
                        on_raw = row[1]
                        shake_raw = row[2]
                        speed_raw = row[3]
                        
                        try:
                            ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                            if ts.date() != target_date:
                                continue 
                        except ValueError:
                            continue

                        # Map values
                        # Row[1]: on ("1" / "-")
                        onoff = True if on_raw == "1" else False
                        
                        # Row[2]: shake ("1" / "-")
                        shake = True if shake_raw == "1" else False
                        
                        # Row[3]: speed (int / "-")
                        speed = None
                        if speed_raw != "-" and speed_raw is not None:
                            try:
                                speed = int(speed_raw)
                            except ValueError:
                                pass
                            
                        entry = {
                            "timestamp": ts_str,
                            "onoff": onoff,
                            "shake": shake,
                            "speed": speed
                        }
                        
                        aggregated_data[ts_str] = entry
                
            except requests.RequestException:
                pass
            
            curr_end = curr_end - timedelta(minutes=100)
            
            if curr_end < start_dt - timedelta(hours=2):
                break

        sorted_data = sorted(aggregated_data.values(), key=lambda x: x['timestamp'], reverse=True)
        
        return Response({
            "device_name": device_name,
            "data": sorted_data
        })


class LightbulbViewSet(BaseDeviceViewSet):
    """
    ViewSet for Smart Lightbulbs. Includes controls for brightness and HEX colour.
    """
    queryset = Lightbulb.objects.all()
    serializer_class = LightbulbSerializer

    @action(detail=True, methods=['post'])
    def set_brightness(self, request, pk=None):
        """
        Command: Set the light brightness level (usually 0-100).
        
        Body: {"brightness": int}
        """
        bulb = self.get_object()
        brightness = request.data.get('brightness')

        if brightness is not None:
            bulb.brightness = int(brightness)
            bulb.save()
            return Response({"status": "brightness set", "current_brightness": bulb.brightness})
        return Response({"error": "brightness parameter missing"}, status=400)

    @action(detail=False, methods=['get'], url_path='getLightbulbLog')
    def getLightbulbLog(self, request):
        """
        Retrieves lightbulb logs for a specific date by aggregating data from an external API.
        
        URL: GET /api/homes/devices/getLightbulbLog/?date=YYYY-MM-DD
        """
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({"error": "date parameter is required (YYYY-MM-DD)"}, status=400)
            
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD"}, status=400)

        # Define time range for the day
        start_dt = datetime.combine(target_date, datetime.min.time())
        end_dt = datetime.combine(target_date, datetime.max.time())
        
        # Start iterating from the end of the day backwards
        # The API returns the last 100 minutes from end_datetime.
        # We align to 5-minute intervals roughly.
        # Starting at 23:55:00 covers up to 23:59 roughly if buckets are 5 mins.
        curr_end = start_dt.replace(hour=23, minute=55, second=0)
        
        aggregated_data = {} # Use dict to dedup by timestamp
        device_name = "Unknown"
        
        # Loop until we cover the start of the day
        # We go backwards. The last fetch should cover 00:00.
        # 100 mins step.
        while curr_end >= start_dt:
            # Format datetime for API: 2026-01-24T18:30:00
            end_str = curr_end.strftime("%Y-%m-%dT%H:%M:%S")
            url = f"https://171.102.128.142:6443/restapi/tag/get_log_data/?template_id=4&end_datetime={end_str}"
            
            try:
                # SSL Verify False as it might be a private/self-signed endpoint
                resp = requests.get(url, verify=False, timeout=10)
                if resp.status_code == 200:
                    data_json = resp.json()
                    
                    # Extract device name from header if not yet found
                    if device_name == "Unknown" and "header" in data_json and len(data_json["header"]) > 0:
                        device_name = data_json["header"][0].get("big_column_name", "Unknown")
                    
                    # Process rows
                    # Row format: [Timestamp, onoff("1"|"-"), brightness("54"|"-"), color("#.."|"-")]
                    rows = data_json.get("data", [])
                    for row in rows:
                        if len(row) < 4:
                            continue
                        
                        ts_str = row[0]
                        onoff_raw = row[1]
                        bright_raw = row[2]
                        color_raw = row[3]
                        
                        # Parse timestamp to ensure it's within the requested day (API might return outside range?)
                        try:
                            ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                            if ts.date() != target_date:
                                continue # Skip if outside the day
                        except ValueError:
                            continue

                        # Map values
                        onoff = True if onoff_raw == "1" else False
                        
                        brightness = None
                        if bright_raw != "-" and bright_raw is not None:
                            try:
                                brightness = int(bright_raw)
                            except ValueError:
                                pass
                                
                        color = None
                        if color_raw != "-" and color_raw is not None:
                            color = color_raw
                            
                        entry = {
                            "timestamp": ts_str,
                            "onoff": onoff,
                            "brightness": brightness,
                            "color": color
                        }
                        
                        aggregated_data[ts_str] = entry
                
            except requests.RequestException:
                # Log error or continue? We should probably continue to try to get partial data
                pass
            
            # Move back 100 minutes
            curr_end = curr_end - timedelta(minutes=100)
            
            # Safety break if we go way back (shouldn't happen with while condition)
            if curr_end < start_dt - timedelta(hours=2):
                break

        # Convert to list and sort
        sorted_data = sorted(aggregated_data.values(), key=lambda x: x['timestamp'], reverse=True)
        
        return Response({
            "device_name": device_name,
            "data": sorted_data
        })


    @action(detail=True, methods=['post'])
    def set_colour(self, request, pk=None):
        """
        Command: Set the light colour.
        
        Body: {"colour": string} (Expected format: Hex Code, e.g., "#FF0000")
        """
        bulb = self.get_object()
        colour = request.data.get('colour')

        if colour:
            bulb.colour = colour
            bulb.save()
            return Response({"status": "colour set", "current_colour": bulb.colour})
        return Response({"error": "colour parameter missing"}, status=400)


class TelevisionViewSet(BaseDeviceViewSet):
    """
    ViewSet for Television devices. Includes controls for volume, channel, and mute.
    """
    queryset = Television.objects.all()
    serializer_class = TelevisionSerializer

    @action(detail=True, methods=['post'])
    def set_volume(self, request, pk=None):
        """
        Command: Set the TV volume.
        
        Body: {"volume": int}
        """
        tv = self.get_object()
        volume = request.data.get('volume')

        if volume is not None:
            tv.volume = int(volume)
            tv.save()
            return Response({"status": "volume set", "current_volume": tv.volume})
        return Response({"error": "volume parameter missing"}, status=400)

    @action(detail=True, methods=['post'])
    def set_channel(self, request, pk=None):
        """
        Command: Change the TV channel.
        
        Body: {"channel": int}
        """
        tv = self.get_object()
        channel = request.data.get('channel')

        if channel is not None:
            tv.channel = int(channel)
            tv.save()
            return Response({"status": "channel set", "current_channel": tv.channel})
        return Response({"error": "channel parameter missing"}, status=400)

    @action(detail=True, methods=['post'])
    def set_mute(self, request, pk=None):
        """
        Command: Set the TV mute status.
        
        Body: {"mute": boolean}
        """
        tv = self.get_object()
        mute = request.data.get('mute')

        if mute is not None:
            tv.is_mute = bool(mute)
            tv.save()
            return Response({"status": "mute updated", "is_muted": tv.is_mute})
        return Response({"error": "mute parameter missing"}, status=400)

    @action(detail=False, methods=['get'], url_path='getTVLog')
    def getTVLog(self, request):
        """
        Retrieves TV logs for a specific date by aggregating data from an external API.
        
        URL: GET /api/homes/tvs/getTVLog/?date=YYYY-MM-DD
        """
        date_str = request.query_params.get('date')
        if not date_str:
            return Response({"error": "date parameter is required (YYYY-MM-DD)"}, status=400)
            
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return Response({"error": "Invalid date format. Use YYYY-MM-DD"}, status=400)

        # Define time range for the day
        start_dt = datetime.combine(target_date, datetime.min.time())
        
        # Start iterating from the end of the day backwards
        curr_end = start_dt.replace(hour=23, minute=55, second=0)
        
        aggregated_data = {} 
        device_name = "Unknown"
        
        while curr_end >= start_dt:
            end_str = curr_end.strftime("%Y-%m-%dT%H:%M:%S")
            # Template ID 7 for TV
            url = f"https://171.102.128.142:6443/restapi/tag/get_log_data/?template_id=7&end_datetime={end_str}"
            
            try:
                resp = requests.get(url, verify=False, timeout=10)
                if resp.status_code == 200:
                    data_json = resp.json()
                    
                    if device_name == "Unknown" and "header" in data_json and len(data_json["header"]) > 0:
                        device_name = data_json["header"][0].get("big_column_name", "Unknown")
                    
                    rows = data_json.get("data", [])
                    for row in rows:
                        if len(row) < 5:
                            continue
                        
                        ts_str = row[0]
                        # Parsing logic
                        on_raw = row[1]
                        channel_raw = row[2]
                        volume_raw = row[3]
                        mute_raw = row[4]
                        
                        try:
                            ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                            if ts.date() != target_date:
                                continue 
                        except ValueError:
                            continue

                        onoff = True if on_raw == "1" else False
                        
                        channel = None
                        if channel_raw != "-" and channel_raw is not None:
                             try:
                                 channel = int(channel_raw)
                             except ValueError:
                                 pass
                                 
                        volume = None
                        if volume_raw != "-" and volume_raw is not None:
                             try:
                                 volume = int(volume_raw)
                             except ValueError:
                                 pass
                        
                        mute = True if mute_raw == "1" else False

                        entry = {
                            "timestamp": ts_str,
                            "onoff": onoff,
                            "channel": channel,
                            "volume": volume,
                            "mute": mute
                        }
                        
                        aggregated_data[ts_str] = entry
                
            except requests.RequestException:
                pass
            
            curr_end = curr_end - timedelta(minutes=100)
            
            if curr_end < start_dt - timedelta(hours=2):
                break

        sorted_data = sorted(aggregated_data.values(), key=lambda x: x['timestamp'], reverse=True)
        
        return Response({
            "device_name": device_name,
            "data": sorted_data
        })

class VoiceCommandViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['post'])
    def command(self, request):
        command_text = request.data.get('command')
        if not command_text:
            return Response({"error": "Command text is required."}, status=400)

        # Instantiate service (it will allow DI if needed, or use default factory)
        service = VoiceAssistantService() 
        result = service.process_voice_command(request.user, command_text)
        
        return Response(result)
