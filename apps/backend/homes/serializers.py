from rest_framework import serializers
from .models import (
    Automation, AvatarScript, Device, Fan, Furniture, Home, Lightbulb, 
    PositionHistory, Room, SmartMeter, Television, AirConditioner
)

# --- 1. Base Logic (Shared by all) ---
class DeviceBaseSerializer(serializers.ModelSerializer):
    device_pos = serializers.SerializerMethodField()
    device_rotation = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()

    def get_device_pos(self, obj):
        if obj.device_pos:
            return {"x": obj.device_pos.x, "y": obj.device_pos.y, "z": obj.device_pos.z}
        return {"x": None, "y": None, "z": None}

    def get_device_rotation(self, obj):
        return {"x": obj.rotation_x, "y": obj.rotation_y, "z": obj.rotation_z}

    def get_type(self, obj):
        return obj.__class__.__name__

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.room:
            data['room'] = instance.room.room_name
        return data


# --- 2. Standard Container Serializers ---

class HomeSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Home
        fields = '__all__'

class RoomSerializer(serializers.ModelSerializer):
    position = serializers.SerializerMethodField()
    rotation = serializers.SerializerMethodField()
    room_model_file_url = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = ['id', 'home', 'room_name', 'room_model', 'room_model_file_url', 'position', 'rotation']
    
    def get_room_model_file_url(self, obj):
        """Return the URL of the uploaded room model file if it exists"""
        if obj.room_model_file:
            request = self.context.get('request')
            if request:
                # Check if this is a ZIP-extracted model (has .main_gltf reference file)
                from django.conf import settings
                import os
                room_model_dir = os.path.join(settings.MEDIA_ROOT, 'room_models', str(obj.id))
                reference_file = os.path.join(room_model_dir, '.main_gltf')
                
                if os.path.exists(reference_file):
                    # Read the relative path from the reference file
                    with open(reference_file, 'r') as f:
                        relative_path = f.read().strip()
                    # Build URL to the extracted file
                    main_file_url = f"{settings.MEDIA_URL}room_models/{obj.id}/{relative_path}"
                    return request.build_absolute_uri(main_file_url)
                else:
                    # Single file upload, use the FileField URL
                    return request.build_absolute_uri(obj.room_model_file.url)
        return None

    def get_position(self, obj):
        return {"x": obj.position_x, "y": obj.position_y, "z": obj.position_z}

    def get_rotation(self, obj):
        return {"y": obj.rotation_y}

class PositionHistorySerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.UUIDField(source='device.id', read_only=True)
    point = serializers.SerializerMethodField()
    rotation = serializers.SerializerMethodField()

    class Meta:
        model = PositionHistory
        fields = ['id', 'device_id', 'device_name', 'point', 'rotation', 'timestamp']

    def get_point(self, obj):
        if obj.point:
            return {"x": obj.point.x, "y": obj.point.y, "z": obj.point.z}
        return {"x": None, "y": None, "z": None}

    def get_rotation(self, obj):
        return {"x": obj.rotation_x, "y": obj.rotation_y, "z": obj.rotation_z}


# --- 3. Specific Device Serializers ---

class AirConditionerSerializer(DeviceBaseSerializer):
    class Meta:
        model = AirConditioner
        fields = '__all__'

class FanSerializer(DeviceBaseSerializer):
    class Meta:
        model = Fan
        fields = '__all__'

class LightbulbSerializer(DeviceBaseSerializer):
    class Meta:
        model = Lightbulb
        fields = '__all__'

class TelevisionSerializer(DeviceBaseSerializer):
    class Meta:
        model = Television
        fields = '__all__'

class SmartMeterSerializer(DeviceBaseSerializer):
    class Meta:
        model = SmartMeter
        fields = '__all__'

# --- 4. The Polymorphic "Smart" Serializer ---

class DeviceSerializer(DeviceBaseSerializer):
    class Meta:
        model = Device
        fields = '__all__'

    def to_representation(self, instance):
        if hasattr(instance, 'airconditioner'):
            return AirConditionerSerializer(instance.airconditioner).data
        
        elif hasattr(instance, 'fan'):
            return FanSerializer(instance.fan).data
        
        elif hasattr(instance, 'lightbulb'):
            return LightbulbSerializer(instance.lightbulb).data
        
        elif hasattr(instance, 'television'):
            return TelevisionSerializer(instance.television).data
            
        elif hasattr(instance, 'smartmeter'):
            return SmartMeterSerializer(instance.smartmeter).data
            
        return super().to_representation(instance)


# --- 5. Furniture Serializer ---

class FurnitureSerializer(serializers.ModelSerializer):
    device_pos = serializers.SerializerMethodField()
    device_rotation = serializers.SerializerMethodField()

    class Meta:
        model = Furniture
        fields = '__all__'

    def get_device_pos(self, obj):
        if obj.device_pos:
            return {"x": obj.device_pos.x, "y": obj.device_pos.y, "z": obj.device_pos.z}
        return {"x": None, "y": None, "z": None}

    def get_device_rotation(self, obj):
        return {"x": obj.rotation_x, "y": obj.rotation_y, "z": obj.rotation_z}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.room:
            data['room'] = instance.room.room_name

        return data

        
class AvatarScriptSerializer(serializers.ModelSerializer):
    script_file_url = serializers.SerializerMethodField()

    class Meta:
        model = AvatarScript
        fields = [
            "id",
            "room",
            "avatar_id",
            "avatar_name",
            "avatar_type",
            "script_data",
            "script_file_url",
            "updated_at",
        ]
        read_only_fields = ["id", "script_file_url", "updated_at"]

    def get_script_file_url(self, obj):
        if not obj.script_file:
            return None
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.script_file.url)
        return obj.script_file.url


class AutomationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Automation
        fields = '__all__'

    def validate_time(self, value):
        """
        Adjust input time from GMT+7 to UTC (System Time).
        Subtracts 7 hours from the provided time.
        """
        if value is None:
            return None
        
        from datetime import datetime, timedelta, date
        
        dummy_dt = datetime.combine(date.today(), value)
        adjusted_dt = dummy_dt - timedelta(hours=7)
        
        return adjusted_dt.time()

    def to_representation(self, instance):
        """
        Adjust output time from UTC (System Time) to GMT+7.
        Adds 7 hours to the stored time.
        """
        data = super().to_representation(instance)
        
        if instance.time:
            from datetime import datetime, timedelta, date
            dummy_dt = datetime.combine(date.today(), instance.time)
            adjusted_dt = dummy_dt + timedelta(hours=7)
            data['time'] = adjusted_dt.time()
            
        return data