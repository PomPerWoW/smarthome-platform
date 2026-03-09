from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.contrib.gis.geos import Point
from django.conf import settings
from django.core.files.base import ContentFile
from .permissions import IsHomeOwner
from .models import *
from .serializers import *
from .services import VoiceAssistantService
from datetime import datetime
from .scada import ScadaManager

from datetime import datetime, timedelta
import requests
import os
import zipfile
import shutil
import tempfile

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

    def get_serializer_context(self):
        """Add request to serializer context for building absolute URLs"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    @action(detail=True, methods=['get'])
    def get_devices(self, request, pk=None):
        """
        Custom Action: Retrieve all devices contained within a specific Room.
        
        URL: GET /api/homes/rooms/{pk}/get_devices/
        """
        room = self.get_object() 
        devices = Device.objects.filter(room=room)
        return Response(DeviceSerializer(devices, many=True).data)

    @action(detail=True, methods=['get'])
    def get_furniture(self, request, pk=None):
        """
        Custom Action: Retrieve all furniture items in a specific Room.
        
        URL: GET /api/homes/rooms/{pk}/get_furniture/
        """
        room = self.get_object()
        furniture = Furniture.objects.filter(room=room)
        return Response(FurnitureSerializer(furniture, many=True).data)

    @action(detail=True, methods=['post'])
    def set_alignment(self, request, pk=None):
        """
        Custom Action: Manually align and save the room's base transform and optional XR anchor.
        
        Body Parameters:
            x (float): Required.
            y (float): Required.
            z (float): Required.
            rotation_y (float): Required.
            anchor_uuid (string): Optional.
            
        Returns:
            JSON: The updated room alignment data.
        """
        room = self.get_object() 
        
        x = request.data.get('x')
        y = request.data.get('y')
        z = request.data.get('z')
        rotation_y = request.data.get('rotation_y')
        anchor_uuid = request.data.get('anchor_uuid')

        if x is None or y is None or z is None or rotation_y is None:
            return Response({"error": "x, y, z, and rotation_y are required"}, status=400)

        room.position_x = float(x)
        room.position_y = float(y)
        room.position_z = float(z)
        room.rotation_y = float(rotation_y)
        if anchor_uuid is not None:
             room.anchor_uuid = anchor_uuid
        room.save()

        return Response({
            "status": "alignment_updated", 
            "position": {"x": room.position_x, "y": room.position_y, "z": room.position_z},
            "rotation": {"y": room.rotation_y},
            "anchor_uuid": room.anchor_uuid
        })

    @action(detail=True, methods=['post'])
    def upload_model(self, request, pk=None):
        """
        Custom Action: Upload a 3D model file (GLTF/GLB) or ZIP folder for the room.
        
        Body Parameters:
            file (file): Required. The 3D model file (GLTF/GLB) or ZIP archive containing the model folder.
            
        Returns:
            JSON: The updated room data with the model file URL.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[Upload Model] ===== Starting upload_model for room_id={pk} =====")
        logger.info(f"[Upload Model] Request method: {request.method}")
        logger.info(f"[Upload Model] Request FILES keys: {list(request.FILES.keys())}")
        logger.info(f"[Upload Model] Request content type: {request.content_type}")
        
        try:
            room = self.get_object()
            logger.info(f"[Upload Model] Room found: {room.id}, name: {room.room_name}")
        except Exception as e:
            logger.error(f"[Upload Model] Failed to get room: {str(e)}")
            return Response({"error": f"Room not found: {str(e)}"}, status=404)
        
        if 'file' not in request.FILES:
            logger.error("[Upload Model] No 'file' key in request.FILES")
            logger.error(f"[Upload Model] Available keys: {list(request.FILES.keys())}")
            return Response({"error": "No file provided"}, status=400)
        
        uploaded_file = request.FILES['file']
        file_extension = os.path.splitext(uploaded_file.name)[1].lower()
        
        logger.info(f"[Upload Model] File received: name={uploaded_file.name}, size={uploaded_file.size}, extension={file_extension}")
        logger.info(f"[Upload Model] File content_type: {getattr(uploaded_file, 'content_type', 'unknown')}")
        
        # Validate file extension
        allowed_extensions = ['.gltf', '.glb', '.zip']
        if file_extension not in allowed_extensions:
            logger.error(f"[Upload Model] Invalid file extension: {file_extension}")
            return Response(
                {"error": f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"}, 
                status=400
            )
        
        logger.info(f"[Upload Model] File extension validated: {file_extension}")
        
        # Get the room's model directory
        room_model_dir = os.path.join(settings.MEDIA_ROOT, 'room_models', str(room.id))
        logger.info(f"[Upload Model] Room model directory: {room_model_dir}")
        logger.info(f"[Upload Model] MEDIA_ROOT: {settings.MEDIA_ROOT}")
        
        # Delete old files if they exist
        if os.path.exists(room_model_dir):
            try:
                logger.info(f"[Upload Model] Deleting old room model directory: {room_model_dir}")
                shutil.rmtree(room_model_dir)
                logger.info(f"[Upload Model] Old directory deleted successfully")
            except Exception as e:
                logger.warning(f"[Upload Model] Could not delete old room model directory: {e}")
        
        # Create the directory
        try:
            os.makedirs(room_model_dir, exist_ok=True)
            logger.info(f"[Upload Model] Created/verified room model directory: {room_model_dir}")
        except Exception as e:
            logger.error(f"[Upload Model] Failed to create directory: {e}")
            return Response({"error": f"Failed to create directory: {str(e)}"}, status=500)
        
        main_gltf_file = None
        
        if file_extension == '.zip':
            # Handle ZIP file - extract it
            logger.info("[Upload Model] Processing ZIP file")
            try:
                # Save uploaded file to a temporary location first
                logger.info("[Upload Model] Saving uploaded file to temporary location")
                with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
                    chunk_count = 0
                    total_bytes = 0
                    for chunk in uploaded_file.chunks():
                        tmp_file.write(chunk)
                        chunk_count += 1
                        total_bytes += len(chunk)
                    tmp_file_path = tmp_file.name
                
                logger.info(f"[Upload Model] Saved to temp file: {tmp_file_path}, chunks: {chunk_count}, total bytes: {total_bytes}")
                
                try:
                    logger.info(f"[Upload Model] Opening ZIP file: {tmp_file_path}")
                    with zipfile.ZipFile(tmp_file_path, 'r') as zip_ref:
                        file_list = zip_ref.namelist()
                        logger.info(f"[Upload Model] ZIP contains {len(file_list)} files")
                        logger.info(f"[Upload Model] ZIP file list (first 10): {file_list[:10]}")
                        
                        # Extract all files to the room model directory
                        logger.info(f"[Upload Model] Extracting to: {room_model_dir}")
                        zip_ref.extractall(room_model_dir)
                        logger.info("[Upload Model] Extraction complete")
                        
                        # Clean up __MACOSX folder if it exists (macOS metadata)
                        macosx_path = os.path.join(room_model_dir, '__MACOSX')
                        if os.path.exists(macosx_path):
                            logger.info(f"[Upload Model] Removing __MACOSX folder: {macosx_path}")
                            try:
                                shutil.rmtree(macosx_path)
                                logger.info("[Upload Model] __MACOSX folder removed")
                            except Exception as e:
                                logger.warning(f"[Upload Model] Could not remove __MACOSX folder: {e}")
                    
                    # Find the main GLTF file (prefer .gltf over .glb, and prefer files in root)
                    # Skip __MACOSX folders and macOS metadata files (._*)
                    logger.info("[Upload Model] Searching for GLTF files")
                    gltf_files = []
                    for root, dirs, files in os.walk(room_model_dir):
                        # Skip __MACOSX folders
                        if '__MACOSX' in root:
                            logger.info(f"[Upload Model] Skipping __MACOSX folder: {root}")
                            continue
                        
                        # Filter out macOS metadata files and __MACOSX directories
                        dirs[:] = [d for d in dirs if d != '__MACOSX']
                        files = [f for f in files if not f.startswith('._')]
                        
                        for file in files:
                            if file.lower().endswith('.gltf'):
                                rel_path = os.path.relpath(os.path.join(root, file), room_model_dir)
                                is_root = root == room_model_dir
                                gltf_files.append((rel_path, file, is_root))
                                logger.info(f"[Upload Model] Found GLTF: {rel_path} (root: {is_root})")
                    
                    # Sort: root files first, then by name
                    gltf_files.sort(key=lambda x: (not x[2], x[0]))
                    
                    if gltf_files:
                        main_gltf_file = gltf_files[0][0]  # Get relative path
                        logger.info(f"[Upload Model] Selected main GLTF file: {main_gltf_file}")
                    else:
                        # If no .gltf, look for .glb
                        logger.info("[Upload Model] No GLTF files found, searching for GLB files")
                        glb_files = []
                        for root, dirs, files in os.walk(room_model_dir):
                            # Skip __MACOSX folders
                            if '__MACOSX' in root:
                                logger.info(f"[Upload Model] Skipping __MACOSX folder: {root}")
                                continue
                            
                            # Filter out macOS metadata files and __MACOSX directories
                            dirs[:] = [d for d in dirs if d != '__MACOSX']
                            files = [f for f in files if not f.startswith('._')]
                            
                            for file in files:
                                if file.lower().endswith('.glb'):
                                    rel_path = os.path.relpath(os.path.join(root, file), room_model_dir)
                                    is_root = root == room_model_dir
                                    glb_files.append((rel_path, file, is_root))
                                    logger.info(f"[Upload Model] Found GLB: {rel_path} (root: {is_root})")
                        
                        glb_files.sort(key=lambda x: (not x[2], x[0]))
                        if glb_files:
                            main_gltf_file = glb_files[0][0]
                            logger.info(f"[Upload Model] Selected main GLB file: {main_gltf_file}")
                        else:
                            # Clean up temp file
                            logger.error("[Upload Model] No GLTF or GLB files found in ZIP")
                            os.unlink(tmp_file_path)
                            return Response(
                                {"error": "ZIP file does not contain any GLTF or GLB files"}, 
                                status=400
                            )
                finally:
                    # Clean up temporary file
                    if os.path.exists(tmp_file_path):
                        logger.info(f"[Upload Model] Cleaning up temp file: {tmp_file_path}")
                        os.unlink(tmp_file_path)
            except zipfile.BadZipFile as e:
                logger.error(f"[Upload Model] Invalid ZIP file: {str(e)}")
                return Response({"error": "Invalid ZIP file"}, status=400)
            except Exception as e:
                logger.error(f"[Upload Model] Failed to extract ZIP file: {str(e)}", exc_info=True)
                return Response({"error": f"Failed to extract ZIP file: {str(e)}"}, status=400)
        else:
            # Handle single GLTF/GLB file
            logger.info("[Upload Model] Processing single file (not ZIP)")
            file_path = os.path.join(room_model_dir, uploaded_file.name)
            logger.info(f"[Upload Model] Saving to: {file_path}")
            try:
                with open(file_path, 'wb+') as destination:
                    chunk_count = 0
                    total_bytes = 0
                    for chunk in uploaded_file.chunks():
                        destination.write(chunk)
                        chunk_count += 1
                        total_bytes += len(chunk)
                    logger.info(f"[Upload Model] File saved: chunks={chunk_count}, bytes={total_bytes}")
                main_gltf_file = uploaded_file.name
                logger.info(f"[Upload Model] Main GLTF file: {main_gltf_file}")
            except Exception as e:
                logger.error(f"[Upload Model] Failed to save file: {str(e)}", exc_info=True)
                return Response({"error": f"Failed to save file: {str(e)}"}, status=500)
        
        # Store the relative path to the main GLTF file
        # The file path will be relative to the room model directory
        relative_path = main_gltf_file.replace('\\', '/')  # Normalize path separators
        logger.info(f"[Upload Model] Relative path: {relative_path}")
        
        # Update the room model field
        room.room_model = f"uploaded_{room.id}"
        logger.info(f"[Upload Model] Room model set to: {room.room_model}")
        
        # For ZIP files, we don't use the FileField since files are already extracted
        # For single files, we save to the FileField
        if file_extension == '.zip':
            # For ZIP files, store a reference to the main file
            logger.info("[Upload Model] Handling ZIP file - creating reference file")
            main_file_path = os.path.join(room_model_dir, relative_path)
            logger.info(f"[Upload Model] Main file path: {main_file_path}")
            logger.info(f"[Upload Model] Main file exists: {os.path.exists(main_file_path)}")
            
            # Create a reference file that stores the relative path
            reference_file = os.path.join(room_model_dir, '.main_gltf')
            logger.info(f"[Upload Model] Creating reference file: {reference_file}")
            with open(reference_file, 'w') as f:
                f.write(relative_path)
            logger.info(f"[Upload Model] Reference file created")
            
            # Save a dummy file to the FileField for compatibility
            logger.info("[Upload Model] Saving dummy file to FileField")
            room.room_model_file.save(
                relative_path,
                ContentFile(b''),  # Empty file, just for path reference
                save=False
            )
            logger.info(f"[Upload Model] FileField saved: {room.room_model_file}")
        else:
            # For single files, save normally
            logger.info("[Upload Model] Handling single file - saving to FileField")
            main_file_path = os.path.join(room_model_dir, relative_path)
            logger.info(f"[Upload Model] Main file path: {main_file_path}")
            if os.path.exists(main_file_path):
                logger.info("[Upload Model] Reading file and saving to FileField")
                with open(main_file_path, 'rb') as f:
                    file_content = f.read()
                    logger.info(f"[Upload Model] File content size: {len(file_content)} bytes")
                    room.room_model_file.save(
                        relative_path,
                        ContentFile(file_content),
                        save=False
                    )
                logger.info(f"[Upload Model] FileField saved: {room.room_model_file}")
            else:
                logger.error(f"[Upload Model] Main file does not exist: {main_file_path}")
                return Response({"error": f"File not found: {main_file_path}"}, status=500)
        
        logger.info("[Upload Model] Saving room to database")
        room.save()
        logger.info("[Upload Model] Room saved successfully")
        
        # Build the URL to the main GLTF file
        # The URL should point to the extracted file in the folder structure
        main_file_url = f"{settings.MEDIA_URL}room_models/{room.id}/{relative_path}"
        file_url = request.build_absolute_uri(main_file_url)
        logger.info(f"[Upload Model] File URL: {file_url}")
        logger.info(f"[Upload Model] Main file URL (relative): {main_file_url}")
        
        logger.info("[Upload Model] ===== Upload completed successfully =====")
        return Response({
            "status": "model_uploaded",
            "room_model": room.room_model,
            "model_file_url": file_url,
            "room": RoomSerializer(room, context={'request': request}).data
        })


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

    def perform_update(self, serializer):
        """
        Intercepts the update to check for 'is_on' changes and trigger SCADA.
        """
        old_instance = self.get_object()
        old_is_on = old_instance.is_on
        
        # Save the new state
        instance = serializer.save()
        
        # Check if is_on changed (or just if we want to enforce state on every patch containing is_on)
        if instance.is_on != old_is_on:
             if instance.tag:
                 value = 1 if instance.is_on else 0
                 ScadaManager().send_command(f"{instance.tag}.onoff", value)


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

    def perform_update(self, serializer):
        """
        Intercepts the update to check for 'is_on' changes and trigger SCADA.
        """
        old_instance = self.get_object()
        old_is_on = old_instance.is_on
        
        # Save the new state
        instance = serializer.save()
        
        # Check if is_on changed
        if instance.is_on != old_is_on:
             if instance.tag:
                 value = 1 if instance.is_on else 0
                 ScadaManager().send_command(f"{instance.tag}.on", value)


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
            
    def perform_update(self, serializer):
        """
        Intercepts the update to check for 'is_on' changes and trigger SCADA.
        """
        old_instance = self.get_object()
        old_is_on = old_instance.is_on
        
        # Save the new state
        instance = serializer.save()
        
        # Check if is_on changed
        if instance.is_on != old_is_on:
             if instance.tag:
                 value = 1 if instance.is_on else 0
                 ScadaManager().send_command(f"{instance.tag}.on", value)

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


# --- Furniture ViewSet ---

class FurnitureViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Furniture items (chairs, tables, etc.).
    These are separate from smart devices and only track position/rotation.
    """
    serializer_class = FurnitureSerializer
    permission_classes = [permissions.IsAuthenticated, IsHomeOwner]

    def get_queryset(self):
        return Furniture.objects.filter(room__home__user=self.request.user)

    def perform_create(self, serializer):
        room = serializer.validated_data.get('room')
        if room and room.home.user != self.request.user:
            raise PermissionDenied("You do not own this room.")
        serializer.save()

    @action(detail=True, methods=['post'])
    def set_position(self, request, pk=None):
        """
        Updates the 3D position and rotation of a furniture item.

        Body Parameters:
            x (float): Required.
            y (float): Required.
            z (float): Optional (default 0).
            rotation_y (float): Optional (default 0).
        """
        obj = self.get_object()

        x = request.data.get('x')
        y = request.data.get('y')
        z = request.data.get('z', 0)
        rotation_y = request.data.get('rotation_y', 0)

        if x is None or y is None:
            return Response({"error": "x and y required"}, status=400)

        obj.device_pos = Point(float(x), float(y), float(z), srid=4326)
        obj.rotation_y = float(rotation_y)
        obj.save()

        return Response({
            "status": "updated",
            "location": {"x": x, "y": y, "z": z},
            "rotation": {"y": rotation_y}
        })

    @action(detail=True, methods=['get'])
    def get_position(self, request, pk=None):
        """
        Retrieves the current position and rotation of a furniture item.
        """
        obj = self.get_object()

        if obj.device_pos:
            return Response({
                "x": obj.device_pos.x,
                "y": obj.device_pos.y,
                "z": obj.device_pos.z,
                "rotation": {"y": obj.rotation_y}
            })

        return Response({
            "x": None, "y": None, "z": None,
            "rotation": {"y": obj.rotation_y}
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

class AutomationViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing Automations.
    """
    serializer_class = AutomationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Return automations for devices that belong to the user's homes.
        """
        return Automation.objects.filter(device__room__home__user=self.request.user)

    def perform_create(self, serializer):
        """
        Ensure the user owns the device they are attaching an automation to.
        """
        device = serializer.validated_data['device']
        if device.room.home.user != self.request.user:
            raise PermissionDenied("You do not own this device.")
        instance = serializer.save()
        
        if instance.sunrise_sunset:
             from .services import update_automation_solar_time
             update_automation_solar_time(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        
        if instance.sunrise_sunset:
             from .services import update_automation_solar_time
             update_automation_solar_time(instance)
