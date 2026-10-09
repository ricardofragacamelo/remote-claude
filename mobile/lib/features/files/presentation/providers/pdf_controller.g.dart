// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pdf_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// [path] of [folder] as a PDF. The password the person types goes to the engine and nowhere else:
/// not into this state, not into a log (S-118).

@ProviderFor(PdfDocumentController)
final pdfDocumentControllerProvider = PdfDocumentControllerFamily._();

/// [path] of [folder] as a PDF. The password the person types goes to the engine and nowhere else:
/// not into this state, not into a log (S-118).
final class PdfDocumentControllerProvider
    extends $NotifierProvider<PdfDocumentController, PdfView> {
  /// [path] of [folder] as a PDF. The password the person types goes to the engine and nowhere else:
  /// not into this state, not into a log (S-118).
  PdfDocumentControllerProvider._({
    required PdfDocumentControllerFamily super.from,
    required (String, String) super.argument,
  }) : super(
         retry: null,
         name: r'pdfDocumentControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$pdfDocumentControllerHash();

  @override
  String toString() {
    return r'pdfDocumentControllerProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  PdfDocumentController create() => PdfDocumentController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PdfView value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<PdfView>(value));
  }

  @override
  bool operator ==(Object other) {
    return other is PdfDocumentControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$pdfDocumentControllerHash() => r'ba99f8fd9662944bffd819b7aaa34bca21b02895';

/// [path] of [folder] as a PDF. The password the person types goes to the engine and nowhere else:
/// not into this state, not into a log (S-118).

final class PdfDocumentControllerFamily extends $Family
    with $ClassFamilyOverride<PdfDocumentController, PdfView, PdfView, PdfView, (String, String)> {
  PdfDocumentControllerFamily._()
    : super(
        retry: null,
        name: r'pdfDocumentControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// [path] of [folder] as a PDF. The password the person types goes to the engine and nowhere else:
  /// not into this state, not into a log (S-118).

  PdfDocumentControllerProvider call(String folder, String path) =>
      PdfDocumentControllerProvider._(argument: (folder, path), from: this);

  @override
  String toString() => r'pdfDocumentControllerProvider';
}

/// [path] of [folder] as a PDF. The password the person types goes to the engine and nowhere else:
/// not into this state, not into a log (S-118).

abstract class _$PdfDocumentController extends $Notifier<PdfView> {
  late final _$args = ref.$arg as (String, String);
  String get folder => _$args.$1;
  String get path => _$args.$2;

  PdfView build(String folder, String path);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<PdfView, PdfView>;
    final element =
        ref.element
            as $ClassProviderElement<AnyNotifier<PdfView, PdfView>, PdfView, Object?, Object?>;
    return element.handleCreate(ref, () => build(_$args.$1, _$args.$2));
  }
}
