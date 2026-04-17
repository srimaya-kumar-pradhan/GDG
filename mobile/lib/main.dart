/// VenueFlow AI — Production Entry Point
/// Smart venue navigation for Indian sporting events (IPL/ISL/PKL)
///
/// Architecture:
///   main.dart → HomeScreen → RecommendationSection (Provider + API)
///                              ↓
///                    ApiService → FastAPI Backend → Rule Engine + Gemini

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const VenueFlowApp());
}

class VenueFlowApp extends StatelessWidget {
  const VenueFlowApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VenueFlow AI',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF080C14),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF3B82F6),
          secondary: Color(0xFF8B5CF6),
          surface: Color(0xFF0F172A),
        ),
        textTheme: GoogleFonts.interTextTheme(
          ThemeData.dark().textTheme,
        ),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
