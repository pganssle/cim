JEKYLL=bundle exec jekyll
SHELL=bash

help:
	@echo 'Makefile for Jekyll site'
	@echo ''
	@echo 'Usage:'
	@echo 'make init             Initialize directory'
	@echo 'make html             Generate the web site'
	@echo 'make clean            Clean up generated site'
	@echo ''
	@echo 'Android (see docs/android.md):'
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

.PHONY: android-assets
android-assets: html node_modules
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
