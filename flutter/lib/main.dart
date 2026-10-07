import 'package:flutter/material.dart';
import 'screens/home_screen.dart';
void main()=>runApp(const NexDownloaderApp());
class NexDownloaderApp extends StatelessWidget{const NexDownloaderApp({super.key});@override Widget build(BuildContext c)=>MaterialApp(debugShowCheckedModeBanner:false,title:'NexDownloader',theme:ThemeData(brightness:Brightness.dark,useMaterial3:true),home:const HomeScreen());}
