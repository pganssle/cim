JEKYLL=bundle exec jekyll
SHELL=bash

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
