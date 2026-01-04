from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    HomeViewSet, RoomViewSet, DeviceViewSet, 
    AirConditionerViewSet, FanViewSet, LightbulbViewSet, TelevisionViewSet
)

# The Router automatically creates the URL list for ViewSets
router = DefaultRouter()
router.register(r'homes', HomeViewSet)
router.register(r'rooms', RoomViewSet)
router.register(r'devices', DeviceViewSet)
router.register(r'acs', AirConditionerViewSet)
router.register(r'fans', FanViewSet)
router.register(r'lightbulbs', LightbulbViewSet)
router.register(r'tvs', TelevisionViewSet)

urlpatterns = [
    # This includes all the router-generated URLs
    path('', include(router.urls)),
]