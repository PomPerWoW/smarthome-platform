from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.contrib.gis.geos import Point
from .permissions import IsHomeOwner
from .models import *
from .serializers import *
from .services import VoiceAssistantService
from .scada import ScadaManager

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

    def perform_update(self, serializer):
        """
        Intercepts the update to check for 'is_on' changes and trigger SCADA.
        """
        old_instance = self.get_object()
        old_is_on = getattr(old_instance, 'is_on', None)
        
        # Save the new state
        instance = serializer.save()
        
        # Check if is_on changed
        if hasattr(instance, 'is_on') and getattr(instance, 'is_on') != old_is_on:
             if instance.tag:
                 value = 1 if instance.is_on else 0
                 
                 suffix = "onoff" # Default for Lightbulb and AirConditioner
                 if hasattr(instance, 'television'):
                     suffix = "on"
                 elif hasattr(instance, 'fan'):
                     suffix = "on"
                 
                 ScadaManager().send_command(f"{instance.tag}.{suffix}", value)
    
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
            
            if ac.tag:
                ScadaManager().send_command(f"{ac.tag}.set_temp", ac.temperature)

            return Response({"status": "temperature set", "current_temp": ac.temperature})
        return Response({"error": "temp parameter missing"}, status=400)


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
            
            if fan.tag:
                ScadaManager().send_command(f"{fan.tag}.speed", fan.speed)

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
            
            if fan.tag:
                value = 1 if fan.swing else 0
                ScadaManager().send_command(f"{fan.tag}.shake", value)

            return Response({"status": "swing updated", "is_swinging": fan.swing})
        return Response({"error": "swing parameter missing"}, status=400)


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
            
            if bulb.tag:
                ScadaManager().send_command(f"{bulb.tag}.Brightness", bulb.brightness)
                
            return Response({"status": "brightness set", "current_brightness": bulb.brightness})
        return Response({"error": "brightness parameter missing"}, status=400)

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
            
            if bulb.tag:
                 ScadaManager().send_command(f"{bulb.tag}.Color", bulb.colour)
                 
            return Response({"status": "colour set", "current_colour": bulb.colour})


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
            
            if tv.tag:
                ScadaManager().send_command(f"{tv.tag}.volume", tv.volume)

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
            
            if tv.tag:
                ScadaManager().send_command(f"{tv.tag}.channel", tv.channel)

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
            
            if tv.tag:
                value = 1 if tv.is_mute else 0
                ScadaManager().send_command(f"{tv.tag}.mute", value)

            return Response({"status": "mute updated", "is_muted": tv.is_mute})

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

    @action(detail=False, methods=['post'])
    def transcribe(self, request):
        """
        Accepts an audio file upload and transcribes it using Groq Whisper API.
        Used as a fallback for browsers that don't support Web Speech API (e.g. Meta Quest 3).
        """
        import os
        import tempfile

        audio_file = request.FILES.get('audio')
        if not audio_file:
            return Response({"error": "Audio file is required."}, status=400)

        should_execute = request.data.get('execute', 'false').lower() == 'true'

        try:
            from groq import Groq
            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                return Response({"error": "Groq API key not configured."}, status=500)

            client = Groq(api_key=api_key)

            # Write uploaded audio to a temp file (Groq SDK needs a file path)
            ext = os.path.splitext(audio_file.name)[1] if audio_file.name else '.webm'
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                for chunk in audio_file.chunks():
                    tmp.write(chunk)
                tmp_path = tmp.name

            try:
                with open(tmp_path, "rb") as f:
                    transcription = client.audio.transcriptions.create(
                        model="whisper-large-v3-turbo",
                        file=("audio" + ext, f),
                        language="en",
                    )
                transcript = transcription.text.strip()
            finally:
                os.unlink(tmp_path)

            if not transcript:
                return Response({"error": "Could not transcribe audio."}, status=400)

            response_data = {"transcript": transcript}

            if should_execute:
                service = VoiceAssistantService()
                command_result = service.process_voice_command(request.user, transcript)
                response_data["command_result"] = command_result

            return Response(response_data)

        except ImportError:
            return Response({"error": "groq package not installed."}, status=500)
        except Exception as e:
            return Response({"error": f"Transcription failed: {str(e)}"}, status=500)