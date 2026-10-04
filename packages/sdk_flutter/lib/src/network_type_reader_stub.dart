import 'network_type.dart';

/// Returns [NetworkType.other] when no Flutter platform channel is available.
Future<NetworkType> readNetworkType() async => NetworkType.other;
