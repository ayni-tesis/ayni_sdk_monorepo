import 'package:test/test.dart';

import 'package:ayni_sdk/src/workflow_execution.dart';

void main() {
  test('requires the selected condition branch to reach an output', () {
    final nodes = <String, Map>{
      'condition': {'type': 'condition'},
      'true-output': {
        'type': 'output',
        'sourceNodeId': 'condition',
        'sourcePort': 'true',
      },
      'false-output': {
        'type': 'output',
        'sourceNodeId': 'condition',
        'sourcePort': 'false',
      },
    };
    expect(
      workflowBranchReachesOutput(
        conditionId: 'condition',
        branchPort: 'true',
        nodes: nodes,
        outgoing: const {},
        connections: const [],
      ),
      isTrue,
    );
    expect(
      workflowBranchReachesOutput(
        conditionId: 'condition',
        branchPort: 'false',
        nodes: {
          'condition': nodes['condition']!,
          'true-output': nodes['true-output']!,
        },
        outgoing: const {},
        connections: const [],
      ),
      isFalse,
    );
  });
}
