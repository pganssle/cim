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
	@echo 'make html             Generate the web site'
	@echo 'make clean            Clean up generated site'
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

.PHONY: clean
clean:
	$(JEKYLL) clean

node_modules: package.json package-lock.json
	npm ci
	touch node_modules

# The native project is generated, not committed: it is rebuilt from the
# Capacitor template (pinned via package-lock.json) plus our patches and
# generated resources whenever — and only when — one of those inputs changes.
ANDROID_INPUTS := capacitor.config.json node_modules \
	scripts/generate_android_project.sh \
	scripts/generate_android_resources.sh \
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

.PHONY: apk-debug
apk-debug: android-assets android-java
	cd android && ./gradlew assembleDebug
	@echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"

.PHONY: apk-release
apk-release: android-assets android-java
	cd android && ./gradlew assembleRelease \
		-PcimVersionName=$${VERSION_NAME:-dev} -PcimVersionCode=$${VERSION_CODE:-1}
	@echo "APK: android/app/build/outputs/apk/release/"
