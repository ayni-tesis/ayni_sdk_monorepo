import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:flutter/material.dart';

void main() => runApp(const AyniExampleApp());

class AyniExampleApp extends StatelessWidget {
  const AyniExampleApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'ayni_sdk',
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal)),
    home: Scaffold(
      appBar: AppBar(title: const Text('ayni_sdk')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_outline, size: 40),
            const SizedBox(height: 12),
            const Text('Dependencias resueltas.'),
            Text('API pública disponible: ${InitializationStatus.ready.name}'),
          ],
        ),
      ),
    ),
  );
}
