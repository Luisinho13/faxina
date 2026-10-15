import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// A chave que assina o app fica fora do repositório (ele é público).
// Sem ela o APK de release sai assinado com a chave de depuração da máquina.
val chave = Properties().apply {
    val arquivo = rootProject.file("keystore.properties")
    if (arquivo.exists()) arquivo.inputStream().use { load(it) }
}

android {
    namespace = "io.github.luisinho13.faxina"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.luisinho13.faxina"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }

    signingConfigs {
        if (chave.isNotEmpty()) {
            create("faxina") {
                storeFile = file(chave.getProperty("arquivo"))
                storePassword = chave.getProperty("senha")
                keyAlias = chave.getProperty("apelido")
                keyPassword = chave.getProperty("senha")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("faxina") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
