/// A pinch that scales the text, without taking the drag from the list under it (plan 25, B-16).
///
/// Raw pointers rather than a scale recognizer: a recognizer enters the gesture arena and wins the
/// one-finger drag the list needs to scroll. Two fingers down change the scale; one finger is left
/// to the list.
library;

import 'package:flutter/widgets.dart';
import 'package:remote_claude/features/files/domain/services/zoom.dart';

/// [child], scaled by a pinch: [onScale] hears the new scale, from [scale] when the pinch began.
class PinchScale extends StatefulWidget {
  const PinchScale({required this.child, required this.scale, required this.onScale, super.key});

  final Widget child;
  final double scale;
  final ValueChanged<double> onScale;

  @override
  State<PinchScale> createState() => _PinchScaleState();
}

class _PinchScaleState extends State<PinchScale> {
  final Map<int, Offset> _pointers = <int, Offset>{};
  double? _startDistance;
  double _startScale = 1;

  double get _distance {
    final List<Offset> points = _pointers.values.toList(growable: false);
    return (points[0] - points[1]).distance;
  }

  void _down(PointerDownEvent event) {
    _pointers[event.pointer] = event.position;
    if (_pointers.length == 2) {
      _startDistance = _distance;
      _startScale = widget.scale;
    }
  }

  void _move(PointerMoveEvent event) {
    if (!_pointers.containsKey(event.pointer)) {
      return;
    }
    _pointers[event.pointer] = event.position;

    final double? start = _startDistance;
    if (_pointers.length == 2 && start != null && start > 0) {
      widget.onScale(clampTextScale(_startScale * _distance / start));
    }
  }

  void _up(PointerEvent event) {
    _pointers.remove(event.pointer);
    _startDistance = null;
  }

  @override
  Widget build(BuildContext context) => Listener(
    onPointerDown: _down,
    onPointerMove: _move,
    onPointerUp: _up,
    onPointerCancel: _up,
    child: widget.child,
  );
}
