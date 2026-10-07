import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';
class AuthService {
  Future<void> saveToken(String t) async => (await SharedPreferences.getInstance()).setString('token',t);
  Future<String?> token() async => (await SharedPreferences.getInstance()).getString('token');
  Future<void> logout() async => (await SharedPreferences.getInstance()).remove('token');
  Future<String> login(String email,String password) async { final r=await ApiService().post('/auth/login',{'email':email,'password':password}); await saveToken(r['access_token']); return r['access_token']; }
  Future<String> register(String email,String password) async { final r=await ApiService().post('/auth/register',{'email':email,'password':password}); await saveToken(r['access_token']); return r['access_token']; }
}
