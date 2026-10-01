import 'dart:io';

import 'package:ayni_sdk/ayni_sdk.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

void main() => runApp(const AyniExampleApp());

class AyniExampleApp extends StatelessWidget {
  const AyniExampleApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'ayni_sdk',
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal)),
    home: const AyniIntegrationPage(),
  );
}

class AyniIntegrationPage extends StatefulWidget {
  const AyniIntegrationPage({super.key});

  @override
  State<AyniIntegrationPage> createState() => _AyniIntegrationPageState();
}

class _AyniIntegrationPageState extends State<AyniIntegrationPage> {
  final _credential = TextEditingController();
  final _serverUrl = TextEditingController();
  final _workflowId = TextEditingController();
  final _picker = ImagePicker();
  AyniSdk? _sdk;
  XFile? _image;
  List<String> _outputs = const [];
  String? _message;
  bool _synced = false;
  bool _working = false;

  @override
  void dispose() {
    _credential.dispose();
    _serverUrl.dispose();
    _workflowId.dispose();
    super.dispose();
  }

  Future<void> _initialize() async {
    final serverUrl = Uri.tryParse(_serverUrl.text.trim());
    final credential = _credential.text.trim();
    if (serverUrl == null || credential.isEmpty) return;

    setState(() {
      _working = true;
      _message = null;
      _sdk = null;
      _image = null;
      _synced = false;
      _outputs = const [];
    });
    try {
      final storageDirectory = await Directory.systemTemp.createTemp(
        'ayni-sdk-example-',
      );
      final result = AyniSdk.initialize(
        AyniConfig(
          serverUrl: serverUrl,
          credential: credential,
          storageDirectory: storageDirectory,
          allowInsecureLoopback: true,
        ),
      );
      if (!mounted) return;
      if (result.isReady) {
        setState(() {
          _sdk = result.sdk;
          _message = 'SDK inicializado';
        });
      } else {
        setState(() {
          _message = 'No se pudo inicializar (${result.status.name}).';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _message = 'No se pudo inicializar. Revisa la configuración.';
        });
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _sync() async {
    final sdk = _sdk;
    if (sdk == null) return;
    setState(() {
      _working = true;
      _synced = false;
      _outputs = const [];
    });
    try {
      final result = await sdk.sync();
      if (!mounted) return;
      final succeeded =
          result.status == SyncStatus.updated ||
          result.status == SyncStatus.upToDate;
      setState(() {
        _synced = succeeded;
        _message = switch (result.status) {
          SyncStatus.updated ||
          SyncStatus.upToDate => 'Sincronización completada',
          SyncStatus.offline => 'Sin conexión. Verifica el endpoint.',
          SyncStatus.error =>
            'No se pudo sincronizar. Verifica el endpoint y los permisos.',
        };
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _message = 'No se pudo sincronizar. Verifica el endpoint.';
        });
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _pickImage() async {
    try {
      final image = await _picker.pickImage(source: ImageSource.gallery);
      if (mounted && image != null) setState(() => _image = image);
    } catch (_) {
      if (mounted) {
        setState(() => _message = 'No se pudo seleccionar la imagen.');
      }
    }
  }

  Future<void> _runWorkflow() async {
    final sdk = _sdk;
    final image = _image;
    final workflowId = _workflowId.text.trim();
    if (sdk == null || image == null || !_synced || workflowId.isEmpty) return;

    setState(() {
      _working = true;
      _outputs = const [];
    });
    try {
      final result = await sdk.run(workflowId, await image.readAsBytes());
      if (mounted) {
        setState(() {
          _outputs = _describeOutputs(result);
          _message = 'Ejecución completada';
        });
      }
    } on WorkflowError catch (error) {
      if (mounted) {
        setState(() {
          _message =
              'No se pudo ejecutar el workflow (${error.category.name}).';
        });
      }
    } on UnsupportedError {
      if (mounted) {
        setState(() => _message = 'Esta plataforma no es compatible.');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _message = 'No se pudo ejecutar el workflow.');
      }
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  List<String> _describeOutputs(WorkflowResult result) => [
    for (final MapEntry(key: name, value: value) in result.outputs.entries)
      switch (value) {
        ClassificationResult(:final label, :final confidence) =>
          '$name: $label (${confidence.toStringAsFixed(2)})',
        DetectionResult(:final detections) =>
          '$name: ${detections.length} objetos',
        CombinedWorkflowResult(:final values) =>
          '$name: ${values.length} resultados',
        BooleanResult(value: final passed) => '$name: $passed',
      },
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('ayni_sdk')),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Configura tu credencial y endpoint de prueba antes de ejecutar.',
          ),
          const SizedBox(height: 20),
          TextField(
            key: const Key('credential-field'),
            controller: _credential,
            obscureText: true,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(
              labelText: 'Credencial de prueba',
              helperText: 'No se guarda. No uses credenciales de producción.',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _serverUrl,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: const InputDecoration(
              labelText: 'Endpoint de prueba',
              hintText: 'https://servidor-de-prueba.example',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _working ? null : _initialize,
            icon: const Icon(Icons.power_settings_new),
            label: const Text('Inicializar SDK'),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _working || _sdk == null ? null : _sync,
            icon: const Icon(Icons.sync),
            label: const Text('Sincronizar'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _workflowId,
            decoration: const InputDecoration(
              labelText: 'ID del workflow publicado',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _working ? null : _pickImage,
            icon: const Icon(Icons.photo_library_outlined),
            label: Text(
              _image == null ? 'Seleccionar imagen' : 'Cambiar imagen',
            ),
          ),
          if (_image != null) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(
                File(_image!.path),
                height: 220,
                fit: BoxFit.contain,
              ),
            ),
          ],
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _working || _sdk == null || !_synced || _image == null
                ? null
                : _runWorkflow,
            icon: const Icon(Icons.play_arrow),
            label: const Text('Ejecutar workflow'),
          ),
          if (_working) ...[
            const SizedBox(height: 16),
            const LinearProgressIndicator(),
          ],
          if (_message != null) ...[
            const SizedBox(height: 16),
            Text(_message!, key: const Key('status-message')),
          ],
          if (_outputs.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('Resultado del workflow'),
            for (final output in _outputs) Text(output),
          ],
        ],
      ),
    ),
  );
}
