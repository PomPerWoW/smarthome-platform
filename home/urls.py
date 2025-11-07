from django.urls import path
from . import views


urlpatterns = [
    # view DB    
    path('homes/all/', views.HomeFullDataView.as_view(), name='home-full-data'),

    # Homes
    path('homes/', views.HomeListCreateView.as_view(), name='home-list-create'),
    path('homes/<uuid:home_id>/', views.HomeDetailView.as_view(), name='home-detail'),

    # Floors
    path('homes/<uuid:home_id>/floors/', views.FloorListCreateView.as_view(), name='floor-list-create'),
    path('homes/<uuid:home_id>/floors/<uuid:floor_id>/', views.FloorDetailView.as_view(), name='floor-detail'),

    # Rooms
    path('homes/<uuid:home_id>/floors/<uuid:floor_id>/rooms/', views.RoomListCreateView.as_view(), name='room-list-create'),
    path('homes/<uuid:home_id>/floors/<uuid:floor_id>/rooms/<uuid:room_id>/', views.RoomDetailView.as_view(), name='room-detail'),

    # Devices
    path('homes/<uuid:home_id>/floors/<uuid:floor_id>/rooms/<uuid:room_id>/devices/', views.DeviceListCreateView.as_view(), name='device-list-create'),
    path('homes/<uuid:home_id>/floors/<uuid:floor_id>/rooms/<uuid:room_id>/devices/<uuid:device_id>/', views.DeviceDetailView.as_view(), name='device-detail'),

    # Device actions
    path('devices/<uuid:device_id>/toggle/', views.DeviceTogglePowerView.as_view(), name='device-toggle'),
    path('devices/<uuid:device_id>/position/', views.DevicePositionView.as_view(), name='device-position'),

    # Device-type specific set/get
    path('devices/<uuid:device_id>/lightbulb/', views.LightbulbControlView.as_view(), name='lightbulb-control'),
    path('devices/<uuid:device_id>/television/', views.TelevisionControlView.as_view(), name='television-control'),
    path('devices/<uuid:device_id>/fan/', views.FanControlView.as_view(), name='fan-control'),
    path('devices/<uuid:device_id>/air-conditioner/', views.AirConditionerControlView.as_view(), name='ac-control'),
]
