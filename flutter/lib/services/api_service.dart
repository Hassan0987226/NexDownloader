import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  final String baseUrl;
  final String? token;
  ApiService({String? baseUrl, this.token}) : baseUrl = baseUrl ?? const String.fromEnvironment('API_BASE_URL', defaultValue: 'http://127.0.0.1:8000');
  Map<String,String> get headers => {'Content-Type':'application/json', if(token!=null) 'Authorization':'Bearer $token'};
  Future<Map<String,dynamic>> post(String path, Map<String,dynamic> body) async { final r=await http.post(Uri.parse('$baseUrl$path'),headers:headers,body:jsonEncode(body)); final j=jsonDecode(r.body); if(r.statusCode>=400) throw Exception(j['detail'] ?? 'Request failed'); return j; }
  Future<Map<String,dynamic>> get(String path) async { final r=await http.get(Uri.parse('$baseUrl$path'),headers:headers); final j=jsonDecode(r.body); if(r.statusCode>=400) throw Exception(j['detail'] ?? 'Request failed'); return j; }
}
