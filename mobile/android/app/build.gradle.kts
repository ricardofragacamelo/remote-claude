plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.remoteclaude.remote_claude"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.remoteclaude.remote_claude"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Scheme of the deep link the provider sends the browser back to, and the half of
        // RC_OIDC_REDIRECT_URL that Android needs at build time: `flutter_appauth` declares an
        // intent filter with this placeholder in it, and the manifest merger refuses to build
        // without a value. Keep it in step with the redirect URI registered in the realm
        // (infra/keycloak/realm-remote-claude.json) — see docs/architecture/mobile/07-auth.md.
        manifestPlaceholders["appAuthRedirectScheme"] = "br.com.remoteclaude.app"

        // The runner `patrol` drives the real-push suite through: it is what reaches the system's
        // own screens — the notification permission dialog, the home button, the tray (plan 02,
        // D-26). Used only by `patrol test`; `flutter test integration_test` does not go through it.
        testInstrumentationRunner = "pl.leancode.patrol.PatrolJUnitRunner"
        testInstrumentationRunnerArguments["clearPackageData"] = "true"
    }

    testOptions {
        // Each test starts from an app with no data — no granted permission, no stored token — so
        // the permission dialog the suite answers is the one a first install shows.
        execution = "ANDROIDX_TEST_ORCHESTRATOR"
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// The push transport's credential file is configuration, per operator, and not committed. Its
// plugin refuses to build without it, so it is applied only when the file is there: a build
// without it compiles, runs, and says notifications will not arrive — it does not fail (D-21).
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.core:core-ktx:1.17.0")

    testImplementation("junit:junit:4.13.2")
    androidTestUtil("androidx.test:orchestrator:1.5.1")
}
