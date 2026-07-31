JEKYLL=bundle exec jekyll
SHELL=bash

# Keep the Gradle wrapper cache with the other build artifacts. This makes
# Make-driven Android builds independent of the permissions on $HOME.
GRADLE_USER_HOME ?= $(CURDIR)/.gradle
export GRADLE_USER_HOME

help:
	@echo 'Makefile for Jekyll site'
	@echo ''
	@echo 'Usage:'
	@echo 'make init             Initialize directory'
	@echo 'make serve            Run the development server'
	@echo 'make html             Generate the web site'
	@echo 'make release          Compile changelog fragments and build the site'
	@echo 'make clean            Clean up generated site'
	@echo ''
	@echo 'Tests:'
	@echo 'make test             Run the automated tests'
	@echo 'make test-e2e         Run the Playwright end-to-end tests'
	@echo 'make test-android     Run the Android WebView smoke tests'
	@echo ''
	@echo 'Android (see docs/android.md):'
	@echo 'make android-project  Generate the native project (template + patches)'
	@echo 'make android-patches  Capture edits made in android/ back into patches/'
	@echo 'make android-assets   Build the site and sync it into the Android project'
	@echo 'make apk-debug        Build a debug APK for local testing'
	@echo 'make apk-release      Build a release APK (unsigned without keystore env vars)'

vendor/bundle:
	bundle config set --local path 'vendor/bundle'
	bundle install

.PHONY: init
init: vendor/bundle

.PHONY: html
html: vendor/bundle
	$(JEKYLL) build

.PHONY: serve
serve: vendor/bundle
	$(JEKYLL) serve -w

.PHONY: release
release: vendor/bundle node_modules
	npm run release:news -- "$$(date +%F)"
	$(JEKYLL) build

.PHONY: clean
clean:
	$(JEKYLL) clean

node_modules: package.json package-lock.json
	npm ci
	touch node_modules

# Playwright installs browsers into ~/.cache/ms-playwright; `install` is
# idempotent and near-instant when they are already present, so no stamp
# file is needed. This deliberately does not use --with-deps, which would
# try to install system packages with apt; CI does that itself.
.PHONY: playwright-browsers
playwright-browsers: node_modules
	npx playwright install chromium firefox

.PHONY: test-e2e
test-e2e: node_modules html playwright-browsers
	npm run test:e2e

.PHONY: test
test: test-e2e
	@sdk=$${ANDROID_HOME:-$${ANDROID_SDK_ROOT:-}}; \
	major=$$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p'); \
	if [ -z "$$sdk" ] || [ ! -x "$$sdk/emulator/emulator" ] || \
	   [ -z "$$major" ] || [ "$$major" -lt 21 ] || [ "$$major" -gt 24 ]; then \
		echo "warning: skipping Android tests (requires Android emulator SDK and JDK 21-24)" >&2; \
	else \
		$(MAKE) test-android; \
	fi

# The native project is generated, not committed: it is rebuilt from the
# Capacitor template (pinned via package-lock.json) plus our patches and
# generated resources whenever — and only when — one of those inputs changes.
ANDROID_INPUTS := capacitor.config.json node_modules \
	scripts/generate_android_project.sh \
	scripts/generate_android_resources.sh \
	$(shell find android-tests -type f) \
	android-resources/colors.xml.in \
	_data/theme.json \
	assets/images/cim_logo_512.png \
	$(wildcard patches/android/*.patch)

android/.generated: $(ANDROID_INPUTS)
	./scripts/generate_android_project.sh
	touch $@

.PHONY: android-project
android-project: android/.generated

.PHONY: android-patches
android-patches: node_modules
	./scripts/update_android_patches.sh

.PHONY: android-assets
android-assets: html android/.generated
	npx cap sync android

.PHONY: android-java
android-java:
	@major=$$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p'); \
	if [ -z "$$major" ] || [ "$$major" -lt 21 ] || [ "$$major" -gt 24 ]; then \
		echo "error: apk builds require JDK 21-24; found Java $${major:-unknown}" >&2; \
		exit 1; \
	fi

.PHONY: test-android
test-android: android-assets android-java
	cd android && ./gradlew pixel2api35DebugAndroidTest \
		-Pandroid.testoptions.manageddevices.emulator.gpu=swiftshader_indirect

.PHONY: apk-debug
apk-debug: android-assets android-java
	cd android && ./gradlew assembleDebug
	@echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"

.PHONY: apk-release
apk-release: android-assets android-java
	cd android && ./gradlew assembleRelease \
		-PcimVersionName=$${VERSION_NAME:-dev} -PcimVersionCode=$${VERSION_CODE:-1}
	@echo "APK: android/app/build/outputs/apk/release/"
