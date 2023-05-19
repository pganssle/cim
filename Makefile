JEKYLL=bundle exec jekyll
SHELL=bash

help:
	@echo 'Makefile for Jekyll site'
	@echo ''
	@echo 'Usage:'
	@echo 'make init          Initialize directory'
	@echo 'make html          Generate the web site'
	@echo 'make clean         Clean up generated site'

.PHONY: init
init:
	bundle config set --local path 'vendor/bundle'
	bundle install

.PHONY: html
html:
	$(JEKYLL) build

.PHONY: serve
serve:
	$(JEKYLL) serve -w

.PHONY: clean
clean:
	$(JEKYLL) clean
