from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token

class AccountsTests(APITestCase):
    def test_register_user(self):
        """Test successful user registration"""
        url = reverse('register')
        data = {
            'email': 'testuser@example.com',
            'password': 'testpassword123',
            'password_confirm': 'testpassword123'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(User.objects.get().email, 'testuser@example.com')
        # Check if auth_token cookie is set
        self.assertIn('auth_token', response.cookies)

    def test_register_password_mismatch(self):
        """Test registration failure when passwords do not match"""
        url = reverse('register')
        data = {
            'email': 'testuser@example.com',
            'password': 'testpassword123',
            'password_confirm': 'differentpassword'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_duplicate_email(self):
        """Test registration failure with duplicate email"""
        User.objects.create_user(username='test@example.com', email='test@example.com', password='oldpassword')
        url = reverse('register')
        data = {
            'email': 'test@example.com',
            'password': 'newpassword123',
            'password_confirm': 'newpassword123'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_user(self):
        """Test successful user login"""
        User.objects.create_user(username='test@example.com', email='test@example.com', password='testpassword123')
        url = reverse('login')
        data = {
            'email': 'test@example.com',
            'password': 'testpassword123'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertIn('auth_token', response.cookies)

    def test_login_invalid_credentials(self):
        """Test login failure with wrong password"""
        User.objects.create_user(username='test@example.com', email='test@example.com', password='testpassword123')
        url = reverse('login')
        data = {
            'email': 'test@example.com',
            'password': 'wrongpassword'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_whoami_authenticated(self):
        """Test whoami endpoint for authenticated user"""
        user = User.objects.create_user(username='test@example.com', email='test@example.com', password='testpassword123')
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)
        
        url = reverse('whoami')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['authenticated'])
        self.assertEqual(response.data['user']['email'], 'test@example.com')

    def test_whoami_unauthenticated(self):
        """Test whoami endpoint for unauthenticated user"""
        url = reverse('whoami')
        response = self.client.get(url)
        # Note: Depending on renderer, this might be 401 or 403 depending on settings
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout(self):
        """Test logout clears token and cookie"""
        user = User.objects.create_user(username='test@example.com', email='test@example.com', password='testpassword123')
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)
        
        url = reverse('logout')
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Token should be deleted
        self.assertFalse(Token.objects.filter(key=token.key).exists())
        # Cookie should be cleared (value empty)
        self.assertEqual(response.cookies['auth_token'].value, '')
