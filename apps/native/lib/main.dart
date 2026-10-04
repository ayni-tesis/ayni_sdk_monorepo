import 'package:flutter/material.dart';

import 'validation/screens/validation_home_page.dart';

void main() => runApp(const BetterFullstackApp());

class BetterFullstackApp extends StatelessWidget {
  const BetterFullstackApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ayni · validación',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF175C4B)),
      ),
      home: const ValidationHomePage(),
    );
  }
}
