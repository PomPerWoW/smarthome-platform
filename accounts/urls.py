from django.urls import path

from . import views

urlpatterns = [
    path("register/", views.register, name="register"),
    path("login/", views.login_view, name="login"),
    path("whoami/", views.whoami, name="whoami"),
    path("scene-creator-url/", views.get_scene_creator_url, name="scene_creator_url"),
]
