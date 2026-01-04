from rest_framework import serializers
from .models import *

# --- 1. Base Serializer (Handles Custom Logic) ---
class DeviceBaseSerializer(serializers.ModelSerializer):
    """
    This base class handles:
    1. Formatting device_pos as {"x":..., "y":..., "z":...}
    2. Swapping 'room' UUID with 'room_name' string in the response
    """
    device_pos = serializers.SerializerMethodField()

    def get_device_pos(self, obj):
        if obj.device_pos:
            return {
                "x": obj.device_pos.x, 
                "y": obj.device_pos.y, 
                "z": obj.device_pos.z
            }
        return {"x": None, "y": None, "z": None}

    def to_representation(self, instance):
        # 1. Generate the default JSON data
        data = super().to_representation(instance)
        
        # 2. OVERRIDE: Swap the 'room' UUID for the actual Room Name
        if instance.room:
            data['room'] = instance.room.room_name
        
        return data


# --- 2. Standard Serializers ---

class HomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Home
        fields = '__all__'

class RoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = '__all__'

class PositionHistorySerializer(serializers.ModelSerializer):
    # 1. Custom format for the coordinate point
    point = serializers.SerializerMethodField()
    
    # 2. Fetch details from the related 'device'
    device_name = serializers.CharField(source='device.device_name', read_only=True)
    device_id = serializers.UUIDField(source='device.id', read_only=True)

    class Meta:
        model = PositionHistory
        # Explicitly list fields to ensure readable order
        fields = ['id', 'device_id', 'device_name', 'point', 'timestamp']

    def get_point(self, obj):
        # Return structured JSON for coordinates
        if obj.point:
            return {
                "x": obj.point.x, 
                "y": obj.point.y, 
                "z": obj.point.z
            }
        # Return strict null structure if not found
        return {"x": None, "y": None, "z": None}


# --- 3. Device Serializers (Inherit from Base) ---

class DeviceSerializer(DeviceBaseSerializer):
    class Meta:
        model = Device
        fields = '__all__'

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