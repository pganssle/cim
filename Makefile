JEKYLL=bundle exec jekyll
SHELL=bash
ANDROID_ASSETS=android-wrapper/app/src/main/assets

help:
	@echo 'Makefile for Jekyll site'
	@echo ''
	@echo 'Usage:'
	@echo 'make init          Initialize directory'
	@echo 'make html          Generate the web site'
	@echo 'make clean         Clean up generated site'
	@echo 'make android-setup Set up the Android app, including building symlinks'
	@echo 'make android-clean Clean up the Android app'


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

.PHONY: android-clean 
android-clean:
	rm -rf $(ANDROID_ASSETS)/*

.PHONY: android-setup
android-setup:
	$(JEKYLL) clean
	$(JEKYLL) build
	make android-clean
	mkdir -p $(ANDROID_ASSETS)
	cp -r _site/* $(ANDROID_ASSETS)

# Android WebView disables fetch() used in Tone.js when legacy=false
# Override to always use legacy=true
	perl -pi -e 's/"?legacy"?\s*:\s*false/"legacy": true/' $(ANDROID_ASSETS)/index.html

# index.html references URL-encoded filenames
# Android loads files directly, so we must rename files to match URL encoding
	find $(ANDROID_ASSETS) -type f \( -name '*.html' -o -name '*.js' \) \
		-exec perl -pi -e 's/([A-G])%23([0-9])/$$1#$$2/g' {} +
