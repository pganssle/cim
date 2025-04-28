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
	make android-clean
	mkdir -p $(ANDROID_ASSETS)
	JEKYLL_ENV=android $(JEKYLL) build --destination $(ANDROID_ASSETS)
