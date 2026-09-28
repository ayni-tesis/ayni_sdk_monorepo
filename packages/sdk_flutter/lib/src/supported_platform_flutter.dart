import 'dart:io';

import 'package:flutter/foundation.dart';

/// Whether this Flutter runtime targets a supported mobile platform.
final isSupported = !kIsWeb && (Platform.isAndroid || Platform.isIOS);
