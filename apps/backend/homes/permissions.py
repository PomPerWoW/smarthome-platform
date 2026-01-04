from rest_framework import permissions

class IsHomeOwner(permissions.BasePermission):
    """
    Custom permission to only allow owners of the Home (or related objects) to view or edit them.
    """

    def has_object_permission(self, request, view, obj):
        # Check permission based on model type
        
        # 1. If it's a HOME object, check user directly
        if hasattr(obj, 'user'):
            return obj.user == request.user
            
        # 2. If it's a ROOM object, check the home's user
        if hasattr(obj, 'home'):
            return obj.home.user == request.user

        # 3. If it's a DEVICE object, check room -> home -> user
        if hasattr(obj, 'room') and obj.room:
             return obj.room.home.user == request.user
             
        # Block access if relationship chain is broken (e.g. device has no room)
        return False