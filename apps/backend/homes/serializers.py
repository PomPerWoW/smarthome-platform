from rest_framework import serializers
from .models import *

# --- 1. Base Logic (Shared by all) ---
class DeviceBaseSerializer(serializers.ModelSerializer):
    """
    Handles common logic:
    1. device_pos -> {"x":..., "y":..., "z":...}
    2. type -> "AirConditioner" (Class Name)
    3. room -> "Living Room" (Name instead of UUID)
    """
    device_pos = serializers.SerializerMethodField()
    type = serializers.SerializerMethodField()  # <--- NEW FIELD

    def get_device_pos(self, obj):
        if obj.device_pos:
            return {"x": obj.device_pos.x, "y": obj.device_pos.y, "z": obj.device_pos.z}
        return {"x": None, "y": None, "z": None}

    def get_type(self, obj):
        # Returns the class name, e.g., "AirConditioner", "Fan", "Device"
        return obj.__class__.__name__

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Swap UUID for Room Name string when reading
        if instance.room:
            data['room'] = instance.room.room_name
        return data


# --- 2. Standard Container Serializers ---

class HomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Home
        fields = '__all__'

class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = '__all__'

class PositionHistorySerializer(DeviceBaseSerializer):
    # Inherits 'type' and 'device_pos' logic automatically
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.UUIDField(source='device.id', read_only=True)
    
    # Override 'point' to use the base 'get_device_pos' style logic if needed
    point = serializers.SerializerMethodField()

    class Meta:
        model = PositionHistory
        fields = ['id', 'type', 'device_id', 'device_name', 'point', 'timestamp']

    def get_point(self, obj):
        if obj.point:
            return {"x": obj.point.x, "y": obj.point.y, "z": obj.point.z}
        return {"x": None, "y": None, "z": None}


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


# --- 4. The Polymorphic "Smart" Serializer ---

class DeviceSerializer(DeviceBaseSerializer):
    class Meta:
        model = Device
        fields = '__all__'

    def to_representation(self, instance):
        """
        Check if the generic 'Device' is actually a specific child type.
        """
        if hasattr(instance, 'airconditioner'):
            return AirConditionerSerializer(instance.airconditioner).data
        
        elif hasattr(instance, 'fan'):
            return FanSerializer(instance.fan).data
        
        elif hasattr(instance, 'lightbulb'):
            return LightbulbSerializer(instance.lightbulb).data
        
        elif hasattr(instance, 'television'):
            return TelevisionSerializer(instance.television).data
            
        return super().to_representation(instance)