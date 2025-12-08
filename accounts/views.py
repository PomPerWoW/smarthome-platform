from django.conf import settings
from django.contrib.auth import login
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .serializers import UserLoginSerializer, UserRegistrationSerializer, UserSerializer


@api_view(["POST"])
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
            httponly=False,
            secure=not settings.DEBUG,
            samesite="None" if not settings.DEBUG else "Lax",
            domain=None,
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_scene_creator_url(request):
    token = request.auth.key if hasattr(request.auth, "key") else str(request.auth)

    scene_creator_host = getattr(
        settings, "SCENE_CREATOR_URL", "https://localhost:3003"
    )

    url_with_token = f"{scene_creator_host}/?token={token}"

    return Response(
        {
            "scene_creator_url": url_with_token,
            "instructions": [
                "Open this URL on your XR device (Meta Quest, etc.)",
                "The token is embedded in the URL for authentication",
                "Bookmark this URL for easy access",
            ],
        },
        status=status.HTTP_200_OK,
    )
