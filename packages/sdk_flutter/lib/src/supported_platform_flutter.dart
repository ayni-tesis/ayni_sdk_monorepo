import 'dart:io';

import 'package:flutter/foundation.dart';

final isSupported = !kIsWeb && (Platform.isAndroid || Platform.isIOS);
