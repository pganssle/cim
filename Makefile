JEKYLL=bundle exec jekyll
SHELL=bash

help:
	@echo 'Makefile for Jekyll site'
	@echo ''
	@echo 'Usage:'
	@echo 'make init          Initialize directory'
	@echo 'make html          Generate the web site'
	@echo 'make clean         Clean up generated site'
	@echo ''
	@echo 'Tests:'
	@echo 'make test          Run the automated tests'
	@echo 'make test-e2e      Run the Playwright end-to-end tests'

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

# Playwright installs browsers into ~/.cache/ms-playwright; `install` is
# idempotent and near-instant when they are already present, so no stamp
# file is needed. This deliberately does not use --with-deps, which would
# try to install system packages with apt; CI does that itself.
.PHONY: playwright-browsers
playwright-browsers: node_modules
	npx playwright install chromium

.PHONY: test-e2e
test-e2e: node_modules html playwright-browsers
	npm run test:e2e

.PHONY: test
test: test-e2e
