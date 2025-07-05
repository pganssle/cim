JEKYLL=bundle exec jekyll
SHELL=bash

help:
	@echo 'Makefile for Jekyll site'
	@echo ''
	@echo 'Usage:'
	@echo 'make init          Initialize directory'
	@echo 'make html          Generate the web site'
	@echo 'make clean         Clean up generated site'

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
