from rest_framework import serializers


class HomeSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()


class FloorSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    number = serializers.IntegerField()


class RoomSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()


class DeviceSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    type = serializers.CharField(read_only=True)
    is_on = serializers.BooleanField(read_only=True)
    position = serializers.ListField(child=serializers.FloatField(), allow_null=True, required=False)


class LightbulbSerializer(DeviceSerializer):
    brightness = serializers.IntegerField(required=False)
    colour = serializers.CharField(required=False)


class TelevisionSerializer(DeviceSerializer):
    volume = serializers.IntegerField(required=False)
    channel = serializers.IntegerField(required=False)


class FanSerializer(DeviceSerializer):
    speed = serializers.IntegerField(required=False)
    swing = serializers.BooleanField(required=False)


class AirConditionerSerializer(DeviceSerializer):
    temperature = serializers.IntegerField(required=False)


class SetPositionSerializer(serializers.Serializer):
    lon = serializers.FloatField()
    lat = serializers.FloatField()
    alt = serializers.FloatField(required=False, allow_null=True)


class TogglePowerSerializer(serializers.Serializer):
    on = serializers.BooleanField(required=False)


class LightbulbSetSerializer(serializers.Serializer):
    brightness = serializers.IntegerField(required=False)
    colour = serializers.CharField(required=False)


class TelevisionSetSerializer(serializers.Serializer):
    volume = serializers.IntegerField(required=False)
    channel = serializers.IntegerField(required=False)


class FanSetSerializer(serializers.Serializer):
    speed = serializers.IntegerField(required=False)
    swing = serializers.BooleanField(required=False)


class AirConditionerSetSerializer(serializers.Serializer):
    temperature = serializers.IntegerField(required=False)


