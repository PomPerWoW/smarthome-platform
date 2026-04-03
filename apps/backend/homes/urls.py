from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    HomeViewSet, RoomViewSet, DeviceViewSet,
    AirConditionerViewSet, FanViewSet, LightbulbViewSet, TelevisionViewSet,
    FurnitureViewSet,
    VoiceCommandViewSet,
    NPCChatViewSet,
    AutomationViewSet,
    AvatarScriptViewSet,
    SmartMeterViewSet,
)

router = DefaultRouter()
router.register(r'homes', HomeViewSet, basename='home')
router.register(r'rooms', RoomViewSet, basename='room')
router.register(r'devices', DeviceViewSet, basename='device')
router.register(r'acs', AirConditionerViewSet, basename='airconditioner')
router.register(r'fans', FanViewSet, basename='fan')
router.register(r'lightbulbs', LightbulbViewSet, basename='lightbulb')
router.register(r'tvs', TelevisionViewSet, basename='television')
router.register(r'furniture', FurnitureViewSet, basename='furniture')
router.register(r'smartmeters', SmartMeterViewSet, basename='smartmeter')
router.register(r'voice', VoiceCommandViewSet, basename='voice')
router.register(r'npc-chat', NPCChatViewSet, basename='npc-chat')
router.register(r'automations', AutomationViewSet, basename='automation')
router.register(r'avatar-scripts', AvatarScriptViewSet, basename='avatar-script')

urlpatterns = [
    path('', include(router.urls)),
]