import hashlib
import logging
import os
import random
import shutil
import tempfile
import zipfile
from datetime import datetime, date, timezone, timedelta

from django.conf import settings
from django.contrib.gis.geos import Point
from django.core.files.base import ContentFile
import json

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import *
from .permissions import IsHomeOwner
from .scada import ScadaManager
from .serializers import *
from .services import VoiceAssistantService

logger = logging.getLogger(__name__)


def _prepare_mock_log_context(request, type_prefix):
    """
    Shared helper for all mock device log endpoints.

    Reads `date` and `device_id` from query params.
    Seeds `random` with a deterministic hash of type_prefix + date + device_id.
    Returns (date_str, max_intervals) where max_intervals is 288 for past dates
    or truncated to the current 5-minute slot for today.

    Raises ValueError on invalid/missing date (caller should catch and return 400).
    """
    date_str = request.query_params.get("date")
    device_id = request.query_params.get("device_id", "")

    if not date_str:
        raise ValueError("date parameter is required (YYYY-MM-DD)")

    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        raise ValueError("Invalid date format. Use YYYY-MM-DD")

    # Build a deterministic integer seed from type + date + device_id
    seed_string = f"{type_prefix}-{date_str}-{device_id}"
    seed_int = int(hashlib.sha256(seed_string.encode()).hexdigest(), 16) % (2**32)
    random.seed(seed_int)

    # Determine how many 5-minute intervals to generate
    # Use GMT+7 to match frontend local time
    gmt_plus_7 = timezone(timedelta(hours=7))
    now = datetime.now(gmt_plus_7)
    today = now.date()

    if target_date == today:
        # Current interval index: (hour * 60 + minute) // 5, capped at 288
        max_intervals = min(((now.hour * 60 + now.minute) // 5) + 1, 288)
    elif target_date > today:
        max_intervals = 0  # Future date — no data
    else:
        max_intervals = 288  # Full day

    return date_str, max_intervals, target_date == today, device_id


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

    @action(detail=True, methods=["get"])
    def get_devices(self, request, pk=None):
        """
        Custom Action: Retrieve all devices linked to a specific Home.

        URL: GET /api/homes/homes/{pk}/get_devices/
        """
        home = self.get_object()  # Triggers IsHomeOwner check
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
        home = serializer.validated_data["home"]
        if home.user != self.request.user:
            raise PermissionDenied("You do not own this home.")
        serializer.save()

    def get_serializer_context(self):
        """Add request to serializer context for building absolute URLs"""
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    @action(detail=True, methods=["get"])
    def get_devices(self, request, pk=None):
        """
        Custom Action: Retrieve all devices contained within a specific Room.

        URL: GET /api/homes/rooms/{pk}/get_devices/
        """
        room = self.get_object()
        devices = Device.objects.filter(room=room)
        return Response(DeviceSerializer(devices, many=True).data)

    @action(detail=True, methods=["get"])
    def get_furniture(self, request, pk=None):
        """
        Custom Action: Retrieve all furniture items in a specific Room.

        URL: GET /api/homes/rooms/{pk}/get_furniture/
        """
        room = self.get_object()
        furniture = Furniture.objects.filter(room=room)
        return Response(FurnitureSerializer(furniture, many=True).data)

    @action(detail=True, methods=["post"])
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

        x = request.data.get("x")
        y = request.data.get("y")
        z = request.data.get("z")
        rotation_y = request.data.get("rotation_y")
        anchor_uuid = request.data.get("anchor_uuid")

        if x is None or y is None or z is None or rotation_y is None:
            return Response(
                {"error": "x, y, z, and rotation_y are required"}, status=400
            )

        room.position_x = float(x)
        room.position_y = float(y)
        room.position_z = float(z)
        room.rotation_y = float(rotation_y)
        if anchor_uuid is not None:
            room.anchor_uuid = anchor_uuid
        room.save()

        return Response(
            {
                "status": "alignment_updated",
                "position": {
                    "x": room.position_x,
                    "y": room.position_y,
                    "z": room.position_z,
                },
                "rotation": {"y": room.rotation_y},
                "anchor_uuid": room.anchor_uuid,
            }
        )

    @action(detail=True, methods=["post"])
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

        logger.info(
            f"[Upload Model] ===== Starting upload_model for room_id={pk} ====="
        )
        logger.info(f"[Upload Model] Request method: {request.method}")
        logger.info(f"[Upload Model] Request FILES keys: {list(request.FILES.keys())}")
        logger.info(f"[Upload Model] Request content type: {request.content_type}")

        try:
            room = self.get_object()
            logger.info(f"[Upload Model] Room found: {room.id}, name: {room.room_name}")
        except Exception as e:
            logger.error(f"[Upload Model] Failed to get room: {str(e)}")
            return Response({"error": f"Room not found: {str(e)}"}, status=404)

        if "file" not in request.FILES:
            logger.error("[Upload Model] No 'file' key in request.FILES")
            logger.error(f"[Upload Model] Available keys: {list(request.FILES.keys())}")
            return Response({"error": "No file provided"}, status=400)

        uploaded_file = request.FILES["file"]
        file_extension = os.path.splitext(uploaded_file.name)[1].lower()

        logger.info(
            f"[Upload Model] File received: name={uploaded_file.name}, size={uploaded_file.size}, extension={file_extension}"
        )
        logger.info(
            f"[Upload Model] File content_type: {getattr(uploaded_file, 'content_type', 'unknown')}"
        )

        # Validate file extension
        allowed_extensions = [".gltf", ".glb", ".zip"]
        if file_extension not in allowed_extensions:
            logger.error(f"[Upload Model] Invalid file extension: {file_extension}")
            return Response(
                {
                    "error": f"Invalid file type. Allowed: {', '.join(allowed_extensions)}"
                },
                status=400,
            )

        logger.info(f"[Upload Model] File extension validated: {file_extension}")

        # Get the room's model directory
        room_model_dir = os.path.join(settings.MEDIA_ROOT, "room_models", str(room.id))
        logger.info(f"[Upload Model] Room model directory: {room_model_dir}")
        logger.info(f"[Upload Model] MEDIA_ROOT: {settings.MEDIA_ROOT}")

        # Delete old files if they exist
        if os.path.exists(room_model_dir):
            try:
                logger.info(
                    f"[Upload Model] Deleting old room model directory: {room_model_dir}"
                )
                shutil.rmtree(room_model_dir)
                logger.info(f"[Upload Model] Old directory deleted successfully")
            except Exception as e:
                logger.warning(
                    f"[Upload Model] Could not delete old room model directory: {e}"
                )

        # Create the directory
        try:
            os.makedirs(room_model_dir, exist_ok=True)
            logger.info(
                f"[Upload Model] Created/verified room model directory: {room_model_dir}"
            )
        except Exception as e:
            logger.error(f"[Upload Model] Failed to create directory: {e}")
            return Response(
                {"error": f"Failed to create directory: {str(e)}"}, status=500
            )

        main_gltf_file = None

        if file_extension == ".zip":
            # Handle ZIP file - extract it
            logger.info("[Upload Model] Processing ZIP file")
            try:
                # Save uploaded file to a temporary location first
                logger.info("[Upload Model] Saving uploaded file to temporary location")
                with tempfile.NamedTemporaryFile(
                    delete=False, suffix=".zip"
                ) as tmp_file:
                    chunk_count = 0
                    total_bytes = 0
                    for chunk in uploaded_file.chunks():
                        tmp_file.write(chunk)
                        chunk_count += 1
                        total_bytes += len(chunk)
                    tmp_file_path = tmp_file.name

                logger.info(
                    f"[Upload Model] Saved to temp file: {tmp_file_path}, chunks: {chunk_count}, total bytes: {total_bytes}"
                )

                try:
                    logger.info(f"[Upload Model] Opening ZIP file: {tmp_file_path}")
                    with zipfile.ZipFile(tmp_file_path, "r") as zip_ref:
                        file_list = zip_ref.namelist()
                        logger.info(
                            f"[Upload Model] ZIP contains {len(file_list)} files"
                        )
                        logger.info(
                            f"[Upload Model] ZIP file list (first 10): {file_list[:10]}"
                        )

                        # Extract all files to the room model directory
                        logger.info(f"[Upload Model] Extracting to: {room_model_dir}")
                        zip_ref.extractall(room_model_dir)
                        logger.info("[Upload Model] Extraction complete")

                        # Clean up __MACOSX folder if it exists (macOS metadata)
                        macosx_path = os.path.join(room_model_dir, "__MACOSX")
                        if os.path.exists(macosx_path):
                            logger.info(
                                f"[Upload Model] Removing __MACOSX folder: {macosx_path}"
                            )
                            try:
                                shutil.rmtree(macosx_path)
                                logger.info("[Upload Model] __MACOSX folder removed")
                            except Exception as e:
                                logger.warning(
                                    f"[Upload Model] Could not remove __MACOSX folder: {e}"
                                )

                    # Find the main GLTF file (prefer .gltf over .glb, and prefer files in root)
                    # Skip __MACOSX folders and macOS metadata files (._*)
                    logger.info("[Upload Model] Searching for GLTF files")
                    gltf_files = []
                    for root, dirs, files in os.walk(room_model_dir):
                        # Skip __MACOSX folders
                        if "__MACOSX" in root:
                            logger.info(
                                f"[Upload Model] Skipping __MACOSX folder: {root}"
                            )
                            continue

                        # Filter out macOS metadata files and __MACOSX directories
                        dirs[:] = [d for d in dirs if d != "__MACOSX"]
                        files = [f for f in files if not f.startswith("._")]

                        for file in files:
                            if file.lower().endswith(".gltf"):
                                rel_path = os.path.relpath(
                                    os.path.join(root, file), room_model_dir
                                )
                                is_root = root == room_model_dir
                                gltf_files.append((rel_path, file, is_root))
                                logger.info(
                                    f"[Upload Model] Found GLTF: {rel_path} (root: {is_root})"
                                )

                    # Sort: root files first, then by name
                    gltf_files.sort(key=lambda x: (not x[2], x[0]))

                    if gltf_files:
                        main_gltf_file = gltf_files[0][0]  # Get relative path
                        logger.info(
                            f"[Upload Model] Selected main GLTF file: {main_gltf_file}"
                        )
                    else:
                        # If no .gltf, look for .glb
                        logger.info(
                            "[Upload Model] No GLTF files found, searching for GLB files"
                        )
                        glb_files = []
                        for root, dirs, files in os.walk(room_model_dir):
                            # Skip __MACOSX folders
                            if "__MACOSX" in root:
                                logger.info(
                                    f"[Upload Model] Skipping __MACOSX folder: {root}"
                                )
                                continue

                            # Filter out macOS metadata files and __MACOSX directories
                            dirs[:] = [d for d in dirs if d != "__MACOSX"]
                            files = [f for f in files if not f.startswith("._")]

                            for file in files:
                                if file.lower().endswith(".glb"):
                                    rel_path = os.path.relpath(
                                        os.path.join(root, file), room_model_dir
                                    )
                                    is_root = root == room_model_dir
                                    glb_files.append((rel_path, file, is_root))
                                    logger.info(
                                        f"[Upload Model] Found GLB: {rel_path} (root: {is_root})"
                                    )

                        glb_files.sort(key=lambda x: (not x[2], x[0]))
                        if glb_files:
                            main_gltf_file = glb_files[0][0]
                            logger.info(
                                f"[Upload Model] Selected main GLB file: {main_gltf_file}"
                            )
                        else:
                            # Clean up temp file
                            logger.error(
                                "[Upload Model] No GLTF or GLB files found in ZIP"
                            )
                            os.unlink(tmp_file_path)
                            return Response(
                                {
                                    "error": "ZIP file does not contain any GLTF or GLB files"
                                },
                                status=400,
                            )
                finally:
                    # Clean up temporary file
                    if os.path.exists(tmp_file_path):
                        logger.info(
                            f"[Upload Model] Cleaning up temp file: {tmp_file_path}"
                        )
                        os.unlink(tmp_file_path)
            except zipfile.BadZipFile as e:
                logger.error(f"[Upload Model] Invalid ZIP file: {str(e)}")
                return Response({"error": "Invalid ZIP file"}, status=400)
            except Exception as e:
                logger.error(
                    f"[Upload Model] Failed to extract ZIP file: {str(e)}",
                    exc_info=True,
                )
                return Response(
                    {"error": f"Failed to extract ZIP file: {str(e)}"}, status=400
                )
        else:
            # Handle single GLTF/GLB file
            logger.info("[Upload Model] Processing single file (not ZIP)")
            file_path = os.path.join(room_model_dir, uploaded_file.name)
            logger.info(f"[Upload Model] Saving to: {file_path}")
            try:
                with open(file_path, "wb+") as destination:
                    chunk_count = 0
                    total_bytes = 0
                    for chunk in uploaded_file.chunks():
                        destination.write(chunk)
                        chunk_count += 1
                        total_bytes += len(chunk)
                    logger.info(
                        f"[Upload Model] File saved: chunks={chunk_count}, bytes={total_bytes}"
                    )
                main_gltf_file = uploaded_file.name
                logger.info(f"[Upload Model] Main GLTF file: {main_gltf_file}")
            except Exception as e:
                logger.error(
                    f"[Upload Model] Failed to save file: {str(e)}", exc_info=True
                )
                return Response({"error": f"Failed to save file: {str(e)}"}, status=500)

        # Store the relative path to the main GLTF file
        # The file path will be relative to the room model directory
        relative_path = main_gltf_file.replace("\\", "/")  # Normalize path separators
        logger.info(f"[Upload Model] Relative path: {relative_path}")

        # Update the room model field
        room.room_model = f"uploaded_{room.id}"
        logger.info(f"[Upload Model] Room model set to: {room.room_model}")

        # For ZIP files, we don't use the FileField since files are already extracted
        # For single files, we save to the FileField
        if file_extension == ".zip":
            # For ZIP files, store a reference to the main file
            logger.info("[Upload Model] Handling ZIP file - creating reference file")
            main_file_path = os.path.join(room_model_dir, relative_path)
            logger.info(f"[Upload Model] Main file path: {main_file_path}")
            logger.info(
                f"[Upload Model] Main file exists: {os.path.exists(main_file_path)}"
            )

            # Create a reference file that stores the relative path
            reference_file = os.path.join(room_model_dir, ".main_gltf")
            logger.info(f"[Upload Model] Creating reference file: {reference_file}")
            with open(reference_file, "w") as f:
                f.write(relative_path)
            logger.info(f"[Upload Model] Reference file created")

            # Save a dummy file to the FileField for compatibility
            logger.info("[Upload Model] Saving dummy file to FileField")
            room.room_model_file.save(
                relative_path,
                ContentFile(b""),  # Empty file, just for path reference
                save=False,
            )
            logger.info(f"[Upload Model] FileField saved: {room.room_model_file}")
        else:
            # For single files, save normally
            logger.info("[Upload Model] Handling single file - saving to FileField")
            main_file_path = os.path.join(room_model_dir, relative_path)
            logger.info(f"[Upload Model] Main file path: {main_file_path}")
            if os.path.exists(main_file_path):
                logger.info("[Upload Model] Reading file and saving to FileField")
                with open(main_file_path, "rb") as f:
                    file_content = f.read()
                    logger.info(
                        f"[Upload Model] File content size: {len(file_content)} bytes"
                    )
                    room.room_model_file.save(
                        relative_path, ContentFile(file_content), save=False
                    )
                logger.info(f"[Upload Model] FileField saved: {room.room_model_file}")
            else:
                logger.error(
                    f"[Upload Model] Main file does not exist: {main_file_path}"
                )
                return Response(
                    {"error": f"File not found: {main_file_path}"}, status=500
                )

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
        return Response(
            {
                "status": "model_uploaded",
                "room_model": room.room_model,
                "model_file_url": file_url,
                "room": RoomSerializer(room, context={"request": request}).data,
            }
        )


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
        room = serializer.validated_data.get("room")
        if room and room.home.user != self.request.user:
            raise PermissionDenied("You do not own this room.")
        serializer.save()

    def perform_update(self, serializer):
        """
        Intercepts the update to check for 'is_on' changes and trigger SCADA.
        """
        old_instance = self.get_object()
        old_is_on = getattr(old_instance, "is_on", None)

        # Save the new state
        instance = serializer.save()

        # Check if is_on changed
        if hasattr(instance, "is_on") and getattr(instance, "is_on") != old_is_on:
            if hasattr(instance, "smartmeter"):
                from .smartmeter import SmartmeterManager

                # Let the manager decide whether to actually start/stop based on global state
                if instance.is_on:
                    SmartmeterManager().start()
                else:
                    SmartmeterManager().close()

                if instance.tag:
                    value = 1 if instance.is_on else 0
                    ScadaManager().send_command(f"{instance.tag}.onoff", value)

            elif instance.tag:
                value = 1 if instance.is_on else 0

                suffix = "onoff"  # Default for Lightbulb and AirConditioner
                if hasattr(instance, "television"):
                    suffix = "on"
                elif hasattr(instance, "fan"):
                    suffix = "on"

                ScadaManager().send_command(f"{instance.tag}.{suffix}", value)

    @action(detail=True, methods=["post"])
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

        x = request.data.get("x")
        y = request.data.get("y")
        z = request.data.get("z", 0)
        rotation_x = request.data.get("rotation_x", 0)
        rotation_y = request.data.get("rotation_y", 0)
        rotation_z = request.data.get("rotation_z", 0)

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
            rotation_z=float(rotation_z),
        )

        return Response(
            {
                "status": "updated",
                "location": {"x": x, "y": y, "z": z},
                "rotation": {"x": rotation_x, "y": rotation_y, "z": rotation_z},
            }
        )

    @action(detail=True, methods=['get', 'delete'])
    def get_position(self, request, pk=None):
        """
        Retrieves or resets the current x, y, z coordinates and rotation of the device.
        
        GET: Returns {x, y, z, rotation: {x, y, z}} or nulls if position is not set.
        DELETE: Resets device_pos to None and returns success status.
        """
        obj = self.get_object()

        # 1. DELETE (Clear Position)
        if request.method == 'DELETE':
            obj.device_pos = None
            obj.save()
            return Response({"status": "position cleared"})
        
        # 2. READ (GET)
        # Consistent return format
        if obj.device_pos:
            return Response(
                {
                    "x": obj.device_pos.x,
                    "y": obj.device_pos.y,
                    "z": obj.device_pos.z,
                    "rotation": {
                        "x": obj.rotation_x,
                        "y": obj.rotation_y,
                        "z": obj.rotation_z,
                    },
                }
            )

        # If null, return strict null structure
        return Response(
            {
                "x": None,
                "y": None,
                "z": None,
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
        }
        )

    @action(detail=True, methods=["get"])
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
        history_records = PositionHistory.objects.filter(device__id=obj.id).order_by(
            "-timestamp"
        )

        serializer = PositionHistorySerializer(history_records, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get", "post", "put", "delete"])
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
        if request.method == "GET":
            return Response({"tag": obj.tag})

        # 2. CREATE / UPDATE (POST, PUT)
        elif request.method in ["POST", "PUT"]:
            new_tag = request.data.get("tag")
            if new_tag is None:
                return Response({"error": "tag parameter is required"}, status=400)

            obj.tag = new_tag
            obj.save()
            return Response({"status": "tag updated", "tag": obj.tag})

        # 3. DELETE (DELETE)
        elif request.method == "DELETE":
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

    @action(detail=True, methods=["post"])
    def set_temperature(self, request, pk=None):
        """
        Command: Set the target temperature of the AC.

        Body: {"temp": float}
        """
        ac = self.get_object()
        temp = request.data.get("temp")

        if temp is not None:
            ac.temperature = float(temp)
            ac.save()

            if ac.tag:
                ScadaManager().send_command(f"{ac.tag}.set_temp", ac.temperature)

            return Response(
                {"status": "temperature set", "current_temp": ac.temperature}
            )
        return Response({"error": "temp parameter missing"}, status=400)

    @action(detail=False, methods=["get"], url_path="getACLog")
    def getACLog(self, request):
        """
        Retrieves mock AC logs for a specific date and device.

        URL: GET /api/homes/acs/getACLog/?date=YYYY-MM-DD&device_id=<uuid>
        """
        try:
            date_str, max_intervals, is_today, device_id = _prepare_mock_log_context(request, "ac")
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        # Pre-generate realistic AC usage sessions
        # Each session: (start_interval, end_interval, temperature)
        sessions = []
        # Possible session windows: morning brief, midday-afternoon, evening
        windows = [
            (random.randint(72, 84), random.randint(90, 108)),    # ~06:00-09:00 morning brief
            (random.randint(120, 144), random.randint(180, 210)), # ~10:00-17:30 midday
            (random.randint(216, 234), random.randint(258, 276)), # ~18:00-23:00 evening
        ]
        for start, end in windows:
            if random.random() < 0.75:  # 75% chance each window has a session
                temp = random.choice([23, 24, 24, 25, 25, 26, 26, 27])
                sessions.append((start, end, temp))
                # Small chance of a temp adjustment mid-session
                if end - start > 18 and random.random() < 0.4:
                    split = random.randint(start + 6, end - 6)
                    new_temp = temp + random.choice([-1, 1])
                    new_temp = max(22, min(28, new_temp))
                    sessions[-1] = (start, split, temp)
                    sessions.append((split, end, new_temp))

        # Build a lookup: interval index → (onoff, temperature)
        interval_map = {}
        for s_start, s_end, s_temp in sessions:
            for idx in range(s_start, s_end + 1):
                interval_map[idx] = (True, s_temp)

        data = []
        for i in range(max_intervals):
            hour = (i * 5) // 60
            minute = (i * 5) % 60
            ts = f"{date_str}T{hour:02d}:{minute:02d}:00+07:00"

            if i in interval_map:
                onoff, temperature = interval_map[i]
            else:
                onoff = False
                temperature = None

            if is_today and i == max_intervals - 1 and device_id:
                from .models import AirConditioner
                try:
                    real_device = AirConditioner.objects.get(id=device_id)
                    onoff = real_device.is_on
                    if onoff:
                        temperature = real_device.temperature
                except Exception:
                    pass

            data.append({"timestamp": ts, "onoff": onoff, "temperature": temperature})

        return Response({"device_name": "SmartAC01", "data": data})

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

    @action(detail=True, methods=["post"])
    def set_speed(self, request, pk=None):
        """
        Command: Set the fan speed.

        Body: {"speed": int}
        """
        fan = self.get_object()
        speed = request.data.get("speed")

        if speed is not None:
            fan.speed = int(speed)
            fan.save()

            if fan.tag:
                ScadaManager().send_command(f"{fan.tag}.speed", fan.speed)

            return Response({"status": "speed set", "current_speed": fan.speed})
        return Response({"error": "speed parameter missing"}, status=400)

    @action(detail=False, methods=["get"], url_path="getFanLog")
    def getFanLog(self, request):
        """
        Retrieves mock Fan logs for a specific date and device.

        URL: GET /api/homes/fans/getFanLog/?date=YYYY-MM-DD&device_id=<uuid>
        """
        try:
            date_str, max_intervals, is_today, device_id = _prepare_mock_log_context(request, "fan")
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        # Pre-generate fan usage sessions
        # Each session: (start, end, speed, swing)
        sessions = []
        # Sleep session (night): low speed, no swing
        sleep_start = random.randint(246, 264)   # ~20:30-22:00
        sleep_end = random.randint(72, 96)        # ~06:00-08:00 next morning
        sleep_speed = random.choice([1, 1, 2])
        # Split into two ranges: evening portion + early morning portion
        sessions.append((sleep_start, 287, sleep_speed, False))  # evening to midnight
        sessions.append((0, sleep_end, sleep_speed, False))       # midnight to morning

        # Afternoon session: higher speed, swing likely
        if random.random() < 0.8:
            af_start = random.randint(132, 156)  # ~11:00-13:00
            af_end = random.randint(192, 222)    # ~16:00-18:30
            af_speed = random.choice([2, 2, 3, 3])
            af_swing = random.random() < 0.65
            sessions.append((af_start, af_end, af_speed, af_swing))
            # Speed change mid-afternoon
            if af_end - af_start > 12 and random.random() < 0.35:
                split = random.randint(af_start + 6, af_end - 6)
                new_speed = max(1, min(3, af_speed + random.choice([-1, 1])))
                sessions[-1] = (af_start, split, af_speed, af_swing)
                sessions.append((split, af_end, new_speed, af_swing))

        # Short morning burst
        if random.random() < 0.3:
            m_start = random.randint(84, 96)   # ~07:00-08:00
            m_end = random.randint(102, 120)   # ~08:30-10:00
            sessions.append((m_start, m_end, 2, random.random() < 0.3))

        # Build lookup
        interval_map = {}
        for s_start, s_end, s_speed, s_swing in sessions:
            for idx in range(s_start, min(s_end + 1, 288)):
                interval_map[idx] = (True, s_speed, s_swing)

        data = []
        for i in range(max_intervals):
            hour = (i * 5) // 60
            minute = (i * 5) % 60
            ts = f"{date_str}T{hour:02d}:{minute:02d}:00+07:00"

            if i in interval_map:
                onoff, speed, swing = interval_map[i]
            else:
                onoff = False
                speed = None
                swing = False

            if is_today and i == max_intervals - 1 and device_id:
                from .models import Fan
                try:
                    real_device = Fan.objects.get(id=device_id)
                    onoff = real_device.is_on
                    if onoff:
                        speed = real_device.speed
                        swing = real_device.swing
                except Exception:
                    pass

            data.append(
                {"timestamp": ts, "onoff": onoff, "speed": speed, "swing": swing}
            )

        return Response({"device_name": "SmartFan01", "data": data})

    @action(detail=True, methods=["post"])
    def set_swing(self, request, pk=None):
        """
        Command: Toggle or set the fan swing mode.

        Body: {"swing": boolean}
        """
        fan = self.get_object()
        swing = request.data.get("swing")

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

    @action(detail=True, methods=["post"])
    def set_brightness(self, request, pk=None):
        """
        Command: Set the light brightness level (usually 0-100).

        Body: {"brightness": int}
        """
        bulb = self.get_object()
        brightness = request.data.get("brightness")

        if brightness is not None:
            bulb.brightness = int(brightness)
            bulb.save()

            if bulb.tag:
                ScadaManager().send_command(f"{bulb.tag}.Brightness", bulb.brightness)

            return Response(
                {"status": "brightness set", "current_brightness": bulb.brightness}
            )
        return Response({"error": "brightness parameter missing"}, status=400)

    @action(detail=False, methods=["get"], url_path="getLightbulbLog")
    def getLightbulbLog(self, request):
        """
        Retrieves mock lightbulb logs for a specific date and device.

        URL: GET /api/homes/lightbulbs/getLightbulbLog/?date=YYYY-MM-DD&device_id=<uuid>
        """
        try:
            date_str, max_intervals, is_today, device_id = _prepare_mock_log_context(request, "light")
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        warm_colors = ["#FFFFFF", "#FFD700", "#FFA500"]  # Warm tones for evening
        cool_colors = ["#FFFFFF", "#49c0efff"]  # Cool tones for daytime
        accent_colors = ["#FFD700", "#FFA500", "#FF69B4", "#8A2BE2"]

        # Pre-generate usage sessions with STABLE brightness & color per session
        # Each session: (start, end, brightness, color)
        sessions = []

        # Morning routine: bright cool light
        m_start = random.randint(72, 78)    # ~06:00-06:30
        m_end = random.randint(90, 108)     # ~07:30-09:00
        m_brightness = random.choice([75, 80, 85])
        m_color = random.choice(cool_colors)
        sessions.append((m_start, m_end, m_brightness, m_color))

        # Coming home / late afternoon (sometimes)
        if random.random() < 0.5:
            h_start = random.randint(198, 210)  # ~16:30-17:30
            h_end = random.randint(216, 222)    # ~18:00-18:30
            h_brightness = random.choice([55, 60, 65])
            sessions.append((h_start, h_end, h_brightness, "#FFFFFF"))

        # Evening main session — typically 2-3 phases of brightness
        ev_start = random.randint(213, 228)     # ~17:45-19:00
        ev_mid1 = random.randint(ev_start + 12, ev_start + 24)  # change after 1-2 hours
        ev_mid2 = random.randint(ev_mid1 + 6, min(ev_mid1 + 18, 280))
        ev_end = random.randint(max(ev_mid2, 264), 280)  # ~22:00-23:20

        ev_bright1 = random.choice([60, 65, 70])
        ev_color1 = random.choice(warm_colors)
        sessions.append((ev_start, ev_mid1, ev_bright1, ev_color1))

        ev_bright2 = random.choice([40, 45, 50])
        ev_color2 = random.choice(warm_colors)
        sessions.append((ev_mid1, ev_mid2, ev_bright2, ev_color2))

        # Wind-down: dim accent lighting before bed
        ev_bright3 = random.choice([15, 20, 25, 30])
        ev_color3 = random.choice(accent_colors)
        sessions.append((ev_mid2, ev_end, ev_bright3, ev_color3))

        # Brief midnight bathroom trip (rare)
        if random.random() < 0.15:
            bath_start = random.randint(0, 24)    # 00:00-02:00
            bath_end = bath_start + random.randint(1, 3)
            sessions.append((bath_start, bath_end, 30, "#FFFFFF"))

        # Build lookup
        interval_map = {}
        for s_start, s_end, s_bright, s_color in sessions:
            for idx in range(s_start, min(s_end + 1, 288)):
                interval_map[idx] = (True, s_bright, s_color)

        data = []
        for i in range(max_intervals):
            hour = (i * 5) // 60
            minute = (i * 5) % 60
            ts = f"{date_str}T{hour:02d}:{minute:02d}:00+07:00"

            if i in interval_map:
                onoff, brightness, color = interval_map[i]
            else:
                onoff = False
                brightness = None
                color = None

            if is_today and i == max_intervals - 1 and device_id:
                from .models import Lightbulb
                try:
                    real_device = Lightbulb.objects.get(id=device_id)
                    onoff = real_device.is_on
                    if onoff:
                        brightness = real_device.brightness
                        color = real_device.colour
                except Exception:
                    pass

            data.append(
                {
                    "timestamp": ts,
                    "onoff": onoff,
                    "brightness": brightness,
                    "color": color,
                }
            )

        return Response({"device_name": "HueLight01", "data": data})

    @action(detail=True, methods=["post"])
    def set_colour(self, request, pk=None):
        """
        Command: Set the light colour.

        Body: {"colour": string} (Expected format: Hex Code, e.g., "#FF0000")
        """
        bulb = self.get_object()
        colour = request.data.get("colour")

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

    @action(detail=True, methods=["post"])
    def set_volume(self, request, pk=None):
        """
        Command: Set the TV volume.

        Body: {"volume": int}
        """
        tv = self.get_object()
        volume = request.data.get("volume")

        if volume is not None:
            tv.volume = int(volume)
            tv.save()

            if tv.tag:
                ScadaManager().send_command(f"{tv.tag}.volume", tv.volume)

            return Response({"status": "volume set", "current_volume": tv.volume})
        return Response({"error": "volume parameter missing"}, status=400)

    @action(detail=True, methods=["post"])
    def set_channel(self, request, pk=None):
        """
        Command: Change the TV channel.

        Body: {"channel": int}
        """
        tv = self.get_object()
        channel = request.data.get("channel")

        if channel is not None:
            tv.channel = int(channel)
            tv.save()

            if tv.tag:
                ScadaManager().send_command(f"{tv.tag}.channel", tv.channel)

            return Response({"status": "channel set", "current_channel": tv.channel})
        return Response({"error": "channel parameter missing"}, status=400)

    @action(detail=True, methods=["post"])
    def set_mute(self, request, pk=None):
        """
        Command: Set the TV mute status.

        Body: {"mute": boolean}
        """
        tv = self.get_object()
        mute = request.data.get("mute")

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

    @action(detail=False, methods=["get"], url_path="getTVLog")
    def getTVLog(self, request):
        """
        Retrieves mock TV logs for a specific date and device.

        URL: GET /api/homes/tvs/getTVLog/?date=YYYY-MM-DD&device_id=<uuid>
        """
        try:
            date_str, max_intervals, is_today, device_id = _prepare_mock_log_context(request, "tv")
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        morning_channels = [3, 5, 7]
        afternoon_channels = [12, 15, 20]
        evening_channels = [1, 2, 5, 7, 8, 10, 139]

        # Pre-generate viewing sessions
        # Each session: (start, end, volume, channel, is_mute)
        # Within a session, a person might change channel 1-3 times
        sessions = []

        # Morning news (maybe)
        if random.random() < 0.6:
            mn_start = random.randint(84, 96)   # ~07:00-08:00
            mn_end = random.randint(100, 114)   # ~08:20-09:30
            mn_vol = random.choice([18, 20, 22, 25])
            mn_ch = random.choice(morning_channels)
            sessions.append((mn_start, mn_end, mn_vol, mn_ch, False))

        # Lunch break (maybe)
        if random.random() < 0.45:
            lu_start = random.randint(144, 150)  # ~12:00-12:30
            lu_end = random.randint(156, 168)    # ~13:00-14:00
            lu_vol = random.choice([25, 28, 30])
            lu_ch = random.choice(afternoon_channels)
            sessions.append((lu_start, lu_end, lu_vol, lu_ch, False))

        # Evening prime time — the main viewing block
        # Generate 2-4 "channel segments" with stable volume+channel
        ev_cursor = random.randint(210, 228)  # ~17:30-19:00 start
        ev_end_target = random.randint(270, 282)  # ~22:30-23:30 end
        num_segments = random.randint(2, 4)
        segment_len = max((ev_end_target - ev_cursor) // num_segments, 3)

        for seg_i in range(num_segments):
            seg_start = ev_cursor
            seg_end = min(ev_cursor + segment_len + random.randint(-3, 3), ev_end_target)
            if seg_start >= ev_end_target:
                break
            seg_vol = random.choice([30, 35, 38, 40, 42, 45])
            seg_ch = random.choice(evening_channels)
            seg_mute = False
            sessions.append((seg_start, seg_end, seg_vol, seg_ch, seg_mute))
            ev_cursor = seg_end

        # Build lookup
        interval_map = {}
        for s_start, s_end, s_vol, s_ch, s_mute in sessions:
            for idx in range(s_start, min(s_end + 1, 288)):
                interval_map[idx] = (True, s_vol, s_ch, s_mute)

        data = []
        for i in range(max_intervals):
            hour = (i * 5) // 60
            minute = (i * 5) % 60
            ts = f"{date_str}T{hour:02d}:{minute:02d}:00+07:00"

            if i in interval_map:
                onoff, volume, channel, is_mute = interval_map[i]
            else:
                onoff = False
                volume = 0
                channel = None
                is_mute = False

            if is_today and i == max_intervals - 1 and device_id:
                from .models import Television
                try:
                    real_device = Television.objects.get(id=device_id)
                    onoff = real_device.is_on
                    if onoff:
                        volume = real_device.volume
                        channel = real_device.channel
                        is_mute = real_device.is_mute
                except Exception:
                    pass

            data.append(
                {
                    "timestamp": ts,
                    "onoff": onoff,
                    "volume": volume,
                    "channel": channel,
                    "is_mute": is_mute,
                }
            )

        return Response({"device_name": "SmartTV01", "data": data})


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
        room = serializer.validated_data.get("room")
        if room and room.home.user != self.request.user:
            raise PermissionDenied("You do not own this room.")
        serializer.save()

    @action(detail=True, methods=["post"])
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

        x = request.data.get("x")
        y = request.data.get("y")
        z = request.data.get("z", 0)
        rotation_y = request.data.get("rotation_y", 0)

        if x is None or y is None:
            return Response({"error": "x and y required"}, status=400)

        obj.device_pos = Point(float(x), float(y), float(z), srid=4326)
        obj.rotation_y = float(rotation_y)
        obj.save()

        return Response(
            {
                "status": "updated",
                "location": {"x": x, "y": y, "z": z},
                "rotation": {"y": rotation_y},
            }
        )

    @action(detail=True, methods=["get"])
    def get_position(self, request, pk=None):
        """
        Retrieves the current position and rotation of a furniture item.
        """
        obj = self.get_object()

        if obj.device_pos:
            return Response(
                {
                    "x": obj.device_pos.x,
                    "y": obj.device_pos.y,
                    "z": obj.device_pos.z,
                    "rotation": {"y": obj.rotation_y},
                }
            )

        return Response(
            {"x": None, "y": None, "z": None, "rotation": {"y": obj.rotation_y}}
        )


class SmartMeterViewSet(BaseDeviceViewSet):
    """
    ViewSet for SmartMeter devices.
    """

    queryset = SmartMeter.objects.all()
    serializer_class = SmartMeterSerializer

    @action(detail=False, methods=["get"], url_path="getSmartMeterLog")
    def getSmartMeterLog(self, request):
        """
        Retrieves mock SmartMeter power logs for a specific date and device.

        URL: GET /api/homes/smartmeters/getSmartMeterLog/?date=YYYY-MM-DD&device_id=<uuid>
        """
        try:
            date_str, max_intervals, is_today, device_id = _prepare_mock_log_context(request, "meter")
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        # SmartMeter uses smooth baseline + small jitter per interval
        # Pre-generate baseline power for each time-of-day zone, then add per-interval noise
        # This creates a smooth curve with realistic micro-fluctuations
        zone_baselines = {
            # (start_hour, end_hour): (base_power, jitter)
            "night":     (random.randint(60, 120), 30),
            "morning":   (random.randint(350, 600), 80),
            "daytime":   (random.randint(180, 350), 60),
            "lunch":     (random.randint(450, 750), 100),
            "afternoon": (random.randint(200, 380), 55),
            "evening":   (random.randint(600, 1200), 150),
            "latenight": (random.randint(150, 300), 50),
        }

        def _get_baseline(hour):
            if 0 <= hour <= 5:
                return zone_baselines["night"]
            elif 6 <= hour <= 8:
                return zone_baselines["morning"]
            elif 9 <= hour <= 11:
                return zone_baselines["daytime"]
            elif 12 <= hour <= 13:
                return zone_baselines["lunch"]
            elif 14 <= hour <= 16:
                return zone_baselines["afternoon"]
            elif 17 <= hour <= 21:
                return zone_baselines["evening"]
            else:
                return zone_baselines["latenight"]

        data = []
        for i in range(max_intervals):
            hour = (i * 5) // 60
            minute = (i * 5) % 60
            ts = f"{date_str}T{hour:02d}:{minute:02d}:00+07:00"

            base, jitter = _get_baseline(hour)
            power = max(20, base + random.randint(-jitter, jitter))
            onoff = True

            if is_today and i == max_intervals - 1 and device_id:
                from .models import SmartMeter
                try:
                    real_device = SmartMeter.objects.get(id=device_id)
                    onoff = real_device.is_on
                    if not onoff:
                        power = 0
                except Exception:
                    pass

            data.append({"timestamp": ts, "onoff": onoff, "power": power})

        return Response({"device_name": "SmartMeter01", "data": data})

    def perform_update(self, serializer):
        old_instance = self.get_object()
        old_is_on = old_instance.is_on

        instance = serializer.save()

        if instance.is_on != old_is_on:
            # 1. Start or Stop the periodic feed over WebSocket2Scada
            from .smartmeter import SmartmeterManager

            if instance.is_on:
                SmartmeterManager().start()
            else:
                SmartmeterManager().close()

            # 2. Forward the onoff command to SCADA hardware directly
            if instance.tag:
                value = 1 if instance.is_on else 0
                ScadaManager().send_command(f"{instance.tag}.onoff", value)


class VoiceCommandViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=["post"])
    def command(self, request):
        command_text = request.data.get("command")
        if command_text is not None and not isinstance(command_text, str):
            command_text = str(command_text)
        if not command_text:
            return Response({"error": "Command text is required."}, status=400)
        raw_execute = request.data.get("execute", True)
        if isinstance(raw_execute, bool):
            should_execute = raw_execute
        else:
            should_execute = str(raw_execute).lower() == "true"

        service = VoiceAssistantService()
        try:
            result = service.process_voice_command(
                request.user,
                command_text,
                execute=should_execute,
            )
        except Exception as e:
            logger.exception("Voice command processing failed")
            err = {"error": "Voice command processing failed."}
            if settings.DEBUG:
                err["detail"] = str(e)
            return Response(err, status=500)

        return Response(result)

    @action(detail=False, methods=["post"])
    def transcribe(self, request):
        """
        Accepts an audio file upload and transcribes it using Groq Whisper API.
        Used as a fallback for browsers that don't support Web Speech API (e.g. Meta Quest 3).
        """
        import os
        import tempfile

        audio_file = request.FILES.get("audio")
        if not audio_file:
            return Response({"error": "Audio file is required."}, status=400)

        raw_execute = request.data.get("execute", False)
        if isinstance(raw_execute, bool):
            should_execute = raw_execute
        else:
            should_execute = str(raw_execute).lower() == "true"

        try:
            from groq import Groq

            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                return Response({"error": "Groq API key not configured."}, status=500)

            client = Groq(api_key=api_key)

            # Write uploaded audio to a temp file (Groq SDK needs a file path)
            ext = os.path.splitext(audio_file.name)[1] if audio_file.name else ".webm"
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


class NPCChatViewSet(viewsets.ViewSet):
    """NPC conversational chat powered by LLM."""

    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=["post"])
    def chat(self, request):
        """
        Send a message to an NPC and get an LLM-powered response.

        Body: {"npc_id": "npc1", "message": "Hey, what's up?"}
        Returns: {"npc_id": str, "npc_name": str, "response": str, "goodbye": bool}
        """
        from .npc_chat import chat_with_npc

        npc_id = request.data.get("npc_id")
        message = request.data.get("message")
        if not npc_id or not message:
            return Response({"error": "npc_id and message are required."}, status=400)

        result = chat_with_npc(npc_id, message)
        return Response(result)

    @action(detail=False, methods=["post"])
    def reset(self, request):
        """
        Reset conversation history for an NPC.

        Body: {"npc_id": "npc1"}
        """
        from .npc_chat import reset_history

        npc_id = request.data.get("npc_id")
        if not npc_id:
            return Response({"error": "npc_id is required."}, status=400)

        reset_history(npc_id)
        return Response({"status": "reset", "npc_id": npc_id})

    @action(detail=False, methods=["post"])
    def greeting(self, request):
        """
        Get an instant greeting for an NPC (no LLM call).

        Body: {"npc_id": "npc1"}
        """
        from .npc_chat import get_greeting

        npc_id = request.data.get("npc_id")
        if not npc_id:
            return Response({"error": "npc_id is required."}, status=400)

        greeting_text = get_greeting(npc_id)
        return Response({"npc_id": npc_id, "greeting": greeting_text})

    @action(detail=False, methods=["post"])
    def farewell(self, request):
        """
        Get an instant farewell for an NPC (no LLM call).

        Body: {"npc_id": "npc1"}
        """
        from .npc_chat import get_farewell, reset_history

        npc_id = request.data.get("npc_id")
        if not npc_id:
            return Response({"error": "npc_id is required."}, status=400)

        farewell_text = get_farewell(npc_id)
        reset_history(npc_id)
        return Response({"npc_id": npc_id, "farewell": farewell_text})


ALLOWED_SCRIPT_ACTION_TYPES = frozenset({"walk", "wait", "idle", "wave", "sit"})


def _normalize_avatar_script_data(script_data):
    if isinstance(script_data, dict) and "actions" in script_data:
        script_data = script_data["actions"]
    if not isinstance(script_data, list):
        return None, "Script must be a JSON array of actions (or an object with an 'actions' array)."
    for i, action in enumerate(script_data):
        if not isinstance(action, dict):
            return None, f"Action at index {i} must be an object."
        t = action.get("type")
        if t not in ALLOWED_SCRIPT_ACTION_TYPES:
            return (
                None,
                f"Action at index {i} has invalid type '{t}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_SCRIPT_ACTION_TYPES))}.",
            )
    return script_data, None


class AvatarScriptViewSet(viewsets.ModelViewSet):
    """
    List / create / delete behavior scripts for avatars in a room.

    POST (multipart): room, avatar_id, avatar_name, avatar_type, file (.json/.txt)
    GET: ?room=<uuid> lists scripts for that room.
    """

    serializer_class = AvatarScriptSerializer
    permission_classes = [permissions.IsAuthenticated, IsHomeOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = AvatarScript.objects.filter(room__home__user=self.request.user)
        room_id = self.request.query_params.get("room")
        if room_id:
            qs = qs.filter(room_id=room_id)
        return qs.order_by("avatar_id")

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx

    def create(self, request, *args, **kwargs):
        room_id = request.data.get("room")
        avatar_id = (request.data.get("avatar_id") or "").strip()
        avatar_name = (request.data.get("avatar_name") or "").strip() or avatar_id
        avatar_type = (request.data.get("avatar_type") or "npc").strip()
        if avatar_type not in ("npc", "robot"):
            return Response({"error": "avatar_type must be 'npc' or 'robot'"}, status=400)
        if not room_id or not avatar_id:
            return Response({"error": "room and avatar_id are required"}, status=400)

        room = Room.objects.filter(pk=room_id, home__user=request.user).first()
        if not room:
            return Response({"error": "Room not found"}, status=404)

        script_data = None
        raw_json = request.data.get("script_data")
        if raw_json not in (None, ""):
            if isinstance(raw_json, str):
                try:
                    script_data = json.loads(raw_json)
                except json.JSONDecodeError as e:
                    return Response({"error": f"Invalid script_data JSON: {e}"}, status=400)
            else:
                script_data = raw_json

        upload = request.FILES.get("file")
        if upload is not None:
            try:
                text = upload.read().decode("utf-8")
            except UnicodeDecodeError:
                return Response({"error": "Script file must be UTF-8 text"}, status=400)
            try:
                script_data = json.loads(text)
            except json.JSONDecodeError as e:
                return Response({"error": f"Invalid script file JSON: {e}"}, status=400)

        if script_data is None:
            return Response({"error": "Provide script_data or a JSON/TXT file"}, status=400)

        script_data, err = _normalize_avatar_script_data(script_data)
        if err:
            return Response({"error": err}, status=400)

        obj, created = AvatarScript.objects.update_or_create(
            room=room,
            avatar_id=avatar_id,
            defaults={
                "avatar_name": avatar_name,
                "avatar_type": avatar_type,
                "script_data": script_data,
            },
        )
        if upload is not None:
            upload.seek(0)
            obj.script_file = upload
            obj.save()

        out = AvatarScriptSerializer(obj, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


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
        device = serializer.validated_data["device"]
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
