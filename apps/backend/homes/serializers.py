from rest_framework import serializers
from .models import *

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
    class Meta:
        model = Room
        fields = '__all__'

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
            
        return super().to_representation(instance)

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