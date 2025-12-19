from django.contrib import admin
from .models import PositionHistory, UserHome

@admin.register(PositionHistory)
class PositionHistoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'device_id', 'recorded_at')
    list_filter = ('recorded_at',)
    search_fields = ('device_id',)
    readonly_fields = ('id', 'recorded_at')


@admin.register(UserHome)
class UserHomeAdmin(admin.ModelAdmin):
    list_display = ('user', 'home_id', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__email', 'user__username', 'home_id')
    readonly_fields = ('created_at',)
