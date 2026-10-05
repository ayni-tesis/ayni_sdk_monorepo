import 'package:flutter/material.dart';

import 'validation/screens/validation_home_page.dart';
import 'validation/validation_lab_launch.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  final route = WidgetsBinding.instance.platformDispatcher.defaultRouteName;
  runApp(BetterFullstackApp(labLaunch: ValidationLabLaunch.parseRoute(route)));
}

class BetterFullstackApp extends StatelessWidget {
  const BetterFullstackApp({super.key, this.runtime, this.labLaunch});

  final ValidationHomeRuntime? runtime;
  final ValidationLabLaunch? labLaunch;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ayni · validación',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF175C4B)),
      ),
      home: ValidationHomePage(runtime: runtime, labLaunch: labLaunch),
    );
  }
}
