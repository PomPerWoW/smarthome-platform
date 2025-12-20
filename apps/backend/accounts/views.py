from django.conf import settings
from django.contrib.auth import login
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .serializers import UserLoginSerializer, UserRegistrationSerializer, UserSerializer


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def register(request):
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        token, created = Token.objects.get_or_create(user=user)
        user_data = UserSerializer(user).data

        return Response(
            {
                "message": "User registered successfully",
                "user": user_data,
                "token": token.key,
            },
            status=status.HTTP_201_CREATED,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login_view(request):
    serializer = UserLoginSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data["user"]
        token, created = Token.objects.get_or_create(user=user)
        user_data = UserSerializer(user).data

        login(request, user)

        response = Response(
            {"message": "Login successful", "user": user_data, "token": token.key},
            status=status.HTTP_200_OK,
        )

        response.set_cookie(
            key="auth_token",
            value=token.key,
            max_age=86400 * 7,
            httponly=True,
            secure=not settings.DEBUG,
            samesite="Lax",
            path="/",
        )

        return response

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def whoami(request):
    user_data = UserSerializer(request.user).data
    token = request.auth.key if hasattr(request.auth, "key") else str(request.auth)

    return Response(
        {"authenticated": True, "user": user_data, "token": token},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    if request.auth:
        request.auth.delete()

    response = Response(
        {"message": "Logout successful"},
        status=status.HTTP_200_OK,
    )

    response.delete_cookie(
        key="auth_token",
        path="/",
        samesite="Lax",
    )

    return response
